# YouTube Shorts Automation

토픽 입력 하나로 스크립트 생성 → TTS → 자막 → 영상 합성 → YouTube 업로드까지 전 과정을 자동화하는 서버리스 파이프라인.

뉴스·시사 쇼츠 채널 특화: Google News RSS에서 자동 수집한 뉴스 제목을 토픽으로 활용하고, 시사 키워드 하이라이트 자막과 Pexels 이미지 기반 영상을 생성한다.

---

## 사전 요구사항

| 도구 | 버전 | 용도 |
|---|---|---|
| Node.js | 20+ | 런타임 |
| pnpm | 9+ | 패키지 매니저 |
| Docker & Docker Compose | 최신 | 로컬 통합 환경 — LocalStack·PostgreSQL·전체 Worker 포함 |
| FFmpeg | 최신 | 렌더링 (`ffmpeg`, `ffprobe` PATH 등록) |
| AWS CLI | v2 | AWS 이관 (Phase 3~) |
| Terraform | 1.6+ | 인프라 프로비저닝 (Phase 3~) |

> **Phase 1 (로컬 파이프라인)**부터는 Docker & Docker Compose만 있으면 LocalStack · PostgreSQL이 자동으로 실행됩니다.  
> Python 및 faster-whisper는 더 이상 필요하지 않습니다. 자막은 스크립트 텍스트 기반으로 생성됩니다.

---

## 빠른 시작

### Phase 1 — 로컬 통합 환경 (Docker Compose + LocalStack)

AWS 자격증명·과금 없이 전체 파이프라인을 로컬에서 실행한다.

```bash
# 전체 스택 기동
# LocalStack(SQS 10개, S3), PostgreSQL, API, 전체 Worker 포함
docker-compose up

# 파이프라인 실행
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"channelId": "<id>", "topic": "한국 경제 전망"}'

# 뉴스 자동 수집 + Job 일괄 생성 (최대 5개)
curl -X POST http://localhost:3000/jobs/auto-news \
  -H "Content-Type: application/json" \
  -d '{"channelId": "<id>", "category": "top", "count": 3}'

# DB에서 PENDING → COMPLETED 전이 확인
# LocalStack S3에서 jobs/{jobId}/output.mp4 생성 확인
```

### Phase 2 — 웹 대시보드 (로컬 개발)

docker-compose 로컬 API를 대상으로 대시보드를 개발·검증한다.

```bash
# 웹 개발 서버 시작 (docker-compose up이 실행 중이어야 함)
pnpm --filter web dev

# http://localhost:3001 에서 대시보드 확인
# - Google OAuth 로그인
# - /dashboard — Job 카드 피드 (2초 폴링), 조회수 실시간 표시
# - /dashboard/[id] — 상태 타임라인 + 재시도
# - /channels/[id] — 채널 관리 + YPP 진행률
```

### Phase 3 — AWS 서버리스 이관

```bash
# 인프라 프로비저닝 (S3, SQS, IAM, ECS, ECR)
cd infra && terraform init && terraform apply

# Lambda 배포 (script / tts / upload worker)
pnpm --filter @shorts/script-worker deploy:prod
pnpm --filter @shorts/tts-worker deploy:prod
pnpm --filter @shorts/upload-worker deploy:prod

# Fargate 배포 (subtitle / render worker)
docker build -f apps/workers/subtitle/Dockerfile -t subtitle-worker .
docker build -f apps/workers/render/Dockerfile -t render-worker .
# ECR 푸시 후 ECS Service 업데이트

# API Gateway + Lambda 배포
pnpm --filter @shorts/api deploy:prod
```

---

## 파이프라인

```
POST /jobs  또는  POST /jobs/auto-news
  → SQS script-queue  → script-worker  (Gemini 2.5 Flash → jobs/{jobId}/script.json)
  → SQS tts-queue     → tts-worker     (Edge-TTS          → jobs/{jobId}/audio.mp3)
  → SQS subtitle-queue→ subtitle-worker(스크립트 기반 SRT  → jobs/{jobId}/subtitle.srt)
  → SQS render-queue  → render-worker  (Pexels + FFmpeg   → jobs/{jobId}/output.mp4)
  → SQS upload-queue  → upload-worker  (YouTube API       → COMPLETED)
```

