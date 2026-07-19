# PRD — AI 유튜브 쇼츠 자동 생성/업로드 플랫폼

> 최종 업데이트: 2026-05-20  
> 기반 문서: docs/roadmap.md, shrimp-rules.md

---

## 1. 제품 개요

유튜브 쇼츠 채널을 운영하는 사용자가 **토픽 하나를 입력하거나 뉴스 RSS를 자동 수집**하면 스크립트 생성 → TTS 음성 → 자막 → 영상 합성 → 유튜브 업로드까지 전 과정이 자동으로 실행되는 플랫폼이다.

한국 뉴스·시사 쇼츠 채널에 특화: Google News RSS에서 주제를 자동 수집하고, Gemini 2.5 Flash로 25~35초 시사 스크립트를 생성하며, 시사 키워드 하이라이트 자막과 Pexels 이미지 기반 zoompan 영상을 제작한다.

Google Gemini API로 스크립트를 생성하고, AWS 서버리스 파이프라인(Lambda + SQS)으로 각 처리 단계를 분리 실행한다. 웹 대시보드(Next.js)로 채널 관리, Job 상태 모니터링, YouTube Analytics 시각화, YPP 진행률 추적을 제공한다.

---

## 2. 목표

| 구분 | 내용 |
|---|---|
| 핵심 목표 | 채널당 매일 1개 뉴스·시사 쇼츠를 완전 자동으로 생성·업로드 |
| 품질 목표 | 댓글 유도·클릭 유발·시청 완료율 높은 시사 콘텐츠 생성 |
| 비용 목표 | 채널 3개 기준 월 운영비 $10 이하 |
| 확장 목표 | 멀티채널 관리, YPP(유튜브 파트너 프로그램) 달성 지원 |

---

## 3. 사용자 스토리

### 채널 운영자

- 구글 계정으로 로그인하면 유튜브 채널이 자동으로 연결된다.
- 토픽을 직접 입력하거나 뉴스 자동 수집(`auto-news`)으로 매일 지정 시간에 영상이 업로드된다.
- 대시보드에서 날짜별로 생성된 영상과 조회수·좋아요 현황을 실시간으로 확인할 수 있다.
- 실패한 Job은 실패 원인을 확인하고 재시도 버튼으로 즉시 재처리할 수 있다.
- 채널별 업로드 스케줄을 독립적으로 설정할 수 있다.
- YPP 달성 진행률(구독자 / 시청 시간)을 대시보드에서 확인할 수 있다.

---

## 4. 기능 요구사항

### 4-1. 파이프라인 핵심 기능

| 단계 | 기능 | 구현 방식 |
|---|---|---|
| 스크립트 생성 | 뉴스·시사 주제 기반 쇼츠 스크립트 자동 작성 | Google Gemini 2.5 Flash |
| TTS | 스크립트 → MP3 오디오 변환 | Edge-TTS `ko-KR-SunHiNeural +20%` → Phase 7: Clova Voice |
| 자막 | 오디오 길이 기반 글자 비례 SRT 생성 (20자 이하 청크) | `ffprobe` 측정 → `script` 필드 비례 타임스탬프 할당 |
| 영상 합성 | Pexels 이미지 + zoompan 효과 + 오디오 + 자막 합성, 1080×1920 포맷 | FFmpeg (Lambda Container Image) |
| 업로드 | YouTube Data API로 영상 업로드, 생성된 설명문·뉴스 카테고리 설정 (`containsSyntheticMedia: true`) | YouTube Data API v3 |

**스크립트 출력 형식 (`ScriptOutput`):**

```json
{
  "title": "영상 제목 (20자 이내, 충격·클릭 유도)",
  "hook": "첫 2초 훅 문장 (의문형 또는 충격 선언)",
  "script": "전체 낭독 스크립트 (180~250자, comment_bait 마무리)",
  "description": "YouTube 영상 설명문 (3~5문단, 400~800자). ~다고 합니다 중립 보도 문체. 마지막 문단 면책 공지 포함.",
  "scenes": [
    {
      "start": 0,
      "end": 6,
      "text": "해당 구간 낭독 텍스트",
      "keyword": "Pexels 검색용 영어 키워드 (2~3단어)",
      "effect": "zoom-in"
    }
  ],
  "hashtags": ["#Shorts", "#시사", "#뉴스"],
  "thumbnail_text": "썸네일 임팩트 문구 (8자 이내)",
  "comment_bait": "댓글 유도 질문 (25자 이내, 공분·논란·의견 충돌 유발)"
}
```

