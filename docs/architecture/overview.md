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
│         Next.js 15 대시보드 (Vercel / AWS Amplify)            │
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
       ├─── script-worker (Lambda)   ──→ Gemini API  ──→ S3 script.json
       ├─── tts-worker    (Lambda)   ──→ Edge-TTS    ──→ S3 audio.mp3
       ├─── subtitle-worker (Fargate)──→ Whisper     ──→ S3 subtitle.srt
       ├─── render-worker  (Fargate) ──→ FFmpeg      ──→ S3 output.mp4
       └─── upload-worker  (Lambda)  ──→ YouTube API ──→ 업로드 완료

┌────────────────────────────────────────────────────────────┐
│                      AWS 공통 인프라                         │
│  S3 (산출물 저장)  CloudWatch (로그/알람)  ECR (컨테이너 이미지) │
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
| **script-worker** | `apps/workers/script` | 토픽, 채널 niche | Gemini 2.0 Flash API 호출 | `script.json` → S3 |
| **tts-worker** | `apps/workers/tts` | `script.json` | Edge-TTS `ko-KR-SunHiNeural` | `audio.mp3` → S3 |
| **upload-worker** | `apps/workers/upload` | `output.mp4` | YouTube Data API v3 업로드 | 업로드 완료, `youtubeVideoId` 저장 |

### Fargate Workers

Fargate는 대용량 모델 파일(~1.5GB)이나 CPU 집약적인 장시간 처리가 필요한 작업에 사용합니다. ECS Service로 상시 실행하여 Cold Start를 방지하고, 자체 SQS Long Polling 루프로 메시지를 수신합니다([ADR 009](../adr/009-fargate-sqs-long-polling.md)).

| Worker | 위치 | 입력 | 처리 | 출력 |
|---|---|---|---|---|
| **subtitle-worker** | `apps/workers/subtitle` | `audio.mp3` | faster-whisper large-v3 (메모리 ~3GB) | `subtitle.srt` → S3 |
| **render-worker** | `apps/workers/render` | `audio.mp3`, `subtitle.srt` | FFmpeg 합성, 1080×1920 Shorts 포맷 | `output.mp4` → S3 |

> Phase 5부터 render-worker는 FFmpeg에서 Remotion으로 전환됩니다([ADR 004](../adr/004-render-engine.md)).

---

## 기술 스택