**Job 상태 전이**

```
PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING
       → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED
```

**S3 키 규칙**

```
jobs/{jobId}/script.json    스크립트 (title, hook, script, scenes, hashtags, thumbnail_text, comment_bait)
jobs/{jobId}/audio.mp3      TTS 오디오 (25~35초)
jobs/{jobId}/subtitle.srt   한국어 자막 (시사 키워드 하이라이트 포함)
jobs/{jobId}/output.mp4     최종 영상 (1080×1920)
```

---

## 프로젝트 구조

```
youtube-shorts-automation/
├── .claude/
│   ├── agents/                       # 전문화된 Claude AI 에이전트 설정
│   │   ├── ai-agent.md               # AI/ML 태스크 담당 (Gemini·Remotion)
│   │   ├── be-agent.md               # 백엔드 담당 (NestJS·Prisma·SQS)
│   │   ├── devops-agent.md           # 인프라 담당 (Terraform·ECS·GitHub Actions)
│   │   └── fe-agent.md               # 프론트엔드 담당 (Next.js·shadcn/ui)
│   └── settings.json                 # Claude Code 프로젝트 설정 (허용 명령·훅)
├── .env.example                      # 환경변수 템플릿 (루트 서비스용)
├── .env.local                        # 공통 환경변수 (gitignore)
├── .mcp.json                         # MCP(Model Context Protocol) 서버 설정
├── docker-compose.yml                # 로컬 통합 환경 (LocalStack + PostgreSQL + Workers)
├── package.json                      # 루트 패키지 (공통 스크립트·devDependencies)
├── pnpm-workspace.yaml               # pnpm 워크스페이스 패키지 경로 선언
├── shrimp-rules.md                   # Shrimp Task Manager 태스크 분류 규칙
├── tsconfig.base.json                # 전체 패키지 공통 TypeScript 컴파일 옵션
├── turbo.json                        # Turborepo 빌드 파이프라인 정의
├── apps/
│   ├── api/                          # NestJS v11 (Fastify) — REST API
│   │   └── src/
│   │       ├── auth/
│   │       │   ├── auth.controller.ts  # Google OAuth 채널 연결 엔드포인트
│   │       │   └── auth.service.ts     # OAuth 토큰 교환 + DB 저장 (yt-analytics.readonly 스코프 포함)
│   │       ├── channels/
│   │       │   ├── channels.controller.ts  # GET /channels, GET /channels/:id/analytics, POST /channels/:id/sync, POST /channels/:id/sync-videos
│   │       │   └── channels.service.ts     # YouTube Data API + Analytics API 동기화
│   │       └── jobs/
│   │           ├── jobs.controller.ts  # POST /jobs, GET /jobs, POST /jobs/auto-news, POST /jobs/:id/retry
│   │           ├── jobs.service.ts     # Job 생성 → SQS 발행, 뉴스 RSS 수집
│   │           └── news-fetcher.ts     # Google News RSS 수집 (카테고리별, 한국어/KR)
│   ├── web/                          # Next.js 15 (App Router) — 대시보드
│   │   └── src/
│   │       ├── app/
│   │       │   └── (dashboard)/
│   │       │       ├── HomeClient.tsx       # 채널·Job 카드 피드 (2초 폴링, 조회수 실시간 표시)
│   │       │       └── channels/[id]/
│   │       │           └── ChannelClient.tsx  # YPP 진행률 + cron 스케줄 편집
│   │       └── lib/
│   │           └── api.ts            # API 클라이언트 (채널 sync 포함)
│   └── workers/
│       ├── script/                   # SQS → Gemini 2.5 Flash → script.json
│       │   └── src/
│       │       └── script-generator.ts  # ScriptOutput(7필드): title,hook,script,scenes[],hashtags,thumbnail_text,comment_bait
│       ├── tts/                      # SQS → Edge-TTS → audio.mp3
│       ├── subtitle/                 # ECS Fargate: 스크립트 기반 SRT 생성 (faster-whisper 제거됨)
│       │   └── src/
│       │       └── processor.ts      # ffprobe 길이 측정 → script.json 기반 SRT 생성 → 시사 키워드 하이라이트
│       ├── render/                   # ECS Fargate: Pexels 이미지 + zoompan + FFmpeg → output.mp4
│       │   └── src/
│       │       ├── processor.ts      # scenes 배열 기반 이미지 다운로드 + 클립 생성
│       │       ├── renderer.ts       # zoompan 효과 (zoom-in/out, pan-left/right), FontSize=46 자막
│       │       └── image-generator.ts  # Pexels API 이미지 검색·다운로드
│       └── upload/                   # SQS → YouTube Data API → COMPLETED
│           └── src/
│               └── uploader.ts       # AI 공시 문구, categoryId=25(뉴스), containsSyntheticMedia: true
├── packages/
│   └── shared/                       # 전 앱 공통 — Prisma, 로거, S3, 환경변수
│       └── prisma/
│           └── schema.prisma         # Channel·Job·ChannelAnalytics 모델 (privacyStatus, watchTimeMinutes 포함)
├── infra/
│   ├── localstack/init/init-aws.sh   # LocalStack: SQS 5큐+DLQ·S3 초기화
│   └── terraform/                   # Terraform 모듈 (ECR, ECS, SQS)
├── docs/
│   ├── README.md                     # 문서 허브
│   ├── prd.md                        # 제품 요구사항 문서
│   ├── roadmap.md                    # Phase별 구현 계획 및 검증 체크리스트
│   ├── adr/                          # 아키텍처 결정 기록 (001~009)
│   ├── architecture/                 # 시스템 아키텍처 문서
│   ├── backend/                      # 백엔드 개발 컨벤션·보안
│   ├── onboarding/                   # 로컬 환경 세팅·API 키·환경변수 가이드
│   └── operations/                   # 배포·모니터링·운영 가이드
└── scripts/
    ├── dev/seed.ts                   # DB 시드 데이터
    └── tools/                        # Phase 0 단독 검증 스크립트
        ├── test-tts.ts               # Edge-TTS 음성 합성 품질 검증
        ├── test-render.ts            # FFmpeg 렌더링 품질 검증
        └── test-upload.ts            # YouTube Data API 업로드 검증
```

