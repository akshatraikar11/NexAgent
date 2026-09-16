import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { BUILD_DEPLOY_STEPS } from '../../src/pipelines/build-deploy.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';

describe('Stretch Pipeline 5: Build/Deploy Triage End-to-End Test', () => {
  it('Transient infra failure (BUILD-501) → AUTO_RESOLVE (retry build)', async () => {
    const initialContext: PipelineContext = {
      runId: 'build-deploy-run-501',
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
      metadata: { buildId: 'BUILD-501' },
      actionType: 'prod_deploy',
    };

    const finalCtx = await runPipeline(BUILD_DEPLOY_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_build']).toBeDefined();
    expect(finalCtx.stepResults['classify_error']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Transient infra → low CCEP → AUTO_RESOLVE
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.ccepScore).toBeLessThan(0.60);
  });

  it('Config error in production (BUILD-502) → ESCALATE (alert DevOps)', async () => {
    const initialContext: PipelineContext = {
      runId: 'build-deploy-run-502',
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
      metadata: { buildId: 'BUILD-502' },
      actionType: 'prod_deploy',
    };

    const finalCtx = await runPipeline(BUILD_DEPLOY_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_build']).toBeDefined();
    expect(finalCtx.stepResults['classify_error']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Config error → high CCEP → ESCALATE
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(0.60);
  });
});
