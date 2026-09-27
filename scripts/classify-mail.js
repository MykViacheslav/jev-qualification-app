'use strict';

// One-off local utility: classify a batch of Gmail threads with Jev
// (via OpenRouter) and print the results as JSON. Run this on a machine
// that already has working network access to openrouter.ai, using the
// same .env as the main app (OPENROUTER_API_KEY, JEV_MODEL).
//
// Reads its input from scripts/mail-batch.json (gitignored — never commit
// real email content) — an array of { threadId, messageId, subject,
// sender, snippet }.
//
// Usage: node scripts/classify-mail.js
//
// Paste the printed JSON back to Claude, which will then apply the
// matching Gmail label to each message via the Gmail connector.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const CATEGORIES = ['Pilne', 'Klient', 'Spam', 'Newsletter'];
const BATCH_FILE = path.join(__dirname, 'mail-batch.json');

function loadBatch() {
  if (!fs.existsSync(BATCH_FILE)) {
    console.error(`Brak pliku ${BATCH_FILE}. Utwórz go z listą e-maili do sklasyfikowania (patrz komentarz w tym skrypcie).`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8'));
}

function buildPrompt(email) {
  return `Sklasyfikuj poniższy e-mail do jednej z czterech kategorii: ${CATEGORIES.join(', ')}.

Temat: ${email.subject}
Nadawca: ${email.sender}
Fragment treści: ${email.snippet}

Odpowiedz WYŁĄCZNIE obiektem JSON, bez dodatkowego tekstu:
{
  "probabilities": { "Pilne": 0.0, "Klient": 0.0, "Spam": 0.0, "Newsletter": 0.0 },
  "confidence": 0.0
}`;
}

function extractJson(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced ? fenced[1] : content).trim());
}

function pickTop(probabilities) {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function classify(email) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || 'typesafe/jev-router',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: buildPrompt(email) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  const parsed = extractJson(content);
  return { category: pickTop(parsed.probabilities), ...parsed };
}

(async () => {
  const emails = loadBatch();
  const results = [];
  for (const email of emails) {
    try {
      const result = await classify(email);
      results.push({ threadId: email.threadId, messageId: email.messageId, subject: email.subject, ...result });
    } catch (err) {
      results.push({ threadId: email.threadId, messageId: email.messageId, subject: email.subject, error: err.message });
    }
  }
  console.log(JSON.stringify(results, null, 2));
})();
