'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildDailySignalReport, validateWatchlistText } = require('../src/dailySignalReport');
const { millisecondsUntilNextRun } = require('../src/dailyReportScheduler');

const watchlist = '###MAM,NASDAQ:AVGO,###OBSERWUJE,NYSE:VST';

test('builds a private daily summary from the last 24 hours of alert snapshots', () => {
  const report = buildDailySignalReport({
    watchlistText: watchlist,
    now: new Date('2026-09-28T08:00:00.000Z'),
    snapshots: [
      { file: 'current.json', snapshot: { source: 'tradingview-json-alerts', asOf: '2026-09-28T07:30:00.000Z', instruments: [{ symbol: 'NASDAQ:AVGO', price: 350, status: 'NEAR', signal: 'MOZLIWY_SUPPORT', intervals: { '12H': { partial: true } } }] } },
      { file: 'old.json', snapshot: { source: 'tradingview-json-alerts', asOf: '2026-09-26T07:00:00.000Z', instruments: [{ symbol: 'NYSE:VST', price: 100, status: 'NEAR', signal: 'MOZLIWY_SUPPORT', intervals: {} }] } },
    ],
  });
  assert.equal(report.completeness, 'partial-alerts-only');
  assert.equal(report.watchlist.instrumentCount, 2);
  assert.equal(report.receivedSignals.length, 1);
  assert.equal(report.receivedSignals[0].group, 'MAM');
  assert.equal(report.risks.missingFullMarketData, true);
});

test('rejects an empty or malformed private watchlist', () => {
  assert.throws(() => validateWatchlistText(''), /nie zawiera instrumentów/i);
  assert.throws(() => validateWatchlistText('AVGO'), /format/i);
});

test('schedules the next Warsaw report at 08:00', () => {
  const delay = millisecondsUntilNextRun(new Date('2026-01-02T06:30:00.000Z'), { hour: 8, timeZone: 'Europe/Warsaw' });
  assert.equal(delay, 30 * 60 * 1000);
});
