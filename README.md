# YouTube Shorts Automation

토픽 입력 하나로 스크립트 생성 → TTS → 자막 → 영상 합성 → YouTube 업로드까지 전 과정을 자동화하는 서버리스 파이프라인.

---

## 사전 요구사항

| 도구 | 버전 | 용도 |
|---|---|---|
| Node.js | 20+ | 런타임 |
| pnpm | 9+ | 패키지 매니저 |
| Docker & Docker Compose | 최신 | 로컬 통합 환경 — LocalStack·PostgreSQL·전체 Worker 포함 (Phase 1) |
| Python | 3.11+ | Phase 0 단독 검증 스크립트 실행 환경 |
| edge-tts | 최신 | TTS 음성 합성 검증 (`pip install edge-tts`, Phase 0) |
| faster-whisper | 최신 | 자막 인식률 검증 (`pip install faster-whisper`, Phase 0) |
| FFmpeg | 최신 | 렌더링 품질 검증 (`ffmpeg`, `ffprobe` PATH 등록, Phase 0) |
| AWS CLI | v2 | AWS 이관 (Phase 3~) |
| Terraform | 1.6+ | 인프라 프로비저닝 (Phase 3~) |

> **Phase 0 검증만 목적이라면** AWS CLI · Terraform은 불필요합니다.  
> **Phase 1 (로컬 파이프라인)**부터는 Docker & Docker Compose만 있으면 LocalStack · PostgreSQL이 자동으로 실행됩니다.

---

## 빠른 시작

### Phase 0 — 핵심 기술 단독 검증

AWS 없이 로컬에서 각 기술의 품질을 먼저 확인한다.

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local에 YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN 입력

# TTS 음성 품질 검증 (목표: 45~55초 MP3, AI 억양 최소화)
pnpm test:tts

# Whisper 한국어 자막 인식률 검증 (목표: 인식률 90%↑, 타임스탬프 오차 ±0.3초↓)
pnpm tsx scripts/tools/test-whisper.ts

# FFmpeg 렌더링 품질 검증 (목표: 1080×1920, 자막 싱크 정상)
pnpm tsx scripts/tools/test-render.ts

# YouTube Data API 업로드 검증 (비공개 업로드 후 #Shorts 분류 확인)
pnpm test:upload
```

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
# - /dashboard — Job 카드 피드 (2초 폴링)
# - /dashboard — 토픽 입력 폼 + Job 카드 피드
# - /dashboard/[id] — 상태 타임라인 + 재시도
# - /channels/[id] — 채널 관리
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
POST /jobs
  → SQS script-queue  → script-worker  (Gemini 2.0 Flash → jobs/{jobId}/script.json)
  → SQS tts-queue     → tts-worker     (Edge-TTS      → jobs/{jobId}/audio.mp3)
  → SQS subtitle-queue→ subtitle-worker(Whisper        → jobs/{jobId}/subtitle.srt)
  → SQS render-queue  → render-worker  (FFmpeg/Remotion→ jobs/{jobId}/output.mp4)
  → SQS upload-queue  → upload-worker  (YouTube API   → COMPLETED)
```

**Job 상태 전이**

```
PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING
       → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED
```

**S3 키 규칙**

```
jobs/{jobId}/script.json    스크립트 (title, hook, script, hashtags 등 7개 필드)
jobs/{jobId}/audio.mp3      TTS 오디오 (45~55초)
jobs/{jobId}/subtitle.srt   한국어 자막
jobs/{jobId}/output.mp4     최종 영상 (1080×1920)
```

---

## 프로젝트 구조

