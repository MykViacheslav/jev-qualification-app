'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { createAiPlan, loadJson } = require('../src/aiHub');

const root = path.join(__dirname, '..');
const policy = loadJson(path.join(root, 'config', 'ai-policy.json'));
const hub = loadJson(path.join(root, 'config', 'ai-hub.json'));

test('creates a read-only investment report plan with the standard Jev route', () => {
  const plan = createAiPlan({ workstream: 'investments', action: 'create_report' }, { policy, hub });

  assert.deepEqual(plan, {
    workstream: 'investments',
    action: 'create_report',
    model: 'typesafe/jev-router',
    reasoningEffort: 'medium',
    endpoint: 'chat',
    requiresFreshInputs: true,
    execution: 'manual-review-required',
  });
});

test('blocks an action forbidden by the stage 1 policy', () => {
  assert.throws(
    () => createAiPlan({ workstream: 'investments', action: 'place_order' }, { policy, hub }),
    /not allowed/,
  );
});

test('uses Jev 1.13 and the Decisions endpoint only for the audit gate', () => {
  const plan = createAiPlan({ workstream: 'governance', action: 'audit_stage' }, { policy, hub });

  assert.equal(plan.model, 'typesafe/jev-1.13');
  assert.equal(plan.endpoint, 'decisions');
  assert.equal(plan.reasoningEffort, null);
});

test('rejects an unknown workstream before any model can be selected', () => {
  assert.throws(
    () => createAiPlan({ workstream: 'unknown', action: 'create_report' }, { policy, hub }),
    /Unknown workstream/,
  );
});
