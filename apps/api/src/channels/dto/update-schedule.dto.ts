import { z } from 'zod';

export const UpdateScheduleSchema = z.object({
  cronExpression: z.string().min(1).nullable().optional(),
  schedulerEnabled: z.boolean().optional(),
  schedulerCategory: z.enum(['top', 'business', 'technology', 'health', 'science', 'nation']).optional(),
});

export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;
