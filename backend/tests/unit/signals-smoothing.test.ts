import { describe, it, expect } from 'vitest';
import {
  computeSmoothedErrorRate,
  SMOOTHING_ALPHA,
  SMOOTHING_BETA,
} from '../../src/ccep/signals.js';

describe('CCEP Bayesian Smoothing — Beta-Binomial Prior (alpha=1, beta=9)', () => {
  it('has alpha=1 and beta=9 reflecting a 10% base error rate prior', () => {
    expect(SMOOTHING_ALPHA).toBe(1);
    expect(SMOOTHING_BETA).toBe(9);
    const prior = SMOOTHING_ALPHA / (SMOOTHING_ALPHA + SMOOTHING_BETA);
    expect(prior).toBe(0.10);
  });

  it('returns exactly prior (0.1000) when totalDecisions is 0', () => {
    const rate = computeSmoothedErrorRate(0, 0);
    expect(rate).toBe(0.1000);
  });

  it('prevents single-override spike from jumping to 1.0 on 1 decision', () => {
    // Without smoothing: 1 / 1 = 1.000 (disastrous single-click flip)
    // With smoothing: (1 + 1) / (1 + 1 + 9) = 2 / 11 = 0.1818
    const smoothed = computeSmoothedErrorRate(1, 1);
    expect(smoothed).toBe(0.1818);
    expect(smoothed).toBeLessThan(0.20);
    expect(smoothed).not.toBe(1.0);
  });

  it('damps 0 overrides on small sample sizes toward prior', () => {
    // 0 overrides on 1 decision: (0 + 1) / (1 + 1 + 9) = 1 / 11 = 0.0909
    const smoothed = computeSmoothedErrorRate(0, 1);
    expect(smoothed).toBe(0.0909);
  });

  it('calculates expected rate for moderate sample size (10 decisions, 1 override)', () => {
    // (1 + 1) / (10 + 1 + 9) = 2 / 20 = 0.1000
    const smoothed = computeSmoothedErrorRate(1, 10);
    expect(smoothed).toBe(0.1000);
  });

  it('converges to empirical rate when sample size is large (N=100)', () => {
    // (20 + 1) / (100 + 1 + 9) = 21 / 110 = 0.1909 (close to 0.20 empirical)
    const smoothed = computeSmoothedErrorRate(20, 100);
    expect(smoothed).toBe(0.1909);

    // (80 + 1) / (100 + 1 + 9) = 81 / 110 = 0.7364
    const smoothedHigh = computeSmoothedErrorRate(80, 100);
    expect(smoothedHigh).toBe(0.7364);
  });

  it('reconciles prior vs posterior in flip demo: 0/10 overrides is 5.0% posterior, prior is 10.0%', () => {
    // Unseen category: 0 decisions -> prior mean = 1/10 = 0.1000 (10.0%)
    expect(computeSmoothedErrorRate(0, 0)).toBe(0.1000);

    // Baseline in flip demo: 10 decisions, 0 overrides -> (0+1)/(10+10) = 1/20 = 0.0500 (5.0%)
    expect(computeSmoothedErrorRate(0, 10)).toBe(0.0500);

    // After 3 overrides on 3 decisions: 13 decisions, 3 overrides -> (3+1)/(13+10) = 4/23 = 0.1739 (17.4%)
    expect(computeSmoothedErrorRate(3, 13)).toBe(0.1739);
  });
});
