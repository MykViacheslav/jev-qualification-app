'use strict';

// Ordered best -> worst. The order matters: it drives which status color
// (good -> warning -> serious -> critical) each bar gets in the admin panel.
const CATEGORIES = [
  'bardzo dobrze zakwalifikowany',
  'zakwalifikowany',
  'przeciętny',
  'niezakwalifikowany',
];

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/system-one';

/*
 * IMPORTANT: this environment's network sandbox could not reach openrouter.ai
 * while this file was written, so the request/response shape below was
 * reconstructed from OpenRouter's published docs summaries rather than a
 * live fetch: a System One request takes `model` + `state` + `questions`;
 * a "choice" question returns a probability per option plus an overall
 * confidence. Before relying on this against the real API, diff it against
 * https://openrouter.ai/docs/guides/community/typesafe-sdk and
 * https://openrouter.ai/typesafe/jev-router and adjust `buildRequestBody`
 * and `parseResponse` below if the field names differ.
 *
 * Set USE_MOCK_JEV=true (see .env.example) to build/demo the UI without an
 * API key or without depending on that shape being exactly right yet.
 */

function buildRequestBody(answers) {
  const state = [
    `Opis projektu / potrzeby: ${answers.q1}`,
    `Budżet: ${answers.q2}`,
    `Termin realizacji: ${answers.q3}`,
  ].join('\n');

  return {
    model: process.env.JEV_MODEL || 'typesafe/jev-router',
    state,
    questions: [
      {
        id: 'qualification',
        type: 'choice',
        question:
          'Na podstawie odpowiedzi zgłaszającego, oceń jego ogólny poziom kwalifikacji do dalszej obsługi.',
        choices: CATEGORIES,
      },
    ],
  };
}

function parseResponse(json) {
  const answer = Array.isArray(json.answers)
    ? json.answers.find((a) => a.id === 'qualification') || json.answers[0]
    : json;

  const probabilities = answer.probabilities || answer.choice_probabilities || {};
  const normalized = {};
  for (const category of CATEGORIES) {
    normalized[category] = typeof probabilities[category] === 'number' ? probabilities[category] : 0;
  }

  return {
    category: answer.choice || answer.answer || pickTopCategory(normalized),
    probabilities: normalized,
    confidence: typeof answer.confidence === 'number' ? answer.confidence : null,
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
