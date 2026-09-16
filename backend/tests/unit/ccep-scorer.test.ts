import { describe, it, expect } from 'vitest';
import { computeCCEPScore } from '../../src/ccep/scorer.js';
import { BOOTSTRAP_DEFAULT_WEIGHTS } from '../../src/ccep/weights.js';

describe('CCEP Scorer Engine - Pure TypeScript Arithmetic Verification', () => {
  it('TestCase 1 (Low Risk, High Confidence): Hand-computed score equals 0.0800', () => {
    // Hand-computed expected output:
    // w1*(1-0.90) = 0.35 * 0.10 = 0.0350
    // w2*(0.10)   = 0.25 * 0.10 = 0.0250
    // w3*(0/3)    = 0.20 * 0.00 = 0.0000
    // w4*(0.10)   = 0.20 * 0.10 = 0.0200
    // Expected Total = 0.0800
    const result = computeCCEPScore(
      {
        modelConfidence: 0.90,
        historicalErrorRate: 0.10,
        guardrailFlagCount: 0,
        actionReversibilityWeight: 0.10,
      },
      BOOTSTRAP_DEFAULT_WEIGHTS,
      0.60
    );

    expect(result.ccepScore).toBe(0.08);
    expect(result.decision).toBe('AUTO_RESOLVE');
    expect(result.signalBreakdown.modelConfidenceContribution).toBe(0.035);
    expect(result.signalBreakdown.historicalErrorRateContribution).toBe(0.025);
    expect(result.signalBreakdown.guardrailFlagsContribution).toBe(0);
    expect(result.signalBreakdown.actionReversibilityContribution).toBe(0.02);
  });

  it('TestCase 2 (High Risk, Low Confidence, 2 Guardrails): Hand-computed score equals 0.7258', () => {
    // Hand-computed expected output:
    // w1*(1-0.25) = 0.35 * 0.75 = 0.2625
    // w2*(0.60)   = 0.25 * 0.60 = 0.1500
    // w3*(2/3)    = 0.20 * 0.6666667 = 0.1333333
    // w4*(0.90)   = 0.20 * 0.90 = 0.1800
    // Total = 0.2625 + 0.15 + 0.1333333 + 0.18 = 0.7258333... -> rounded 0.7258
    const result = computeCCEPScore(
      {
        modelConfidence: 0.25,
        historicalErrorRate: 0.60,
        guardrailFlagCount: 2,
        actionReversibilityWeight: 0.90,
      },
      BOOTSTRAP_DEFAULT_WEIGHTS,
      0.60
    );

    expect(result.ccepScore).toBe(0.7258);
    expect(result.decision).toBe('ESCALATE');
    expect(result.signalBreakdown.modelConfidenceContribution).toBe(0.2625);
    expect(result.signalBreakdown.historicalErrorRateContribution).toBe(0.15);
    expect(result.signalBreakdown.guardrailFlagsContribution).toBe(0.1333);
    expect(result.signalBreakdown.actionReversibilityContribution).toBe(0.18);
  });

  it('TestCase 3 (All Zeros - Max Confidence, 0 Error, 0 Flags, 0 Risk): Hand-computed score equals 0.0000', () => {
    const result = computeCCEPScore(
      {
        modelConfidence: 1.0,
        historicalErrorRate: 0.0,
        guardrailFlagCount: 0,
        actionReversibilityWeight: 0.0,
      },
      BOOTSTRAP_DEFAULT_WEIGHTS,
      0.60
    );

    expect(result.ccepScore).toBe(0.0);
    expect(result.decision).toBe('AUTO_RESOLVE');
  });

  it('TestCase 4 (All Max - 0 Confidence, 100% Error, 3+ Flags, 1.0 Risk): Hand-computed score equals 1.0000', () => {
    const result = computeCCEPScore(
      {
        modelConfidence: 0.0,
        historicalErrorRate: 1.0,
        guardrailFlagCount: 5, // capped at 3
        actionReversibilityWeight: 1.0,
      },
      BOOTSTRAP_DEFAULT_WEIGHTS,
      0.60
    );

    expect(result.ccepScore).toBe(1.0);
    expect(result.decision).toBe('ESCALATE');
    expect(result.signalBreakdown.normalizedGuardrailScore).toBe(1.0);
  });

  it('TestCase 5 (Threshold Edge Case): score >= threshold triggers ESCALATE', () => {
    const result = computeCCEPScore(
      {
        modelConfidence: 0.25,
        historicalErrorRate: 0.60,
        guardrailFlagCount: 2,
        actionReversibilityWeight: 0.90,
      },
      BOOTSTRAP_DEFAULT_WEIGHTS,
      0.7258
    );

    expect(result.decision).toBe('ESCALATE');
  });
});
