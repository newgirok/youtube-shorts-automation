# 시스템 아키텍처 개요

이 문서는 AI YouTube Shorts 자동화 플랫폼의 전체 시스템 구조를 설명합니다. 파이프라인 상세 흐름은 [파이프라인 흐름](./pipeline-flow.md), 데이터 모델은 [데이터 모델](./data-model.md)을 참고하세요.

---

## 시스템 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 (브라우저)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────────┐
│         Next.js 15 대시보드 (EC2, Docker Compose)             │
│  /dashboard  /dashboard/[id]  /channels  /channels/[id]     │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP (API 호출)
┌───────────────────────▼─────────────────────────────────────┐
│       API Gateway + Lambda (NestJS v11 + Fastify)           │
│                   apps/api                                   │
└──────┬──────────────────────────────────┬────────────────────┘
       │ SQS 메시지 발행                    │ Prisma ORM
       │                                  │
┌──────▼──────────────────────────┐  ┌────▼───────────────────┐
│         AWS SQS 파이프라인        │  │  PostgreSQL (Supabase) │
│                                 │  │  + pgBouncer           │
│  script-queue → tts-queue       │  └────────────────────────┘
│  → subtitle-queue → render-queue│
│  → upload-queue                 │
└──────┬──────────────────────────┘
       │
       ├─── script-worker  (Lambda)  ──→ Gemini 2.5 Flash ──→ S3 script.json
       ├─── tts-worker     (Lambda)  ──→ Edge-TTS          ──→ S3 audio.mp3
       ├─── subtitle-worker (Lambda)  ──→ 글자 비례 SRT       ──→ S3 subtitle.srt
       ├─── render-worker  (Lambda Container Image) ──→ Pexels + FFmpeg ──→ S3 output.mp4
       └─── upload-worker  (Lambda)  ──→ YouTube API        ──→ 업로드 완료

