import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { RetryableError, FatalError } from '../../src/orchestrator/errors.js';
import { Step, PipelineContext } from '../../src/orchestrator/types.js';

describe('Custom State-Machine Orchestrator - Error Handling Unit Tests', () => {
  const baseContext: PipelineContext = {
    runId: 'test-run-101',
    ticketId: 'JIRA-101',
    kbMatches: [],
    llmResponse: '',
    geminiConfidence: 0,
    groqConfidence: 0,
    cosineSimilarity: 0,
    modelConfidence: 0.9,
    dualModelAgreed: true,
    guardrailFlags: [],
    guardrailFlagCount: 0,
    normalizedGuardrailScore: 0,
    historicalErrorRate: 0,
    actionReversibilityWeight: 0.1,
    ccepScore: 0.1,
    threshold: 0.6,
    decision: 'PENDING',
    stepResults: {},
    metadata: {},
  };

  it('RetryableError Path: Retries up to 3 times with backoff and succeeds on 3rd attempt', async () => {
    let attempts = 0;

    const retryableStep: Step = {
      name: 'flaky_mcp_step',
      tool: 'jira_mcp',
      action: 'fetch',
      maxRetries: 3,
      execute: async (ctx) => {
        attempts++;
        if (attempts < 3) {
          throw new RetryableError(`Network timeout on attempt ${attempts}`, 'flaky_mcp_step', attempts);
        }
        ctx.stepResults['flaky_mcp_step'] = { success: true, attempts };
        ctx.decision = 'AUTO_RESOLVE';
        return ctx;
      },
    };

    const finalCtx = await runPipeline([retryableStep], { ...baseContext }, { backoffBaseMs: 1 });

    expect(attempts).toBe(3);
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
    expect(finalCtx.stepResults['flaky_mcp_step']).toEqual({ success: true, attempts: 3 });
  });

  it('RetryableError Exhaustion Path: Converts to FatalError and halts pipeline with ESCALATE decision', async () => {
    let attempts = 0;

    const failingStep: Step = {
      name: 'always_failing_mcp_step',
      tool: 'jira_mcp',
      action: 'fetch',
      maxRetries: 3,
      execute: async () => {
        attempts++;
        throw new RetryableError(`Persistent connection failure`, 'always_failing_mcp_step', attempts);
      },
    };

    const finalCtx = await runPipeline([failingStep], { ...baseContext }, { backoffBaseMs: 1 });

    expect(attempts).toBe(4); // Initial try (1) + 3 retries = 4 attempts total
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.metadata.failedAtStep).toBe('always_failing_mcp_step');
    expect(finalCtx.metadata.error).toContain('Exhausted retries (3)');
  });

  it('FatalError Path: Immediately halts pipeline without retrying', async () => {
    let step1Attempts = 0;
    let step2Executed = false;

    const fatalStep: Step = {
      name: 'auth_fatal_step',
      tool: 'auth',
      action: 'verify',
      maxRetries: 3,
      execute: async () => {
        step1Attempts++;
        throw new FatalError('Fatal: Authentication token revoked or invalid credentials', 'auth_fatal_step');
      },
    };

    const subsequentStep: Step = {
      name: 'never_reached_step',
      tool: 'dispatcher',
      action: 'decide',
      execute: async (ctx) => {
        step2Executed = true;
        return ctx;
      },
    };

    const finalCtx = await runPipeline([fatalStep, subsequentStep], { ...baseContext }, { backoffBaseMs: 1 });

    expect(step1Attempts).toBe(1); // Halts immediately, 0 retries
    expect(step2Executed).toBe(false); // Subsequent step never executed
    expect(finalCtx.decision).toBe('ESCALATE');
    expect(finalCtx.metadata.failedAtStep).toBe('auth_fatal_step');
    expect(finalCtx.metadata.error).toContain('Authentication token revoked');
  });
});
