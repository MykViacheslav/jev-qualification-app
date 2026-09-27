'use strict';

const ATTENTION_STATES = new Set(['NEAR', 'AT_SUPPORT', 'AT_RESISTANCE', 'BROKEN', 'CONFLICT']);
const CONFIRMED_GROUPS = new Set(['MAM', 'KUPIONE']);
const GROUP_NAMES = {
  MAM: 'MAM',
  KUPIONE: 'KUPIONE',
  'CHCE KUPIC': 'CHCE_KUPIC',
  OBSERWUJE: 'OBSERWUJE',
};
const STATUS_WEIGHT = { FAR: 0, NEAR: 50, AT_SUPPORT: 70, AT_RESISTANCE: 70, CONFLICT: 80, BROKEN: 90 };
const SIGNAL_WEIGHT = { STOP_WYJDZ: 120, CZESC_SPRZEDAJ: 100, WCZESNE_OSTRZEZENIE: 85, ODBI_KUP: 75, MOZLIWY_SUPPORT: 60 };
const REQUIRED_INTERVALS = ['1D', '12H', '6H'];

function normalizeGroup(rawGroup) {
  const normalized = rawGroup.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  return GROUP_NAMES[normalized] || 'NIEPRZYPISANE';
}

function parseWatchlist(text) {
  let group = 'NIEPRZYPISANE';
  return String(text || '')
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      if (part.startsWith('###')) {
        group = normalizeGroup(part.slice(3));
        return [];
      }
      return [{ symbol: part, group }];
    });
}

function toDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid ISO timestamp.`);
  return date;
}

function hasAttention(row) {
  return ATTENTION_STATES.has(row.status) || Boolean(row.signal);
}

function rank(row, group) {
  return (STATUS_WEIGHT[row.status] || 0) + (SIGNAL_WEIGHT[row.signal] || 0) + (CONFIRMED_GROUPS.has(group) ? 20 : 0);
}

function toReportItem(row, group, snapshot) {
  return {
    symbol: row.symbol,
    group,
    price: row.price ?? null,
    status: row.status || 'UNKNOWN',
    signal: row.signal || null,
    intervals: row.intervals || {},
    source: snapshot.source,
    asOf: snapshot.asOf,
  };
}

function isValidCandidate(candidate) {
  return Boolean(
    candidate?.symbol && candidate?.source && candidate?.asOf && candidate?.reason
      && candidate?.risk && candidate?.verificationRule && !Number.isNaN(new Date(candidate.asOf).getTime()),
  );
}

function findIncompleteIntervals(row) {
  return REQUIRED_INTERVALS.filter((interval) => !row?.intervals?.[interval] || row.intervals[interval].partial === true);
}

function buildMorningReport({ watchlistText, snapshot, now = new Date(), maxAgeHours = 36 }) {
  if (!snapshot?.asOf || !snapshot?.source || !Array.isArray(snapshot.instruments)) {
    throw new Error('Snapshot must contain asOf, source, and instruments.');
  }

  const asOf = toDate(snapshot.asOf, 'Snapshot asOf');
  const referenceTime = now instanceof Date ? now : toDate(now, 'now');
  const staleInput = referenceTime.getTime() - asOf.getTime() > maxAgeHours * 60 * 60 * 1000;
  const groupsBySymbol = new Map(parseWatchlist(watchlistText).map((entry) => [entry.symbol, entry.group]));
  const rows = snapshot.instruments
    .filter((row) => row?.symbol && hasAttention(row))
    .map((row) => ({ row, group: groupsBySymbol.get(row.symbol) || 'NIEPRZYPISANE' }))
    .sort((left, right) => rank(right.row, right.group) - rank(left.row, left.group));

  const confirmedInstruments = rows
    .filter(({ group }) => CONFIRMED_GROUPS.has(group))
    .slice(0, 10)
    .map(({ row, group }) => toReportItem(row, group, snapshot));
  const existing = rows
    .filter(({ group }) => !CONFIRMED_GROUPS.has(group))
    .slice(0, Math.max(0, 10 - confirmedInstruments.length))
    .map(({ row, group }) => toReportItem(row, group, snapshot));

  const newCandidates = (snapshot.newCandidates || [])
    .filter(isValidCandidate)
    .slice(0, 3)
    .map((candidate) => ({ ...candidate, autoAddedToWatchlist: false }));
  const unverifiedCandidates = (snapshot.newCandidates || []).filter((candidate) => !isValidCandidate(candidate)).length;
  const coveredSymbols = new Set(snapshot.instruments.filter((row) => row?.symbol).map((row) => row.symbol));
  const missingMarketData = [...groupsBySymbol.keys()].filter((symbol) => !coveredSymbols.has(symbol));
  const incompleteIntervals = snapshot.instruments
    .filter((row) => row?.symbol)
    .map((row) => ({ symbol: row.symbol, missing: findIncompleteIntervals(row) }))
    .filter((item) => item.missing.length > 0);

  const riskItems = [];
  if (staleInput) riskItems.push(`Dane są nieaktualne: zrzut pochodzi z ${snapshot.asOf}.`);
  if (missingMarketData.length) riskItems.push(`Brakuje danych rynkowych dla ${missingMarketData.length} instrumentów z listy.`);
  if (incompleteIntervals.length) riskItems.push(`Niepełne dane interwałowe dla ${incompleteIntervals.length} instrumentów; raport nie traktuje ich jako pełnego setupu.`);
  if (unverifiedCandidates) riskItems.push(`Pominięto ${unverifiedCandidates} nowych kandydatów bez pełnej weryfikacji.`);

  return {
    marketContext: { source: snapshot.source, asOf: snapshot.asOf, currentData: !staleInput },
    confirmedInstruments,
    watchlistAndCandidates: { existing, newCandidates },
    risksAndMissingData: {
      staleInput,
      missingMarketDataCount: missingMarketData.length,
      missingMarketDataSample: missingMarketData.slice(0, 10),
      incompleteIntervals,
      items: riskItems,
    },
  };
}

module.exports = { buildMorningReport, parseWatchlist };