```
youtube-shorts-automation/
├── .changeset/
│   └── config.json                   # Changesets 버전 관리 설정
├── .claude/
│   ├── agents/                       # 전문화된 Claude AI 에이전트 설정
│   │   ├── ai-agent.md               # AI/ML 태스크 담당 (Whisper·Gemini·Remotion)
│   │   ├── be-agent.md               # 백엔드 담당 (NestJS·Prisma·SQS)
│   │   ├── devops-agent.md           # 인프라 담당 (Terraform·ECS·GitHub Actions)
│   │   └── fe-agent.md               # 프론트엔드 담당 (Next.js·shadcn/ui)
│   └── settings.json                 # Claude Code 프로젝트 설정 (허용 명령·훅)
├── .env.example                      # 환경변수 템플릿 (루트 서비스용)
├── .env.local                        # 공통 환경변수 (gitignore)
├── .eslintrc.js                      # ESLint 규칙 설정
├── .mcp.json                         # MCP(Model Context Protocol) 서버 설정
├── docker-compose.yml                # 로컬 통합 환경 (LocalStack + PostgreSQL + Workers)
├── package.json                      # 루트 패키지 (공통 스크립트·devDependencies)
├── pnpm-workspace.yaml               # pnpm 워크스페이스 패키지 경로 선언
├── shrimp-rules.md                   # Shrimp Task Manager 태스크 분류 규칙
├── tsconfig.base.json                # 전체 패키지 공통 TypeScript 컴파일 옵션
├── tsconfig.json                     # 루트 레벨 TypeScript 설정 (scripts/ 대상)
├── turbo.json                        # Turborepo 빌드 파이프라인 정의
├── apps/
│   ├── api/                          # NestJS v11 (Fastify) — REST API
│   │   ├── Dockerfile                # 멀티스테이지 컨테이너 빌드
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app.module.ts         # 루트 NestJS 모듈 (전체 모듈 조합)
│   │       ├── main.ts               # Fastify 어댑터 부트스트랩 (포트 3000)
│   │       ├── auth/
│   │       │   ├── auth.controller.ts  # Google OAuth 채널 연결 엔드포인트
│   │       │   ├── auth.module.ts
│   │       │   ├── auth.service.ts     # OAuth 토큰 교환 + DB 저장
│   │       │   └── crypto.ts           # AES-256-GCM 암복호화 (OAuth 자격증명 보호)
│   │       ├── channels/
│   │       │   ├── channels.controller.ts  # 채널 CRUD REST 엔드포인트
│   │       │   ├── channels.module.ts
│   │       │   ├── channels.repository.ts  # Prisma 채널 쿼리
│   │       │   ├── channels.service.ts     # 채널 비즈니스 로직
│   │       │   └── dto/
│   │       │       └── update-schedule.dto.ts  # 채널 cron 스케줄 업데이트 Zod DTO
│   │       └── jobs/
│   │           ├── jobs.controller.ts  # Job CRUD + 재시도 REST 엔드포인트
│   │           ├── jobs.errors.ts      # Job 도메인 에러 클래스 (NotFound·NotRetryable)
│   │           ├── jobs.module.ts
│   │           ├── jobs.repository.ts  # Prisma Job 쿼리
│   │           ├── jobs.service.ts     # Job 생성 → SQS 발행 비즈니스 로직
│   │           └── dto/
│   │               └── create-job.dto.ts  # Job 생성 요청 Zod DTO
│   ├── web/                          # Next.js 15 (App Router) — 대시보드
│   │   ├── Dockerfile                # standalone 출력 컨테이너 빌드
│   │   ├── .env.example              # 웹 환경변수 템플릿
│   │   ├── .env.local                # 웹 전용 환경변수 (gitignore)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── auth.ts               # NextAuth 설정 (Google OAuth + JWT 세션)
│   │       ├── middleware.ts         # 미인증 접근 차단 미들웨어
│   │       ├── app/
│   │       │   ├── layout.tsx        # 루트 레이아웃 (폰트·Provider 주입)
│   │       │   ├── page.tsx          # 루트 진입점 → /dashboard 리다이렉트
│   │       │   ├── globals.css       # TailwindCSS 글로벌 스타일
│   │       │   ├── providers.tsx     # TanStack Query QueryClientProvider 래퍼
│   │       │   ├── api/
│   │       │   │   └── auth/
│   │       │   │       └── [...nextauth]/
│   │       │   │           └── route.ts   # NextAuth API 라우트 핸들러
│   │       │   ├── (auth)/
│   │       │   │   ├── login/
│   │       │   │   │   └── page.tsx  # Google OAuth 로그인 페이지
│   │       │   │   ├── close/
│   │       │   │   │   └── page.tsx  # OAuth 팝업 창 닫기 처리
│   │       │   │   └── popup/
│   │       │   │       └── page.tsx  # YouTube OAuth 팝업 창
│   │       │   └── (dashboard)/
│   │       │       ├── layout.tsx           # 대시보드 레이아웃 (Sidebar/BottomNav)
│   │       │       ├── page.tsx             # 대시보드 루트 → 채널 목록
│   │       │       ├── HomeClient.tsx       # 채널·Job 카드 피드 (2초 폴링) 클라이언트
│   │       │       ├── dashboard/
│   │       │       │   └── [id]/
│   │       │       │       └── page.tsx    # Job 상태 타임라인 + 재시도
│   │       │       └── channels/
│   │       │           └── [id]/
│   │       │               ├── page.tsx           # 채널 상세 서버 컴포넌트
│   │       │               └── ChannelClient.tsx  # cron 스케줄 편집 클라이언트
│   │       ├── components/
│   │       │   ├── VideoCard.tsx       # Job 상태 카드 (상태별 색상·타임스탬프)
│   │       │   ├── StatusTimeline.tsx  # PENDING → COMPLETED 단계 진행 표시
│   │       │   ├── Sidebar.tsx         # 데스크톱 사이드 네비게이션
│   │       │   ├── BottomNav.tsx       # 모바일 하단 네비게이션
│   │       │   └── ui/                 # shadcn/ui 기반 공통 컴포넌트
│   │       │       ├── badge.tsx
│   │       │       ├── button.tsx
│   │       │       ├── card.tsx
│   │       │       ├── input.tsx
│   │       │       ├── label.tsx
│   │       │       └── tabs.tsx
│   │       └── lib/
│   │           ├── api.ts            # API 클라이언트 (fetch 래퍼·엔드포인트 함수)
│   │           ├── store.ts          # Zustand 스토어 (선택된 채널 ID 전역 상태)
│   │           ├── types.ts          # 프론트엔드 공유 타입 정의
│   │           └── utils.ts          # cn() 유틸 (tailwind-merge + clsx)
│   └── workers/
│       ├── script/                   # SQS → Gemini 2.0 Flash → script.json
│       │   ├── Dockerfile
│       │   └── src/
│       │       ├── env.ts            # Zod 환경변수 검증 (GEMINI_API_KEY 등)
│       │       ├── handler.ts        # SQS 이벤트 핸들러 (Lambda 진입점)
│       │       ├── script-generator.ts  # Gemini API 호출 → 스크립트 생성 → S3 업로드 → tts-queue 발행
│       │       └── local-runner.ts   # Docker Compose 환경용 SQS Long Polling 루프
│       ├── tts/                      # SQS → Edge-TTS → audio.mp3
│       │   ├── Dockerfile
│       │   └── src/
│       │       ├── env.ts            # Zod 환경변수 검증 (EDGE_TTS_PATH 등)
│       │       ├── handler.ts        # SQS 이벤트 핸들러 (Lambda 진입점)
│       │       ├── TTSAdapter.ts     # TTS 인터페이스 (Phase 7 Clova Voice 교체 대비)
│       │       ├── EdgeTTSAdapter.ts # Edge-TTS ko-KR-SunHiNeural 구현체
│       │       └── local-runner.ts   # Docker Compose 환경용 SQS Long Polling 루프
│       ├── subtitle/                 # ECS Fargate: faster-whisper → subtitle.srt
│       │   ├── Dockerfile            # faster-whisper large-v3 포함
│       │   └── src/
│       │       ├── env.ts            # Zod 환경변수 검증 (WHISPER_MODEL 등)
│       │       ├── index.ts          # SQS Long Polling 진입점
│       │       ├── processor.ts      # S3 오디오 다운로드 → Whisper 실행 → SRT 업로드 → render-queue 발행
│       │       └── transcriber.py    # faster-whisper CLI 래퍼 (JSON 타임스탬프 출력)
│       ├── render/                   # ECS Fargate: FFmpeg → output.mp4
│       │   ├── Dockerfile            # FFmpeg + NanumGothic 폰트 포함
│       │   └── src/
│       │       ├── env.ts            # Zod 환경변수 검증 (FFMPEG_PATH 등)
│       │       ├── index.ts          # SQS Long Polling 진입점
│       │       ├── processor.ts      # S3 오디오·SRT 다운로드 → FFmpeg 실행 → upload-queue 발행
│       │       ├── renderer.ts       # FFmpeg 1080×1920 자막 burn-in 합성 + FFprobe 길이 측정
│       │       └── image-generator.ts  # 썸네일 이미지 생성 유틸
│       └── upload/                   # SQS → YouTube Data API → COMPLETED
│           ├── Dockerfile
│           └── src/
│               ├── env.ts            # Zod 환경변수 검증 (ENCRYPTION_KEY 등)
│               ├── handler.ts        # SQS 이벤트 핸들러 (Lambda 진입점)
│               ├── uploader.ts       # YouTube Data API v3 영상 업로드 (공개·#Shorts 태그)
│               ├── crypto.ts         # AES-256-GCM OAuth 자격증명 복호화
│               └── local-runner.ts   # Docker Compose 환경용 SQS Long Polling 루프
├── packages/
│   └── shared/                       # 전 앱 공통 — Prisma, 로거, S3, 환경변수
│       ├── package.json
│       ├── tsconfig.json
│       ├── prisma/
│       │   ├── schema.prisma         # Channel·Job 데이터 모델 정의
│       │   └── migrations/           # Prisma 마이그레이션 이력
│       └── src/
│           ├── index.ts              # 전체 공통 모듈 re-export 진입점
│           ├── env.ts                # Zod 공통 환경변수 스키마 (BaseEnvSchema)
│           ├── logger.ts             # Pino 로거 팩토리 (jobId·channelId 컨텍스트)
│           ├── prisma.ts             # Prisma Client 싱글톤
│           └── s3.ts                 # S3 클라이언트 (putObject·getObject·jobKey)
├── infra/
│   ├── localstack/
│   │   └── init/
│   │       └── init-aws.sh           # LocalStack 기동 시 SQS 5큐+DLQ·S3 초기화
│   ├── terraform/
│   │   ├── envs/
│   │   │   ├── dev/
│   │   │   │   └── main.tf           # dev 환경 Terraform 진입점
│   │   │   └── prod/
│   │   │       └── main.tf           # prod 환경 Terraform 진입점
│   │   └── modules/
│   │       ├── ecr-repo/
│   │       │   └── main.tf           # ECR 레포지토리 생성 모듈
│   │       ├── ecs-worker/
│   │       │   ├── main.tf           # ECS Fargate 태스크·서비스 정의 모듈
│   │       │   ├── outputs.tf        # ECS 서비스 ARN·이름 출력
│   │       │   └── variables.tf      # 워커별 이미지·CPU·메모리 변수
│   │       └── sqs-queue/
│   │           ├── main.tf           # SQS Standard Queue + DLQ 생성 모듈
│   │           ├── outputs.tf        # 큐 URL·ARN 출력
│   │           └── variables.tf      # 큐 이름·가시성 타임아웃 변수
│   └── docker/
│       └── migrate/
│           └── Dockerfile            # Prisma migrate deploy 전용 컨테이너
├── docs/
│   ├── README.md                     # 문서 허브 (진입점)
│   ├── prd.md                        # 제품 요구사항 문서
│   ├── roadmap.md                    # Phase별 구현 계획 및 검증 체크리스트
│   ├── adr/
│   │   ├── README.md                 # ADR 인덱스 (001~009)
│   │   └── 001~009-*.md              # 아키텍처 결정 기록 9개
│   ├── architecture/
│   │   ├── overview.md               # 시스템 아키텍처 개요 (다이어그램·스택)
│   │   ├── pipeline-flow.md          # 5단계 파이프라인 상세·상태 전이·실패 처리
│   │   └── data-model.md             # Prisma 스키마·ER 다이어그램·필드 설명
│   ├── backend/
│   │   ├── conventions.md            # NestJS 3계층·TypeScript·로깅·Worker 설계 원칙
│   │   └── security/
│   │       └── encryption.md         # AES-256-GCM·DB 저장 포맷·키 관리
│   ├── onboarding/
│   │   ├── local-setup.md            # 로컬 개발 환경 세팅 (사전 요구사항~기동)
│   │   ├── api-keys.md               # Gemini·YouTube OAuth·NextAuth·ENCRYPTION_KEY 발급 통합 가이드
│   │   └── env-vars.md               # 전체 환경변수 레퍼런스
│   ├── operations/
│   │   ├── monitoring.md             # CloudWatch·DLQ 알림·Sentry·Budget Alert
│   │   └── runbook/
│   │       ├── deploy.md             # 로컬~AWS 배포 단계별 절차
│   │       └── gemini-quota.md       # Gemini 429 오류 원인 및 해결책
│   └── product/
│       ├── business-rules.md         # 핵심 도메인 비즈니스 규칙
│       └── terminology.md            # 프로젝트 도메인 용어 사전
└── scripts/
    ├── dev/
    │   └── seed.ts                   # DB 시드 데이터 삽입 스크립트
    └── tools/                        # Phase 0 단독 검증 스크립트 (AWS 없이 실행)
        ├── test-tts.ts               # Edge-TTS 음성 합성 품질 검증
        ├── test-whisper.ts           # faster-whisper 한국어 자막 인식률 검증
        ├── test-render.ts            # FFmpeg 렌더링 품질 검증
        ├── test-upload.ts            # YouTube Data API 업로드 검증
        ├── transcribe.py             # Python faster-whisper 직접 실행 스크립트
        └── output/                   # 검증 결과물 (gitignore)
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
pnpm --filter @shorts/shared prisma:migrate    # 프로덕션 마이그레이션 적용 (DIRECT_URL 필요)
pnpm --filter @shorts/shared prisma studio    # DB GUI

# Docker Compose (로컬 통합 환경)
docker-compose up             # 전체 스택 기동
docker-compose up localstack  # LocalStack만 기동
docker-compose down -v        # 스택 종료 + 볼륨 삭제
```

