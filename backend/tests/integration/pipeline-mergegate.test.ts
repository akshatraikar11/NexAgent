import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { MERGEGATE_STEPS, evaluateMergePreconditions } from '../../src/pipelines/mergegate.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';
import { prisma } from '../../src/db/client.js';
import { DEFAULT_CCEP_THRESHOLD } from '../../src/ccep/constants.js';

describe('Stretch Pipeline 6: MergeGate PR Review End-to-End Test', () => {
  afterEach(async () => {
    try {
      await prisma.decision.deleteMany({ where: { pipelineRunId: { in: ['mergegate-run-601', 'mergegate-run-602', 'mergegate-run-603'] } } });
      await prisma.stepLog.deleteMany({ where: { pipelineRunId: { in: ['mergegate-run-601', 'mergegate-run-602', 'mergegate-run-603'] } } });
      await prisma.pipelineRun.deleteMany({ where: { id: { in: ['mergegate-run-601', 'mergegate-run-602', 'mergegate-run-603'] } } });
    } catch (_) {}
  });

  it('Low-risk README PR (PR-42) → AUTO_RESOLVE (auto-merge under unified threshold)', async () => {
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
      threshold: DEFAULT_CCEP_THRESHOLD,
      decision: 'PENDING',
      stepResults: {},
      metadata: { prNumber: '42' },
      actionType: 'auto_merge_pr',
    };

    try {
      await prisma.pipelineRun.upsert({
        where: { id: initialContext.runId },
        update: { status: 'PENDING' },
        create: { id: initialContext.runId, type: 'MERGEGATE', status: 'PENDING' },
      });
    } catch (_) {}

    const finalCtx = await runPipeline(MERGEGATE_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 5 step results are present
    expect(finalCtx.stepResults['fetch_pr']).toBeDefined();
    expect(finalCtx.stepResults['assess_risk']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // Small, low-risk, CI green, rev=0.30 → CCEP ~0.166 < 0.32 → AUTO_RESOLVE
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.ccepScore).toBeLessThan(DEFAULT_CCEP_THRESHOLD);
  });

  it('High-risk payment module rewrite (PR-99) → ESCALATE (precondition failure + score)', async () => {
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
      threshold: DEFAULT_CCEP_THRESHOLD,
      decision: 'PENDING',
      stepResults: {},
      metadata: { prNumber: '99' },
      actionType: 'auto_merge_pr',
    };

    try {
      await prisma.pipelineRun.upsert({
        where: { id: initialContext.runId },
        update: { status: 'PENDING' },
        create: { id: initialContext.runId, type: 'MERGEGATE', status: 'PENDING' },
      });
    } catch (_) {}

    const finalCtx = await runPipeline(MERGEGATE_STEPS, initialContext, { backoffBaseMs: 1 });

    expect(finalCtx.stepResults['fetch_pr']).toBeDefined();
    expect(finalCtx.stepResults['assess_risk']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ccep_evaluate']).toBeDefined();
    expect(finalCtx.stepResults['execute_or_escalate']).toBeDefined();

    // High-risk module + large diff + failed CI → fails preconditions → ESCALATE
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(DEFAULT_CCEP_THRESHOLD);
  });

  it('Explicit preconditions: rejects failing CI, guardrail flags, unbounded diffs, protected branch', () => {
    // Failing CI
    const badCiCtx = {
      metadata: {
        pr: { prNumber: 101, filesChanged: 2, additions: 10, deletions: 5, ciStatus: 'failure', baseBranch: 'main' },
      },
      guardrailFlagCount: 0,
    } as any;
    const resCi = evaluateMergePreconditions(badCiCtx);
    expect(resCi.requiredChecksGreen).toBe(false);
    expect(resCi.allPassed).toBe(false);

    // Guardrail flags
    const badFlagsCtx = {
      metadata: {
        pr: { prNumber: 102, filesChanged: 2, additions: 10, deletions: 5, ciStatus: 'success', baseBranch: 'main' },
      },
      guardrailFlagCount: 1,
    } as any;
    const resFlags = evaluateMergePreconditions(badFlagsCtx);
    expect(resFlags.zeroGuardrailFlags).toBe(false);
    expect(resFlags.allPassed).toBe(false);

    // Unbounded diff size (> 20 files or > 500 lines)
    const largeDiffCtx = {
      metadata: {
        pr: { prNumber: 103, filesChanged: 25, additions: 600, deletions: 50, ciStatus: 'success', baseBranch: 'main' },
      },
      guardrailFlagCount: 0,
    } as any;
    const resDiff = evaluateMergePreconditions(largeDiffCtx);
    expect(resDiff.boundedDiffSize).toBe(false);
    expect(resDiff.allPassed).toBe(false);

    // Protected target branch ('production')
    const protectedBranchCtx = {
      metadata: {
        pr: { prNumber: 104, filesChanged: 2, additions: 10, deletions: 5, ciStatus: 'success', baseBranch: 'production' },
      },
      guardrailFlagCount: 0,
    } as any;
    const resBranch = evaluateMergePreconditions(protectedBranchCtx);
    expect(resBranch.targetBranchUnprotected).toBe(false);
    expect(resBranch.allPassed).toBe(false);
  });
});
