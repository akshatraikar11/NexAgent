import dotenv from 'dotenv';
import path from 'path';
import { runPipeline } from '../src/orchestrator/runner.js';
import { getPipelineSteps } from '../src/orchestrator/registry.js';
import type { PipelineContext } from '../src/orchestrator/types.js';
import { DEFAULT_CCEP_THRESHOLD } from '../src/ccep/constants.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runLiveTest() {
  console.log('='.repeat(75));
  console.log('  NEXAGENT LIVE E2E TEST: Real Jira + Real Gemini + Real Slack');
  console.log('='.repeat(75));

  const runId = `live-test-${Date.now()}`;
  const steps = getPipelineSteps('TICKET_TRIAGE');

  const ctx: PipelineContext = {
    runId,
    externalTicketId: 'SCRUM-1', // Real Jira ticket created by user
    ticketId: 'SCRUM-1',
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
    historicalErrorRate: 0.05,
    actionReversibilityWeight: 0.10,
    ccepScore: 0,
    threshold: DEFAULT_CCEP_THRESHOLD,
    decision: 'PENDING',
    stepResults: {},
    metadata: {},
  };

  console.log(`\n[INIT] Launching Ticket Triage Pipeline with ticket: SCRUM-1`);
  console.log(`[CONFIG] Jira: ${process.env.JIRA_BASE_URL} | Mock Mode: ${process.env.MOCK_MODE}`);
  console.log(`[PIPELINE] Total Steps: ${steps.length}`);

  const startTime = Date.now();
  const final = await runPipeline(steps, ctx, { backoffBaseMs: 100 });
  const duration = Date.now() - startTime;

  console.log('\n' + '='.repeat(75));
  console.log('  LIVE EXECUTION COMPLETED');
  console.log('='.repeat(75));
  console.log(`Pipeline Status: COMPLETED in ${duration}ms`);
  console.log(`Ticket Key:       ${final.externalTicketId}`);
  console.log(`Ticket Title:     ${final.ticketTitle}`);
  console.log(`Category:         ${final.category}`);
  console.log(`LLM Response:     ${final.llmResponse?.slice(0, 100)}...`);
  console.log(`Model Confidence: ${(final.modelConfidence * 100).toFixed(1)}%`);
  console.log(`CCEP Risk Score:  ${final.ccepScore.toFixed(3)} (Threshold: ${final.threshold})`);
  console.log(`Final Decision:   ${final.decision}`);
  
  const execResult = final.stepResults['execute_or_escalate'] as any;
  if (execResult) {
    console.log(`Execution Action: ${execResult.action}`);
    if (execResult.slackResult) {
      console.log(`Slack Status:     Message posted to ${execResult.slackResult.channel}`);
    }
  }

  console.log('='.repeat(75));
}

runLiveTest().catch(console.error);
