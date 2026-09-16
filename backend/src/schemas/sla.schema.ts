import { z } from 'zod';

export const CorrelateAlertSchema = z.object({
  alertId: z.string().min(1, 'alertId required'),
  alertTitle: z.string().min(1, 'alertTitle required'),
  alertDescription: z.string().optional().default(''),
  severity: z.enum(['P0','P1','P2','P3','CRITICAL','HIGH','MEDIUM','LOW']).default('P2'),
  source: z.string().optional().default('SENTRY'),
});

export const CreateNotificationSchema = z.object({
  userId: z.string().uuid().optional(),
  type: z.enum(['ESCALATION','SLA_BREACH','OVERRIDE','KB_INGESTED','SYSTEM','INFO']),
  title: z.string().min(1),
  body: z.string().min(1),
  severity: z.enum(['INFO','WARNING','CRITICAL']).optional().default('INFO'),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export type CorrelateAlertInput = z.infer<typeof CorrelateAlertSchema>;
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
