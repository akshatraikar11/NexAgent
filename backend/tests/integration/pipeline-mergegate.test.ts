import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { MERGEGATE_STEPS } from '../../src/pipelines/mergegate.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';

describe('Stretch Pipeline 6: MergeGate PR Review End-to-End Test', () => {
  it('Low-risk README PR (PR-42) → AUTO_RESOLVE (auto-merge)', async () => {
    const initialContext: PipelineContext = {
      runId: 'mergegate-run-601',
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
      metadata: { prNumber: '42' },
      actionType: 'auto_merge_pr',
    };

    const finalCtx = await runPipeline(MERGEGATE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_pr']).toBeDefined();
    expect(finalCtx.stepResults['assess_risk']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Small, low-risk, CI green → low CCEP → AUTO_RESOLVE
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.ccepScore).toBeLessThan(0.60);
  });

  it('High-risk payment module rewrite (PR-99) → ESCALATE (senior review)', async () => {
    const initialContext: PipelineContext = {
      runId: 'mergegate-run-602',
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
      metadata: { prNumber: '99' },
      actionType: 'auto_merge_pr',
    };

    const finalCtx = await runPipeline(MERGEGATE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_pr']).toBeDefined();
    expect(finalCtx.stepResults['assess_risk']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // High-risk module + large diff → high CCEP → ESCALATE
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(0.60);
  });
});
