# PRD — AI 유튜브 쇼츠 자동 생성/업로드 플랫폼

> 작성일: 2026-05-11  
> 기반 문서: docs/roadmap.md, shrimp-rules.md

---

## 1. 제품 개요

유튜브 쇼츠 채널을 운영하는 사용자가 **토픽 하나를 입력하면** 스크립트 생성 → TTS 음성 → 자막 → 영상 합성 → 유튜브 업로드까지 전 과정이 자동으로 실행되는 플랫폼이다.

Google Gemini API로 쇼츠 스크립트를 생성하고, AWS 서버리스 파이프라인(Lambda + ECS Fargate + SQS)으로 각 처리 단계를 분리 실행한다. 웹 대시보드(Next.js)로 채널 관리와 Job 상태 모니터링을 제공한다.

---

## 2. 목표

| 구분 | 내용 |
|---|---|
| 핵심 목표 | 채널당 매일 1개 쇼츠를 완전 자동으로 생성·업로드 |
| 품질 목표 | 실제 사람이 끝까지 볼 만한 영상 생성 |
| 비용 목표 | 채널 3개 기준 월 운영비 $10 이하 |
| 안정성 목표 | 30일 연속 자동 운영, 실패율 3% 이하 |
| 확장 목표 | 멀티채널 관리, YPP(유튜브 파트너 프로그램) 달성 지원 |

---

## 3. 사용자 스토리

### 채널 운영자

- 구글 계정으로 로그인하면 유튜브 채널이 자동으로 연결된다.
- 토픽을 입력하거나 DB 큐에 등록해두면 매일 지정 시간에 영상이 업로드된다.
- 대시보드에서 날짜별로 생성된 영상과 조회수·좋아요 현황을 확인할 수 있다.
- 실패한 Job은 실패 원인을 확인하고 재시도 버튼으로 즉시 재처리할 수 있다.
- 채널별 업로드 스케줄과 토픽 큐를 독립적으로 설정할 수 있다.

### 제휴 마케팅 운영자

- 채널에 쿠팡 파트너스 링크를 등록하면 영상 설명란과 영상 마지막 8초 자막에 자동으로 삽입된다.

---

## 4. 기능 요구사항

### 4-1. 파이프라인 핵심 기능

| 단계 | 기능 | 구현 방식 |
|---|---|---|
| 스크립트 생성 | 토픽 + 니치 기반 쇼츠 스크립트 자동 작성 | Google Gemini API (gemini-2.0-flash) |
| TTS | 스크립트 → MP3 오디오 변환 | Edge-TTS → Clova Voice (Phase 7) |
| 자막 | MP3 → SRT 자막 파일 생성 | Whisper (ECS Fargate) |
| 영상 합성 | 배경영상 + 오디오 + 자막 합성, 1080×1920 쇼츠 포맷 | FFmpeg → Remotion (Phase 4) |
| 업로드 | YouTube Data API로 영상 업로드, 메타데이터 설정, 예약 업로드 | YouTube Data API v3 |

**스크립트 출력 형식:**

```json
{
  "title": "유튜브 제목 (60자 이내, 이모지 포함)",
  "hook": "첫 1~2문장",
  "script": "전체 스크립트 (45~55초 분량)",
  "hashtags": ["#shorts", "#관련태그"],
  "thumbnail_text": "썸네일 텍스트 (10자 이내)",
  "affiliate_product": "추천 상품명 또는 null",
  "affiliate_cta": "CTA 문구"
}
```

### 4-2. 스케줄링

- EventBridge Scheduler로 채널별 지정 시간에 Job 자동 생성
- 토픽 큐가 있으면 순서대로 사용, 소진 시 Gemini API로 자동 생성

### 4-3. 웹 대시보드

| 페이지 | 기능 |
|---|---|
| `/` | 로그인 / 랜딩 |
| `/dashboard` | 채널 탭 + 날짜별 Job 카드 피드, 이번 달 요약, 2초 폴링 |
| `/dashboard` | 토픽 입력 폼 (하단 통합) + 날짜별 Job 카드 피드 |
| `/dashboard/[id]` | Job 상태 타임라인, 실패 시 재시도 |
| `/channels` | 채널 목록, OAuth2 연결, 활성화 토글 |
| `/channels/[id]` | 업로드 스케줄 설정, 토픽 큐 관리, 성과 테이블, YPP 진행률 |

**Job 상태 전이:**

```
PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING
       → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED
```

### 4-4. 모니터링 및 알림

