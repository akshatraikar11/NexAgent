import { prisma } from '../db/client.js';

export const DEFAULT_REVERSIBILITY_MAP: Record<string, number> = {
  slack_notification: 0.1,
  jira_comment: 0.3,
  auto_merge_pr: 0.3, // Reversibility weight: 0.30 (in Git, merges to feature/dev branches are 1-click reversible via git revert without prod deployment risk)
  status_change: 0.5,
  prod_deploy: 1.0,
};

/**
 * Computes calibrated model confidence from dual LLM evaluations
 * If cosine similarity >= 0.85, models agree -> confidence is averaged
 * If cosine similarity < 0.85, models disagree -> average confidence is halved
 */
export function calculateCalibratedConfidence(
  geminiConfidence: number,
  groqConfidence: number,
  cosineSimilarity: number
): { calibratedConfidence: number; dualModelAgreed: boolean } {
  const avgConfidence = (geminiConfidence + groqConfidence) / 2;
  const dualModelAgreed = cosineSimilarity >= 0.85;
  const calibratedConfidence = dualModelAgreed ? avgConfidence : avgConfidence / 2;

  return {
    calibratedConfidence: Number(calibratedConfidence.toFixed(4)),
    dualModelAgreed,
  };
}

/**
 * Fetch category historical error rate from database with Bayesian smoothing.
 *
 * Raw rate: overrideCount / totalDecisions
 * Problem: 1 override on 1 decision = 1.0 — a single click swings a whole category.
 *
 * Smoothed rate: (overrides + α) / (decisions + α + β)
 * With α=1, β=9 (Beta prior implying ~10% base error rate prior mean):
 *   0 overrides,  0 decisions → 1/10 = 0.100 (10.0% unobserved category prior mean)
 *   0 overrides, 10 decisions → 1/20 = 0.050 (5.0% posterior for clean category with 10 decisions)
 *   1 override,   1 decision  → 2/11 = 0.182 (not 1.0)
 *   3 overrides, 13 decisions → 4/23 = 0.174 (demonstrated in demo:flip)
 *   5 overrides, 50 decisions → 6/60 = 0.100
 *
 * This is a standard Bayesian approach (Beta-Binomial conjugate prior).
 */
export const SMOOTHING_ALPHA = 1;  // pseudo-count for overrides (prior successes)
export const SMOOTHING_BETA = 9;   // pseudo-count for non-overrides (prior failures)

export function computeSmoothedErrorRate(overrides: number, totalDecisions: number): number {
  if (totalDecisions <= 0) {
    return Number((SMOOTHING_ALPHA / (SMOOTHING_ALPHA + SMOOTHING_BETA)).toFixed(4));
  }
  const smoothed = (overrides + SMOOTHING_ALPHA) / (totalDecisions + SMOOTHING_ALPHA + SMOOTHING_BETA);
  return Number(smoothed.toFixed(4));
}

export async function getHistoricalErrorRate(categoryIdOrName?: string): Promise<number> {
  if (!categoryIdOrName) return 0.0;

  try {
    const { isDatabaseConnected } = await import('../db/client.js');
    if (!(await isDatabaseConnected())) {
      return 0.10; // Default historical error rate when DB is offline
    }

    const category = await prisma.category.findFirst({
      where: {
        OR: [
          { id: categoryIdOrName },
          { name: categoryIdOrName },
          { name: { equals: categoryIdOrName, mode: 'insensitive' } },
        ],
      },
    });

    if (!category || category.totalDecisions === 0) {
      // No decisions yet — return the prior: α / (α + β) = 1/10 = 0.10
      return computeSmoothedErrorRate(0, 0);
    }

    // Bayesian smoothed rate
    return computeSmoothedErrorRate(category.overrideCount, category.totalDecisions);
  } catch (error) {
    return 0.0;
  }
}

/**
 * Resolve Category record by either id or name.
 */
export async function resolveCategory(categoryIdOrName?: string) {
  if (!categoryIdOrName) return null;
  try {
    const { isDatabaseConnected } = await import('../db/client.js');
    if (!(await isDatabaseConnected())) return null;

    return await prisma.category.findFirst({
      where: {
        OR: [
          { id: categoryIdOrName },
          { name: categoryIdOrName },
          { name: { equals: categoryIdOrName, mode: 'insensitive' } },
        ],
      },
    });
  } catch {
    return null;
  }
}

/**
 * Get action reversibility weight from action type
 */
export function getActionReversibilityWeight(
  actionType: string,
  customMap?: Record<string, number>
): number {
  const map = customMap || DEFAULT_REVERSIBILITY_MAP;
  return map[actionType] ?? 0.5; // Default to medium risk (0.5) if unlisted
}

/**
 * Compute flakiness score for a test by measuring its flip-rate over the last 20 runs.
 * Flip-rate = number of pass→fail or fail→pass transitions / (total runs − 1).
 * Returns 0.5 (unknown/neutral) when fewer than 5 historical runs exist.
 * Falls back to 0.5 on DB error (safe default — does not override LLM opinion).
 */
export async function computeFlakinessScore(testName: string): Promise<number> {
  try {
    const { isDatabaseConnected } = await import('../db/client.js');
    if (!(await isDatabaseConnected())) return 0.5;

    const rows = await prisma.testRunHistory.findMany({
      where: { testName, kind: 'test' },
      orderBy: { runAt: 'desc' },
      take: 20,
      select: { passed: true },
    });

    if (rows.length < 5) return 0.5; // ponytail: neutral until we have signal

    let flips = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].passed !== rows[i + 1].passed) flips++;
    }
    return Number((flips / (rows.length - 1)).toFixed(4));
  } catch {
    return 0.5;
  }
}

/**
 * Compute transience score for a build workflow+environment pair over the last 20 runs.
 * Transience = fraction of past failures that were followed immediately by a pass
 * (i.e. auto-retry succeeded), indicating the error is transient.
 * Returns 0.5 on < 5 runs or DB error.
 */
export async function computeTransienceScore(workflow: string, environment: string): Promise<number> {
  const testName = `${workflow}:${environment}`;
  try {
    const { isDatabaseConnected } = await import('../db/client.js');
    if (!(await isDatabaseConnected())) return 0.5;

    const rows = await prisma.testRunHistory.findMany({
      where: { testName, kind: 'build' },
      orderBy: { runAt: 'desc' },
      take: 20,
      select: { passed: true },
    });

    if (rows.length < 5) return 0.5;

    // Count failure→pass transitions (failure that resolved on next run = transient)
    let transientFailures = 0;
    let totalFailures = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      if (!rows[i + 1].passed) {
        // rows are newest-first, so rows[i+1] is the older run
        totalFailures++;
        if (rows[i].passed) transientFailures++; // failure followed by success
      }
    }
    if (totalFailures === 0) return 0.1; // no failures → almost certainly not transient infra
    return Number((transientFailures / totalFailures).toFixed(4));
  } catch {
    return 0.5;
  }
}
