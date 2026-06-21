import { z } from 'zod';

export const AutoNewsJobSchema = z.object({
  channelId: z.string().min(1),
  category: z.enum(['top', 'business', 'technology', 'health', 'science', 'nation']).default('top'),
  count: z.number().int().min(1).max(5).default(3),
});

export type AutoNewsJobDto = z.infer<typeof AutoNewsJobSchema>;
