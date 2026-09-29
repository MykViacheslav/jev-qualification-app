'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { classifyLead, CATEGORIES } = require('./src/jevClient');
const { alertToSnapshot, storeSnapshot, validateAlert } = require('./src/tradingViewAlerts');
const { createAndStoreDailySignalReport, validateWatchlistText } = require('./src/dailySignalReport');
const { runSafely, scheduleDaily } = require('./src/dailyReportScheduler');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

app.post('/api/qualify', async (req, res) => {
  const { q1, q2, q3 } = req.body || {};
  if (!q1 || !q2 || !q3) {
    return res.status(400).json({ error: 'Wypełnij wszystkie trzy pytania.' });
  }

  try {
    const result = await classifyLead({ q1, q2, q3 });
    res.json(result);
  } catch (err) {
    console.error('Jev classification failed:', err);
    res.status(502).json({ error: err.message || 'Klasyfikacja nie powiodła się.' });
  }
});

app.post('/api/investments/tradingview/:token', (req, res) => {
  if (!process.env.TRADINGVIEW_WEBHOOK_TOKEN) {
    return res.status(503).json({ error: 'TradingView webhook is not configured.' });
  }
  if (req.params.token !== process.env.TRADINGVIEW_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Invalid webhook token.' });
  }

  try {
    const alert = validateAlert(req.body);
    const snapshot = alertToSnapshot(alert);
    const inboxDirectory = process.env.TRADINGVIEW_INBOX_DIR || path.join(__dirname, 'data', 'investments', 'inbox');
    const filePath = storeSnapshot(snapshot, inboxDirectory);
    return res.status(202).json({ stored: true, file: path.basename(filePath), partial: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid TradingView alert.' });
  }
});

function hasValidInvestmentToken(req) {
  return Boolean(process.env.TRADINGVIEW_WEBHOOK_TOKEN) && req.params.token === process.env.TRADINGVIEW_WEBHOOK_TOKEN;
}

app.post('/api/investments/watchlist/:token', express.text({ type: 'text/plain', limit: '1mb' }), (req, res) => {
  if (!hasValidInvestmentToken(req)) return res.status(401).json({ error: 'Invalid token.' });
  try {
    const entries = validateWatchlistText(req.body);
    const watchlistPath = process.env.WATCHLIST_PATH || path.join(__dirname, 'data', 'investments', 'watchlist.txt');
    fs.mkdirSync(path.dirname(watchlistPath), { recursive: true });
    const temporary = `${watchlistPath}.tmp`;
    fs.writeFileSync(temporary, `${req.body.trim()}\n`, 'utf8');
    fs.renameSync(temporary, watchlistPath);
    return res.status(201).json({ stored: true, instrumentCount: entries.length });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid watchlist.' });
  }
});

app.get('/api/investments/reports/:token/latest', (req, res) => {
  if (!hasValidInvestmentToken(req)) return res.status(401).json({ error: 'Invalid token.' });
  const reportDirectory = process.env.DAILY_REPORT_DIR || path.join(__dirname, 'data', 'investments', 'reports');
  if (!fs.existsSync(reportDirectory)) return res.status(404).json({ error: 'No daily report is available yet.' });
  const latest = fs.readdirSync(reportDirectory).filter((file) => /^daily-signal-summary-\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort().at(-1);
  if (!latest) return res.status(404).json({ error: 'No daily report is available yet.' });
  return res.sendFile(path.join(reportDirectory, latest));
});

function runDailySignalReport() {
  const watchlistPath = process.env.WATCHLIST_PATH || path.join(__dirname, 'data', 'investments', 'watchlist.txt');
  const inputDirectory = process.env.TRADINGVIEW_INBOX_DIR || path.join(__dirname, 'data', 'investments', 'inbox');
  const outputDirectory = process.env.DAILY_REPORT_DIR || path.join(__dirname, 'data', 'investments', 'reports');
  const result = createAndStoreDailySignalReport({ watchlistPath, inputDirectory, outputDirectory });
  console.log(`Daily signal report stored: ${result.reportPath}`);
}

if (process.env.DAILY_REPORT_ENABLED === 'true') {
  void runSafely(runDailySignalReport);
  scheduleDaily(runDailySignalReport, { hour: Number(process.env.DAILY_REPORT_HOUR || 8), timeZone: process.env.DAILY_REPORT_TIMEZONE || 'Europe/Warsaw' });
}

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Jev qualification app listening on http://localhost:${port}`);
});
