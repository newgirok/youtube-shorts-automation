import { z } from 'zod';

export const CreateJobSchema = z.object({
  channelId: z.string().min(1),
  topic: z.string().min(1).max(500),
});

export type CreateJobDto = z.infer<typeof CreateJobSchema>;
