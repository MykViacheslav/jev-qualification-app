'use strict';

const path = require('path');
const { createAiPlan, loadJson } = require('../src/aiHub');

const ROOT = path.join(__dirname, '..');

function main(argv) {
  const [workstream, action] = argv;
  if (!workstream || !action) {
    throw new Error('Użycie: npm run inspect-ai-plan -- <obszar> <akcja>');
  }

  const policy = loadJson(path.join(ROOT, 'config', 'ai-policy.json'));
  const hub = loadJson(path.join(ROOT, 'config', 'ai-hub.json'));
  console.log(JSON.stringify(createAiPlan({ workstream, action }, { policy, hub }), null, 2));
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
