# AI Agent 개발 가이드라인

## 프로젝트 개요

토픽 입력 → 스크립트 생성 → TTS → 자막 → 영상 합성 → YouTube 업로드 전 과정을 자동화하는 서버리스 파이프라인.

- **런타임:** Node.js 20, TypeScript 5.x strict
- **패키지 매니저:** pnpm workspace + turbo
- **AI:** Google Gemini API (`gemini-2.0-flash`)
- **큐:** AWS SQS (Standard Queue + DLQ)
- **DB:** PostgreSQL / Prisma v5 (Supabase → RDS)

---

## 프로젝트 아키텍처

```
youtube-shorts-automation/
├── packages/
│   ├── api/                  # NestJS v11 (Fastify Adapter) — API Gateway + Lambda
│   ├── shared/               # Prisma 스키마, 공통 타입, 환경변수 Zod 스키마
│   ├── web/                  # Next.js 15 (App Router) — 대시보드
│   └── workers/
│       ├── script-worker/    # Lambda: Gemini API → script.json → S3
│       ├── tts-worker/       # Lambda: Edge-TTS → audio.mp3 → S3
│       ├── subtitle-worker/  # ECS Fargate: Whisper → subtitle.srt → S3
│       ├── render-worker/    # ECS Fargate: FFmpeg → output.mp4 → S3
│       └── upload-worker/    # Lambda: YouTube Data API → COMPLETED
├── infra/                    # AWS 리소스 (S3, SQS, IAM, EventBridge 등)
├── docker/                   # Fargate 컨테이너 (subtitle, render)
└── scripts/                  # 단독 검증 스크립트 (test-tts.ts 등)
```

**S3 키 규칙 (반드시 준수):**
```
jobs/{jobId}/script.json
jobs/{jobId}/audio.mp3
jobs/{jobId}/subtitle.srt
jobs/{jobId}/output.mp4
```

**Worker 실행 환경 결정 기준:**
| Worker | 환경 | 이유 |
|---|---|---|
| script, tts, upload | Lambda | 가볍고 빠른 작업 |
| subtitle, render | ECS Fargate | 대용량 모델/CPU 집약적 |

---

## 파이프라인 흐름

```
POST /jobs
  → SQS script-queue → script-worker (Lambda)
    → SQS tts-queue → tts-worker (Lambda)
      → SQS subtitle-queue → subtitle-worker (Fargate)
        → SQS render-queue → render-worker (Fargate)
          → SQS upload-queue → upload-worker (Lambda)
            → Job 상태: COMPLETED
```

**Job 상태 전이 (JobStatus enum 순서 고정):**
```
PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING
       → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED
```

---

## 코드 규칙

- **TypeScript**
  - `strict: true` 필수, `any` 사용 금지
  - 타입 단언 대신 `satisfies` 연산자 사용
  - 공통 타입은 `packages/shared`에서만 정의하고 import
- **NestJS** (`apps/api`)
  - **컨트롤러:** 요청 파싱 + 서비스 호출만. 비즈니스 로직 작성 금지
  - **서비스:** HTTP 상태 코드 참조 금지. 도메인 예외만 throw
  - Lambda 배포: `serverless-express` 또는 `@codegenie/serverless-express` 사용
  - 환경변수: 앱 시작 시 Zod 스키마로 검증 (`packages/shared/src/env.ts`)
- **Next.js** (`apps/web`)
  - 서버 컴포넌트 기본. `'use client'`는 인터랙션이 필요한 컴포넌트에만 적용
  - 데이터 페칭에 `useEffect` 사용 금지 → TanStack Query v5 사용
  - `/dashboard` 폴링 간격: 2초 고정
- **Prisma** (`packages/shared`)
  - 쿼리 시 필요한 필드만 `select` — `findMany()` 단독 사용 금지
  - Lambda 환경에서 싱글턴 패턴 필수
    ```typescript
    // packages/shared/src/prisma.ts
    const globalForPrisma = global as unknown as { prisma: PrismaClient };
    export const prisma = globalForPrisma.prisma ?? new PrismaClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
    ```
- **로깅**
  - `console.log` 프로덕션 코드에서 **완전 금지**
  - Pino 사용, 모든 로그에 `jobId`와 `channelId` 필드 포함
    ```typescript
    logger.info({ jobId, channelId, stage: 'tts' }, 'TTS 시작');
    ```
- **Google Gemini API** (`script-worker`)
  - 모델: `gemini-2.0-flash` 고정 (변경 금지)
  - 스크립트 출력 JSON 필드: `title`, `hook`, `script`, `hashtags`, `thumbnail_text`, `affiliate_product`, `affiliate_cta`
