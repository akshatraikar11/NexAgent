import { CCEPWeights } from './weights.js';
import { DEFAULT_CCEP_THRESHOLD } from './constants.js';

export interface CCEPSignals {
  modelConfidence: number;            // 0.0 to 1.0 (calibrated LLM confidence)
  historicalErrorRate: number;        // 0.0 to 1.0 (override rate for category)
  guardrailFlagCount: number;         // raw integer (0, 1, 2, 3, ...)
  actionReversibilityWeight: number;  // 0.0 to 1.0 (risk/impact of action)
}

export interface CCEPScoreResult {
  ccepScore: number;
  threshold: number;
  decision: 'AUTO_RESOLVE' | 'ESCALATE';
  signalBreakdown: {
    modelConfidenceContribution: number;
    historicalErrorRateContribution: number;
    guardrailFlagsContribution: number;
    actionReversibilityContribution: number;
    normalizedGuardrailScore: number;
  };
}

/**
 * Computes CCEP Escalation Score with pure TS arithmetic matching the spec exactly:
 * escalation_score = w1 * (1 - model_confidence) + w2 * historical_error_rate + w3 * min(guardrail_flag_count, 3) / 3 + w4 * action_reversibility_weight
 *
 * Throws if any input signal is NaN or any weight is NaN/non-positive.
 * WHY: NaN inputs silently propagate through Math.max/min, producing NaN scores that
 * compare as false for >= threshold, defaulting everything to AUTO_RESOLVE — wrong and dangerous.
 */
export function computeCCEPScore(
  signals: CCEPSignals,
  weights: CCEPWeights,
  threshold = DEFAULT_CCEP_THRESHOLD
): CCEPScoreResult {
  // Guard: reject NaN or non-finite signal inputs
  const signalEntries: [string, number][] = [
    ['modelConfidence', signals.modelConfidence],
    ['historicalErrorRate', signals.historicalErrorRate],
    ['guardrailFlagCount', signals.guardrailFlagCount],
    ['actionReversibilityWeight', signals.actionReversibilityWeight],
  ];
  for (const [name, value] of signalEntries) {
    if (!Number.isFinite(value)) {
      throw new Error(`[CCEP] Invalid signal: ${name}=${value}. All signals must be finite numbers.`);
    }
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(`[CCEP] Invalid threshold: ${threshold}. Must be a positive finite number.`);
  }
  // Clamp signals to valid ranges
  const modelConfidence = Math.max(0, Math.min(1, signals.modelConfidence));
  const historicalErrorRate = Math.max(0, Math.min(1, signals.historicalErrorRate));
  const actionReversibilityWeight = Math.max(0, Math.min(1, signals.actionReversibilityWeight));
  
  // Guardrail flag count normalization: min(count, 3) / 3
  const normalizedGuardrailScore = Math.min(Math.max(0, signals.guardrailFlagCount), 3) / 3;

  // Signal contributions
  const modelConfidenceContribution = weights.w1 * (1 - modelConfidence);
  const historicalErrorRateContribution = weights.w2 * historicalErrorRate;
  const guardrailFlagsContribution = weights.w3 * normalizedGuardrailScore;
  const actionReversibilityContribution = weights.w4 * actionReversibilityWeight;

  // Total escalation score
  const ccepScore =
    modelConfidenceContribution +
    historicalErrorRateContribution +
    guardrailFlagsContribution +
    actionReversibilityContribution;

  // Decision rule: if ccepScore > threshold (or >= threshold), escalate
  // Standard decision: score >= threshold means escalate to human
  const decision: 'AUTO_RESOLVE' | 'ESCALATE' =
    ccepScore >= threshold ? 'ESCALATE' : 'AUTO_RESOLVE';

  return {
    ccepScore: Number(ccepScore.toFixed(4)),
    threshold,
    decision,
    signalBreakdown: {
      modelConfidenceContribution: Number(modelConfidenceContribution.toFixed(4)),
      historicalErrorRateContribution: Number(historicalErrorRateContribution.toFixed(4)),
      guardrailFlagsContribution: Number(guardrailFlagsContribution.toFixed(4)),
      actionReversibilityContribution: Number(actionReversibilityContribution.toFixed(4)),
      normalizedGuardrailScore: Number(normalizedGuardrailScore.toFixed(4)),
    },
  };
}
