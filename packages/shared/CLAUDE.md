# @shorts/shared

모든 앱·Worker가 공유하는 유틸리티 패키지. 이 파일을 변경하면 전체 파이프라인에 영향을 준다.

## 적용 Rules
- `.claude/rules/database.md` — Prisma 싱글턴, findMany select
- `.claude/rules/typescript.md` — strict, ESM .js
- `.claude/rules/security.md` — 토큰 암호화, 환경변수

## 모듈 구조

| 모듈 | 경로 | 설명 |
|---|---|---|
| prisma | `src/prisma.ts` | Lambda 싱글턴 Prisma Client — 직접 `new PrismaClient()` 금지 |
| s3 | `src/s3.ts` | `uploadToS3`, `downloadFromS3`, `jobKey` 유틸 — `.jpg/.jpeg` 포함 Content-Type 자동 판별 |
| logger | `src/logger.ts` | `createLogger({ jobId, channelId })` — Pino 기반 구조적 로거 |
| env | `src/env.ts` | `BaseEnvSchema` (Zod) — 각 앱에서 `.extend()`로 확장 |
| types | `src/types.ts` | `ScriptOutput` (8필드), `ScriptContent` (title·description·hashtags·thumbnail_text), SQS 메시지 타입 |

## 변경 시 필수 확인

| 변경 대상 | 반드시 확인할 항목 |
|---|---|
| `src/types.ts` ScriptOutput | 모든 Worker의 import 경로 및 필드 참조 |
| `src/env.ts` BaseEnvSchema | 각 앱의 `EnvSchema.extend()` 호환성 |
| `prisma/schema.prisma` | `pnpm --filter @shorts/shared prisma:generate` 실행 후 Worker 타입 확인 |
| `src/s3.ts` jobKey 형식 | 모든 Worker의 S3 업로드/다운로드 경로 |

## 사용 패턴

```typescript
// Prisma — 반드시 싱글턴 사용
import { prisma } from '@shorts/shared/prisma.js';

// S3
import { uploadToS3, downloadFromS3, jobKey } from '@shorts/shared/s3.js';
await uploadToS3(jobKey(jobId, 'audio.mp3'), buffer);

// Logger
import { createLogger } from '@shorts/shared/logger.js';
const logger = createLogger({ jobId, channelId });

// Env (각 앱에서 확장)
import { BaseEnvSchema } from '@shorts/shared/env.js';
const EnvSchema = BaseEnvSchema.extend({ GEMINI_API_KEY: z.string().min(1) });
export const env = EnvSchema.parse(process.env);
```
