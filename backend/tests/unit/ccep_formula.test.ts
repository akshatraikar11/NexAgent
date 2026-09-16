/**
 * ccep_formula.test.ts
 * =====================
 * Phase 2 spec requirement: 5 hand-computed CCEP formula test cases.
 * These cases are identical to the Python unit tests in fit_weights.py —
 * both must agree on identical inputs (verified: all 5 PASS in Python).
 *
 * Formula (exact):
 *   score = w1*(1-modelConf) + w2*histErrRate + w3*min(guardFlags,3)/3 + w4*actionRevWeight
 *   decision = score >= threshold ? 'ESCALATE' : 'AUTO_RESOLVE'
 *
 * Default weights used: {w1:0.35, w2:0.25, w3:0.20, w4:0.20} (BOOTSTRAP_DEFAULT_WEIGHTS)
 * These match the Python test cases exactly so Python ↔ TypeScript agreement is assured.
 */
import { describe, it, expect } from 'vitest';
import { computeCCEPScore } from '../../src/ccep/scorer.js';
import { BOOTSTRAP_DEFAULT_WEIGHTS } from '../../src/ccep/weights.js';

const W = BOOTSTRAP_DEFAULT_WEIGHTS; // {w1:0.35, w2:0.25, w3:0.20, w4:0.20}
const THRESHOLD = 0.60;

