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
| logger | `src/logger.ts` | `createLogger({ jobId?, channelId? })` — Pino 기반 구조적 로거 |
| env | `src/env.ts` | `BaseEnvSchema` (Zod), `parseBaseEnv()`, `BaseEnv` 타입 — 각 앱에서 `.extend()`로 확장 |
| types | `src/types.ts` | `ScriptOutput` (8필드), `ScriptContent` (`Partial<ScriptOutput>`), SQS 메시지 타입 6종 |

## Exports (index.ts)

```typescript
// Prisma
export { prisma } from './prisma.js';
export { JobStatus } from '@prisma/client';
export type { Channel, Job, ChannelAnalytics } from '@prisma/client';

// S3
export { uploadToS3, downloadFromS3, jobKey } from './s3.js';

// Logger
export { createLogger } from './logger.js';

// Env
export { BaseEnvSchema, parseBaseEnv } from './env.js';
export type { BaseEnv } from './env.js';

// Types
export type {
  ScriptScene, ScriptOutput, ScriptContent,
  BaseSQSMessage, ScriptMessage, TTSMessage,
  SubtitleMessage, RenderMessage, UploadMessage,
} from './types.js';
```

## SQS 메시지 타입 필드

| 타입 | 추가 필드 |
|---|---|
| `ScriptMessage` | `topic` |
| `TTSMessage` | `scriptS3Key` |
| `SubtitleMessage` | `audioS3Key` |
| `RenderMessage` | `audioS3Key`, `subtitleS3Key` |
| `UploadMessage` | `videoS3Key` |

모든 타입은 `BaseSQSMessage`(`jobId`, `channelId`)를 상속한다.

## Prisma 모델 요약

| 모델 | 주요 필드 |
|---|---|
| `Channel` | `id`, `youtubeId`, `name`, `niche`, `refreshToken`, `isActive`, `schedulerEnabled`, `schedulerCategory`, `subscriberCount(Int)`, `totalViews(BigInt)` |
| `Job` | `id`, `channelId`, `topic`, `status(JobStatus)`, `retryCount`, `failReason`, `scriptContent(Json?)`, `audioS3Key`, `subtitleS3Key`, `videoS3Key`, `youtubeVideoId`, `thumbnailUrl`, `viewCount(BigInt)`, `likeCount(BigInt)` |
| `ChannelAnalytics` | `id`, `channelId`, `date`, `views(BigInt)`, `subscribers(Int)`, `estimatedRevenue(Float)`, `watchTimeMinutes(BigInt)` |
| `User` | `id`, `email(UNIQUE)`, `createdAt` — 로그인 허용 이메일 관리 (signIn 콜백에서 조회) |

`JobStatus` enum 순서: `PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED`

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

// Env (단순 파싱)
import { parseBaseEnv } from '@shorts/shared/env.js';
const env = parseBaseEnv(); // 누락된 변수 있을 시 에러 메시지에 키 이름 포함
```
