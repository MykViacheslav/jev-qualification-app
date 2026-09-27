'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const { classifyLead, CATEGORIES } = require('./src/jevClient');
const { alertToSnapshot, storeSnapshot, validateAlert } = require('./src/tradingViewAlerts');

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

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Jev qualification app listening on http://localhost:${port}`);
});
