import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { CI_TRIAGE_STEPS } from '../../src/pipelines/ci-triage.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';

describe('Stretch Pipeline 4: CI Test Triage End-to-End Test', () => {
  it('Flaky test (RUN-1002) → AUTO_RESOLVE (retry)', async () => {
    const initialContext: PipelineContext = {
      runId: 'ci-triage-run-401',
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
      metadata: { ciRunId: 'RUN-1002' },
      actionType: 'status_change',
    };

    const finalCtx = await runPipeline(CI_TRIAGE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_ci_run']).toBeDefined();
    expect(finalCtx.stepResults['analyze_failure']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Flaky test → low CCEP → AUTO_RESOLVE
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.ccepScore).toBeLessThan(0.60);
  });

  it('Real regression (RUN-1001) → ESCALATE (block PR)', async () => {
    const initialContext: PipelineContext = {
      runId: 'ci-triage-run-402',
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
      metadata: { ciRunId: 'RUN-1001' },
      actionType: 'status_change',
    };

    const finalCtx = await runPipeline(CI_TRIAGE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_ci_run']).toBeDefined();
    expect(finalCtx.stepResults['analyze_failure']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Real regression → high CCEP → ESCALATE
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(0.60);
  });
});