- **SQS**
  - 설정값
    | 항목 | 값 |
    |---|---|
    | Visibility Timeout | Worker 타임아웃 × 2 |
    | Message Retention | 4일 |
    | Max Receive Count | 3 (DLQ 이동 전) |
    | DLQ Retention | 14일 |
  - Worker 타임아웃
    | Worker | 타임아웃 | 실행 환경 |
    |---|---|---|
    | api | 30초 | Lambda |
    | script-worker | 60초 | Lambda |
    | tts-worker | 120초 | Lambda |
    | subtitle-worker | 300초 | ECS Fargate |
    | render-worker | 600초 | ECS Fargate |
    | upload-worker | 300초 | Lambda |

---

## 연동 수정 규칙

| 변경 대상 | 반드시 함께 수정할 파일 |
|---|---|
| `packages/shared/prisma/schema.prisma` | `packages/shared/src/types.ts` (Prisma 생성 타입 재export) |
| `JobStatus` enum 변경 | 모든 worker의 상태 업데이트 코드 |
| SQS 큐 추가 | `infra/` 큐 정의 + 해당 worker + **이전 단계 worker**(다음 큐 전송 로직) |
| 환경변수 추가 | `.env.example` + `packages/shared/src/env.ts` (Zod 스키마) |
| S3 키 패턴 변경 | 모든 worker의 S3 업로드/다운로드 경로 |
| YouTube OAuth 관련 변경 | `upload-worker` + `apps/api` 채널 연결 엔드포인트 |

---

## 보안 규칙

- `.env.local` 파일 Git 커밋 **절대 금지** (`.gitignore`에 포함 필수)
- `access_token` DB 저장 **금지** → 런타임에서 `refresh_token`으로 재발급
- `refresh_token`은 AES-256-GCM 암호화 후 저장
- `ENCRYPTION_KEY`는 AWS Secrets Manager에서 주입, `.env.local`에 직접 작성 금지 (로컬 개발 전용)
- `.env.example`에는 키 이름만 작성, 실제 값 작성 금지

---

## Git 규칙

- 커밋 메시지: `<type>(<scope>): <subject>` 형식
  - type
    - `feat` — 새 기능
    - `fix` — 버그 수정
    - `refactor` — 리팩터링
    - `test` — 테스트
    - `infra` — 인프라
    - `docs` — 문서
  - scope 예시: `script-worker`, `api`, `web`, `shared`, `infra`
- PR 단위: Phase 단위로 묶기 (Worker 하나씩 PR 금지)

---

## 금지 사항

- **TypeScript**
  - `any` 타입 사용
- **로깅**
  - `console.log` 프로덕션 코드 사용
- **보안**
  - `access_token` DB 저장
  - `.env.local` 파일 Git 커밋
- **Next.js**
  - `useEffect` 데이터 페칭
- **NestJS**
  - 컨트롤러에 비즈니스 로직 작성
- **Prisma**
  - `select` 없는 `findMany` 필드 전체 선택
- **Claude API**
  - `gemini-2.0-flash` 외 다른 모델을 script-worker에 사용
- **인프라**
  - S3 키 형식(`jobs/{jobId}/...`) 임의 변경
  - Worker 실행 환경 임의 변경 (subtitle/render는 반드시 Fargate)

---

## AI 의사결정 기준

- **Worker 배포 환경 결정**
  - 실행 시간 > 15분 또는 메모리 > 3GB → Fargate
  - 그 외 → Lambda
- **새 SQS 큐 추가 시 체크리스트**
  - `infra/`에 큐 + DLQ 정의
  - 이전 단계 worker에 다음 큐 전송 로직 추가
  - 새 worker에 SQS 트리거 설정
  - `JobStatus` enum에 새 상태 추가
  - Visibility Timeout = Worker 타임아웃 × 2 적용
- **환경변수 추가 시 체크리스트**
  - `packages/shared/src/env.ts` Zod 스키마에 추가
  - `.env.example`에 키 이름 추가 (값 없이)
  - Lambda/Fargate Task Definition 환경변수 섹션에 추가
  - AWS Secrets Manager에 실제 값 저장
- **ROADMAP 진행 현황 업데이트**
  - 태스크 완료가 확인되면 즉시 `docs/ROADMAP.md`의 해당 항목을 `- [ ]` → `- [✓]`로 변경
  - 완료 기준: E2E 검증 통과 또는 사용자가 완료를 명시적으로 확인한 경우
  - Phase 전체 완료 시 Phase 헤더도 함께 체크