┌────────────────────────────────────────────────────────────┐
│                      AWS 공통 인프라                         │
│  S3 (산출물 저장)  CloudWatch (로그/알람)  ECR (render-worker 컨테이너 이미지) │
│  EventBridge Scheduler (채널별 일일 Job 생성)               │
│  Secrets Manager (암호화 키, API 키)                        │
└────────────────────────────────────────────────────────────┘
```

---

## 각 Worker 역할

### Lambda Workers

Lambda는 실행 시간 15분 이내, 메모리 3GB 이하인 경량 작업에 사용합니다. 자세한 분리 기준은 [ADR 001 — Lambda vs ECS Fargate](../adr/001-lambda-vs-fargate.md)를 참고하세요.

| Worker | 위치 | 입력 | 처리 | 출력 |
|---|---|---|---|---|
| **script-worker** | `apps/workers/script` | 토픽, 채널 ID | Gemini 2.5 Flash API 호출 — 뉴스·시사 특화 35~45초 스크립트(210~350자, 최대 380자 검증) | `script.json` → S3 |
| **tts-worker** | `apps/workers/tts` | `script.json` | Edge-TTS `ko-KR-SunHiNeural` | `audio.mp3` → S3 |
| **upload-worker** | `apps/workers/upload` | `output.mp4` | YouTube Data API v3 업로드 (description+해시태그, categoryId=25, containsSyntheticMedia: true) | 업로드 완료, `youtubeVideoId` 저장 |

### Lambda Workers (추가)

| Worker | 위치 | 입력 | 처리 | 출력 |
|---|---|---|---|---|
| **subtitle-worker** | `apps/workers/subtitle` | `audio.mp3`, `script.json` | `ffprobe`로 오디오 길이 측정 후 글자 비례 타임스탬프 할당, 20자 이하 청크 분할 | `subtitle.srt` → S3 |
| **render-worker** | `apps/workers/render` | `audio.mp3`, `subtitle.srt`, scenes[] | Pexels 동영상/이미지 다운로드 → zoompan 클립 → FFmpeg concat + 헤더 오버레이 + ASS 자막 burn-in → FFmpeg `-vframes 1` 썸네일 추출 | `output.mp4`, `thumbnail.jpg` → S3 |

render-worker는 Lambda Container Image로 패키징됩니다 (3008MB, 600s).

> Phase 6부터 render-worker는 FFmpeg에서 Remotion으로 전환됩니다([ADR 004](../adr/004-render-engine.md)).

---

## 기술 스택

| 분류 | 기술 | 비고 |
|---|---|---|
| **Frontend** | Next.js 15 (App Router), React 19 | EC2 (GitHub Actions SSH 배포, standalone Docker) |
| **UI** | TailwindCSS, shadcn/ui | |
| **상태관리** | TanStack Query v5, Zustand v4 | 서버 상태 / 클라이언트 상태 분리 |
| **Backend** | NestJS v11, Fastify Adapter | Lambda 함수로 패키징 |
| **언어** | TypeScript 5.x strict mode, ESM | `any` 사용 금지 |
| **유효성 검사** | Zod | 환경변수, API 요청 검증 |
| **로깅** | Pino | 구조적 로깅, `jobId`/`channelId` 컨텍스트 포함 |
| **ORM** | Prisma v5 | Lambda 싱글턴 패턴 |
| **DB** | PostgreSQL (Supabase → RDS) | pgBouncer로 연결 관리([ADR 007](../adr/007-database-strategy.md)) |
| **Queue** | AWS SQS Standard Queue + DLQ | FIFO 불사용([ADR 003](../adr/003-sqs-standard-queue.md)) |
| **스토리지** | AWS S3 | 모든 중간 산출물 저장 |
| **AI (스크립트)** | Google Gemini 2.5 Flash | 무료 티어 사용([ADR 005](../adr/005-gemini-flash.md)) |
| **TTS** | Edge-TTS `ko-KR-SunHiNeural` | Phase 8~: Clova Voice([ADR 002](../adr/002-tts-engine.md)) |
| **자막** | 글자 비례 SRT 생성 | `ffprobe` 오디오 길이 측정 → `script` 필드 글자 수 비례 타임스탬프 |
| **이미지** | Pexels API | scenes[].keyword 기반 배경 이미지 다운로드 |
| **렌더링** | FFmpeg (zoompan 효과, Phase 1~5) → Remotion (Phase 6~) | [ADR 004](../adr/004-render-engine.md) |
| **뉴스 수집** | Google News RSS | `POST /jobs/auto-news` 엔드포인트 |
| **IaC** | Terraform + Serverless Framework | [ADR 006](../adr/006-iac-terraform-serverless.md) |
| **모니터링** | CloudWatch, Sentry (Phase 7) | |
| **스케줄러** | EventBridge Scheduler | 채널별 일일 Job 자동 생성 |

---

## Monorepo 패키지 구조

```
youtube-shorts-automation/        ← Turborepo 루트
├── apps/
│   ├── api/                      ← NestJS v11 + Fastify (Lambda + API Gateway)
│   ├── web/                      ← Next.js 15 App Router 대시보드
│   └── workers/
│       ├── script/               ← Gemini 2.5 Flash → script.json (Lambda)
│       ├── tts/                  ← Edge-TTS → audio.mp3 (Lambda)
│       ├── subtitle/             ← VTT 기반 SRT → subtitle.srt (Lambda)
│       ├── render/               ← Pexels + FFmpeg → output.mp4 (Lambda Container Image)
│       └── upload/               ← YouTube Data API (Lambda)
├── packages/
│   └── shared/                   ← Prisma 스키마, S3 클라이언트, logger, 공유 타입
├── infra/                        ← Terraform (S3, SQS, IAM, EventBridge, ECR)
├── scripts/                      ← 로컬 검증 스크립트 (Phase 0)
├── docker-compose.yml            ← 로컬 개발용 (PostgreSQL, LocalStack)
├── turbo.json                    ← Turborepo 파이프라인 설정
└── pnpm-workspace.yaml
```

### packages/shared 주요 모듈

```
packages/shared/
├── prisma/
│   └── schema.prisma             ← Channel, Job, ChannelAnalytics, User 스키마
│                                   (Job.privacyStatus, ChannelAnalytics.watchTimeMinutes 포함)
└── src/
    ├── index.ts                  ← 전체 공통 모듈 re-export 진입점
    ├── env.ts                    ← Zod BaseEnvSchema (DATABASE_URL, AWS_REGION, S3_BUCKET_NAME)
    ├── prisma.ts                 ← Prisma 싱글턴 (Lambda 재사용)
    ├── s3.ts                     ← S3 put/get 헬퍼
    └── logger.ts                 ← Pino 인스턴스 팩토리
```

---

## API 엔드포인트 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/jobs` | Job 생성 후 script-queue 발행 |
| `GET` | `/jobs` | Job 목록 (channelId 필터) |
| `GET` | `/jobs/:id` | Job 상세 조회 |
| `GET` | `/jobs/:id/thumbnail` | S3 썸네일 이미지 프록시 서빙 (`@Public()`) |
| `POST` | `/jobs/auto-news` | Google News RSS 수집 → Job 일괄 생성 |
| `POST` | `/jobs/:id/retry` | FAILED Job 재시도 |
| `GET` | `/channels` | 활성 채널 목록 |
| `GET` | `/channels/:id` | 채널 상세 + YPP 통계 |
| `PATCH` | `/channels/:id/schedule` | 업로드 cron 스케줄·`schedulerEnabled`·`schedulerCategory` 변경 |
| `DELETE` | `/channels/:id` | 채널 연결 해제 (isActive=false, 데이터 보존) |
| `GET` | `/channels/:id/analytics` | 최근 30일 일별 analytics |
| `POST` | `/channels/:id/sync` | 채널 통계 + Analytics + 영상 조회수 풀 동기화 |
| `POST` | `/channels/:id/sync-videos` | 영상 조회수·privacyStatus 동기화 + 삭제 영상 처리 |
| `GET` | `/auth/youtube` | YouTube OAuth 인증 URL 리다이렉트 |
| `GET` | `/auth/youtube/callback` | OAuth 코드 교환 + 채널 upsert |

