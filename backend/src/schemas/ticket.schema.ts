import { z } from 'zod';

export const CreateTicketInputSchema = z.object({
  externalId: z.string(),
  title: z.string().min(3),
  description: z.string().min(5),
  categoryId: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  source: z.string().optional().default('JIRA'),
  metadata: z.record(z.unknown()).optional(),
});

export const TicketResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  title: z.string(),
  description: z.string(),
  categoryId: z.string(),
  status: z.string(),
  priority: z.string(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateTicketInput = z.infer<typeof CreateTicketInputSchema>;
export type TicketResponse = z.infer<typeof TicketResponseSchema>;
