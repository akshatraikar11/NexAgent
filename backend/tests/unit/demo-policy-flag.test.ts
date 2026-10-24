import { describe, it, expect, afterEach } from 'vitest';
import { TICKET_TRIAGE_STEPS } from '../../src/pipelines/ticket-triage.pipeline.js';
import { makeTestCtx } from '../helpers/pipeline-context.js';

describe('DEMO_POLICY_OVERRIDES Behavior Test', () => {
  const originalEnv = process.env.DEMO_POLICY_OVERRIDES;
  // Only execute the ccep_evaluate step — earlier steps (LLM, Jira, etc.) are not needed here
  const ccepStep = TICKET_TRIAGE_STEPS.find((s) => s.name === 'ccep_evaluate')!;

  afterEach(() => {
    process.env.DEMO_POLICY_OVERRIDES = originalEnv;
  });

  it('when DEMO_POLICY_OVERRIDES=false, BILLING tickets follow pure CCEP formula and may AUTO_RESOLVE', async () => {
    process.env.DEMO_POLICY_OVERRIDES = 'false';

    const ctx = makeTestCtx({
      runId: 'test-billing-no-override',
      pipelineType: 'TICKET_TRIAGE',
      category: 'BILLING',
      actionType: 'jira_comment', // reversibility 0.3
      modelConfidence: 0.95,
      guardrailFlagCount: 0,
      threshold: 0.34,
    });

    const finalCtx = await ccepStep.execute(ctx);

    // DEMO_POLICY_OVERRIDES=false: no policy flag, pure CCEP math
    expect(finalCtx.metadata['demoPolicyOverrideApplied']).toBeUndefined();
    // CCEP score ≈ 0.2562*(1-0.95) + 0.226*0.10 + 0 + 0.3502*0.3 ≈ 0.140 < 0.34 → AUTO_RESOLVE
    expect(finalCtx.ccepScore).toBeLessThan(0.34);
    expect(finalCtx.decision).toBe('AUTO_RESOLVE');
  });

  it('when DEMO_POLICY_OVERRIDES=true, BILLING hard policy forces escalation regardless of CCEP score', async () => {
    process.env.DEMO_POLICY_OVERRIDES = 'true';

    const ctx = makeTestCtx({
      runId: 'test-billing-with-override',
      pipelineType: 'TICKET_TRIAGE',
      category: 'BILLING',
      actionType: 'jira_comment',
      modelConfidence: 0.95,
      guardrailFlagCount: 0,
      threshold: 0.32,
    });

    const finalCtx = await ccepStep.execute(ctx);

    // Policy override metadata must be recorded
    expect(finalCtx.metadata['demoPolicyOverrideApplied']).toBe('BILLING');
    // Signals elevated by policy
    expect(finalCtx.historicalErrorRate).toBeGreaterThanOrEqual(0.70);
    expect(finalCtx.actionReversibilityWeight).toBeGreaterThanOrEqual(0.85);
    // Score crosses threshold → ESCALATE
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(0.32);
    expect(finalCtx.decision).toBe('ESCALATE');
  });

  it('when DEMO_POLICY_OVERRIDES=true, critical P0 INFRASTRUCTURE is also forced to escalate', async () => {
    process.env.DEMO_POLICY_OVERRIDES = 'true';

    const ctx = makeTestCtx({
      runId: 'test-infra-p0-override',
      pipelineType: 'TICKET_TRIAGE',
      category: 'INFRASTRUCTURE',
      actionType: 'jira_comment',
      modelConfidence: 0.95,
      guardrailFlagCount: 0,
      threshold: 0.32,
      metadata: { itilClassification: { severity: 'P0' } },
    });

    const finalCtx = await ccepStep.execute(ctx);

    expect(finalCtx.metadata['demoPolicyOverrideApplied']).toBe('critical INFRASTRUCTURE');
    expect(finalCtx.historicalErrorRate).toBeGreaterThanOrEqual(0.65);
    expect(finalCtx.ccepScore).toBeGreaterThanOrEqual(0.32);
    expect(finalCtx.decision).toBe('ESCALATE');
  });
});