---

## 개발 명령어

```bash
# 전체
pnpm install          # 의존성 설치
pnpm build            # 전체 패키지 빌드 (Turborepo)
pnpm lint             # 전체 ESLint 검사
pnpm test             # 전체 테스트

# 개별 패키지 개발 서버
pnpm --filter @shorts/api dev
pnpm --filter @shorts/web dev

# Prisma (packages/shared 기준)
pnpm --filter @shorts/shared prisma:generate   # Prisma Client 재생성
pnpm --filter @shorts/shared prisma migrate dev  # 개발 마이그레이션 생성
pnpm --filter @shorts/shared prisma:migrate    # 프로덕션 마이그레이션 적용
pnpm --filter @shorts/shared prisma studio     # DB GUI

# Docker Compose (로컬 통합 환경)
docker-compose up             # 전체 스택 기동
docker-compose up localstack  # LocalStack만 기동
docker-compose down -v        # 스택 종료 + 볼륨 삭제
```

---

## 기술 스택

| 영역 | 기술 | 비고 |
|---|---|---|
| 런타임 | Node.js 20, TypeScript 5.x strict | `any` 사용 금지, ESM |
| 패키지 관리 | pnpm workspace, Turborepo | |
| API | NestJS v11, Fastify Adapter | 3계층 구조 |
| 프론트엔드 | Next.js 15 App Router | 서버 컴포넌트 기본 |
| UI | TailwindCSS, shadcn/ui | |
| 서버 상태 | TanStack Query v5 | 2초 폴링 |
| 클라이언트 상태 | Zustand v4 | |
| 인증 | NextAuth (Google OAuth, JWT) | |
| DB | PostgreSQL 14, Prisma v5 | 로컬: Docker Compose / 프로덕션: Supabase → RDS |
| 큐 | AWS SQS Standard Queue + DLQ | 5큐 + DLQ 5개 |
| AI | Google Gemini API `gemini-2.5-flash` | 뉴스·시사 쇼츠 스크립트 생성 |
| TTS | Edge-TTS `ko-KR-SunHiNeural` | → Phase 7: Clova Voice |
| 자막 | 스크립트 기반 SRT 생성 | ffprobe 길이 측정 + 시사 키워드 하이라이트 (faster-whisper 제거) |
| 이미지 | Pexels API | scenes[].keyword 기반 배경 이미지 |
| 렌더링 | FFmpeg (zoompan 효과) | → Phase 5: Remotion |
| 스케줄링 | EventBridge Scheduler | 채널별 cron |
| 뉴스 수집 | Google News RSS | `POST /jobs/auto-news` |
| 인프라 | Lambda, ECS Fargate, S3 | Terraform |
| 로컬 개발 | Docker Compose, LocalStack v3 | |
| 로깅 | Pino | jobId·channelId 컨텍스트 필수 |
| 에러 추적 | Sentry | Phase 7 |

