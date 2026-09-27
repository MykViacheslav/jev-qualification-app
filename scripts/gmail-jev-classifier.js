'use strict';

// Fully local Gmail -> Jev classifier. Runs entirely on your machine:
// reads inbox mail directly via the Gmail API (OAuth, no browser session,
// no Claude in the loop), classifies each message with Jev (OpenRouter),
// and applies the matching Jev/* label. Re-run it whenever you want to
// catch up on new mail; already-labeled messages are skipped automatically.
//
// One-time setup (see README.md "Pełna automatyzacja Gmail + Jev"):
//   1. Create an OAuth client (Desktop app) in Google Cloud Console with
//      the Gmail API enabled, download it as scripts/credentials.json.
//   2. npm install
//   3. npm run classify-gmail  — first run opens a browser tab to authorize;
//      after that, scripts/token.json makes future runs fully unattended.
//
// Env vars (optional, in .env): OPENROUTER_API_KEY, JEV_MODEL (as for the
// main app), plus:
//   GMAIL_DAYS_BACK   — only consider mail newer than N days (unset = all mail)
//   GMAIL_MAX_MESSAGES — safety cap per run (default 500)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CALLBACK_PORT = 53682;

const LABELS = [
  { name: 'Jev/Pilne', color: { backgroundColor: '#fb4c2f', textColor: '#ffffff' } },
  { name: 'Jev/Klient', color: { backgroundColor: '#16a765', textColor: '#ffffff' } },
  { name: 'Jev/Spam', color: { backgroundColor: '#666666', textColor: '#ffffff' } },
  { name: 'Jev/Newsletter', color: { backgroundColor: '#fad165', textColor: '#000000' } },
  { name: 'Jev/Inne', color: { backgroundColor: '#a479e2', textColor: '#ffffff' } },
];
const CATEGORIES = LABELS.map((l) => l.name.replace('Jev/', ''));

const MAX_MESSAGES = Number(process.env.GMAIL_MAX_MESSAGES || 500);
const DAYS_BACK = process.env.GMAIL_DAYS_BACK ? Number(process.env.GMAIL_DAYS_BACK) : null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadOAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`Brak pliku ${CREDENTIALS_PATH}. Pobierz go z Google Cloud Console (OAuth client, typ "Desktop app") i zapisz jako scripts/credentials.json.`);
    process.exit(1);
  }
  const { client_id, client_secret } = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).installed;
  const redirectUri = `http://localhost:${CALLBACK_PORT}/oauth2callback`;
  const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    return client;
  }

  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log('\nOtwórz ten link w przeglądarce i zaloguj się swoim kontem Gmail:\n');
  console.log(authUrl + '\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, redirectUri);
      const authCode = reqUrl.searchParams.get('code');
      if (!authCode) {
        res.writeHead(400).end('Brak kodu autoryzacji.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>Autoryzacja zakończona — możesz zamknąć tę kartę i wrócić do terminala.</body></html>');
      server.close();
      resolve(authCode);
    });
    server.on('error', reject);
    server.listen(CALLBACK_PORT);
  });

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Zapisano token w ${TOKEN_PATH} — kolejne uruchomienia nie będą już wymagać logowania.\n`);
  return client;
}

async function ensureLabels(gmail) {
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const byName = new Map(data.labels.map((l) => [l.name, l.id]));
  const ids = {};

  for (const label of LABELS) {
    if (byName.has(label.name)) {
      ids[label.name] = byName.get(label.name);
      continue;
    }
    const { data: created } = await gmail.users.labels.create({
      userId: 'me',
      requestBody: { name: label.name, color: label.color, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    });
    ids[label.name] = created.id;
    console.log(`Utworzono etykietę ${label.name}`);
  }
  return ids;
}

function buildQuery(labelIds) {
  const exclusions = LABELS.map((l) => `-label:"${l.name}"`).join(' ');
  const dateFilter = DAYS_BACK ? ` newer_than:${DAYS_BACK}d` : '';
  return `in:inbox ${exclusions}${dateFilter}`;
}

async function* listUnlabeledMessages(gmail, query) {
  let pageToken;
  let fetched = 0;
  do {
    const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100, pageToken });
    for (const m of data.messages || []) {
      yield m.id;
      fetched += 1;
      if (fetched >= MAX_MESSAGES) return;
    }
    pageToken = data.nextPageToken;
  } while (pageToken && fetched < MAX_MESSAGES);
}

function header(headers, name) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function buildPrompt({ subject, sender, snippet }) {
  return `Sklasyfikuj poniższy e-mail do jednej z pięciu kategorii: ${CATEGORIES.join(', ')}. Użyj "Inne" tylko gdy żadna z pozostałych czterech nie pasuje.

Temat: ${subject}
Nadawca: ${sender}
Fragment treści: ${snippet}

Odpowiedz WYŁĄCZNIE obiektem JSON, bez dodatkowego tekstu:
{
  "probabilities": { ${CATEGORIES.map((c) => `"${c}": 0.0`).join(', ')} },
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
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = await res.json();
  const parsed = extractJson(json.choices[0].message.content);
  return pickTop(parsed.probabilities);
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Brak OPENROUTER_API_KEY w .env. Ustaw go przed uruchomieniem.');
    process.exit(1);
  }

  const auth = await loadOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const labelIds = await ensureLabels(gmail);
  const query = buildQuery(labelIds);

  console.log(`Szukam nieoznakowanej poczty: ${query}\n`);

  const summary = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  let processed = 0;
  let errors = 0;

  for await (const id of listUnlabeledMessages(gmail, query)) {
    try {
      const { data: msg } = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From'] });
      const email = {
        subject: header(msg.payload.headers, 'Subject'),
        sender: header(msg.payload.headers, 'From'),
        snippet: msg.snippet || '',
      };

      const category = await classify(email);
      const labelName = `Jev/${category}`;
      const labelId = labelIds[labelName];
      if (!labelId) throw new Error(`Nieznana kategoria zwrócona przez Jev: ${category}`);

      await gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: [labelId] } });
      summary[category] = (summary[category] || 0) + 1;
      processed += 1;
      console.log(`[${processed}] ${category.padEnd(11)} — ${email.subject.slice(0, 70)}`);
    } catch (err) {
      errors += 1;
      console.error(`Błąd przy wiadomości ${id}: ${err.message}`);
    }
    await sleep(250);
  }

  console.log('\nGotowe.');
  console.log(`Przetworzono: ${processed}, błędów: ${errors}`);
  console.log('Podsumowanie kategorii:', summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
