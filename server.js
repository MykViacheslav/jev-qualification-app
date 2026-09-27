'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const { classifyLead, CATEGORIES } = require('./src/jevClient');

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Jev qualification app listening on http://localhost:${port}`);
});
