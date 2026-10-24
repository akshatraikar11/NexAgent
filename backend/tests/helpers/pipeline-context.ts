import { PipelineContext } from '../../src/orchestrator/types.js';

/**
 * makeTestCtx — builds a valid PipelineContext for tests.
 *
 * All required numeric/boolean fields are defaulted to safe zero-values.
 * Callers pass only the fields relevant to the behaviour under test.
 * WHY: PipelineContext fields are required (non-optional) in production so that
 * pipeline steps after population can read them without null checks. Tests need
 * to construct partial contexts; this helper provides the defaults so tests stay concise.
 */
export function makeTestCtx(overrides: Partial<PipelineContext> & { runId: string }): PipelineContext {
  return {
    kbMatches: [],
    llmResponse: '',
    geminiConfidence: 0.80,
    groqConfidence: 0.78,
    cosineSimilarity: 0.90,
    modelConfidence: 0.80,
    dualModelAgreed: true,
    guardrailFlags: [],
    guardrailFlagCount: 0,
    normalizedGuardrailScore: 0,
    historicalErrorRate: 0.10,
    actionReversibilityWeight: 0.3,
    ccepScore: 0,
    threshold: 0.32,
    decision: 'PENDING',
    stepResults: {},
    metadata: {},
    ...overrides,
  };
}
