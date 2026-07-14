# 백엔드 개발 컨벤션

> 이 문서는 PRD 14절의 개발 규칙을 구체적인 실천 지침으로 풀어낸 것이다.  
> 관련 문서: [보안/암호화](security/encryption.md) · [파이프라인 흐름](../architecture/pipeline-flow.md)

---

## 1. NestJS 3계층 원칙

이 프로젝트의 NestJS 코드는 Controller → Service → Repository 3계층을 엄격히 분리한다.  
각 계층의 **책임 범위를 벗어나는 코드는 코드 리뷰에서 반려**한다.

### 1-1. Controller — HTTP 파싱·검증만

Controller의 유일한 책임은 HTTP 요청을 받아 DTO로 변환하고, Service를 호출하고, 응답을 반환하는 것이다.

```typescript
// 올바른 예
@Post()
async createJob(@Body() dto: CreateJobDto): Promise<JobResponseDto> {
  const job = await this.jobService.create(dto);
  return toJobResponseDto(job);
}
```

**금지사항:**
- Controller에 비즈니스 로직 작성 (조건 분기, 계산, 외부 API 호출)
- Controller에서 Prisma 직접 호출
- Controller에서 SQS 직접 호출

### 1-2. Service — 비즈니스 로직만

Service는 도메인 로직의 유일한 진입점이다. HTTP와 무관하게 동작해야 한다.

```typescript
// 올바른 예
async create(dto: CreateJobDto): Promise<Job> {
  const channel = await this.channelRepo.findByIdOrThrow(dto.channelId);
  if (!channel.isActive) throw new Error('채널이 비활성화 상태입니다.');
  const job = await this.jobRepo.create(dto);
  await this.sqsService.sendToScriptQueue({ jobId: job.id, topic: dto.topic });
  return job;
}
```

**금지사항:**
- Service에서 `HttpStatus`, `HttpException` 등 HTTP 개념 사용
- Service에서 `@Req()`, `@Res()` 등 NestJS HTTP 데코레이터 의존
- Service에서 Prisma Client 직접 import (Repository를 통할 것)

### 1-3. Repository — Prisma 쿼리만

Repository는 DB 쿼리의 유일한 진입점이다. 비즈니스 조건 판단 없이 데이터 접근만 담당한다.

```typescript
// 올바른 예
async findByIdOrThrow(id: string): Promise<Channel> {
  const channel = await this.prisma.channel.findUnique({
    where: { id },
    select: { id: true, isActive: true, refreshToken: true },
  });
  if (!channel) throw new NotFoundException(`Channel ${id} not found`);
  return channel;
}
```

**금지사항:**
- Repository에서 비즈니스 조건 판단 ("`isActive`가 false면 예외" 같은 도메인 규칙)
- Repository에서 암호화/복호화 직접 처리 (Service 책임)

---

## 2. TypeScript 규칙

### 2-1. strict mode 필수

`tsconfig.json`의 `"strict": true`는 모든 패키지에서 활성화된다. 해제 금지.

### 2-2. `any` 사용 금지

`any`는 타입 시스템을 무력화하므로 어떤 상황에서도 사용하지 않는다.  
타입을 모를 때는 `unknown`을 사용하고, 이후 타입 가드로 좁힌다.

```typescript
// 금지
function processMessage(msg: any) { ... }

// 올바른 예
function processMessage(msg: unknown) {
  if (!isScriptMessage(msg)) throw new Error('Invalid message shape');
  // 이후 msg는 ScriptMessage 타입
}
```

### 2-3. `satisfies` 연산자 활용

객체가 특정 타입을 만족하는지 컴파일 타임에 검증하되, 타입 추론은 더 좁게 유지하고 싶을 때 `satisfies`를 사용한다.

```typescript
const config = {
  queueUrl: process.env.SQS_SCRIPT_QUEUE_URL,
  maxMessages: 1,
} satisfies SqsConfig;
// config.maxMessages는 number 타입으로 추론됨 (SqsConfig로 넓어지지 않음)
```

