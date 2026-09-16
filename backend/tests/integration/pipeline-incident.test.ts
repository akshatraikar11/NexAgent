import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { INCIDENT_RESPONSE_STEPS } from '../../src/pipelines/incident-response.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';

describe('Mandatory Pipeline 2: Incident Response End-to-End Test', () => {
  it('Executes Incident Response pipeline and logs state transitions across all 7 steps', async () => {
    const initialContext: PipelineContext = {
      runId: 'incident-run-201',
      alertId: 'INC-8891',
      ticketTitle: 'Database Connection Timeout in Region US-East-1',
      ticketDescription: 'High severity alert: PostgreSQL connection pool exhausted.',
      actionType: 'prod_deploy', // High risk action (1.0 weight)
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
      historicalErrorRate: 0.80,
      actionReversibilityWeight: 1.0,
      ccepScore: 0,
      threshold: 0.30,
      decision: 'PENDING',
      stepResults: {},
      metadata: {},
    };

    const finalCtx = await runPipeline(INCIDENT_RESPONSE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 6 step results logged
    expect(finalCtx.stepResults['parse_alert']).toBeDefined();
    expect(finalCtx.stepResults['classify_severity']).toBeDefined();
    expect(finalCtx.stepResults['correlate_history']).toBeDefined();
    expect(finalCtx.stepResults['generate_response']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // High risk action + high error rate -> ESCALATE decision
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(0.30);
  });
});