> **자동 스케줄러**: P5-1에서 EventBridge Scheduler로 구현 예정.
> 채널 `uploadSchedule` cron 기준으로 일일 Job을 자동 생성하고, `auto-news`로 뉴스 토픽을 선택한다.

---

## 외부 서비스 의존성

| 서비스 | 용도 | 제한 / 비용 |
|---|---|---|
| **Google Gemini API** | 뉴스·시사 쇼츠 스크립트 생성 | 무료 티어 사용 (gemini-2.5-flash) |
| **YouTube Data API v3** | 영상 업로드, 채널/영상 통계 조회 | 무료 10,000 quota/day |
| **YouTube Analytics API** | 일별 views, subscribersGained, estimatedMinutesWatched | youtube.readonly + yt-analytics.readonly |
| **Google News RSS** | 뉴스 제목 자동 수집 (auto-news) | 무료 |
| **Pexels API** | scene keyword 기반 배경 이미지 | 무료 플랜 |
| **Edge-TTS** | 한국어 TTS | 무료 (Microsoft Edge 서버 사용) |
| **Supabase** | PostgreSQL 호스팅 + pgBouncer | 무료 플랜 (Phase 3 이후 RDS 이전 고려) |
| **AWS S3** | 중간 산출물 저장 | ~$0.023/GB/월 |
| **AWS SQS** | Worker 간 비동기 메시지 큐 | 무료 티어 100만 요청/월 |
| **AWS Lambda** | 모든 Worker(script/tts/subtitle/render/upload) + api 실행 | 무료 티어 100만 호출/월 |
| **AWS EventBridge** | 채널별 일일 스케줄 | 무료 |
| **AWS Secrets Manager** | 암호화 키, API 시크릿 관리 | ~$0.40/시크릿/월 |

---

## 비용 목표 및 예상 비용

**목표**: 채널 3개, 영상 90개/월 기준 **$10 이하**

| 항목 | 예상 비용 |
|---|---|
| Google Gemini API (무료 티어) | $0 |
| Edge-TTS | $0 |
| Pexels API (무료 플랜) | $0 |
| Google News RSS | $0 |
| Supabase (무료 플랜) | $0 |
| AWS Lambda, SQS (무료 티어) | ~$0 |
| AWS S3 (~9GB) | ~$0.21 |
| AWS CloudWatch | ~$1 |
| **합계** | **~$1.5** |

---

## 추가 기술 항목

아래 항목은 위 표에서 별도로 기재되지 않은 스택입니다.

| 분류 | 기술 | 비고 |
|---|---|---|
| **런타임** | Node.js 20, TypeScript 5.x strict | `any` 사용 금지, ESM |
| **패키지 관리** | pnpm workspace, Turborepo | |
| **인증** | NextAuth v5 (Google OAuth, JWT) | signIn 콜백 + Prisma User 테이블 이메일 제한 |
| **로컬 개발** | Docker Compose, LocalStack v3 | |
| **에러 추적** | Sentry | Phase 7 |

---

## 관련 ADR

| ADR | 주제 |
|---|---|
| [ADR 001](../adr/001-lambda-vs-fargate.md) | Lambda vs ECS Fargate 분리 기준 |
| [ADR 002](../adr/002-tts-engine.md) | TTS 엔진 선택 (Edge-TTS) |
| [ADR 003](../adr/003-sqs-standard-queue.md) | SQS Standard Queue 사용 이유 |
| [ADR 004](../adr/004-render-engine.md) | 렌더링 엔진 (FFmpeg → Remotion) |
| [ADR 005](../adr/005-gemini-flash.md) | AI 모델 선택 (Gemini 2.5 Flash) |
| [ADR 006](../adr/006-iac-terraform-serverless.md) | IaC 전략 |
| [ADR 007](../adr/007-database-strategy.md) | DB 전략 (Supabase + pgBouncer) |
| [ADR 009](../adr/009-fargate-sqs-long-polling.md) | Fargate SQS Long Polling (Superseded — 전체 Lambda 전환) |