### 2-4. 타입 단언(`as`) 최소화

`as` 타입 단언은 런타임 오류를 숨긴다. 불가피한 경우에만 사용하고, 이유를 주석으로 명시한다.

---

## 3. Prisma 사용 규칙

### 3-1. 필요한 필드만 `select`

`findUnique`, `findMany` 등 모든 조회 쿼리에서 반드시 `select`로 필요한 필드만 가져온다.  
`select` 없는 조회는 코드 리뷰에서 반려한다.

```typescript
// 금지
const job = await prisma.job.findUnique({ where: { id } });

// 올바른 예
const job = await prisma.job.findUnique({
  where: { id },
  select: { id: true, status: true, channelId: true },
});
```

### 3-2. Lambda 싱글턴 패턴

Lambda 환경에서 매 호출마다 새 Prisma Client를 생성하면 DB 연결 풀이 고갈된다.  
`packages/shared/src/prisma.ts`의 싱글턴을 사용한다.

```typescript
// packages/shared/src/prisma.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

Lambda에서 직접 `new PrismaClient()` 호출 금지. 반드시 위 싱글턴을 import할 것.

---

## 4. 로깅 규칙

### 4-1. Pino 사용

모든 로그는 `packages/shared/src/logger.ts`의 `createLogger`를 통해 작성한다.  
프로덕션 환경에서 `console.log`, `console.error` 직접 사용 금지.

```typescript
import { createLogger } from '@shorts/shared/logger';

const logger = createLogger({ jobId: message.jobId, channelId: message.channelId });
logger.info('TTS 시작');
logger.error({ err }, 'TTS 실패');
```

### 4-2. `jobId` / `channelId` 필수 포함

모든 Worker 로그에는 `jobId`와 (가능하면) `channelId`가 포함되어야 한다.  
CloudWatch에서 특정 Job 추적이 가능하도록 구조적 로그를 유지한다.

### 4-3. 에러 로그 형식

에러 로그는 반드시 `err` 키에 Error 객체를 포함한다.  
문자열만 로깅하면 스택 트레이스가 사라진다.

```typescript
// 금지
logger.error('TTS 실패: ' + error.message);

// 올바른 예
logger.error({ err: error, jobId }, 'TTS 처리 실패');
```

---

## 5. SQS Worker 설계 원칙

### 5-1. Lambda Worker (script / tts / subtitle / render / upload)

AWS SQS Event Source Mapping이 핸들러를 자동으로 호출하는 방식이다. 핸들러 함수 형태로 작성한다.

```typescript
export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as ScriptMessage;
    await processMessage(message);
  }
};
```

### 5-2. 멱등성(idempotent) 보장

모든 Worker는 같은 메시지를 여러 번 처리해도 결과가 동일해야 한다.  
S3에 같은 키로 덮어쓰기(put)하는 방식이 기본 전략이다.

```typescript
// 멱등한 S3 저장 — 이미 존재해도 안전하게 덮어씀
await uploadToS3(`jobs/${jobId}/audio.mp3`, audioBuffer);
```

### 5-3. 실패 처리

처리 실패 시 Job 상태를 `FAILED`로 업데이트하고 `failReason`을 기록한다.  
SQS `maxReceiveCount: 3` 도달 시 메시지는 자동으로 DLQ로 이동한다.

```typescript
await jobRepo.update(jobId, {
  status: 'FAILED',
  failReason: error instanceof Error ? error.message : String(error),
});
```

---

## 6. `packages/shared` 모듈

공통 기능은 `@shorts/shared`로 패키지화되어 있다. 중복 구현 금지.

| 모듈 | 경로 | 설명 |
|---|---|---|
| `prisma` | `src/prisma.ts` | Lambda 싱글턴 패턴 Prisma Client |
| `s3` | `src/s3.ts` | `uploadToS3`, `downloadFromS3`, `jobKey` 유틸 |
| `logger` | `src/logger.ts` | `createLogger({ jobId, channelId })` — Pino 기반 구조적 로거 |
| `env` | `src/env.ts` | Zod `BaseEnvSchema` (`DATABASE_URL`, `AWS_REGION`, `S3_BUCKET_NAME`) |
| `types` | `src/types.ts` | SQS 메시지 타입, `ScriptOutput` 인터페이스 |

### S3 유틸 사용 예시

```typescript
import { uploadToS3, downloadFromS3, jobKey } from '@shorts/shared/s3';

