export interface KBMatchItem {
  id: string;
  score: number;
  content: string;
  confidenceAtIngestion?: number;
  timesReused?: number;
}

/**
 * PipelineContext — the mutable state bag passed through every pipeline step.
 *
 * Fields populated by individual steps (kbMatches, llmResponse, modelConfidence, etc.)
 * are required on the interface so that production code after those steps can read them
 * without null checks. Test code that needs to construct a partial context should
 * use `makeTestCtx()` from tests/helpers/pipeline-context.ts.
 *
 * AUTO_RESOLVE_FAILED_VERIFICATION: CCEP said auto-resolve but post-fix verification
 * failed → treated as escalation. Set in ticket-triage.pipeline.ts execute_or_escalate.
 */
export interface PipelineContext {
  runId: string;
  pipelineType?: PipelineType;
  ticketId?: string;
  externalTicketId?: string;
  alertId?: string;
  ticketTitle?: string;
  ticketDescription?: string;
  category?: string;
  categoryId?: string;
  actionType?: string;
  kbMatches: KBMatchItem[];
  llmResponse: string;
  geminiConfidence: number;
  groqConfidence: number;
  cosineSimilarity: number;
  modelConfidence: number;
  dualModelAgreed: boolean;
  guardrailFlags: string[];
  guardrailFlagCount: number;
  normalizedGuardrailScore: number;
  historicalErrorRate: number;
  actionReversibilityWeight: number;
  ccepScore: number;
  threshold: number;
  decision: 'AUTO_RESOLVE' | 'ESCALATE' | 'PENDING' | 'AUTO_RESOLVE_FAILED_VERIFICATION';
  signalBreakdown?: Record<string, number>;
  stepResults: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface Step {
  name: string;
  tool: string;
  action: string;
  maxRetries?: number; // Default: 3
  execute: (ctx: PipelineContext) => Promise<PipelineContext>;
}

export type PipelineType = 'TICKET_TRIAGE' | 'INCIDENT_RESPONSE' | 'KB_SELF_LEARNING' | 'CI_TRIAGE' | 'BUILD_DEPLOY' | 'MERGEGATE';

export interface PipelineDefinition {
  type: PipelineType;
  steps: Step[];
}
