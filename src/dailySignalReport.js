'use strict';

const fs = require('fs');
const path = require('path');
const { parseWatchlist } = require('./investmentReport');

function readJsonSnapshots(inputDirectory) {
  if (!fs.existsSync(inputDirectory)) return { snapshots: [], invalidFiles: [] };
  const snapshots = [];
  const invalidFiles = [];
  for (const entry of fs.readdirSync(inputDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const file = path.join(inputDirectory, entry.name);
    try {
      snapshots.push({ file: entry.name, snapshot: JSON.parse(fs.readFileSync(file, 'utf8')) });
    } catch {
      invalidFiles.push(entry.name);
    }
  }
  return { snapshots, invalidFiles };
}

function validateWatchlistText(text) {
  const entries = parseWatchlist(text);
  if (!entries.length) throw new Error('Lista obserwowanych nie zawiera instrumentów.');
  if (entries.length > 500) throw new Error('Lista obserwowanych przekracza limit 500 instrumentów.');
  if (entries.some((entry) => !entry.symbol.includes(':'))) {
    throw new Error('Każdy instrument musi mieć format GIEŁDA:SYMBOL.');
  }
  return entries;
}

function buildDailySignalReport({ watchlistText, snapshots, invalidFiles = [], now = new Date(), windowHours = 24 }) {
  const entries = validateWatchlistText(watchlistText);
  const groupsBySymbol = new Map(entries.map((entry) => [entry.symbol, entry.group]));
  const end = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(end.getTime())) throw new Error('Czas raportu jest nieprawidłowy.');
  const start = new Date(end.getTime() - windowHours * 60 * 60 * 1000);
  const signals = snapshots
    .flatMap(({ file, snapshot }) => (snapshot?.instruments || []).map((instrument) => ({ file, snapshot, instrument })))
    .filter(({ snapshot, instrument }) => snapshot?.source === 'tradingview-json-alerts' && instrument?.symbol)
    .filter(({ snapshot }) => {
      const asOf = new Date(snapshot.asOf).getTime();
      return Number.isFinite(asOf) && asOf >= start.getTime() && asOf <= end.getTime();
    })
    .map(({ file, snapshot, instrument }) => ({
      symbol: instrument.symbol,
      group: groupsBySymbol.get(instrument.symbol) || 'NIEPRZYPISANE',
      price: instrument.price ?? null,
      status: instrument.status || 'UNKNOWN',
      signal: instrument.signal || null,
      intervals: instrument.intervals || {},
      asOf: snapshot.asOf,
      inputFile: file,
      partial: true,
    }))
    .sort((left, right) => new Date(right.asOf) - new Date(left.asOf));
  const groupCounts = Object.fromEntries(entries.reduce((counts, entry) => {
    counts.set(entry.group, (counts.get(entry.group) || 0) + 1);
    return counts;
  }, new Map()));
  const unknownSymbols = [...new Set(signals.filter((signal) => !groupsBySymbol.has(signal.symbol)).map((signal) => signal.symbol))];
  return {
    kind: 'daily-tradingview-signal-summary',
    generatedAt: end.toISOString(),
    period: { from: start.toISOString(), to: end.toISOString(), hours: windowHours },
    completeness: 'partial-alerts-only',
    message: 'Raport obejmuje wyłącznie alerty TradingView z ostatnich 24 godzin. Nie zastępuje pełnych danych 1D, 12H i 6H.',
    watchlist: { instrumentCount: entries.length, groupCounts },
    receivedSignals: signals,
    risks: { missingFullMarketData: true, invalidInboxFiles: invalidFiles, unknownSymbols },
  };
}

function storeDailySignalReport(report, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, `daily-signal-summary-${report.generatedAt.slice(0, 10)}.json`);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, destination);
  return destination;
}

function createAndStoreDailySignalReport({ watchlistPath, inputDirectory, outputDirectory, now = new Date() }) {
  const { snapshots, invalidFiles } = readJsonSnapshots(inputDirectory);
  const report = buildDailySignalReport({ watchlistText: fs.readFileSync(watchlistPath, 'utf8'), snapshots, invalidFiles, now });
  return { report, reportPath: storeDailySignalReport(report, outputDirectory) };
}

module.exports = { buildDailySignalReport, createAndStoreDailySignalReport, readJsonSnapshots, validateWatchlistText };
