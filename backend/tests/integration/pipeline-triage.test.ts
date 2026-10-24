import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { TICKET_TRIAGE_STEPS } from '../../src/pipelines/ticket-triage.pipeline.js';
import { makeTestCtx } from '../helpers/pipeline-context.js';

describe('Mandatory Pipeline 1: Ticket Triage End-to-End Test', () => {
  // Uses JIRA-104 (Password Reset — no VPN/DNS keywords) to avoid triggering
  // real host remediation (PowerShell commands). Host remediation paths are
  // covered separately in tests/unit/host-remediation-failures.test.ts and
  // tests/integration/verification-failure-outcome.test.ts.
  it('Executes Ticket Triage pipeline and logs state transitions across all 7 steps', async () => {
    const initialContext = makeTestCtx({
      runId: 'triage-run-104',
      ticketId: 'JIRA-104',
      externalTicketId: 'JIRA-104',
      historicalErrorRate: 0.10,
      actionReversibilityWeight: 0.30,
      threshold: 0.33,
    });

    const finalCtx = await runPipeline(TICKET_TRIAGE_STEPS, initialContext, { backoffBaseMs: 1 });

    // All 7 step results must be populated
    expect(finalCtx.stepResults['fetch_ticket']).toBeDefined();
    expect(finalCtx.stepResults['classify_itil']).toBeDefined();
    expect(finalCtx.stepResults['search_kb']).toBeDefined();
    expect(finalCtx.stepResults['generate_response']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Password reset is low-risk: AUTO_RESOLVE expected
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.ccepScore).toBeLessThan(0.33);
  });
});
