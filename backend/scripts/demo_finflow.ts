/**
 * demo_finflow.ts — Real-world scenario validation for FinFlow Payments
 *
 * Company: FinFlow Payments
 * Industry: B2B payments platform (PCI DSS Level 1), 3,000+ merchants, 150-person eng org
 * Service desk: IT Helpdesk + SRE On-Call + Engineering
 *
 * 5 scenarios covering all real desk situations:
 *   1. Merchant Portal SSO broken (Ticket Triage → ESCALATE)
 *   2. New employee laptop onboarding (Ticket Triage → AUTO_RESOLVE)
 *   3. Duplicate charge billing dispute (Ticket Triage → ESCALATE)
 *   4. Payment API 100% down (Incident Response → ESCALATE)
 *   5. Stripe SDK v5 PR upgrade (MergeGate → ESCALATE)
 *
 * Run: npx tsx scripts/demo_finflow.ts
 * Requires: MOCK_MODE=true (default), PostgreSQL running + migrated
 */

import dotenv from 'dotenv';
dotenv.config();

import { getPipelineSteps } from '../src/orchestrator/registry.js';
import { runPipeline } from '../src/orchestrator/runner.js';
import { PipelineContext } from '../src/orchestrator/types.js';
import { prisma, isDatabaseConnected } from '../src/db/client.js';

// ── Import mock data to ensure FinFlow fixtures are registered ────────────────
import '../src/mcp/mock-data/jira.mock.js';
import '../src/mcp/mock-data/sentry.mock.js';
import '../src/mcp/mock-data/github.mock.js';

const PASS = '\u2705'; // ✅
const FAIL = '\u274C'; // ❌
const WARN = '\u26A0\uFE0F'; // ⚠️

interface Scenario {
  id: string;
  name: string;
  company: string;
  context: string;         // why this matters at FinFlow
  pipelineType: string;
  input: Partial<PipelineContext>;
  expectedDecision: 'ESCALATE' | 'AUTO_RESOLVE';
  expectedReason: string;  // human-readable justification
}

