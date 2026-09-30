'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATUS_BY_SIGNAL = {
  MOZLIWY_SUPPORT: 'NEAR',
  ZBLIZENIE_SUPPORTU: 'NEAR',
  DOTKNIECIE_SUPPORTU: 'AT_SUPPORT',
  ODBI_KUP: 'AT_SUPPORT',
  CZESC_SPRZEDAJ: 'AT_RESISTANCE',
  WCZESNE_OSTRZEZENIE: 'CONFLICT',
  STOP_WYJDZ: 'BROKEN',
};

function intervalName(timeframe) {
  const value = String(timeframe).toUpperCase();
  if (value === 'D' || value === '1D' || value === '1440') return '1D';
  if (value === '720' || value === '12H') return '12H';
  if (value === '360' || value === '6H') return '6H';
  if (value === '240' || value === '4H') return '4H';
  return value;
}

function firstDefined(object, names) {
  return names.map((name) => object?.[name]).find((value) => value !== undefined && value !== null && value !== '');
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseTimestamp(value) {
  const numeric = numberOrNull(value);
  const epochMilliseconds = numeric !== null && Number.isInteger(numeric)
    ? (numeric < 100_000_000_000 ? numeric * 1000 : numeric)
    : null;
  const date = new Date(epochMilliseconds ?? value);
  if (Number.isNaN(date.getTime())) throw new Error('bar_time must be a valid timestamp.');
  return date.toISOString();
}

function parseAlertPayload(payload) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload !== 'string' || !payload.trim()) throw new Error('TradingView alert body is empty.');

  const raw = payload.trim();
  const candidates = [raw, raw.replace(/\b(?:na|NaN|Infinity|-Infinity)\b/g, 'null')];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next safe normalization before rejecting the alert.
    }
  }
  throw new Error('TradingView alert body is not valid JSON.');
}

function validateAlert(payload, { receivedAt = new Date() } = {}) {
  const body = parseAlertPayload(payload);
  const nestedMessage = typeof body.message === 'string' && body.message.trim().startsWith('{')
    ? parseAlertPayload(body.message)
    : body;
  const event = firstDefined(nestedMessage, ['event', 'type']) || 'tradingview_alert';
  const signal = firstDefined(nestedMessage, ['signal', 'action', 'alert_name']);
  const symbol = firstDefined(nestedMessage, ['symbol', 'ticker', 'instrument']);
  const timeframe = firstDefined(nestedMessage, ['timeframe', 'interval', 'tf']);
  const close = numberOrNull(firstDefined(nestedMessage, ['close', 'price', 'last']));
  const barTime = firstDefined(nestedMessage, ['bar_time', 'time', 'timestamp', 'timenow']) || receivedAt.toISOString();

  if (!signal || !symbol || !timeframe || close === null) {
    throw new Error('TradingView alert must include signal, symbol, timeframe, and a numeric close or price.');
  }
  if (!Number.isFinite(close)) throw new Error('close must be a number.');

  return {
    event: String(event),
    signal: String(signal),
    symbol: String(symbol),
    timeframe: intervalName(timeframe),
    close,
    support: numberOrNull(firstDefined(nestedMessage, ['support', 'support_price', 'band_lower'])),
    warning: numberOrNull(firstDefined(nestedMessage, ['warning', 'resistance', 'band_upper'])),
    bar_time: parseTimestamp(barTime),
  };
}

function alertToSnapshot(alert) {
  const technicalData = { partial: true };
  if (Number.isFinite(alert.support)) technicalData.support = alert.support;
  if (Number.isFinite(alert.warning)) technicalData.warning = alert.warning;

  return {
    asOf: alert.bar_time,
    source: 'tradingview-json-alerts',
    instruments: [{
      symbol: alert.symbol,
      price: alert.close,
      status: STATUS_BY_SIGNAL[alert.signal] || 'CONFLICT',
      signal: alert.signal,
      intervals: { [alert.timeframe]: technicalData },
    }],
    newCandidates: [],
  };
}

function storeSnapshot(snapshot, inboxDirectory) {
  fs.mkdirSync(inboxDirectory, { recursive: true });
  const filename = `tradingview-${snapshot.asOf.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
  const filePath = path.join(inboxDirectory, filename);
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = { alertToSnapshot, parseAlertPayload, storeSnapshot, validateAlert };
