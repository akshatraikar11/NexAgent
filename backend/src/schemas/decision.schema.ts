import { z } from 'zod';

export const OverrideDecisionInputSchema = z.object({
  overriddenDecision: z.enum(['AUTO_RESOLVE', 'ESCALATE']),
  reason: z.string().min(5),
});

export const DecisionResponseSchema = z.object({
  id: z.string(),
  ticketId: z.string().nullable(),
  pipelineRunId: z.string(),
  ccepScore: z.number(),
  threshold: z.number(),
  decision: z.enum(['AUTO_RESOLVE', 'ESCALATE', 'PENDING']),
  modelConfidence: z.number(),
  dualModelAgreed: z.boolean(),
  historicalErrorRate: z.number(),
  guardrailFlagsCount: z.number(),
  normalizedGuardrailScore: z.number(),
  actionReversibilityWeight: z.number(),
  signalBreakdown: z.record(z.unknown()),
  createdAt: z.string(),
});

export type OverrideDecisionInput = z.infer<typeof OverrideDecisionInputSchema>;
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;
