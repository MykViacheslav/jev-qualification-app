'use strict';

// Stage 1 gate: Jev audits evidence against a local policy before the project
// may move to the next stage. The --offline mode is deterministic and is used
// by tests; normal mode uses Jev 1.13's typed Decisions API.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_POLICY_PATH = path.join(ROOT, 'config', 'ai-policy.json');
const REQUIRED_WORKSTREAMS = ['gmail', 'investments', 'techmodul', 'clients'];

function parseArgs(argv) {
  const args = { offline: false, policyPath: DEFAULT_POLICY_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--offline') args.offline = true;
    if (argv[index] === '--policy') {
      args.policyPath = path.resolve(ROOT, argv[index + 1] || '');
      index += 1;
    }
  }
  return args;
}

function loadPolicy(policyPath) {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

function validatePolicy(policy) {
  const missing = [];
  if (policy.stage !== 'stage-1') missing.push('stage_1_policy');
  if (!policy.transition?.blockNextStageUntilOwnerApproval) missing.push('stage_transition_lock');
  if (policy.models?.decisionGate !== 'typesafe/jev-1.13') missing.push('jev_decision_gate');
  if (policy.models?.expensiveAnalysis !== 'not_selected') missing.push('unapproved_expensive_model_lock');
  if (!policy.budgetPolicy?.separateKeyPerWorkstreamRequiredBeforeAutomation) missing.push('separate_key_rule');
  if (!policy.budgetPolicy?.spendingLimitsRequiredBeforeAutomation) missing.push('spending_limit_rule');

  for (const name of REQUIRED_WORKSTREAMS) {
    if (!policy.workstreams?.[name]) missing.push(`workstream_${name}`);
  }
  if (!policy.workstreams?.investments?.forbiddenActions?.includes('place_order')) missing.push('investment_order_lock');
  if (!policy.workstreams?.techmodul?.forbiddenActions?.includes('change_work_time')) missing.push('techmodul_read_only_lock');
  if (!policy.workstreams?.clients?.forbiddenActions?.includes('send_message')) missing.push('client_send_lock');

  return missing;
}

function buildEvidence(policy, policyPath) {
  const ruleMissing = validatePolicy(policy);
  return {
    stage: policy.stage,
    policyFile: path.relative(ROOT, policyPath),
    rulesValid: ruleMissing.length === 0,
    ruleMissing,
    ownerApproval: policy.ownerApproval === true,
    workstreams: Object.keys(policy.workstreams || {}).sort(),
  };
}

function deterministicAudit(evidence) {
  const missing = [...evidence.ruleMissing];
  if (!evidence.ownerApproval) missing.push('owner_approval');
  return {
    status: missing.length === 0 ? 'READY' : 'NOT_READY',
    completed: evidence.rulesValid ? ['policy_rules'] : [],
    missing,
    nextAction: missing.length === 0
      ? 'Stage 1 is complete. Ask the owner before starting stage 2.'
      : missing.includes('owner_approval')
        ? 'Ask the owner to review and approve the stage 1 policy.'
        : 'Repair the missing policy rules before requesting approval.',
  };
}

async function askJev(evidence) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('Brak OPENROUTER_API_KEY w .env.');
  const response = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.JEV_AUDITOR_MODEL || 'typesafe/jev-1.13',
      state: evidence,
      questions: {
        stage_status: {
          type: 'choice',
          instructions: 'Does this evidence prove that stage 1 of the AI operations plan is complete? Choose READY only when every rule is valid and the owner has approved it. Otherwise choose NOT_READY.',
          criteria: {
            READY: 'Every policy rule is valid and ownerApproval is true.',
            NOT_READY: 'Any policy rule is missing or invalid, or ownerApproval is false.',
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Jev audit failed: HTTP ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const answer = json.answers?.stage_status;
  if (!['READY', 'NOT_READY'].includes(answer?.choice)) throw new Error('Jev returned an invalid stage status.');
  return {
    status: answer.choice,
    completed: [],
    missing: [],
    nextAction: answer.choice === 'READY'
      ? 'Stage 1 is complete. Ask the owner before starting stage 2.'
      : 'Keep stage 2 blocked and resolve the missing approval or rule.',
    jev: {
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    },
  };
}

function applySafetyGate(report, evidence) {
  const requiredMissing = [...evidence.ruleMissing];
  if (!evidence.ownerApproval) requiredMissing.push('owner_approval');
  const missing = [...new Set([...report.missing, ...requiredMissing])];
  return {
    ...report,
    status: missing.length === 0 ? report.status : 'NOT_READY',
    missing,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = loadPolicy(args.policyPath);
  const evidence = buildEvidence(policy, args.policyPath);
  const rawReport = args.offline ? deterministicAudit(evidence) : await askJev(evidence);
  const report = applySafetyGate(rawReport, evidence);
  console.log(JSON.stringify({ auditor: args.offline ? 'deterministic-test-gate' : 'Jev 1.13', evidence, ...report }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
