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

function parseTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('bar_time must be a valid timestamp.');
  return date.toISOString();
}

function validateAlert(body) {
  const required = ['event', 'signal', 'symbol', 'timeframe', 'close', 'bar_time'];
  if (!body || required.some((field) => body[field] === undefined || body[field] === null || body[field] === '')) {
    throw new Error('TradingView alert must include event, signal, symbol, timeframe, close, and bar_time.');
  }
  const close = Number(body.close);
  if (!Number.isFinite(close)) throw new Error('close must be a number.');

  return {
    event: String(body.event),
    signal: String(body.signal),
    symbol: String(body.symbol),
    timeframe: intervalName(body.timeframe),
    close,
    support: body.support === undefined ? null : Number(body.support),
    warning: body.warning === undefined ? null : Number(body.warning),
    bar_time: parseTimestamp(body.bar_time),
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

module.exports = { alertToSnapshot, storeSnapshot, validateAlert };