### 4-2. 뉴스 자동 수집

- `POST /jobs/auto-news`: Google News RSS (`news.google.com/rss`, 한국어/KR) 수집 → 뉴스 제목으로 Job 일괄 생성
- 카테고리: `top | politics | business | nation` (기본값: `top`)
- count: 1~5개 (기본값: 3)

### 4-3. 스케줄링

- EventBridge Scheduler로 채널별 지정 시간에 Job 자동 생성 (`cron` 표현식, `uploadSchedule` 필드)
- `topic: null` 수신 시 `auto-news`로 자동 처리

### 4-4. 웹 대시보드

| 페이지 | 기능 |
|---|---|
| `/login` | Google 소셜 로그인 (NextAuth v5) |
| `/` | 토픽 입력 폼 + 카테고리 버튼 (Auto-News) + Job 카드 갤러리 (2초 폴링) |
| `/dashboard/[id]` | Job 상태 타임라인, 실패 시 failReason + 재시도, privacyStatus 표시 |
| `/channels/[id]` | YPP 진행률, 채널 성과 차트, 자동 업로드 스케줄러 설정 |

**Job 상태 전이:**

```
PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING
       → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED
```

### 4-5. Analytics 및 채널 동기화

- `POST /channels/:id/sync` — 풀 동기화:
  1. YouTube Data API: 채널 통계 (subscriberCount, totalViews)
  2. YouTube Analytics API: 최근 30일 일별 views, subscribersGained, estimatedMinutesWatched → `ChannelAnalytics` upsert
  3. YouTube Data API: 모든 영상 조회수·likeCount·privacyStatus 동기화
  4. 삭제된 영상 자동 감지 → `status=FAILED`, `failReason='유튜브에서 영상이 삭제되었습니다.'`
- 홈 페이지 마운트 시 자동 sync 실행

### 4-6. 모니터링 및 알림

- CloudWatch: Lambda 로그 수집, 에러율 5% 초과 시 알람
- SQS DLQ: maxReceiveCount 3회 실패 시 DLQ 이동, DLQ 적재 시 Slack/Discord 알림
- Sentry: 런타임 에러 트래킹, jobId·channelId 컨텍스트 포함
- AWS Budget Alert: $20 초과 시 이메일 알람

### 4-7. 보안

- YouTube refresh_token AES-256-GCM 암호화 저장
- access_token DB 저장 금지 → 런타임에서 refresh_token으로 재발급
- ENCRYPTION_KEY는 AWS Secrets Manager에서 주입
- OAuth 스코프: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`
- 환경변수 Zod 스키마로 앱 시작 시 검증

---

## 5. 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 응답 시간 | API Gateway → Lambda 첫 응답 3초 이내 |
| 확장성 | 채널 10개까지 추가 인프라 변경 없이 운영 가능 |
| 비용 | 채널 3개·영상 90개/월 기준 AWS + AI 합산 $10 이하 |
| 보안 | 시크릿 전량 Secrets Manager 관리, .env.local 파일 Git 커밋 금지 |
| 로깅 | Pino 구조적 로깅, console.log 프로덕션 사용 금지 |
| 타입 안정성 | TypeScript strict mode, any 사용 금지, ESM |

---

## 6. 기술 스택

### 요약

| 분류 | 기술 |
|---|---|
| Frontend | Next.js 15 (App Router, React 19), TailwindCSS, shadcn/ui, TanStack Query v5, Zustand v4 |
| Backend | NestJS v11, Fastify Adapter, TypeScript 5.x strict, Zod |
| Queue | AWS SQS (Standard Queue + DLQ) |
| Database | PostgreSQL (Supabase → RDS), Prisma v5 |
| Infra | AWS Lambda (Node.js 20), API Gateway, EventBridge, S3, CloudWatch, ECR, IAM, GitHub Actions |
| Rendering | FFmpeg (zoompan 효과, ASS 자막, 썸네일 추출) |
| AI | Google Gemini 2.5 Flash |
| TTS | Edge-TTS `ko-KR-SunHiNeural` → Clova Voice (Phase 7) |
| 자막 생성 | `ffprobe` 오디오 길이 측정 → `script` 필드 글자 수 비례 SRT 생성 |
| 이미지 | Pexels API (scenes[].keyword 기반) |
| 뉴스 수집 | Google News RSS |
| Monitoring | CloudWatch, Sentry |

### 실행 환경

| 실행 환경 | Worker | 이유 |
|---|---|---|
| Lambda | script / tts / subtitle / upload | 빠르고 가벼운 작업 |
| Lambda Container Image | render (Pexels + FFmpeg) | FFmpeg 바이너리 포함 컨테이너 이미지 필요 |

---

## 7. 아키텍처 개요

```
[Next.js — Vercel or AWS Amplify]
           ↓ HTTP
