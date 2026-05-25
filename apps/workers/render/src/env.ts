import { z } from 'zod';
import { BaseEnvSchema } from '@shorts/shared';

export const EnvSchema = BaseEnvSchema.extend({
  SQS_RENDER_QUEUE_URL: z.string().url(),
  SQS_UPLOAD_QUEUE_URL: z.string().url(),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  PEXELS_API_KEY: z.string(),
  FONTS_DIR: z.string().optional(),
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
