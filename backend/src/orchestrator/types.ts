export interface KBMatchItem {
  id: string;
  score: number;
  content: string;
  confidenceAtIngestion?: number;
  timesReused?: number;
}

export interface PipelineContext {
  runId: string;
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
  decision: 'AUTO_RESOLVE' | 'ESCALATE' | 'PENDING';
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
