'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function verify(fixture) {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-ai-policy.js', '--offline', '--policy', fixture],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('reports NOT_READY when the owner has not approved stage 1', () => {
  const report = verify('test/fixtures/ai-policy-not-approved.json');

  assert.equal(report.status, 'NOT_READY');
  assert.deepEqual(report.missing, ['owner_approval']);
});

test('reports READY when all stage 1 rules are approved', () => {
  const report = verify('test/fixtures/ai-policy-approved.json');

  assert.equal(report.status, 'READY');
  assert.deepEqual(report.missing, []);
});