| 분류 | 기술 | 비고 |
|---|---|---|
| **Frontend** | Next.js 15 (App Router), React 19 | Vercel 또는 AWS Amplify 배포 |
| **UI** | TailwindCSS, shadcn/ui | |
| **상태관리** | TanStack Query v5, Zustand v4 | 서버 상태 / 클라이언트 상태 분리 |
| **Backend** | NestJS v11, Fastify Adapter | Lambda 함수로 패키징 |
| **언어** | TypeScript 5.x strict mode | `any` 사용 금지 |
| **유효성 검사** | Zod | 환경변수, API 요청 검증 |
| **로깅** | Pino | 구조적 로깅, `jobId`/`channelId` 컨텍스트 포함 |
| **ORM** | Prisma v5 | Lambda 싱글턴 패턴 |
| **DB** | PostgreSQL (Supabase → RDS) | pgBouncer로 연결 관리([ADR 007](../adr/007-database-strategy.md)) |
| **Queue** | AWS SQS Standard Queue + DLQ | FIFO 불사용([ADR 003](../adr/003-sqs-standard-queue.md)) |
| **스토리지** | AWS S3 | 모든 중간 산출물 저장 |
| **AI (스크립트)** | Google Gemini 2.0 Flash | 무료 1,500 req/day([ADR 005](../adr/005-gemini-flash.md)) |
| **TTS** | Edge-TTS `ko-KR-SunHiNeural` | Phase 7~: Clova Voice([ADR 002](../adr/002-tts-engine.md)) |
| **STT** | faster-whisper large-v3 | 한국어 93%([ADR 008](../adr/008-whisper-model.md)) |
| **렌더링** | FFmpeg (Phase 1~4) → Remotion (Phase 5~) | [ADR 004](../adr/004-render-engine.md) |
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
│       ├── script/               ← Gemini API → script.json (Lambda)
│       ├── tts/                  ← Edge-TTS → audio.mp3 (Lambda)
│       ├── subtitle/             ← faster-whisper → subtitle.srt (ECS Fargate)
│       ├── render/               ← FFmpeg → output.mp4 (ECS Fargate)
│       └── upload/               ← YouTube Data API (Lambda)
├── packages/
│   └── shared/                   ← Prisma 스키마, S3 클라이언트, logger, 공유 타입
├── infra/                        ← Terraform (VPC, Fargate, RDS, S3, SQS)
├── scripts/                      ← 로컬 검증 스크립트 (Phase 0)
├── docker-compose.yml            ← 로컬 개발용 (PostgreSQL, LocalStack)
├── turbo.json                    ← Turborepo 파이프라인 설정
└── pnpm-workspace.yaml
```

### packages/shared 주요 모듈

```
packages/shared/
├── prisma/
│   └── schema.prisma             ← Channel, Job, ChannelAnalytics 스키마
├── src/
│   ├── index.ts                  ← 전체 공통 모듈 re-export 진입점
│   ├── env.ts                    ← Zod BaseEnvSchema (DATABASE_URL, AWS_REGION, S3_BUCKET_NAME)
│   ├── prisma.ts                 ← Prisma 싱글턴 (Lambda 재사용)
│   ├── s3.ts                     ← S3 put/get 헬퍼
│   ├── logger.ts                 ← Pino 인스턴스 팩토리
│   └── types.ts                  ← SQS 메시지 타입, 공유 인터페이스
```

---

## 외부 서비스 의존성

| 서비스 | 용도 | 제한 / 비용 |
|---|---|---|
| **Google Gemini API** | 쇼츠 스크립트 생성 | 무료 1,500 req/day (gemini-2.0-flash) |
| **YouTube Data API v3** | 영상 업로드, Analytics 수집 | 무료 10,000 quota/day |
| **Edge-TTS** | 한국어 TTS | 무료 (Microsoft Edge 서버 사용) |
| **Supabase** | PostgreSQL 호스팅 + pgBouncer | 무료 플랜 (Phase 3 이후 RDS 이전 고려) |
| **AWS S3** | 중간 산출물 저장 | ~$0.023/GB/월 |
| **AWS SQS** | Worker 간 비동기 메시지 큐 | 무료 티어 100만 요청/월 |
| **AWS Lambda** | script/tts/upload/api 실행 | 무료 티어 100만 호출/월 |
| **AWS ECS Fargate** | subtitle/render 실행 | ~$6/월 (채널 3개 기준) |
| **AWS EventBridge** | 채널별 일일 스케줄 | 무료 |
| **AWS Secrets Manager** | 암호화 키, API 시크릿 관리 | ~$0.40/시크릿/월 |

---

## 비용 목표 및 예상 비용

**목표**: 채널 3개, 영상 90개/월 기준 **$10 이하**

| 항목 | 예상 비용 |
|---|---|
| Google Gemini API (gemini-2.0-flash, 무료 티어) | $0 |
| Edge-TTS | $0 |
| Supabase (무료 플랜) | $0 |
| AWS Lambda, SQS (무료 티어) | ~$0 |
| AWS S3 (~9GB) | ~$0.21 |
| AWS ECS Fargate (렌더링) | ~$6 |
| AWS CloudWatch | ~$1 |
| **합계** | **~$7.5** |

---

## 관련 ADR

| ADR | 주제 |
|---|---|
| [ADR 001](../adr/001-lambda-vs-fargate.md) | Lambda vs ECS Fargate 분리 기준 |
| [ADR 002](../adr/002-tts-engine.md) | TTS 엔진 선택 (Edge-TTS) |
| [ADR 003](../adr/003-sqs-standard-queue.md) | SQS Standard Queue 사용 이유 |
| [ADR 004](../adr/004-render-engine.md) | 렌더링 엔진 (FFmpeg → Remotion) |
| [ADR 005](../adr/005-gemini-flash.md) | AI 모델 선택 (Gemini 2.0 Flash) |
| [ADR 006](../adr/006-iac-terraform-serverless.md) | IaC 전략 |
| [ADR 007](../adr/007-database-strategy.md) | DB 전략 (Supabase + pgBouncer) |
| [ADR 008](../adr/008-whisper-model.md) | STT 모델 (faster-whisper large-v3) |
| [ADR 009](../adr/009-fargate-sqs-long-polling.md) | Fargate SQS Long Polling 자체 구현 |