// 저장: jobs/{jobId}/audio.mp3
await uploadToS3(jobKey(jobId, 'audio.mp3'), audioBuffer);

// 조회
const scriptJson = await downloadFromS3(jobKey(jobId, 'script.json'));
```

### 환경변수 검증 확장 예시

각 패키지의 `src/env.ts`에서 `BaseEnvSchema`를 확장해 패키지 전용 변수를 추가한다.

```typescript
import { BaseEnvSchema } from '@shorts/shared/env';
import { z } from 'zod';

const EnvSchema = BaseEnvSchema.extend({
  GEMINI_API_KEY: z.string().min(1),
  SQS_TTS_QUEUE_URL: z.string().url(),
});

export const env = EnvSchema.parse(process.env);
// 앱 시작 시 필수 환경변수 누락이면 즉시 프로세스 종료
```

---

## 7. 환경변수 검증

모든 앱과 Worker는 **시작 시점에** Zod 스키마로 환경변수를 검증한다.  
필수 변수가 없으면 즉시 프로세스를 종료해 배포 오류를 조기에 발견한다.

- 변수 추가 시 해당 패키지의 `src/env.ts` 스키마에도 동시에 추가할 것
- `.env.example` 파일에 키 이름과 설명을 추가할 것 (실제 값은 절대 커밋 금지)
- 상세 변수 목록: [환경변수 가이드](../onboarding/env-vars.md)

---

## 8. Git 커밋 컨벤션

```
<type>(<scope>): <subject>
```

### type 목록

| type | 사용 시점 |
|---|---|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 개선 |
| `test` | 테스트 추가·수정 |
| `docs` | 문서 작성·수정 |
| `chore` | 빌드·도구·설정 변경 |

### scope 예시

`api`, `script-worker`, `tts-worker`, `subtitle-worker`, `render-worker`, `upload-worker`, `shared`, `web`, `infra`

### 예시

```
feat(script-worker): Gemini API 재시도 로직 추가
fix(upload-worker): refresh_token 만료 시 재발급 처리
docs(api): Channel 암호화 API 문서 추가
```

### PR 단위

PR은 Phase 단위로 작성한다. 하나의 PR에 여러 Phase를 섞지 않는다.

---

## 9. Next.js 규칙 (apps/web)

- 서버 컴포넌트(Server Component)를 기본으로 사용한다
- 클라이언트 컴포넌트(`'use client'`)는 인터랙션이 필요한 최소 범위로 제한한다
- `useEffect`에서 데이터 페칭 금지 — TanStack Query 또는 Server Component를 사용한다
- API 호출은 `NEXT_PUBLIC_API_URL` 환경변수 기반 fetch를 사용한다

---

## 10. 보안 요약

| 항목 | 규칙 |
|---|---|
| `.env.local` | Git 커밋 금지 (`.gitignore`에 포함됨) |
| `access_token` | DB 저장 절대 금지 — 런타임에서 `refresh_token`으로 재발급 |
| `ENCRYPTION_KEY` | 프로덕션에서 AWS Secrets Manager 주입만 허용 |
| `refreshToken` | AES-256-GCM으로 암호화 후 DB 저장 |
| 시크릿 전반 | Secrets Manager 관리 — `.env.example`에는 키 이름만 기재 |

상세 암호화 규격: [security/encryption.md](security/encryption.md)
