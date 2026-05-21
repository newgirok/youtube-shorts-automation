# AI Agent 개발 가이드라인

> **코딩 규칙 위치 변경**: 세부 코딩 규칙은 `.claude/rules/`로 이전됨.
> 이 파일은 shrimp-task-manager MCP의 태스크 컨텍스트 전용으로 유지.
> 코드 작성 시 `.claude/rules/*.md`를 우선 참조할 것.

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

## 스크립트 출력 형식 (ScriptOutput — 8개 필드)

```typescript
interface ScriptOutput {
  title: string;           // 20자 이내, 충격·클릭 유도
  hook: string;            // 첫 2초 훅 문장
  script: string;          // 180~250자, comment_bait으로 마무리
  description: string;     // YouTube 설명문, 3~5문단, ~다고 합니다 문체, 면책 공지 포함
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

> 필드 추가/변경 시 tts-worker의 파싱 로직 함께 확인.

