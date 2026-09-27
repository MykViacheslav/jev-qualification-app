'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildMorningReport, parseWatchlist } = require('../src/investmentReport');

const watchlist = `NASDAQ:AVGO,NYSE:VST,###MAM,NASDAQ:META,###KUPIONE,BINANCE:BTCUSD,###CHCE KUPIĆ,NASDAQ:TSLA,###OBSERWUJE,NYSE:UNH`;

const snapshot = {
  asOf: '2026-09-27T07:00:00.000Z',
  source: 'tradingview-json-alerts',
  instruments: [
    {
      symbol: 'NASDAQ:META',
      price: 352.81,
      status: 'NEAR',
      signal: 'MOZLIWY_SUPPORT',
      intervals: {
        '1D': { support: 340, resistance: 370, distanceToSupportPct: 3.63, distanceToSupportAtr: 1.2 },
        '12H': { support: 345, resistance: 365, distanceToSupportPct: 2.26, distanceToSupportAtr: 0.9 },
        '6H': { support: 348, resistance: 360, distanceToSupportPct: 1.38, distanceToSupportAtr: 0.6 }
      }
    },
    {
      symbol: 'NASDAQ:TSLA',
      price: 400,
      status: 'FAR',
      intervals: {}
    }
  ],
  newCandidates: [
    {
      symbol: 'NYSE:ABC',
      source: 'verified-issuer-source',
      asOf: '2026-09-27T06:30:00.000Z',
      reason: 'Nowa obserwacja po zweryfikowanym zdarzeniu.',
      risk: 'Duża zmienność.',
      verificationRule: 'Sprawdź dane cenowe i płynność przed dodaniem do listy.'
    }
  ]
};

test('preserves watchlist groups while selecting only attention-worthy instruments', () => {
  const groups = parseWatchlist(watchlist);
  const report = buildMorningReport({ watchlistText: watchlist, snapshot, now: new Date('2026-09-27T08:00:00.000Z') });

  assert.equal(groups.find((entry) => entry.symbol === 'NASDAQ:AVGO').group, 'NIEPRZYPISANE');
  assert.equal(groups.find((entry) => entry.symbol === 'NASDAQ:TSLA').group, 'CHCE_KUPIC');
  assert.deepEqual(report.confirmedInstruments.map((item) => item.symbol), ['NASDAQ:META']);
  assert.deepEqual(report.watchlistAndCandidates.existing.map((item) => item.symbol), []);
  assert.equal(report.risksAndMissingData.missingMarketDataCount, 4);
  assert.equal(report.risksAndMissingData.staleInput, false);
});

test('keeps valid new candidates separate and never auto-adds them to the watchlist', () => {
  const report = buildMorningReport({ watchlistText: watchlist, snapshot, now: new Date('2026-09-27T08:00:00.000Z') });

  assert.equal(report.watchlistAndCandidates.newCandidates.length, 1);
  assert.equal(report.watchlistAndCandidates.newCandidates[0].symbol, 'NYSE:ABC');
  assert.equal(report.watchlistAndCandidates.newCandidates[0].autoAddedToWatchlist, false);
});

test('reports stale inputs as a risk instead of treating them as current market data', () => {
  const report = buildMorningReport({ watchlistText: watchlist, snapshot, now: new Date('2026-09-29T08:00:00.000Z') });

  assert.equal(report.risksAndMissingData.staleInput, true);
  assert.match(report.risksAndMissingData.items[0], /nieaktualne/i);
});
