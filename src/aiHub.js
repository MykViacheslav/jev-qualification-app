'use strict';

const fs = require('fs');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createAiPlan(request, { policy, hub }) {
  const { workstream, action } = request || {};
  const hubWorkstream = hub?.workstreams?.[workstream];
  if (!hubWorkstream) throw new Error(`Unknown workstream: ${workstream}`);

  if (workstream === 'governance') {
    if (action !== 'audit_stage') throw new Error(`Action "${action}" is not allowed for governance.`);
  } else {
    const policyWorkstream = policy?.workstreams?.[workstream];
    if (!policyWorkstream) throw new Error(`Missing policy for workstream: ${workstream}`);
    if (!policyWorkstream.allowedActions?.includes(action)) {
      throw new Error(`Action "${action}" is not allowed for ${workstream}.`);
    }
  }

  const profile = hub?.profiles?.[hubWorkstream.profile];
  if (!profile?.model || !profile.endpoint) {
    throw new Error(`Invalid AI profile for ${workstream}.`);
  }

  return {
    workstream,
    action,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort ?? null,
    endpoint: profile.endpoint,
    requiresFreshInputs: hubWorkstream.requiresFreshInputs === true,
    execution: hubWorkstream.execution,
  };
}

module.exports = { createAiPlan, loadJson };
