import { CCEPWeights } from './weights.js';

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
 */
export function computeCCEPScore(
  signals: CCEPSignals,
  weights: CCEPWeights,
  threshold = 0.60
): CCEPScoreResult {
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
