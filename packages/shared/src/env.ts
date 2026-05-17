import { z } from 'zod';

export const BaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AWS_REGION: z.string().default('ap-northeast-2'),
  S3_BUCKET_NAME: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function parseBaseEnv(): BaseEnv {
  const result = BaseEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`[ENV] 누락된 환경변수: ${missing}`);
  }
  return result.data;
}
