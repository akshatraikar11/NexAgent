/**
 * Pre-LLM Prompt Injection Screen — Fix #7 Medium
 *
 * Runs BEFORE the generate_response step on raw ticket/alert input.
 * The main guardrails scanner runs AFTER (on combined input+output) for CCEP scoring.
 * This screen is the security gate: if injection patterns are detected in the INPUT,
 * we redact the offending text before it ever reaches Gemini/Groq.
 *
 * Returns the sanitised text and a flag indicating whether redaction occurred.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?previous\s+instructions/gi,
  /disregard\s+(?:the\s+)?above/gi,
  /(?:reveal|show|print|output|repeat)\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions)/gi,
  /you\s+are\s+now\s+(?:a\s+)?(?:unrestricted|jailbroken|DAN)/gi,
  /\bDAN\b|developer\s+mode|jailbreak/gi,
  /\bACT\s+AS\b|\bpretend\s+(?:you\s+are|to\s+be)\b/gi,
  /override\s+(?:your\s+)?(?:safety|content)\s+(?:filters?|guidelines?)/gi,
];

export interface PreScreenResult {
  sanitised: string;
  wasRedacted: boolean;
  redactionCount: number;
}

const REDACTION_PLACEHOLDER = '[CONTENT REDACTED BY SECURITY SCREEN]';

export function preLLMScreen(text: string): PreScreenResult {
  if (!text) return { sanitised: text, wasRedacted: false, redactionCount: 0 };

  let sanitised = text;
  let redactionCount = 0;

  for (const pattern of INJECTION_PATTERNS) {
    const before = sanitised;
    sanitised = sanitised.replace(pattern, REDACTION_PLACEHOLDER);
    if (sanitised !== before) redactionCount++;
  }

  return {
    sanitised,
    wasRedacted: redactionCount > 0,
    redactionCount,
  };
}

/**
 * Screen both title and description before they enter the LLM.
 * Returns sanitised versions and logs if redaction occurred.
 */
export function screenTicketInput(title: string, description: string): {
  title: string;
  description: string;
  wasRedacted: boolean;
} {
  const titleResult = preLLMScreen(title);
  const descResult = preLLMScreen(description);
  return {
    title: titleResult.sanitised,
    description: descResult.sanitised,
    wasRedacted: titleResult.wasRedacted || descResult.wasRedacted,
  };
}
