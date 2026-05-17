import { z } from 'zod';
import { BaseEnvSchema } from '@shorts/shared';

export const EnvSchema = BaseEnvSchema.extend({
  SQS_SUBTITLE_QUEUE_URL: z.string().url(),
  SQS_RENDER_QUEUE_URL: z.string().url(),
  PYTHON_PATH: z.string().default('python'),
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
