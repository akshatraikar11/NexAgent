/**
 * Unit tests for computeFlakinessScore() and computeTransienceScore()
 * in backend/src/ccep/signals.ts
 *
 * Strategy: vi.mock the Prisma client and isDatabaseConnected so we can
 * control exactly what rows come back without a live DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock isDatabaseConnected to always return true ────────────────────────────
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    testRunHistory: {
      findMany: vi.fn(),
    },
  },
  isDatabaseConnected: vi.fn().mockResolvedValue(true),
}));

import { computeFlakinessScore, computeTransienceScore } from '../../src/ccep/signals.js';
import { prisma } from '../../src/db/client.js';

// Typed shorthand so each test can set return values easily
const mockFindMany = prisma.testRunHistory.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── computeFlakinessScore ─────────────────────────────────────────────────────

describe('computeFlakinessScore', () => {
  it('returns 0.5 (neutral) when fewer than 5 historical runs exist', async () => {
    mockFindMany.mockResolvedValue([{ passed: true }, { passed: false }, { passed: true }]);
    const score = await computeFlakinessScore('PaymentService.processRefund');
    expect(score).toBe(0.5);
  });

  it('returns 0.5 when DB is unreachable', async () => {
    const { isDatabaseConnected } = await import('../../src/db/client.js');
    (isDatabaseConnected as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const score = await computeFlakinessScore('SomeTest.method');
    expect(score).toBe(0.5);
  });

  it('returns 0.0 for a perfectly stable test (no flips in 10 runs)', async () => {
    // 10 passes in a row — no transitions
    mockFindMany.mockResolvedValue(Array(10).fill({ passed: true }));
    const score = await computeFlakinessScore('StableTest.alwaysPasses');
    expect(score).toBe(0.0);
  });

  it('returns 1.0 for a perfectly alternating test (flips every run)', async () => {
    // pass, fail, pass, fail, pass, fail — 5 flips out of 5 possible transitions
    mockFindMany.mockResolvedValue([
      { passed: true }, { passed: false }, { passed: true },
      { passed: false }, { passed: true }, { passed: false },
    ]);
    const score = await computeFlakinessScore('FlakyTest.alwaysFlips');
    // 5 flips / (6 - 1) = 1.0
    expect(score).toBe(1.0);
  });

  it('computes partial flip-rate correctly', async () => {
    // 5 runs: T F T T T → 2 flips out of 4 transitions = 0.5
    mockFindMany.mockResolvedValue([
      { passed: true }, { passed: false }, { passed: true },
      { passed: true }, { passed: true },
    ]);
    const score = await computeFlakinessScore('SometimesFlaky.method');
    expect(score).toBe(0.5);
  });

  it('returns 0.5 on unexpected DB error', async () => {
    mockFindMany.mockRejectedValue(new Error('DB crashed'));
    const score = await computeFlakinessScore('AnyTest.method');
    expect(score).toBe(0.5);
  });
});

// ── computeTransienceScore ────────────────────────────────────────────────────

describe('computeTransienceScore', () => {
  it('returns 0.5 (neutral) when fewer than 5 historical runs exist', async () => {
    mockFindMany.mockResolvedValue([{ passed: false }, { passed: false }]);
    const score = await computeTransienceScore('deploy-staging.yml', 'staging');
    expect(score).toBe(0.5);
  });

  it('returns 0.5 when DB is unreachable', async () => {
    const { isDatabaseConnected } = await import('../../src/db/client.js');
    (isDatabaseConnected as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const score = await computeTransienceScore('deploy-production.yml', 'production');
    expect(score).toBe(0.5);
  });

  it('returns 0.1 when there are no past failures (all passes)', async () => {
    mockFindMany.mockResolvedValue(Array(8).fill({ passed: true }));
    const score = await computeTransienceScore('deploy-staging.yml', 'staging');
    // no failures → not a transient-infra pattern
    expect(score).toBe(0.1);
  });

  it('returns 1.0 when every failure was followed by a pass (all transient)', async () => {
    // newest-first: pass, fail, pass, fail, pass, fail (6 rows)
    // rows[i+1] is the older run — failures at indices 1,3,5 (older runs)
    // each failure is followed (in time) by a pass → all transient
    mockFindMany.mockResolvedValue([
      { passed: true },  // newest
      { passed: false }, // failure → next run (index 0) passed → transient
      { passed: true },
      { passed: false }, // failure → next run (index 2) passed → transient
      { passed: true },
      { passed: false }, // failure → next run (index 4) passed → transient
    ]);
    const score = await computeTransienceScore('ci.yml', 'staging');
    expect(score).toBe(1.0);
  });

  it('returns 0.0 when every failure was followed by another failure (all persistent)', async () => {
    // newest-first: fail, fail, fail, fail, fail, pass
    // failures at indices 1,2,3,4 (older) all followed by another failure
    mockFindMany.mockResolvedValue([
      { passed: false }, // newest
      { passed: false },
      { passed: false },
      { passed: false },
      { passed: false },
      { passed: true },  // oldest
    ]);
    const score = await computeTransienceScore('deploy-production.yml', 'production');
    expect(score).toBe(0.0);
  });

  it('returns 0.5 on unexpected DB error', async () => {
    mockFindMany.mockRejectedValue(new Error('Connection refused'));
    const score = await computeTransienceScore('build.yml', 'staging');
    expect(score).toBe(0.5);
  });
});