describe('CCEP Formula — 5 hand-computed cases (Python↔TypeScript agreement)', () => {
  /**
   * TC1: Low risk, high confidence
   * Hand-computed (matches Python fit_weights.py TC1):
   *   w1*(1-0.90) = 0.35 * 0.10 = 0.0350
   *   w2*(0.10)   = 0.25 * 0.10 = 0.0250
   *   w3*(0/3)    = 0.20 * 0.00 = 0.0000
   *   w4*(0.10)   = 0.20 * 0.10 = 0.0200
   *   Total = 0.0800  →  AUTO_RESOLVE (0.08 < 0.60)
   */
  it('TC1 Low Risk High Confidence: score=0.0800, AUTO_RESOLVE', () => {
    const r = computeCCEPScore(
      { modelConfidence: 0.90, historicalErrorRate: 0.10, guardrailFlagCount: 0, actionReversibilityWeight: 0.10 },
      W, THRESHOLD
    );
    expect(r.ccepScore).toBe(0.08);
    expect(r.decision).toBe('AUTO_RESOLVE');
    expect(r.signalBreakdown.modelConfidenceContribution).toBe(0.035);
    expect(r.signalBreakdown.historicalErrorRateContribution).toBe(0.025);
    expect(r.signalBreakdown.guardrailFlagsContribution).toBe(0);
    expect(r.signalBreakdown.actionReversibilityContribution).toBe(0.02);
  });

  /**
   * TC2: High risk, low confidence, 2 guardrail flags
   * Hand-computed (matches Python fit_weights.py TC2):
   *   w1*(1-0.25) = 0.35 * 0.75 = 0.2625
   *   w2*(0.60)   = 0.25 * 0.60 = 0.1500
   *   w3*(2/3)    = 0.20 * 0.6667 = 0.1333
   *   w4*(0.90)   = 0.20 * 0.90 = 0.1800
   *   Total = 0.7258  →  ESCALATE (0.7258 >= 0.60)
   */
  it('TC2 High Risk Low Confidence 2 Flags: score=0.7258, ESCALATE', () => {
    const r = computeCCEPScore(
      { modelConfidence: 0.25, historicalErrorRate: 0.60, guardrailFlagCount: 2, actionReversibilityWeight: 0.90 },
      W, THRESHOLD
    );
    expect(r.ccepScore).toBe(0.7258);
    expect(r.decision).toBe('ESCALATE');
    expect(r.signalBreakdown.modelConfidenceContribution).toBe(0.2625);
    expect(r.signalBreakdown.historicalErrorRateContribution).toBe(0.15);
    expect(r.signalBreakdown.guardrailFlagsContribution).toBe(0.1333);
    expect(r.signalBreakdown.actionReversibilityContribution).toBe(0.18);
  });

  /**
   * TC3: All zeros — maximum confidence, zero error, zero flags, zero risk
   * Hand-computed (matches Python fit_weights.py TC3):
   *   w1*(1-1.0) = 0.35 * 0 = 0.0000
   *   w2*(0.0)   = 0.25 * 0 = 0.0000
   *   w3*(0/3)   = 0.20 * 0 = 0.0000
   *   w4*(0.0)   = 0.20 * 0 = 0.0000
   *   Total = 0.0000  →  AUTO_RESOLVE
   */
  it('TC3 All Zeros Max Confidence: score=0.0000, AUTO_RESOLVE', () => {
    const r = computeCCEPScore(
      { modelConfidence: 1.0, historicalErrorRate: 0.0, guardrailFlagCount: 0, actionReversibilityWeight: 0.0 },
      W, THRESHOLD
    );
    expect(r.ccepScore).toBe(0.0);
    expect(r.decision).toBe('AUTO_RESOLVE');
  });

  /**
   * TC4: All maximum — zero confidence, 100% error, 5 flags (capped at 3), 1.0 risk
   * Hand-computed (matches Python fit_weights.py TC4):
   *   w1*(1-0.0)  = 0.35 * 1.0 = 0.3500
   *   w2*(1.0)    = 0.25 * 1.0 = 0.2500
   *   w3*(min(5,3)/3) = 0.20 * 1.0 = 0.2000
   *   w4*(1.0)    = 0.20 * 1.0 = 0.2000
   *   Total = 1.0000  →  ESCALATE; normalizedGuardrailScore = 1.0 (cap enforced)
   */
  it('TC4 All Max 0 Confidence 5 Flags (capped): score=1.0000, ESCALATE', () => {
    const r = computeCCEPScore(
      { modelConfidence: 0.0, historicalErrorRate: 1.0, guardrailFlagCount: 5, actionReversibilityWeight: 1.0 },
      W, THRESHOLD
    );
    expect(r.ccepScore).toBe(1.0);
    expect(r.decision).toBe('ESCALATE');
    expect(r.signalBreakdown.normalizedGuardrailScore).toBe(1.0);
  });

  /**
   * TC5: Threshold edge — score exactly equals threshold → ESCALATE (>= rule)
   * Uses same inputs as TC2 giving score=0.7258, threshold also set to 0.7258.
   * Hand-computed: 0.7258 >= 0.7258  →  ESCALATE  (matches Python TC5)
   */
  it('TC5 Threshold Edge (score >= threshold triggers ESCALATE)', () => {
    const r = computeCCEPScore(
      { modelConfidence: 0.25, historicalErrorRate: 0.60, guardrailFlagCount: 2, actionReversibilityWeight: 0.90 },
      W,
      0.7258 // threshold set equal to score
    );
    expect(r.decision).toBe('ESCALATE');
    expect(r.ccepScore).toBe(0.7258);
  });

  /**
   * Bonus: sum(contributions) === ccepScore (client-side dev assertion spec §10)
   * This verifies that signalBreakdown values add up to ccepScore exactly.
   */
  it('Signal breakdown contributions sum equals ccepScore (spec §10 assertion)', () => {
    const r = computeCCEPScore(
      { modelConfidence: 0.55, historicalErrorRate: 0.30, guardrailFlagCount: 1, actionReversibilityWeight: 0.50 },
      W, THRESHOLD
    );
    const sum = Number(
      (
        r.signalBreakdown.modelConfidenceContribution +
        r.signalBreakdown.historicalErrorRateContribution +
        r.signalBreakdown.guardrailFlagsContribution +
        r.signalBreakdown.actionReversibilityContribution
      ).toFixed(4)
    );
    expect(sum).toBe(r.ccepScore);
  });
});
