import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { TICKET_TRIAGE_STEPS } from '../../src/pipelines/ticket-triage.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';

describe('Mandatory Pipeline 1: Ticket Triage End-to-End Test', () => {
  it('Executes Ticket Triage pipeline and logs state transitions across all 7 steps', async () => {
    const initialContext: PipelineContext = {
      runId: 'triage-run-101',
      ticketId: 'JIRA-101',
      externalTicketId: 'JIRA-101',
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
      historicalErrorRate: 0.10,
      actionReversibilityWeight: 0.30,
      ccepScore: 0,
      threshold: 0.60,
      decision: 'PENDING',
      stepResults: {},
      metadata: {},
    };

    const finalCtx = await runPipeline(TICKET_TRIAGE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 6 step results are present in stepResults
    expect(finalCtx.stepResults['fetch_ticket']).toBeDefined();
    expect(finalCtx.stepResults['classify_itil']).toBeDefined();
    expect(finalCtx.stepResults['search_kb']).toBeDefined();
    expect(finalCtx.stepResults['generate_response']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Low score -> AUTO_RESOLVE decision
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.ccepScore).toBeLessThan(0.60);
  });
});
