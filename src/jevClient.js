'use strict';

// Ordered best -> worst. The order matters: it drives which status color
// (good -> warning -> serious -> critical) each bar gets in the admin panel.
const CATEGORIES = [
  'bardzo dobrze zakwalifikowany',
  'zakwalifikowany',
  'przeciętny',
  'niezakwalifikowany',
];

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Jev is called through OpenRouter's standard chat completions API (confirmed
// against a live curl to this endpoint) — there is no separate "System One"
// REST endpoint. So the classification is done by prompting the model to
// return a JSON object with per-category probabilities and a confidence
// score, the same way you'd get structured output from any chat model.
function buildPrompt(answers) {
  return `Jesteś systemem oceny zgłoszeń klienta. Oceń poniższe zgłoszenie i przypisz mu prawdopodobieństwa przynależności do czterech kategorii (od najlepszej do najgorszej): ${CATEGORIES.map((c) => `"${c}"`).join(', ')}.

Opis projektu / potrzeby: ${answers.q1}
Budżet: ${answers.q2}
Termin realizacji: ${answers.q3}

Odpowiedz WYŁĄCZNIE obiektem JSON, bez żadnego dodatkowego tekstu ani formatowania markdown, dokładnie w tym kształcie:
{
  "probabilities": {
    "bardzo dobrze zakwalifikowany": 0.0,
    "zakwalifikowany": 0.0,
    "przeciętny": 0.0,
    "niezakwalifikowany": 0.0
  },
  "confidence": 0.0
}

Prawdopodobieństwa muszą być liczbami z przedziału 0-1 i sumować się w przybliżeniu do 1. "confidence" to Twoja pewność co do tej klasyfikacji, również z przedziału 0-1.`;
}

function buildRequestBody(answers) {
  return {
    model: process.env.JEV_MODEL || 'typesafe/jev-router',
    messages: [{ role: 'user', content: buildPrompt(answers) }],
    response_format: { type: 'json_object' },
  };
}

function extractJson(content) {
  // Strip a ```json ... ``` fence if the model wraps its answer in one.
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  return JSON.parse(candidate.trim());
}

function parseResponse(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Unexpected OpenRouter response shape: no choices[0].message.content.');
  }

  const parsed = extractJson(content);
  const probabilities = parsed.probabilities || {};
  const normalized = {};
  for (const category of CATEGORIES) {
    normalized[category] = typeof probabilities[category] === 'number' ? probabilities[category] : 0;
  }

  return {
    category: pickTopCategory(normalized),
    probabilities: normalized,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    raw: json,
  };
}

function pickTopCategory(probabilities) {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0] || CATEGORIES[CATEGORIES.length - 1];
}

function mockClassification(answers) {
  const weights = CATEGORIES.map(() => Math.random());
  const total = weights.reduce((sum, w) => sum + w, 0);
  const probabilities = {};
  CATEGORIES.forEach((category, i) => {
    probabilities[category] = weights[i] / total;
  });

  return {
    category: pickTopCategory(probabilities),
    probabilities,
    confidence: 0.5 + Math.random() * 0.45,
    raw: { mock: true, answers },
  };
}

async function classifyLead(answers) {
  if (process.env.USE_MOCK_JEV === 'true') {
    return mockClassification(answers);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set. Set it in .env or set USE_MOCK_JEV=true.');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/MykViacheslav/jev-qualification-app',
      'X-Title': 'Jev Qualification Form (test)',
    },
    body: JSON.stringify(buildRequestBody(answers)),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Jev/OpenRouter request failed: ${response.status} ${response.statusText} ${text}`);
  }

  const json = await response.json();
  return parseResponse(json);
}

module.exports = { classifyLead, CATEGORIES };