---

## 기술 스택

| 영역 | 기술 | 비고 |
|---|---|---|
| 런타임 | Node.js 20, TypeScript 5.x strict | `any` 사용 금지 |
| 패키지 관리 | pnpm workspace, Turborepo | |
| API | NestJS v11, Fastify Adapter | 3계층 구조 |
| 프론트엔드 | Next.js 15 App Router | 서버 컴포넌트 기본 |
| UI | TailwindCSS, shadcn/ui | |
| 서버 상태 | TanStack Query v5 | 2초 폴링 |
| 클라이언트 상태 | Zustand v4 | |
| 인증 | NextAuth (Google OAuth, JWT) | |
| DB | PostgreSQL 14, Prisma v5 | 로컬: Docker Compose 자동 실행 / 프로덕션: Supabase → RDS |
| 큐 | AWS SQS Standard Queue + DLQ | 5큐 + DLQ 5개 |
| AI | Google Gemini API `gemini-2.0-flash` | 무료 티어 사용 |
| TTS | Edge-TTS `ko-KR-SunHiNeural` | Python CLI (`pip install edge-tts`) / → Phase 7: Clova Voice |
| 자막 | faster-whisper `large-v3` | Python (`pip install faster-whisper`) / 한국어 인식률 90%+ |
| 렌더링 | FFmpeg | → Phase 4: Remotion |
| 스케줄링 | EventBridge Scheduler | 채널별 cron |
| 인프라 | Lambda, ECS Fargate, S3 | Terraform |
| 로컬 개발 | Docker Compose, LocalStack v3 | LocalStack: Docker 이미지로 SQS·S3 시뮬레이션 (별도 설치 불필요) |
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
| [API 키 발급](docs/onboarding/api-keys.md) | Gemini·YouTube OAuth·NextAuth·ENCRYPTION_KEY 통합 가이드 |
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
| [005](docs/adr/005-gemini-flash.md) | Gemini 2.0 Flash 모델 고정 |
| [006](docs/adr/006-iac-terraform-serverless.md) | Terraform + Serverless Framework 역할 분리 |
| [007](docs/adr/007-database-strategy.md) | Supabase → RDS 전략, DIRECT_URL 분리 이유 |
| [008](docs/adr/008-whisper-model.md) | faster-whisper large-v3 선택 이유 |
| [009](docs/adr/009-fargate-sqs-long-polling.md) | Fargate SQS Long Polling 자체 구현 이유 |
