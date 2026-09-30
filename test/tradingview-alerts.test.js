'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { alertToSnapshot, validateAlert } = require('../src/tradingViewAlerts');
const { buildMorningReport } = require('../src/investmentReport');

test('converts the existing Spot Compass support alert to a read-only partial snapshot', () => {
  const alert = {
    event: 'spot_compass_possible_support',
    signal: 'MOZLIWY_SUPPORT',
    symbol: 'NASDAQ:AVGO',
    timeframe: '720',
    close: 352.81,
    support: 349.43,
    warning: 360,
    bar_time: '2026-09-27T10:00:00.000Z'
  };

  const snapshot = alertToSnapshot(validateAlert(alert));

  assert.equal(snapshot.source, 'tradingview-json-alerts');
  assert.equal(snapshot.instruments[0].status, 'NEAR');
  assert.equal(snapshot.instruments[0].intervals['12H'].support, 349.43);
  assert.equal(snapshot.instruments[0].intervals['12H'].warning, 360);
  assert.equal(snapshot.instruments[0].intervals['12H'].partial, true);

  const report = buildMorningReport({
    watchlistText: '###MAM,NASDAQ:AVGO',
    snapshot,
    now: new Date('2026-09-27T11:00:00.000Z'),
  });
  assert.match(report.risksAndMissingData.items.join(' '), /niepełne dane interwałowe/i);
});

test('keeps approach and touch of support distinct', () => {
  const common = {
    event: 'spot_compass_support',
    symbol: 'NASDAQ:ADBE',
    timeframe: '1D',
    close: 235.47,
    support: 228.19,
    bar_time: '2026-09-27T10:00:00.000Z',
  };

  const near = alertToSnapshot(validateAlert({ ...common, signal: 'ZBLIZENIE_SUPPORTU' }));
  const touch = alertToSnapshot(validateAlert({ ...common, signal: 'DOTKNIECIE_SUPPORTU', close: 228.19 }));

  assert.equal(near.instruments[0].status, 'NEAR');
  assert.equal(touch.instruments[0].status, 'AT_SUPPORT');
});

test('rejects a webhook payload that is not a Spot Compass JSON alert', () => {
  assert.throws(
    () => validateAlert({ message: 'AVGO przekroczył 352,81' }),
    /signal, symbol, timeframe, and a numeric close or price/,
  );
});

test('accepts scanner field aliases and a Unix timestamp from a raw TradingView message', () => {
  const alert = validateAlert('{"signal":"MOZLIWY_SUPPORT","ticker":"GPW:KRU","interval":"360","price":"381,10","time":1790789760}');

  assert.equal(alert.event, 'tradingview_alert');
  assert.equal(alert.symbol, 'GPW:KRU');
  assert.equal(alert.timeframe, '6H');
  assert.equal(alert.close, 381.1);
  assert.equal(alert.bar_time, '2026-09-30T17:36:00.000Z');
});

test('uses the receipt time when a valid scanner message lacks a source timestamp', () => {
  const alert = validateAlert(
    '{"signal":"MOZLIWY_SUPPORT","symbol":"NYSE:FI","timeframe":"720","close":123.45}',
    { receivedAt: new Date('2026-09-30T20:20:00.000Z') },
  );

  assert.equal(alert.bar_time, '2026-09-30T20:20:00.000Z');
});