[API Gateway + Lambda (NestJS)]
           ↓ SQS
[script-worker]  → Gemini 2.5 Flash  → S3 (script.json)   ← Lambda
[tts-worker]     → Edge-TTS           → S3 (audio.mp3)     ← Lambda
[subtitle-worker]→ 스크립트 기반 SRT  → S3 (subtitle.srt)  ← Lambda
[render-worker]  → Pexels + FFmpeg    → S3 (output.mp4)    ← Lambda Container Image
[upload-worker]  → YouTube API        → 업로드 완료         ← Lambda
           ↓
[RDS PostgreSQL / Supabase]
[EventBridge Scheduler] — 매일 채널별 지정 시간에 Job 생성
[CloudWatch] — 로그, 알람
```

**S3 키 규칙:**

```
jobs/{jobId}/script.json    (title, hook, script, scenes[], hashtags, thumbnail_text, comment_bait)
jobs/{jobId}/audio.mp3
jobs/{jobId}/subtitle.srt
jobs/{jobId}/output.mp4
```

---

## 8. 데이터 모델

```prisma
model Channel {
  id                String    @id @default(cuid())
  youtubeId         String    @unique
  name              String
  niche             String
  refreshToken      String    // AES-256-GCM 암호화
  uploadSchedule    String?
  schedulerEnabled  Boolean   @default(false)
  schedulerCategory String    @default("top")
  isActive          Boolean   @default(true)
  subscriberCount   Int       @default(0)
  totalViews        BigInt    @default(0)  // YouTube Data API channels.list statistics.viewCount
  userId            String
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user              User             @relation(fields: [userId], references: [id])
  jobs              Job[]
  analytics         ChannelAnalytics[]

  @@index([isActive])
  @@index([userId])
}

// isYPPQualified, uploadCount90d, shortsViews90d는 DB 컬럼이 아닌 GET /channels/:id 응답 시 동적 계산 파생 필드

model Job {
  id              String    @id @default(cuid())
  channelId       String
  topic           String
  status          JobStatus @default(PENDING)
  retryCount      Int       @default(0)
  failReason      String?
  scriptContent   Json?     // ScriptOutput (8필드: title,hook,script,description,scenes[],hashtags,thumbnail_text,comment_bait)
  audioS3Key      String?
  subtitleS3Key   String?
  videoS3Key      String?
  youtubeVideoId  String?
  thumbnailUrl    String?
  privacyStatus   String    @default("public")
  viewCount       BigInt    @default(0)
  likeCount       BigInt    @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  channel         Channel   @relation(fields: [channelId], references: [id])
}

model ChannelAnalytics {
  id               String   @id @default(cuid())
  channelId        String
  date             DateTime @db.Date
  views            BigInt   @default(0)
  subscribers      Int      @default(0)
  estimatedRevenue Float    @default(0)
  watchTimeMinutes BigInt   @default(0)
  channel          Channel  @relation(fields: [channelId], references: [id])
  @@unique([channelId, date])
}

