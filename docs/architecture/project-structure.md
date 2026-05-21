# 프로젝트 구조

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
├── .mcp.json                         # MCP 서버 설정 (Shrimp Task Manager·Playwright·Supabase·Terraform·AWS·Sentry)
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
    └── tools/                        # Phase 0 단독 검증 스크립트 (AWS 없이 실행)
        ├── test-tts.ts               # Edge-TTS 음성 합성 품질 검증
        ├── test-render.ts            # FFmpeg 렌더링 품질 검증
        └── test-upload.ts            # YouTube Data API 업로드 검증
```
