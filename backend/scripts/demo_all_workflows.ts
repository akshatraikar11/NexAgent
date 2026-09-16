/**
 * NexAgent Full Platform Demo — runs all 6 workflows + loads all 4 evaluations.
 * Usage: MOCK_MODE=true NODE_ENV=production npx tsx scripts/demo_all_workflows.ts
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from '../src/orchestrator/runner.js';
import { getPipelineSteps } from '../src/orchestrator/registry.js';
import type { PipelineContext, PipelineType } from '../src/orchestrator/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function baseContext(runId: string): PipelineContext {
  return {
    runId,
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
    threshold: 0.60,
    decision: 'PENDING',
    stepResults: {},
    metadata: {},
  };
}

interface DemoScenario {
  name: string;
  type: PipelineType;
  expectedDecision: 'AUTO_RESOLVE' | 'ESCALATE' | 'INGESTED';
  ctx: Partial<PipelineContext> & { metadata?: Record<string, unknown> };
}

// Scenarios aligned to mock fixtures in jira.mock.ts, github.mock.ts, sentry.mock.ts, llm/mock.ts
const SCENARIOS: DemoScenario[] = [
  {
    name: 'W1: VPN Password Reset → auto-resolve',
    type: 'TICKET_TRIAGE',
    expectedDecision: 'AUTO_RESOLVE',
    ctx: { externalTicketId: 'JIRA-101', actionType: 'jira_comment' },
  },
  {
    name: 'W1: Billing Double Charge → escalate',
    type: 'TICKET_TRIAGE',
    expectedDecision: 'ESCALATE',
    ctx: { externalTicketId: 'JIRA-102', actionType: 'status_change' },
  },
  {
    name: 'W2: DB Outage P1 (INC-8891) → escalate',
    type: 'INCIDENT_RESPONSE',
    expectedDecision: 'ESCALATE',
    ctx: { alertId: 'INC-8891', actionType: 'prod_deploy' },
  },
  {
    name: 'W2: Staging Memory Warning P3 → auto-resolve',
    type: 'INCIDENT_RESPONSE',
    expectedDecision: 'AUTO_RESOLVE',
    ctx: { alertId: 'INC-7702', actionType: 'slack_notification' },
  },
  {
    name: 'W3: KB ingest VPN solution → quality gate pass',
    type: 'KB_SELF_LEARNING',
    expectedDecision: 'INGESTED',
    ctx: { ticketId: 'JIRA-101', llmResponse: 'Reset VPN via self-service portal with MFA.' },
  },
  {
    name: 'W4: CI flaky test RUN-1002 → auto-retry',
    type: 'CI_TRIAGE',
    expectedDecision: 'AUTO_RESOLVE',
    ctx: { actionType: 'status_change', metadata: { ciRunId: 'RUN-1002' } },
  },
  {
    name: 'W4: CI real regression RUN-1001 → escalate',
    type: 'CI_TRIAGE',
    expectedDecision: 'ESCALATE',
    ctx: { actionType: 'status_change', metadata: { ciRunId: 'RUN-1001' } },
  },
  {
    name: 'W5: Docker timeout BUILD-501 → auto-retry',
    type: 'BUILD_DEPLOY',
    expectedDecision: 'AUTO_RESOLVE',
    ctx: { actionType: 'prod_deploy', metadata: { buildId: 'BUILD-501' } },
  },
  {
    name: 'W5: Missing ENV BUILD-502 → escalate',
    type: 'BUILD_DEPLOY',
    expectedDecision: 'ESCALATE',
    ctx: { actionType: 'prod_deploy', metadata: { buildId: 'BUILD-502' } },
  },
  {
    name: 'W6: MergeGate PR-42 README → auto-merge',
    type: 'MERGEGATE',
    expectedDecision: 'AUTO_RESOLVE',
    ctx: { actionType: 'auto_merge_pr', metadata: { prNumber: '42' } },
  },
  {
    name: 'W6: MergeGate PR-99 payment rewrite → escalate',
    type: 'MERGEGATE',
    expectedDecision: 'ESCALATE',
    ctx: { actionType: 'auto_merge_pr', metadata: { prNumber: '99' } },
  },
];

function extractEvalMetrics() {
  const resultsDir = path.join(__dirname, '../results');
  const eval1 = readFileSync(path.join(resultsDir, 'eval_report.md'), 'utf-8');

  const row = (label: string) => {
    const m = eval1.match(new RegExp(`${label}[^|]*\\| ([\\d.]+) \\| ([\\d.]+) \\| ([\\d.]+)`));
    return m ? { p: m[1], r: m[2], f1: m[3] } : null;
  };

  const fitted = row('Fitted CCEP \\(LogReg weights\\)');
  const fixed = row('Fixed Threshold \\(w=bootstrap');
  const irFitted = eval1.match(/Fitted CCEP \(TT weights → IR\) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+)/);

  let eval2 = { pipe: 'N/A', naive: 'N/A' };
  if (existsSync(path.join(resultsDir, 'eval2_orchestrator_vs_naive.md'))) {
    const e2 = readFileSync(path.join(resultsDir, 'eval2_orchestrator_vs_naive.md'), 'utf-8');
    eval2 = {
      pipe: e2.match(/Full Pipeline \+ CCEP \| ([\d.]+)%/)?.[1] ?? 'N/A',
      naive: e2.match(/Naive Single-Prompt \| ([\d.]+)%/)?.[1] ?? 'N/A',
    };
  }

  let eval3 = { before: 'N/A', after: 'N/A', lift: 'N/A' };
  if (existsSync(path.join(resultsDir, 'eval3_kb_impact.md'))) {
    const e3 = readFileSync(path.join(resultsDir, 'eval3_kb_impact.md'), 'utf-8');
    eval3 = {
      before: e3.match(/Before KB ingestion \| \d+\/\d+ \| ([\d.]+)%/)?.[1] ?? 'N/A',
      after: e3.match(/After KB ingestion \| \d+\/\d+ \| ([\d.]+)%/)?.[1] ?? 'N/A',
      lift: e3.match(/Lift:\*\* \+([\d.]+)/)?.[1] ?? 'N/A',
    };
  }

  return { fitted, fixed, irFitted, eval2, eval3 };
}

function checkPass(
  expected: DemoScenario['expectedDecision'],
  final: PipelineContext
): boolean {
  if (expected === 'INGESTED') {
    const ingested = final.stepResults['ingest_kb'] as { ingested?: boolean } | undefined;
    return ingested?.ingested === true;
  }
  return final.decision === expected;
}

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  NEXAGENT LIVE DEMO — 6 Workflows x 11 Scenarios + 4 Evaluations');
  console.log('='.repeat(72));

  const results: {
    name: string;
    type: string;
    steps: number;
    decision: string;
    ccepScore: number;
    expected: string;
    pass: boolean;
    action?: string;
    agencyMeta?: string;
  }[] = [];

  for (const scenario of SCENARIOS) {
    const steps = getPipelineSteps(scenario.type);
    const ctx: PipelineContext = { ...baseContext(`demo-${Date.now()}`), ...scenario.ctx };
    if (scenario.ctx.metadata) ctx.metadata = { ...scenario.ctx.metadata };

    const final = await runPipeline(steps, ctx, { backoffBaseMs: 1 });
    const pass = checkPass(scenario.expectedDecision, final);

    const exec = final.stepResults['execute_or_escalate'] as { action?: string } | undefined;
    const ingest = final.stepResults['ingest_kb'] as { ingested?: boolean } | undefined;

    let agencyMeta = '';
    if (final.metadata['incidentSeverity']) {
      agencyMeta = `P${String(final.metadata['incidentSeverity']).replace('P', '')} | Team: ${((final.metadata['responseTeam'] as string[]) ?? []).slice(0, 2).join(', ')}`;
    }
    if (final.metadata['itilPriority']) agencyMeta = `ITIL: ${final.metadata['itilPriority']}`;

    results.push({
      name: scenario.name,
      type: scenario.type,
      steps: steps.length,
      decision: scenario.expectedDecision === 'INGESTED'
        ? (ingest?.ingested ? 'INGESTED' : 'SKIPPED')
        : final.decision,
      ccepScore: final.ccepScore,
      expected: scenario.expectedDecision,
      pass,
      action: exec?.action ?? (ingest?.ingested ? 'KB_INGESTED' : undefined),
      agencyMeta,
    });
  }

  console.log('\n### ALL 6 WORKFLOWS — DEMO RESULTS\n');
  console.log('| # | Workflow | Scenario | Steps | CCEP | Result | Expected | Status |');
  console.log('|---|----------|----------|-------|------|--------|----------|--------|');
  results.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.type.replace('_', ' ')} | ${r.name.slice(4, 40)} | ${r.steps} | ${r.ccepScore.toFixed(3)} | ${r.decision} | ${r.expected} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  });

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n>>> Workflow demo: ${passed}/${results.length} scenarios PASS (${((passed / results.length) * 100).toFixed(0)}%)\n`);

  // Show one auto + one escalate with CCEP breakdown
  const auto = results.find((r) => r.decision === 'AUTO_RESOLVE' && r.pass);
  const esc = results.find((r) => r.decision === 'ESCALATE' && r.pass);
  console.log('### CCEP DECISION EXAMPLES\n');
  if (auto) console.log(`  AUTO:  ${auto.name} → CCEP ${auto.ccepScore.toFixed(3)} < 0.60 → ${auto.action}`);
  if (esc) console.log(`  ESC:   ${esc.name} → CCEP ${esc.ccepScore.toFixed(3)} >= 0.60 → ${esc.action}`);
  if (results.find((r) => r.decision === 'INGESTED')) {
    const kb = results.find((r) => r.expected === 'INGESTED')!;
    console.log(`  KB:    ${kb.name} → solution ingested into ChromaDB`);
  }

  const m = extractEvalMetrics();
  console.log('\n### 4 EMPIRICAL EVALUATIONS — ACCURACY\n');
  console.log('| Eval | What it measures | Result |');
  console.log('|------|------------------|--------|');
  if (m.fitted && m.fixed) {
    console.log(`| **Eval 1** | CCEP vs baselines (N=47 test) | Fitted F1=${m.fitted.f1} beats Fixed F1=${m.fixed.f1} | Precision=${m.fitted.p}, Recall=${m.fitted.r} |`);
  }
  console.log(`| **Eval 2** | Full pipeline vs naive LLM | Pipeline ${m.eval2.pipe}% vs Naive ${m.eval2.naive}% (+${Number(m.eval2.pipe) - Number(m.eval2.naive)}pp) |`);
  console.log(`| **Eval 3** | KB self-learning impact | ${m.eval3.before}% → ${m.eval3.after}% (+${m.eval3.lift}pp lift) |`);
  if (m.irFitted) {
    console.log(`| **Eval 4** | Cross-domain transfer (N=30 IR) | F1=${m.irFitted[3]} (TT weights applied without refit) |`);
  }

  console.log('\n### WHAT MAKES NEXAGENT UNIQUE\n');
  [
    ['Transparent CCEP', 'Every decision shows w1-w4 signal breakdown — ServiceNow/Freshservice are black-box'],
    ['Learned policy', 'Logistic regression on 155 scenarios, not a fixed 0.7 threshold'],
    ['Dual-LLM consensus', 'Gemini + Groq with embedding similarity — halves confidence on disagreement'],
    ['One gate, 6 workflows', 'Same CCEP formula for IT, SRE, QA, DevOps, Dev, KB'],
    ['Cross-domain eval', 'Weights fitted on tickets, tested on incidents without refitting'],
    ['Custom orchestrator', 'Built from scratch — no LangChain/CrewAI dependency'],
    ['Agency-agents NEXUS', 'P0-P3 severity, ITIL triage, Incident Commander prompts integrated'],
    ['Human override loop', 'Approvals queue feeds historical_error_rate for continuous learning'],
    ['Zero cost', 'Free-tier APIs + Docker Compose + offline Python fitting'],
  ].forEach(([title, desc], i) => console.log(`  ${i + 1}. **${title}:** ${desc}`));

  console.log('\n' + '='.repeat(72));
  console.log(`  DEMO COMPLETE — ${passed}/${results.length} workflows verified`);
  console.log('='.repeat(72) + '\n');

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
