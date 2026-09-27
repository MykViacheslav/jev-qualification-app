'use strict';

const fs = require('fs');
const path = require('path');
const { buildMorningReport } = require('../src/investmentReport');

const ROOT = path.join(__dirname, '..');

function requiredArgument(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : null;
  if (!value || value.startsWith('--')) throw new Error(`Brak wartości ${flag}.`);
  return value;
}

function main(argv) {
  const snapshotPath = path.resolve(ROOT, requiredArgument(argv, '--snapshot'));
  const watchlistPath = path.resolve(ROOT, requiredArgument(argv, '--watchlist'));
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const watchlistText = fs.readFileSync(watchlistPath, 'utf8');
  console.log(JSON.stringify(buildMorningReport({ watchlistText, snapshot }), null, 2));
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
