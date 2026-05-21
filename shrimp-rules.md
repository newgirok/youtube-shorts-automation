# AI Agent 개발 가이드라인

## 프로젝트 개요

한국 뉴스·시사 쇼츠 채널 특화 자동화 파이프라인.  
Google News RSS 또는 토픽 입력 → 스크립트 생성 → TTS → 자막 → 영상 합성 → YouTube 업로드 전 과정을 자동화한다.

- **런타임:** Node.js 20, TypeScript 5.x strict, **ESM** (import 경로 `.js` 확장자 필수)
- **패키지 매니저:** pnpm workspace + Turborepo
- **AI:** Google Gemini API (`gemini-2.5-flash`)
- **큐:** AWS SQS (Standard Queue + DLQ)
- **DB:** PostgreSQL / Prisma v5 (Supabase → RDS)

---

## 프로젝트 아키텍처

```
youtube-shorts-automation/
├── apps/
│   ├── api/                  # NestJS v11 (Fastify Adapter) — REST API
│   ├── web/                  # Next.js 15 (App Router) — 대시보드
│   └── workers/
│       ├── script/           # Lambda: Gemini 2.5 Flash → script.json → S3
│       ├── tts/              # Lambda: Edge-TTS → audio.mp3 → S3
│       ├── subtitle/         # ECS Fargate: 스크립트 기반 SRT → subtitle.srt → S3
│       ├── render/           # ECS Fargate: Pexels + FFmpeg → output.mp4 → S3
│       └── upload/           # Lambda: YouTube Data API → COMPLETED
├── packages/
│   └── shared/               # Prisma 스키마, 공통 타입, 환경변수 Zod 스키마
├── infra/                    # AWS 리소스 (S3, SQS, IAM, ECS, ECR, EventBridge 등)
└── scripts/                  # Phase 0 단독 검증 스크립트 (test-tts.ts 등)
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
| subtitle, render | ECS Fargate | CPU 집약적 처리 |

---

## 파이프라인 흐름

```
POST /jobs  또는  POST /jobs/auto-news
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

## 스크립트 출력 형식 (ScriptOutput — 7개 필드)

```typescript
interface ScriptOutput {
  title: string;           // 20자 이내, 충격·클릭 유도
  hook: string;            // 첫 2초 훅 문장
  script: string;          // 180~250자, comment_bait으로 마무리
  scenes: Scene[];         // 4~6개 장면
  hashtags: string[];
  thumbnail_text: string;  // 8자 이내
  comment_bait: string;    // 25자 이내, 공분·논란 유발
}

interface Scene {
  start: number;   // 초
  end: number;     // 초
  text: string;    // 해당 구간 낭독 텍스트
  keyword: string; // Pexels 영어 검색 키워드
  effect: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
}
```

> `affiliate_product`, `affiliate_cta` 필드는 제거됨. script-worker 수정 시 tts-worker의 파싱 로직 함께 확인.

---

## 코드 규칙

- **TypeScript**
  - `strict: true` 필수, `any` 사용 금지
  - 타입 단언 대신 `satisfies` 연산자 사용
  - 공통 타입은 `packages/shared`에서만 정의하고 import
  - ESM: import 경로 끝에 `.js` 확장자 필수 (예: `'./service.js'`)
- **NestJS** (`apps/api`)
  - **컨트롤러:** 요청 파싱 + 서비스 호출만. 비즈니스 로직 작성 금지
  - **서비스:** HTTP 상태 코드 참조 금지. 도메인 예외만 throw
  - 환경변수: 앱 시작 시 Zod 스키마로 검증
- **Next.js** (`apps/web`)
  - 서버 컴포넌트 기본. `'use client'`는 인터랙션이 필요한 컴포넌트에만 적용
  - 데이터 페칭에 `useEffect` 사용 금지 → TanStack Query v5 사용
  - `/dashboard` 폴링 간격: 2초 고정
- **Prisma** (`packages/shared`)
  - 쿼리 시 필요한 필드만 `select` — `findMany()` 단독 사용 금지
  - Lambda 환경에서 싱글턴 패턴 필수
    ```typescript
    const globalForPrisma = global as unknown as { prisma: PrismaClient };
    export const prisma = globalForPrisma.prisma ?? new PrismaClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
    ```
- **로깅**
  - `console.log` 프로덕션 코드에서 **완전 금지**
  - Pino 사용, 모든 로그에 `jobId`와 `channelId` 필드 포함
    ```typescript
    logger.info({ jobId, channelId, stage: 'subtitle' }, 'SRT 생성 완료');
    ```
- **Google Gemini API** (`script-worker`)
  - 모델: `gemini-2.5-flash` 고정 (변경 금지)
  - 503 응답 시 최대 3회 재시도, 재시도 간 지연 5초 × 시도 횟수
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
| `packages/shared/prisma/schema.prisma` | 해당 Worker의 타입 참조 코드 |
| `JobStatus` enum 변경 | 모든 worker의 상태 업데이트 코드 |
| SQS 큐 추가 | `infra/` 큐 정의 + 해당 worker + **이전 단계 worker**(다음 큐 전송 로직) |
| 환경변수 추가 | `.env.example` + `packages/shared/src/env.ts` (Zod 스키마) |
| S3 키 패턴 변경 | 모든 worker의 S3 업로드/다운로드 경로 |
| YouTube OAuth 관련 변경 | `upload-worker` + `apps/api` 채널 연결 엔드포인트 |
| `ScriptOutput` 필드 변경 | `script-worker/script-generator.ts` + `tts-worker` 파싱 코드 |

---

## 보안 규칙

- `.env.local` 파일 Git 커밋 **절대 금지**
- `access_token` DB 저장 **금지** → 런타임에서 `refresh_token`으로 재발급
- `refresh_token`은 AES-256-GCM 암호화 후 저장
- `ENCRYPTION_KEY`는 AWS Secrets Manager에서 주입, `.env.local`에 직접 작성 금지 (로컬 개발 전용)
- `.env.example`에는 키 이름만 작성, 실제 값 작성 금지
- OAuth 스코프: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`

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
- **script-worker**
  - `gemini-2.5-flash` 외 다른 모델 사용
  - `affiliate_product`, `affiliate_cta` 필드를 ScriptOutput에 추가 (제거된 필드)
- **render-worker**
  - affiliate CTA 자막 렌더링 (제거됨)
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
  - 태스크 완료가 확인되면 즉시 `docs/roadmap.md`의 해당 항목을 `- [ ]` → `- [✓]`로 변경
  - 완료 기준: E2E 검증 통과 또는 사용자가 완료를 명시적으로 확인한 경우
  - Phase 전체 완료 시 Phase 헤더도 함께 체크
- **subtitle-worker 수정 시**
  - faster-whisper 관련 코드 없음 — SRT는 `script.json`의 `script` 필드 기반으로 생성
  - `ffprobe`로 오디오 길이 측정 필수
  - 하이라이트 키워드 목록 변경 시 `processor.ts`의 `highlightKeywords()` 함수 수정
- **render-worker 수정 시**
  - `scriptContent.scenes` 배열 없는 경우 fallback 처리 (topic 키워드 단일 이미지)
  - Pexels API 실패 시 topic으로 재시도 로직 유지
  - `PEXELS_API_KEY` 환경변수 필수