const SCENARIOS: Scenario[] = [
  {
    id: 'FF-S1',
    name: 'Merchant Portal SSO — redirect loop affecting 400+ merchants',
    company: 'FinFlow Payments',
    context: 'Auth0 redirect_uri mismatch broke login for all merchants after a NGINX config change. Revenue-affecting: merchants cannot access their dashboards to manage payouts.',
    pipelineType: 'TICKET_TRIAGE',
    input: {
      externalTicketId: 'FF-1001',
      metadata: {},
    },
    expectedDecision: 'ESCALATE',
    expectedReason: 'INFRASTRUCTURE category, high error count, production impact — CCEP should score above 0.60',
  },
  {
    id: 'FF-S2',
    name: 'New employee onboarding — standard IT checklist',
    company: 'FinFlow Payments',
    context: 'New hire joining data engineering. Low urgency, fully scripted process: provision MacBook, Okta, GitHub, Jira, VPN. Should auto-resolve with a checklist comment.',
    pipelineType: 'TICKET_TRIAGE',
    input: {
      externalTicketId: 'FF-1002',
      metadata: {},
    },
    expectedDecision: 'AUTO_RESOLVE',
    expectedReason: 'IT_SUPPORT low-priority standard task — well-known procedure, low reversibility risk',
  },
  {
    id: 'FF-S3',
    name: 'Duplicate transaction charge — billing dispute with chargeback risk',
    company: 'FinFlow Payments',
    context: 'Merchant GreenLeaf Retail was double-charged $249.99 due to idempotency key collision. Chargeback risk and potential PCI DSS audit trigger. Requires manual refund and audit trail.',
    pipelineType: 'TICKET_TRIAGE',
    input: {
      externalTicketId: 'FF-1003',
      metadata: {},
    },
    expectedDecision: 'ESCALATE',
    expectedReason: 'BILLING category forces historicalErrorRate ≥ 0.60 and reversibility ≥ 0.85 — safe for automation is false here',
  },
  {
    id: 'FF-S4',
    name: 'Payment API down — 100% error rate, $18k/min revenue impact',
    company: 'FinFlow Payments',
    context: 'All /v2/charge requests returning 502. Stripe upstream connection refused. 8,400 req/min failing. P0 severity. SRE on-call must be paged immediately.',
    pipelineType: 'INCIDENT_RESPONSE',
    input: {
      alertId: 'FF-INC-201',
      metadata: {},
    },
    expectedDecision: 'ESCALATE',
    expectedReason: 'P0 incident: payment processing down keyword triggers severity=P0, reversibility=1.0, historicalErrorRate=0.65',
  },
  {
    id: 'FF-S5',
    name: 'Stripe SDK v5 PR — breaking API changes across 22 files',
    company: 'FinFlow Payments',
    context: 'PR touches payments/, billing/, webhooks/, api/checkout — all high-risk PCI modules. 22 files, 610 additions. Should never auto-merge without senior review.',
    pipelineType: 'MERGEGATE',
    input: {
      metadata: { prNumber: 'FF-301' },
    },
    expectedDecision: 'ESCALATE',
    expectedReason: 'Touches HIGH_RISK_MODULES (payments/, billing/, auth/) — adjustedConfidence hard-capped to 0.20',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContext(runId: string, s: Scenario): PipelineContext {
  return {
    runId,
    ticketId: undefined,
    externalTicketId: (s.input as Record<string, unknown>)['externalTicketId'] as string | undefined,
    alertId: (s.input as Record<string, unknown>)['alertId'] as string | undefined,
    ticketTitle: '',
    ticketDescription: '',
    categoryId: undefined,
    actionType: undefined,
    threshold: 0.60,
    kbMatches: [],
    llmResponse: '',
    geminiConfidence: 0,
    groqConfidence: 0,
    cosineSimilarity: 0,
    modelConfidence: 0,
    dualModelAgreed: true,
    guardrailFlags: [],
    guardrailFlagCount: 0,
    normalizedGuardrailScore: 0,
    historicalErrorRate: 0,
    actionReversibilityWeight: 0,
    ccepScore: 0,
    decision: 'PENDING',
    stepResults: {},
    metadata: (s.input.metadata as Record<string, unknown>) ?? {},
  };
}

function printBox(lines: string[]) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const border = '─'.repeat(width);
  console.log(`┌${border}┐`);
  for (const l of lines) console.log(`│  ${l.padEnd(width - 2)}│`);
  console.log(`└${border}┘`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   NexAgent — FinFlow Payments Real-World Scenario Validation  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const dbOk = await isDatabaseConnected();
  console.log(`Database: ${dbOk ? PASS + ' connected' : WARN + ' offline (mock mode only — some signals degraded)'}\n`);

  const results: { id: string; pass: boolean; decision: string; score: number; expected: string }[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n${'─'.repeat(66)}`);
    console.log(`Scenario ${scenario.id}: ${scenario.name}`);
    console.log(`Context : ${scenario.context}`);
    console.log(`Pipeline: ${scenario.pipelineType}  |  Expected: ${scenario.expectedDecision}`);
    console.log(`Reason  : ${scenario.expectedReason}`);
    console.log('');

    // Create a PipelineRun record (required by orchestrator for DB writes)
    let runId = `demo-ff-${scenario.id.toLowerCase()}-${Date.now()}`;
    if (dbOk) {
      const run = await prisma.pipelineRun.create({
        data: {
          type: scenario.pipelineType as Parameters<typeof prisma.pipelineRun.create>[0]['data']['type'],
          status: 'PENDING',
          context: {},
        },
      });
      runId = run.id;
    }

    const ctx = buildContext(runId, scenario);
    const steps = getPipelineSteps(scenario.pipelineType as Parameters<typeof getPipelineSteps>[0]);

    const start = Date.now();
    let finalCtx: PipelineContext;
    try {
      finalCtx = await runPipeline(steps, ctx, { backoffBaseMs: 100 });
    } catch (err) {
      console.error(`  ERROR running pipeline: ${(err as Error).message}`);
      results.push({ id: scenario.id, pass: false, decision: 'ERROR', score: 0, expected: scenario.expectedDecision });
      continue;
    }
    const elapsed = Date.now() - start;

    const decision = finalCtx.decision;
    const ccepScore = finalCtx.ccepScore;
    const pass = decision === scenario.expectedDecision;
    results.push({ id: scenario.id, pass, decision, score: ccepScore, expected: scenario.expectedDecision });

    const icon = pass ? PASS : FAIL;
    printBox([
      `${icon}  Decision : ${decision}  (expected: ${scenario.expectedDecision})`,
      `   CCEP    : ${ccepScore.toFixed(4)}  (threshold: ${finalCtx.threshold})`,
      `   Conf.   : ${finalCtx.modelConfidence.toFixed(3)}  | Err Rate: ${finalCtx.historicalErrorRate.toFixed(3)}  | Rev: ${finalCtx.actionReversibilityWeight.toFixed(3)}`,
      `   Signals : w1=${finalCtx.signalBreakdown?.modelConfidenceContribution?.toFixed(3) ?? '?'}  w2=${finalCtx.signalBreakdown?.historicalErrorRateContribution?.toFixed(3) ?? '?'}  w3=${finalCtx.signalBreakdown?.guardrailFlagsContribution?.toFixed(3) ?? '?'}  w4=${finalCtx.signalBreakdown?.actionReversibilityContribution?.toFixed(3) ?? '?'}`,
      `   Steps   : ${Object.keys(finalCtx.stepResults).join(' → ')}`,
      `   Time    : ${elapsed}ms`,
    ]);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed}/${SCENARIOS.length} scenarios matched expected decision          ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const allPass = passed === SCENARIOS.length;
  for (const r of results) {
    const icon = r.pass ? PASS : FAIL;
    console.log(`  ${icon}  ${r.id.padEnd(8)} ${r.decision.padEnd(14)} (score: ${r.score.toFixed(4)})  expected: ${r.expected}`);
  }

  console.log('');

  if (allPass) {
    console.log(`${PASS}  All ${SCENARIOS.length} FinFlow scenarios produced correct decisions.\n`);
  } else {
    const failed = results.filter((r) => !r.pass);
    console.log(`${FAIL}  ${failed.length} scenario(s) did NOT match expected decision:`);
    for (const r of failed) {
      console.log(`     ${r.id}: got ${r.decision}, expected ${r.expected} (CCEP=${r.score.toFixed(4)})`);
    }
    console.log('');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