enum JobStatus {
  PENDING
  SCRIPT_PROCESSING
  TTS_PROCESSING
  SUBTITLE_PROCESSING
  RENDER_PROCESSING
  UPLOAD_PROCESSING
  COMPLETED
  FAILED
}
```

---

## 9. SQS 설정 표준

| 항목 | 값 | 이유 |
|---|---|---|
| Visibility Timeout | Worker 타임아웃 × 2 | 재처리 방지 |
| Message Retention | 4일 | 주말 포함 장애 대응 |
| Max Receive Count | 3 | DLQ 이동 전 재시도 |
| DLQ Retention | 14일 | 수동 조사 시간 확보 |

**Worker 타임아웃:**

| Worker | 타임아웃 | Visibility Timeout |
|---|---|---|
| api (NestJS Lambda) | 30초 | — |
| script-worker | 60초 | 120초 |
| tts-worker | 120초 | 240초 |
| subtitle-worker | 300초 | 600초 |
| render-worker | 600초 | 1,200초 |
| upload-worker | 300초 | 600초 |

---

## 10. 예상 비용 (채널 3개, 영상 90개/월)

| 항목 | 비용 |
|---|---|
| Google Gemini 2.5 Flash (무료 티어) | $0 |
| Edge-TTS | $0 |
| Pexels API (무료 플랜) | $0 |
| Google News RSS | $0 |
| AWS S3 (~9GB) | ~$0.21 |
| CloudWatch | ~$1 |
| Lambda, SQS | ~$0 (무료 티어) |
| Supabase | $0 (무료 플랜) |
| **합계** | **~$1.5** |

---

## 11. 핵심 리스크 및 검증 전략

> 이 프로젝트에서 가장 큰 리스크는 인프라가 아니라 **콘텐츠 품질**이다.  
> 아키텍처 구성 전, 아래 3가지를 단독 스크립트로 먼저 검증한다.

| 리스크 | 검증 항목 | 검증 방법 |
|---|---|---|
| YouTube 업로드 안정성 | Shorts 분류 여부, quota 소비량, refresh_token 재발급 흐름 | `apps/workers/upload` |
| FFmpeg 렌더링 품질 | 모바일 자막 잘림, 한글 폰트, 오디오 싱크, 유튜브 재압축 화질 | `apps/workers/render` |
| TTS 음성 품질 | 속도/억양/AI 느낌 최소화, 25~35초 분량 | `apps/workers/tts` |

---

## 12. Phase 요약

| Phase | 목표 | 상태 |
|---|---|---|
| **1** | Monorepo 구성, 로컬 파이프라인 구현, 수동 유튜브 업로드 1회 성공 | 완료 |
| **2** | 웹 대시보드 (NextAuth, 채널 연결, Job 모니터링, Analytics, auto-news, sync) | 완료 |
| **3** | Supabase DB 이관 (연결 설정 + 마이그레이션) | 완료 |
| **4** | AWS 서버리스 이관 (Lambda + SQS + S3), E2E 자동 업로드 | 완료 |
| **5** | EventBridge 스케줄링, DLQ 알림, CloudWatch 알람 | 완료 |
| **6** | 멀티채널 독립 스케줄, Analytics 다채널 수집 | 예정 |
| **7** | GitHub Actions CI/CD, Sentry, Clova Voice 교체, Budget Alert | 진행 중 (P7-1 완료) |

---

## 13. 완료 기준 (전체 플랫폼)

- [ ] 월 운영 비용 $10 이하
- [ ] 모바일 유튜브 앱에서 자막·오디오 품질 합격 판정
- [ ] 대시보드에서 채널·Job 관리 전 기능 동작

---

## 14. 개발 규칙 요약

- TypeScript strict mode, `any` 금지, `satisfies` 연산자 활용, ESM
- NestJS: 컨트롤러에 비즈니스 로직 금지, 서비스에 HTTP 코드 금지
- Next.js: 서버 컴포넌트 기본, `useEffect` 데이터 페칭 금지
- Prisma: 필요한 필드만 `select`, Lambda 싱글턴 패턴
- 로깅: Pino 사용, `console.log` 프로덕션 금지, `jobId/channelId` 항상 포함
- Git: `<type>(<scope>): <subject>` 커밋 컨벤션, Phase 단위 PR
- 보안: `.env.local` Git 커밋 금지, access_token DB 저장 금지, Secrets Manager 사용
