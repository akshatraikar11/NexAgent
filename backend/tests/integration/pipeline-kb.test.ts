import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/orchestrator/runner.js';
import { KB_SELF_LEARNING_STEPS } from '../../src/pipelines/kb-self-learning.pipeline.js';
import { PipelineContext } from '../../src/orchestrator/types.js';

describe('Mandatory Pipeline 3: KB Self-Learning End-to-End Test & Quality Gate', () => {
  it('Executes KB Self-Learning pipeline for eligible resolution and ingests into ChromaDB', async () => {
    const initialContext: PipelineContext = {
      runId: 'kb-run-301',
      ticketId: 'JIRA-101',
      llmResponse: 'For VPN password resets, navigate to self-service portal.',
      kbMatches: [],
      geminiConfidence: 0,
      groqConfidence: 0,
      cosineSimilarity: 0,
      modelConfidence: 0.95,
      dualModelAgreed: true,
      guardrailFlags: [],
      guardrailFlagCount: 0,
      normalizedGuardrailScore: 0,
      historicalErrorRate: 0,
      actionReversibilityWeight: 0.1,
      ccepScore: 0.08,
      threshold: 0.60,
      decision: 'AUTO_RESOLVE',
      stepResults: {},
      metadata: {},
    };

    const finalCtx = await runPipeline(KB_SELF_LEARNING_STEPS, initialContext, { backoffBaseMs: 1 });

    // Assert all 4 step results logged
    expect(finalCtx.stepResults['extract_solution']).toBeDefined();
    expect(finalCtx.stepResults['quality_gate']).toBeDefined();
    expect(finalCtx.stepResults['run_guardrails']).toBeDefined();
    expect(finalCtx.stepResults['ingest_kb']).toBeDefined();

    expect(finalCtx.metadata['qualityGatePassed']).toBe(true);
    const ingestResult = finalCtx.stepResults['ingest_kb'] as { ingested: boolean; kbId?: string };
    expect(ingestResult.ingested).toBe(true);
    expect(ingestResult.kbId).toBeDefined();
  });
});