- CloudWatch: Lambda·Fargate 로그 수집, 에러율 5% 초과 시 알람
- SQS DLQ: maxReceiveCount 3회 실패 시 DLQ 이동, DLQ 적재 시 Slack/Discord 알림
- Sentry: 런타임 에러 트래킹, jobId·channelId 컨텍스트 포함
- AWS Budget Alert: $20 초과 시 이메일 알람

### 4-5. 보안

- YouTube refresh_token AES-256-GCM 암호화 저장
- access_token DB 저장 금지 → 런타임에서 refresh_token으로 재발급
- ENCRYPTION_KEY는 AWS Secrets Manager에서 주입
- 환경변수 Zod 스키마로 앱 시작 시 검증

---

## 5. 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 가용성 | 파이프라인 실패율 3% 이하 (30일 기준) |
| 응답 시간 | API Gateway → Lambda 첫 응답 3초 이내 |
| 확장성 | 채널 10개까지 추가 인프라 변경 없이 운영 가능 |
| 비용 | 채널 3개·영상 90개/월 기준 AWS + AI 합산 $10 이하 |
| 보안 | 시크릿 전량 Secrets Manager 관리, .env.local 파일 Git 커밋 금지 |
| 로깅 | Pino 구조적 로깅, console.log 프로덕션 사용 금지 |
| 타입 안정성 | TypeScript strict mode, any 사용 금지 |

---

## 6. 기술 스택

### 요약

| 분류 | 기술 |
|---|---|
| Frontend | Next.js 15 (App Router, React 19), TailwindCSS, shadcn/ui, TanStack Query v5, Zustand v4 |
| Backend | NestJS v11, Fastify Adapter, TypeScript 5.x strict, Zod, Swagger/OpenAPI |
| Queue | AWS SQS (Standard Queue + DLQ) |
| Database | PostgreSQL (Supabase → RDS), Prisma v5 |
| Infra | AWS Lambda (Node.js 20), API Gateway, ECS Fargate, EventBridge, S3, CloudWatch, ECR, IAM, GitHub Actions |
| Rendering | FFmpeg (Phase 1~3) → Remotion (Phase 4~) |
| AI | Google Gemini API — gemini-2.0-flash |
| TTS | Edge-TTS (초기) → Clova Voice (Phase 7) |
| STT | Whisper (faster-whisper, ECS Fargate) |
| Monitoring | CloudWatch, Sentry |

### Lambda vs ECS Fargate 분리 기준

| 실행 환경 | Worker | 이유 |
|---|---|---|
| Lambda | script / tts / upload | 빠르고 가벼운 작업 |
| ECS Fargate | subtitle (Whisper), render (FFmpeg/Remotion) | 대용량 모델 파일, CPU 집약적 |

---

## 7. 아키텍처 개요

```
[Next.js — Vercel or AWS Amplify]
           ↓ HTTP
[API Gateway + Lambda (NestJS)]
           ↓ SQS
[script-worker]  → Gemini API   → S3 (script.json)
[tts-worker]     → Edge-TTS      → S3 (audio.mp3)
[subtitle-worker]→ Whisper       → S3 (subtitle.srt)   ← ECS Fargate
[render-worker]  → FFmpeg        → S3 (output.mp4)     ← ECS Fargate
[upload-worker]  → YouTube API   → 업로드 완료
           ↓
[RDS PostgreSQL / Supabase]
[EventBridge Scheduler] — 매일 채널별 지정 시간에 Job 생성
[CloudWatch] — 로그, 알람
```

**Worker 간 메시지 흐름:**

```
POST /jobs
  → SQS script-queue
    → script-worker (Lambda): Gemini API → script.json → S3
      → SQS tts-queue
        → tts-worker (Lambda): Edge-TTS → audio.mp3 → S3
          → SQS subtitle-queue
            → subtitle-worker (Fargate): Whisper → subtitle.srt → S3
              → SQS render-queue
                → render-worker (Fargate): FFmpeg → output.mp4 → S3
                  → SQS upload-queue
                    → upload-worker (Lambda): YouTube API → COMPLETED
```

**S3 키 규칙:**

```
jobs/{jobId}/script.json
jobs/{jobId}/audio.mp3
jobs/{jobId}/subtitle.srt
jobs/{jobId}/output.mp4
```

---

## 8. 데이터 모델

