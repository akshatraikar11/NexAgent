import { z } from 'zod';

export const UpdateSettingsInputSchema = z.object({
  ccepThreshold: z.number().min(0).max(1).optional(),
  weights: z
    .object({
      w1: z.number().min(0).max(1),
      w2: z.number().min(0).max(1),
      w3: z.number().min(0).max(1),
      w4: z.number().min(0).max(1),
    })
    .optional(),
  reversibilityMap: z.record(z.number()).optional(),
});

export const SettingsResponseSchema = z.object({
  ccepThreshold: z.number(),
  weights: z.object({
    w1: z.number(),
    w2: z.number(),
    w3: z.number(),
    w4: z.number(),
  }),
  reversibilityMap: z.record(z.number()),
  updatedAt: z.string(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;
