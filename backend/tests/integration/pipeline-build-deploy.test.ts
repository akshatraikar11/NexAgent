import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { BUILD_DEPLOY_STEPS } from '../../src/pipelines/build-deploy.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';
import { prisma } from '../../src/db/client.js';

describe('Stretch Pipeline 5: Build/Deploy Triage End-to-End Test', () => {
  beforeEach(async () => {
    try {
      await prisma.testRunHistory.deleteMany({ where: { kind: 'build' } });
    } catch (_) {}
  });

  afterEach(async () => {
    try {
      await prisma.decision.deleteMany({ where: { pipelineRunId: { in: ['build-deploy-run-501', 'build-deploy-run-502'] } } });
      await prisma.stepLog.deleteMany({ where: { pipelineRunId: { in: ['build-deploy-run-501', 'build-deploy-run-502'] } } });
      await prisma.pipelineRun.deleteMany({ where: { id: { in: ['build-deploy-run-501', 'build-deploy-run-502'] } } });
      await prisma.testRunHistory.deleteMany({ where: { kind: 'build' } });
    } catch (_) {}
  });

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

    try {
      await prisma.pipelineRun.upsert({
        where: { id: initialContext.runId },
        update: { status: 'PENDING' },
        create: { id: initialContext.runId, type: 'BUILD_DEPLOY', status: 'PENDING' },
      });
    } catch (_) {}

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

    try {
      await prisma.pipelineRun.upsert({
        where: { id: initialContext.runId },
        update: { status: 'PENDING' },
        create: { id: initialContext.runId, type: 'BUILD_DEPLOY', status: 'PENDING' },
      });
    } catch (_) {}

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
