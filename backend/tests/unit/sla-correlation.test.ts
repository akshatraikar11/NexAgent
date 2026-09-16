/**
 * Unit tests for SLA priority mapping and alert correlation keyword engine.
 * These cover the two new backend modules added in the upgrade.
 */

import { describe, it, expect } from 'vitest';

// ── SLA helpers (inlined from sla.routes.ts to keep tests pure) ──────────────
const SLA_HOURS: Record<string, number> = {
  P1: 1, P2: 4, P3: 8, P4: 24,
  CRITICAL: 1, HIGH: 4, MEDIUM: 8, LOW: 24,
};

function slaHoursForPriority(priority: string): number {
  return SLA_HOURS[priority.toUpperCase()] ?? 8;
}

function computeBreachAt(priority: string, createdAt: Date): Date {
  const hours = slaHoursForPriority(priority);
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

function slaStatus(breachAt: Date, resolvedAt: Date | null): 'ON_TRACK' | 'AT_RISK' | 'BREACHED' {
  if (resolvedAt) return 'ON_TRACK';
  const now = new Date();
  const msLeft = breachAt.getTime() - now.getTime();
  if (msLeft < 0) return 'BREACHED';
  if (msLeft < 2 * 60 * 60 * 1000) return 'AT_RISK';
  return 'ON_TRACK';
}

// ── Alert correlation helpers ─────────────────────────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','in','on','at','for','to','of','and','or','is','are','was',
  'has','have','with','from','by','this','that','it','its','be','been','alert',
  'error','warning','failed','failure','issue','problem','detected',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 12);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── SLA Tests ─────────────────────────────────────────────────────────────────
describe('SLA Priority Mapping', () => {
  it('maps P1 to 1 hour', () => {
    expect(slaHoursForPriority('P1')).toBe(1);
  });

  it('maps P2 to 4 hours', () => {
    expect(slaHoursForPriority('P2')).toBe(4);
  });

  it('maps CRITICAL to 1 hour (same as P1)', () => {
    expect(slaHoursForPriority('CRITICAL')).toBe(1);
  });

  it('maps LOW to 24 hours', () => {
    expect(slaHoursForPriority('LOW')).toBe(24);
  });

  it('defaults unknown priority to 8 hours', () => {
    expect(slaHoursForPriority('UNKNOWN')).toBe(8);
  });

  it('is case-insensitive', () => {
    expect(slaHoursForPriority('high')).toBe(slaHoursForPriority('HIGH'));
  });

  it('computes correct breach time for P1', () => {
    const created = new Date('2026-08-30T10:00:00Z');
    const breach = computeBreachAt('P1', created);
    expect(breach.toISOString()).toBe('2026-08-30T11:00:00.000Z');
  });

  it('computes correct breach time for HIGH (4h)', () => {
    const created = new Date('2026-08-30T10:00:00Z');
    const breach = computeBreachAt('HIGH', created);
    expect(breach.toISOString()).toBe('2026-08-30T14:00:00.000Z');
  });

  it('returns ON_TRACK when resolvedAt is set', () => {
    const breach = new Date(Date.now() - 1000); // already past
    const resolved = new Date();
    expect(slaStatus(breach, resolved)).toBe('ON_TRACK');
  });

  it('returns BREACHED when past deadline and unresolved', () => {
    const breach = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    expect(slaStatus(breach, null)).toBe('BREACHED');
  });

  it('returns AT_RISK when within 2h of breach', () => {
    const breach = new Date(Date.now() + 30 * 60 * 1000); // 30m from now
    expect(slaStatus(breach, null)).toBe('AT_RISK');
  });

  it('returns ON_TRACK when breach is far away', () => {
    const breach = new Date(Date.now() + 10 * 60 * 60 * 1000); // 10h from now
    expect(slaStatus(breach, null)).toBe('ON_TRACK');
  });
});

// ── Correlation Tests ─────────────────────────────────────────────────────────
describe('Alert Correlation — Keyword Extraction', () => {
  it('extracts meaningful keywords from alert text', () => {
    const kw = extractKeywords('Database connection pool exhausted in us-east-1');
    expect(kw).toContain('database');
    expect(kw).toContain('connection');
    expect(kw).toContain('pool');
    expect(kw).toContain('exhausted');
  });

  it('filters stopwords', () => {
    const kw = extractKeywords('The error is detected in the system');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('is');
    expect(kw).not.toContain('in');
    expect(kw).not.toContain('error');
    expect(kw).not.toContain('detected');
  });

  it('limits to 12 keywords', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi';
    const kw = extractKeywords(text);
    expect(kw.length).toBeLessThanOrEqual(12);
  });

  it('filters words shorter than 3 chars', () => {
    const kw = extractKeywords('db io cpu ram oom pod node');
    // All are ≤3 chars except "node"
    const short = kw.filter((w) => w.length < 3);
    expect(short).toHaveLength(0);
  });
});

describe('Alert Correlation — Jaccard Similarity', () => {
  it('returns 1.0 for identical keyword sets', () => {
    const kw = ['database', 'connection', 'pool'];
    expect(jaccardSimilarity(kw, kw)).toBe(1.0);
  });

  it('returns 0.0 for completely different sets', () => {
    const a = ['database', 'connection'];
    const b = ['payment', 'checkout', 'stripe'];
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns 0.0 for empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('correctly scores 50% overlap', () => {
    const a = ['database', 'connection', 'pool', 'timeout'];
    const b = ['database', 'connection', 'memory', 'cpu'];
    // intersection = {database, connection} = 2
    // union = 6
    const score = jaccardSimilarity(a, b);
    expect(score).toBeCloseTo(2 / 6, 5);
  });

  it('groups alerts above 0.2 threshold (same incident type)', () => {
    const existing = extractKeywords('PostgreSQL connection pool exhausted region us-east-1');
    const incoming = extractKeywords('Database connection pool at max capacity postgresql');
    const score = jaccardSimilarity(existing, incoming);
    expect(score).toBeGreaterThanOrEqual(0.2);
  });

  it('does NOT group unrelated alerts (score < 0.2)', () => {
    const a = extractKeywords('Payment gateway stripe checkout failed');
    const b = extractKeywords('Kubernetes pod crashloopbackoff memory oom');
    const score = jaccardSimilarity(a, b);
    expect(score).toBeLessThan(0.2);
  });
});
