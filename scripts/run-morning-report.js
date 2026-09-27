'use strict';

const fs = require('fs');
const path = require('path');
const { buildMorningReport } = require('../src/investmentReport');
const { selectNewestSnapshot } = require('../src/morningReportRunner');

const ROOT = path.join(__dirname, '..');

function argument(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Brak wartości ${flag}.`);
  return value;
}

function readSnapshots(inputDir) {
  return fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => {
      const file = path.join(inputDir, entry.name);
      return { file, snapshot: JSON.parse(fs.readFileSync(file, 'utf8')) };
    });
}

function main(argv) {
  const inputDir = path.resolve(ROOT, argument(argv, '--input-dir', 'data/investments/inbox'));
  const outputDir = path.resolve(ROOT, argument(argv, '--output-dir', 'data/investments/reports'));
  const watchlistPath = path.resolve(ROOT, argument(argv, '--watchlist'));
  const selected = selectNewestSnapshot(readSnapshots(inputDir));
  const report = buildMorningReport({
    watchlistText: fs.readFileSync(watchlistPath, 'utf8'),
    snapshot: selected.snapshot,
  });
  const stamp = selected.snapshot.asOf.replace(/[:.]/g, '-');
  const reportPath = path.join(outputDir, `morning-report-${stamp}.json`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...report, inputFile: selected.file }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath, inputFile: selected.file, currentData: report.marketContext.currentData }, null, 2));
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
