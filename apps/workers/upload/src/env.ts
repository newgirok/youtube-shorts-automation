import { z } from 'zod';
import { BaseEnvSchema } from '@shorts/shared';

export const EnvSchema = BaseEnvSchema.extend({
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z.string().length(64),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`[ENV] 누락된 환경변수: ${missing}`);
  }
  return result.data;
}
