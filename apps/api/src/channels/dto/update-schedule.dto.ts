import { z } from 'zod';

export const UpdateScheduleSchema = z.object({
  cronExpression: z.string().min(1),
});

export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;
