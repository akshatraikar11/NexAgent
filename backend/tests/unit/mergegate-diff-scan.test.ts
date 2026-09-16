/**
 * Unit tests for diff-based guardrail scanning in the MergeGate pipeline (Fix 2).
 *
 * Design note: the sql_comment pattern (-- and /*) produces false positives on
 * standard git diff syntax (hunk headers, template literals). This is a known
 * limitation of applying a generic guardrail scanner to diff text — documented
 * in DEVIATIONS.md. The tests below verify what actually matters: that diffs
 * containing hardcoded secrets/API keys are correctly flagged with PII category,
 * and that clean diffs produce zero PII or PROMPT_INJECTION hits.
 */
import { describe, it, expect } from 'vitest';
import { scanGuardrails } from '../../src/guardrails/scanner.js';
import { MOCK_PR_DIFFS, MOCK_DIFF_DEFAULT } from '../../src/mcp/mock-data/github.mock.js';

describe('Diff-based guardrail scanning (MergeGate Fix 2)', () => {
  it('flags hardcoded API key and password patterns in PR-99 diff', () => {
    const result = scanGuardrails(MOCK_PR_DIFFS['PR-99']);

    expect(result.flagCount).toBeGreaterThanOrEqual(2);
    expect(result.detectedCategories).toContain('PII');
    expect(result.flags.map((f) => f.patternName)).toContain('api_key');
  });

  it('PR-99 diff: PII flag matchedText is redacted, never the raw secret value', () => {
    const result = scanGuardrails(MOCK_PR_DIFFS['PR-99']);
    const piiFlags = result.flags.filter((f) => f.category === 'PII');
    expect(piiFlags.length).toBeGreaterThan(0);
    for (const flag of piiFlags) {
      expect(flag.matchedText).toMatch(/^\[REDACTED-/);
    }
  });

  it('clean docs-only PR-42 diff: no PII or prompt-injection flags', () => {
    const result = scanGuardrails(MOCK_PR_DIFFS['PR-42']);
    // sql_comment may fire on diff `--` syntax (known false-positive) — that is acceptable.
    // What must NOT appear is any PII (credentials, emails, keys) or prompt injection.
    const securityFlags = result.flags.filter(
      (f) => f.category === 'PII' || f.category === 'PROMPT_INJECTION'
    );
    expect(securityFlags).toHaveLength(0);
  });

  it('clean hotfix PR-87 diff: no PII or prompt-injection flags', () => {
    const result = scanGuardrails(MOCK_PR_DIFFS['PR-87']);
    const securityFlags = result.flags.filter(
      (f) => f.category === 'PII' || f.category === 'PROMPT_INJECTION'
    );
    expect(securityFlags).toHaveLength(0);
  });

  it('OAuth2 PKCE PR-112 diff (crypto code, no secrets): no PII or prompt-injection flags', () => {
    const result = scanGuardrails(MOCK_PR_DIFFS['PR-112']);
    const securityFlags = result.flags.filter(
      (f) => f.category === 'PII' || f.category === 'PROMPT_INJECTION'
    );
    expect(securityFlags).toHaveLength(0);
  });

  it('default fallback diff: no PII or prompt-injection flags', () => {
    const result = scanGuardrails(MOCK_DIFF_DEFAULT);
    const securityFlags = result.flags.filter(
      (f) => f.category === 'PII' || f.category === 'PROMPT_INJECTION'
    );
    expect(securityFlags).toHaveLength(0);
  });

  it('normalizedScore is capped at 1.0 even when PR-99 has many flags', () => {
    const result = scanGuardrails(MOCK_PR_DIFFS['PR-99']);
    expect(result.normalizedScore).toBeLessThanOrEqual(1.0);
    expect(result.normalizedScore).toBeGreaterThan(0);
  });

  it('PR-42 and PR-87 produce lower PII flag count than PR-99', () => {
    const clean42 = scanGuardrails(MOCK_PR_DIFFS['PR-42']);
    const clean87 = scanGuardrails(MOCK_PR_DIFFS['PR-87']);
    const dirty99 = scanGuardrails(MOCK_PR_DIFFS['PR-99']);
    const pii42 = clean42.flags.filter((f) => f.category === 'PII').length;
    const pii87 = clean87.flags.filter((f) => f.category === 'PII').length;
    const pii99 = dirty99.flags.filter((f) => f.category === 'PII').length;
    expect(pii99).toBeGreaterThan(pii42);
    expect(pii99).toBeGreaterThan(pii87);
  });
});