```prisma
model Channel {
  id              String    @id @default(cuid())
  youtubeId       String    @unique
  name            String
  niche           String
  refreshToken    String    // AES-256-GCM 암호화
  uploadSchedule  String    // cron: "0 9 * * ? *"
  affiliateUrl    String?   // 쿠팡 파트너스 링크
  isActive        Boolean   @default(true)
  subscriberCount Int       @default(0)
  totalViews      Int       @default(0)
  isYPPQualified  Boolean   @default(false)
  jobs            Job[]
  analytics       ChannelAnalytics[]
}

model Job {
  id              String    @id @default(cuid())
  channelId       String
  topic           String
  status          JobStatus @default(PENDING)
  retryCount      Int       @default(0)
  failReason      String?
  scriptContent   Json?
  audioS3Key      String?
  subtitleS3Key   String?
  videoS3Key      String?
  youtubeVideoId  String?
  viewCount       Int       @default(0)
  likeCount       Int       @default(0)
  lastSyncedAt    DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  channel         Channel   @relation(fields: [channelId], references: [id])
}

model ChannelAnalytics {
  id               String   @id @default(cuid())
  channelId        String
  date             DateTime @db.Date
  views            Int      @default(0)
  subscribers      Int      @default(0)
  estimatedRevenue Float    @default(0)
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
| Google Gemini API (gemini-2.0-flash, 무료 티어) | $0 |
| AWS S3 (~9GB) | ~$0.21 |
| ECS Fargate (렌더링) | ~$6 |
| CloudWatch | ~$1 |
| Lambda, SQS | ~$0 (무료 티어) |
| Supabase | $0 (무료 플랜) |
| TTS (Edge-TTS) | $0 |
| **합계** | **~$7.5** |

---

## 11. 핵심 리스크 및 검증 전략

> 이 프로젝트에서 가장 큰 리스크는 인프라가 아니라 **콘텐츠 품질**이다.  
> 아키텍처 구성 전, 아래 4가지를 단독 스크립트로 먼저 검증한다.

| 리스크 | 검증 항목 | 검증 방법 |
|---|---|---|
| YouTube 업로드 안정성 | Shorts 분류 여부, quota 소비량, refresh_token 재발급 흐름 | `scripts/test-upload.ts` |
| FFmpeg 렌더링 품질 | 모바일 자막 잘림, 한글 폰트, 오디오 싱크, 유튜브 재압축 화질 | `scripts/test-render.ts` |
| TTS 음성 품질 | 속도/억양/AI 느낌 최소화, 45~55초 분량 | `scripts/test-tts.ts` |
| Whisper 자막 정확도 | 한국어 90% 이상, 숫자·영어 혼용, 타임스탬프 ±0.3초 | `scripts/test-whisper.ts` |

---

## 12. Phase 요약

| Phase | 목표 |
|---|---|
| **0** | 4가지 핵심 리스크 단독 검증 |
| **1** | Monorepo 구성, 로컬 파이프라인 구현, 수동 유튜브 업로드 1회 성공 |
| **2** | 웹 대시보드 (NextAuth, 채널 연결, Job 모니터링) |
| **3** | AWS 서버리스 이관 (Lambda + SQS + Fargate + S3), E2E 자동 업로드 |
| **4** | EventBridge 스케줄링, DLQ 모니터링, 7일 무중단 운영 |
| **5** | Remotion 전환, YouTube Analytics 수집, 고성과 패턴 반영 |
| **6** | 멀티채널 독립 스케줄, Fargate 동적 스케일링 |
| **7** | GitHub Actions CI/CD, Sentry, Clova Voice 교체, 30일 안정성 검증 |

---

## 13. 완료 기준 (전체 플랫폼)

- [ ] 채널 3개에서 매일 자동 업로드 30일 연속 성공
- [ ] 실패율 3% 이하
- [ ] 월 운영 비용 $10 이하
- [ ] 모바일 유튜브 앱에서 자막·오디오 품질 합격 판정
- [ ] 대시보드에서 채널·Job 관리 전 기능 동작

---

## 14. 개발 규칙 요약

- TypeScript strict mode, `any` 금지, `satisfies` 연산자 활용
- NestJS: 컨트롤러에 비즈니스 로직 금지, 서비스에 HTTP 코드 금지
- Next.js: 서버 컴포넌트 기본, `useEffect` 데이터 페칭 금지
- Prisma: 필요한 필드만 `select`, Lambda 싱글턴 패턴
- 로깅: Pino 사용, `console.log` 프로덕션 금지, `jobId/channelId` 항상 포함
- Git: `<type>(<scope>): <subject>` 커밋 컨벤션, Phase 단위 PR
- 보안: `.env.local` Git 커밋 금지, access_token DB 저장 금지, Secrets Manager 사용
