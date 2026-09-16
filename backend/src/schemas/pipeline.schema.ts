import { z } from 'zod';

export const RunPipelineInputSchema = z.object({
  pipelineType: z.enum(['TICKET_TRIAGE', 'INCIDENT_RESPONSE', 'KB_SELF_LEARNING', 'CI_TRIAGE', 'BUILD_DEPLOY', 'MERGEGATE']),
  ticketId: z.string().optional(),
  externalTicketId: z.string().optional(),
  alertId: z.string().optional(),
  ticketTitle: z.string().optional(),
  ticketDescription: z.string().optional(),
  categoryId: z.string().optional(),
  actionType: z.string().optional(),
  threshold: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const RunPipelineResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  pipelineType: z.string(),
  decision: z.enum(['AUTO_RESOLVE', 'ESCALATE', 'PENDING']).optional(),
  ccepScore: z.number().optional(),
  message: z.string(),
});

export type RunPipelineInput = z.infer<typeof RunPipelineInputSchema>;
export type RunPipelineResponse = z.infer<typeof RunPipelineResponseSchema>;
