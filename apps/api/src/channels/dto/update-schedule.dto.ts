import { z } from 'zod';

export const UpdateScheduleSchema = z.object({
  cronExpression: z.string().min(1).nullable().optional(),
  schedulerEnabled: z.boolean().optional(),
  schedulerCategory: z.enum(['top', 'politics', 'business', 'nation']).optional(),
});

export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;
