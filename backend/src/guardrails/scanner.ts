export interface GuardrailFlag {
  category: 'PII' | 'SQL_INJECTION' | 'PROMPT_INJECTION';
  patternName: string;
  matchedText: string;
}

export interface GuardrailScanResult {
  flagCount: number;
  normalizedScore: number; // min(count, 3) / 3
  flags: GuardrailFlag[];
  detectedCategories: string[];
}

const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi },
  { name: 'phone', regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'credit_card', regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { name: 'api_key', regex: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?/gi },
];

const SQLI_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'drop_table', regex: /\bDROP\s+TABLE\b/gi },
  { name: 'union_select', regex: /\bUNION\s+(?:ALL\s+)?SELECT\b/gi },
  { name: 'or_1_equals_1', regex: /\bOR\s+['"]?1['"]?\s*=\s*['"]?1['"]?\b/gi },
  { name: 'delete_from', regex: /\bDELETE\s+FROM\b/gi },
  { name: 'exec_cmd', regex: /\bEXEC(?:UTE)?\s*\(/gi },
  { name: 'sql_comment', regex: /--|\/\*/g },
];

const PROMPT_INJECTION_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'ignore_previous', regex: /ignore\s+(?:all\s+)?previous\s+instructions/gi },
  { name: 'disregard_above', regex: /disregard\s+(?:the\s+)?above\s+instructions/gi },
  { name: 'system_prompt_reveal', regex: /(?:reveal|show|print|output)\s+(?:the\s+)?system\s+prompt/gi },
  { name: 'jailbreak_dan', regex: /\bDAN\b|developer\ mode|jailbreak/gi },
  { name: 'roleplay_override', regex: /you\s+are\s+now\s+a\s+unrestricted/gi },
];

/**
 * Scans input text for PII, SQL injection, and Prompt Injection using regex patterns.
 * Normalizes flag count as min(count, 3) / 3.
 */
export function scanGuardrails(text: string): GuardrailScanResult {
  if (!text) {
    return { flagCount: 0, normalizedScore: 0, flags: [], detectedCategories: [] };
  }

  const flags: GuardrailFlag[] = [];

  // PII scanning
  for (const pattern of PII_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        flags.push({
          category: 'PII',
          patternName: pattern.name,
          // Fix #10 Medium — never store actual PII values in flag records
          // (they end up in StepLog.output in the DB)
          matchedText: `[REDACTED-${pattern.name.toUpperCase()}]`,
        });
      }
    }
  }

  // SQL Injection scanning
  for (const pattern of SQLI_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        flags.push({
          category: 'SQL_INJECTION',
          patternName: pattern.name,
          matchedText: m.length > 40 ? m.slice(0, 40) + '…' : m,
        });
      }
    }
  }

  // Prompt Injection scanning
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        flags.push({
          category: 'PROMPT_INJECTION',
          patternName: pattern.name,
          matchedText: m.length > 40 ? m.slice(0, 40) + '…' : m,
        });
      }
    }
  }

  const flagCount = flags.length;
  // min(count, 3) / 3 per spec
  const normalizedScore = Number((Math.min(flagCount, 3) / 3).toFixed(4));
  const detectedCategories = Array.from(new Set(flags.map((f) => f.category)));

  return {
    flagCount,
    normalizedScore,
    flags,
    detectedCategories,
  };
}

/**
 * Fix #9 Medium — redact PII from a string before posting to Slack or storing in logs.
 * Replaces each PII pattern match with a labelled placeholder.
 */
export function redactPIIFromText(text: string): string {
  if (!text) return text;
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern.regex, `[REDACTED-${pattern.name.toUpperCase()}]`);
  }
  return result;
}