---

## 문서 목록

| 문서 | 설명 |
|---|---|
| [문서 허브](docs/README.md) | 전체 문서 진입점 및 링크 모음 |
| [ROADMAP](docs/roadmap.md) | Phase별 구현 계획 및 검증 기준 (체크리스트 포함) |
| [PRD](docs/prd.md) | 제품 요구사항 — 기능 범위, 데이터 모델, API 명세 |
| [ADR](docs/adr/README.md) | 아키텍처 결정 기록 (001~009) |
| [아키텍처 개요](docs/architecture/overview.md) | 시스템 다이어그램·기술 스택·외부 의존성 |
| [파이프라인 흐름](docs/architecture/pipeline-flow.md) | 5단계 파이프라인·상태 전이·실패 처리 |
| [데이터 모델](docs/architecture/data-model.md) | Prisma 스키마·ER 다이어그램 |
| [비즈니스 규칙](docs/product/business-rules.md) | 핵심 도메인 규칙 |
| [용어 사전](docs/product/terminology.md) | 프로젝트 도메인 용어 정의 |

**온보딩 가이드**

| 가이드 | 설명 |
|---|---|
| [로컬 환경 세팅](docs/onboarding/local-setup.md) | docker-compose 로컬 환경 전체 구성 |
| [API 키 발급](docs/onboarding/api-keys.md) | Gemini·YouTube OAuth·NextAuth·ENCRYPTION_KEY·Pexels 통합 가이드 |
| [환경변수 레퍼런스](docs/onboarding/env-vars.md) | `.env.local` / `apps/web/.env.local` 전체 변수 목록 |

**백엔드 개발**

| 문서 | 설명 |
|---|---|
| [개발 컨벤션](docs/backend/conventions.md) | NestJS 3계층·TypeScript·로깅·Worker 설계 원칙 |
| [암호화 규격](docs/backend/security/encryption.md) | AES-256-GCM·DB 저장 포맷·키 관리 |

**운영**

| 문서 | 설명 |
|---|---|
| [배포 절차](docs/operations/runbook/deploy.md) | 로컬~AWS 배포 단계별 절차 |
| [모니터링](docs/operations/monitoring.md) | CloudWatch·DLQ·Sentry·Budget Alert |
| [Gemini 할당량 오류](docs/operations/runbook/gemini-quota.md) | 429 오류 원인 및 해결책 |

**ADR 목록** — 전체 인덱스: [docs/adr/README.md](docs/adr/README.md)

| 번호 | 결정 |
|---|---|
| [001](docs/adr/001-lambda-vs-fargate.md) | Lambda vs ECS Fargate 배포 환경 분리 기준 |
| [002](docs/adr/002-tts-engine.md) | Edge-TTS 선택 및 Phase 7 Clova Voice 전환 계획 |
| [003](docs/adr/003-sqs-standard-queue.md) | SQS Standard Queue 선택 (FIFO 아님) |
| [004](docs/adr/004-render-engine.md) | FFmpeg → Phase 5 Remotion 전환 계획 |
| [005](docs/adr/005-gemini-flash.md) | Gemini 2.5 Flash 모델 고정 |
| [006](docs/adr/006-iac-terraform-serverless.md) | Terraform + Serverless Framework 역할 분리 |
| [007](docs/adr/007-database-strategy.md) | Supabase → RDS 전략, DIRECT_URL 분리 이유 |
| [009](docs/adr/009-fargate-sqs-long-polling.md) | Fargate SQS Long Polling 자체 구현 이유 |
