# 프로젝트 구조

```
youtube-shorts-automation/
├── .claude/
│   ├── agents/                       # 전문화된 Claude AI 에이전트 설정
│   │   ├── ai-agent.md               # AI/ML 태스크 담당 (Gemini·Remotion)
│   │   ├── be-agent.md               # 백엔드 담당 (NestJS·Prisma·SQS)
│   │   ├── devops-agent.md           # 인프라 담당 (Terraform·Lambda·GitHub Actions)
│   │   └── fe-agent.md               # 프론트엔드 담당 (Next.js·shadcn/ui)
│   ├── rules/                        # 도메인별 코딩 규칙 (Claude 자동 참조)
│   │   ├── typescript.md             # strict, any 금지, ESM .js 확장자
│   │   ├── nestjs-api.md             # 3계층 패턴, Pino 로깅, Zod 환경변수
│   │   ├── database.md               # Prisma findMany select, 싱글턴, BigInt
│   │   ├── worker-pipeline.md        # Job 상태, SQS 고정값, S3 키, Lambda 배포 기준
│   │   ├── security.md               # AES-256-GCM, OAuth, .env 커밋 금지
│   │   ├── frontend.md               # 서버 컴포넌트, TanStack Query, useEffect 금지
│   │   └── infrastructure.md         # IaC 분리 원칙, Worker 배포 기준, 체크리스트
│   ├── REVIEW.md                     # 코드 리뷰 기준 (Critical/항상 확인/건너뛸 것)
│   ├── playwright-sort.ps1           # PostToolUse 훅 — Playwright 출력 자동 분류
│   └── settings.json                 # Claude Code 프로젝트 설정 (PostToolUse·permissions deny)
├── .env.example                      # 환경변수 템플릿 (루트 서비스용)
├── .env.local                        # 공통 환경변수 (gitignore)
├── .mcp.json                         # MCP 서버 설정 (Shrimp Task Manager·Playwright·Terraform·Sentry)
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
│   │       │   ├── channels.controller.ts  # GET /channels, GET /channels/:id, PATCH /channels/:id/schedule, DELETE /channels/:id, GET /channels/:id/analytics, POST /channels/:id/sync, POST /channels/:id/sync-videos
│   │       │   └── channels.service.ts     # YouTube Data API + Analytics API 동기화
│   │       ├── jobs/
│   │       │   ├── jobs.controller.ts  # POST /jobs, GET /jobs, GET /jobs/:id, GET /jobs/:id/thumbnail(@Public), POST /jobs/auto-news, POST /jobs/:id/retry
│   │       │   ├── jobs.service.ts     # Job 생성 → SQS 발행, 뉴스 RSS 수집
│   │       │   └── news-fetcher.ts     # Google News RSS 수집 (카테고리별, 한국어/KR)
│   │       └── scheduler/
│   │           └── scheduler.service.ts  # @Cron('* * * * *') — schedulerEnabled 채널 uploadSchedule 평가 → createFromNews(count:1)
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
│       │       └── script-generator.ts  # ScriptOutput(8필드): title,hook,script,description,scenes[],hashtags,thumbnail_text,comment_bait
│       ├── tts/                      # SQS → Edge-TTS → audio.mp3
│       ├── subtitle/                 # Lambda: Edge-TTS VTT 기반 SRT 생성 (faster-whisper 제거됨)
│       │   └── src/
│       │       └── processor.ts      # VTT 기반 SRT 생성 (vtt 없으면 ffprobe 길이 측정 후 글자 비례 fallback)
│       ├── render/                   # Lambda Container Image: Pexels 동영상/이미지 + zoompan + FFmpeg → output.mp4 + thumbnail.jpg
│       │   └── src/
│       │       ├── processor.ts      # scenes 배열 기반 동영상/이미지 다운로드 + 클립 생성 + thumbnail.jpg 추출
│       │       ├── renderer.ts       # zoompan 효과 (zoom-in/out, pan-left/right), FontSize=76 ASS 자막 (BorderStyle=3), 헤더 오버레이
│       │       └── image-generator.ts  # Pexels API 동영상/이미지 검색·다운로드
│       └── upload/                   # SQS → YouTube Data API → COMPLETED
│           └── src/
│               └── uploader.ts       # description+해시태그 설명문, categoryId=25(뉴스), containsSyntheticMedia: true
├── packages/
│   └── shared/                       # 전 앱 공통 — Prisma, 로거, S3, 환경변수
│       └── prisma/
│           └── schema.prisma         # Channel·Job·ChannelAnalytics 모델 (privacyStatus, watchTimeMinutes 포함)
├── infra/
│   ├── localstack/init/init-aws.sh   # LocalStack: SQS 5큐+DLQ·S3 초기화
│   └── terraform/                   # Terraform 모듈 (ECR, SQS, IAM, S3)
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
    ├── run-pipeline.ts               # 로컬 통합 진단 (SQS 없이 운영 워커 4종 직접 호출)
    └── fonts/                        # 렌더링 폰트 (SBAggro-Bold.ttf — renderer.ts에서 참조)
```
