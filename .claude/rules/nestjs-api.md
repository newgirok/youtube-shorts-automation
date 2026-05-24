# NestJS API 규칙 (apps/api)

## 3계층 아키텍처 (엄격 준수)

| 계층 | 역할 | 금지 사항 |
|---|---|---|
| Controller | 요청 파싱 + 서비스 호출 | 비즈니스 로직 작성 |
| Service | 도메인 로직 + 예외 throw | HTTP 상태코드 참조 |
| Repository | Prisma 쿼리 전담 | 도메인 로직 |

```typescript
//  Controller — 파싱만
@Post()
async createJob(@Body() dto: CreateJobDto) {
  return this.jobsService.createJob(dto);
}

//  Service — 도메인 예외
async createJob(dto: CreateJobDto) {
  const channel = await this.channelRepo.findById(dto.channelId);
  if (!channel) throw new ChannelNotFoundException(dto.channelId);
  // ...
}

//  Controller에 비즈니스 로직 금지
@Post()
async createJob(@Body() dto: CreateJobDto) {
  const channel = await this.prisma.channel.findUnique(...); // 금지
}
```

## 환경변수 검증 (Zod)
앱 시작 시 Zod 스키마로 검증 — `packages/shared/src/env.ts`:
```typescript
export const env = z.object({
  DATABASE_URL: z.string().url(),
  SQS_QUEUE_URL_SCRIPT: z.string().url(),
  GEMINI_API_KEY: z.string().min(1),
  // ...
}).parse(process.env);
```
새 환경변수 추가 시 반드시 이 스키마에 먼저 추가.

## 로깅 규칙 (Pino)
- `console.log` / `console.error` 프로덕션 코드에서 완전 금지
- 모든 로그에 `jobId`, `channelId` 필드 필수:
```typescript
import { logger } from '@shorts/shared';

logger.info({ jobId, channelId, stage: 'api' }, 'Job 생성 완료');
logger.error({ jobId, err }, 'SQS 발행 실패');
```

## CORS 설정
```typescript
// apps/api/src/main.ts
app.enableCors({ origin: env.WEB_ORIGIN ?? 'http://localhost:3001' });
```

## BigInt JSON 직렬화 (main.ts 최상단 필수)
```typescript
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};
```

## 인증 미들웨어
모든 `/jobs`, `/channels` 엔드포인트에 인증 미들웨어 적용 필수.
`GET /health`는 인증 제외.
