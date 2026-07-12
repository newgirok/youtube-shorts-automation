# 로드맵 — AI 유튜브 쇼츠 자동화 플랫폼

> 기반 문서: docs/prd.md, shrimp-rules.md  
> 원칙: 각 Phase의 완료 기준을 충족해야 다음 Phase로 진행한다.

---

## 진행 현황

- **Phase 0** — 핵심 리스크 검증 ✅ 완료 → 운영 워커(`apps/workers/*`)로 흡수
- **Phase 1** — 로컬 파이프라인 구현 ✅ 완료
  - [x] P1-1. Monorepo 초기화 `[DevOps]`
  - [x] P1-2. `packages/shared` — 공통 기반 `[BE]`
  - [x] P1-3. `apps/api` — POST /jobs `[BE]`
  - [x] P1-4. `apps/workers/script` — Gemini 2.5 Flash, ScriptOutput(8필드) `[BE][AI]`
  - [x] P1-5. `apps/workers/tts` `[BE]`
  - [x] P1-6. `apps/workers/subtitle` _(Fargate)_ — VTT 기반 SRT 생성 (색상 하이라이트 미구현) `[BE][DevOps]`
  - [x] P1-7. `apps/workers/render` _(Fargate)_ — Pexels + zoompan + FFmpeg `[BE][DevOps]`
  - [x] P1-8. `apps/workers/upload` + 수동 E2E `[BE]`
  - [x] P1-9. Docker Compose 통합 로컬 환경 `[DevOps]`
- **Phase 2** — 웹 대시보드 ✅ 완료
  - [x] P2-1. `apps/web` 초기화 + NextAuth Google OAuth `[FE]`
  - [x] P2-2. `/` — 홈 (토픽 입력·Auto-News·Job 갤러리) `[FE][BE]`
  - [x] P2-3. `/dashboard/[id]` — 상태 타임라인 + 재시도 `[FE][BE]`
  - [x] P2-4. `/channels/[id]` — 채널 관리 + YPP 진행률 대시보드 `[FE][BE]`
  - [x] P2-5. YouTube OAuth2 채널 연결 + `refresh_token` 암호화 저장 `[BE]`
  - [x] P2-6. `POST /jobs/auto-news` — Google News RSS 수집 + Job 일괄 생성 `[BE]`
  - [x] P2-7. `POST /channels/:id/sync` — YouTube Data API + Analytics API 풀 동기화 `[BE]`
  - [x] P2-8. 삭제 영상 자동 감지 + FAILED 처리 `[BE]`
  - [x] P2-9. `Job.privacyStatus` 추적 `[BE]`
  - [x] P2-10. API 인-프로세스 자동 스케줄러 `[BE]` — `@Cron('* * * * *')` 1분 폴링, `schedulerEnabled` 채널의 `uploadSchedule` cron 평가 → `createFromNews(count:1, category: schedulerCategory)` 자동 호출 (Asia/Seoul, 중복 방지). Phase 5 EventBridge로 대체 예정.
- **Phase 3** — DB 이관 ✅ 완료
  - [x] P3-1. Supabase 프로젝트 연결 설정 `[BE][DevOps]`
  - [x] P3-2. 마이그레이션 실행 `[BE][DevOps]`
- **Phase 4** — AWS 서버리스 이관 🔄 진행 중
  - [x] P4-1. `infra/` — AWS 핵심 리소스 (Terraform) `[DevOps]` ✅
  - [x] P4-2. Lambda 배포 — script / tts / upload worker `[DevOps][BE]` ✅
  - [x] P4-3. Fargate 배포 — subtitle / render worker `[DevOps]` ✅
  - [x] P4-4. API Gateway + Lambda (`apps/api`) `[DevOps][BE]` ✅
  - [ ] P4-5. AWS E2E 자동 업로드 검증 `[BE][DevOps]`
- **Phase 5** — 스케줄링 + 운영 안정화
  - [ ] P5-1. EventBridge Scheduler — 채널별 cron `[DevOps][BE]`
  - [ ] P5-2. DLQ 알림 Lambda `[BE][DevOps]`
  - [ ] P5-3. CloudWatch 알람 설정 `[DevOps]`
  - [ ] P5-4. 7일 연속 운영 검증 `[BE][DevOps]`
- **Phase 6** — Remotion 전환
  - [ ] P6-1. `render-worker` Remotion 전환 `[FE][BE]`
  - [ ] P6-2. 고성과 스크립트 패턴 → Gemini 프롬프트 반영 `[AI][BE]`
- **Phase 7** — 멀티채널 + 스케일링
  - [ ] P7-1. 채널별 EventBridge 스케줄 자동 생성/삭제 `[BE][DevOps]`
  - [ ] P7-2. Fargate 동적 스케일링 `[DevOps]`
  - [ ] P7-3. 채널 3개 7일 운영 `[BE][DevOps]`
- **Phase 8** — 프로덕션 준비
  - [ ] P8-1. GitHub Actions CI/CD `[DevOps]`
  - [ ] P8-2. Sentry 연동 `[BE]`
  - [ ] P8-3. Edge-TTS → Clova Voice 교체 `[BE][AI]`
  - [ ] P8-4. AWS Budget Alert `[DevOps]`
  - [ ] P8-5. 30일 연속 운영 최종 검증 `[BE][DevOps][FE][AI]`

---

## Phase 0 — 핵심 리스크 검증 (완료)

> TTS·렌더링·업로드를 단독 스크립트로 검증 후 전부 운영 워커(`apps/workers/*`)로 이전 완료.
> - P0-1 TTS (52.4초, PASS) → `apps/workers/tts/src/EdgeTTSAdapter.ts`
> - P0-2 FFmpeg 렌더링 (1080×1920, 54초, PASS) → `apps/workers/render/src/renderer.ts`
> - P0-3 YouTube 업로드 (videoId: HEHyy3p7zpc, PASS) → `apps/workers/upload/src/uploader.ts`
> 전체 파이프라인 로컬 진단: `npx tsx scripts/run-pipeline.ts [주제]`

---

## Phase 1 — 로컬 파이프라인 구현

> 로컬에서 토픽 → YouTube 업로드까지 전 과정을 1회 성공시킨다.

**전제 조건**
- YouTube OAuth2 `refresh_token` 수동 발급 후 `.env.local` 주입 가능
- FFmpeg PATH 등록 완료

- **P1-1.** Monorepo 초기화 `[DevOps]`
  - `package.json` (루트): `private: true`, `packageManager: "pnpm@9.x"`
  - `pnpm-workspace.yaml`: `packages: ["apps/*", "apps/workers/*", "packages/*"]`
  - `turbo.json`: `build` · `dev` · `lint` · `test` 파이프라인 정의
  - `tsconfig.base.json`: `strict: true`, `target: "ES2022"`, `module: "NodeNext"` (ESM)
  - 검증
    - `pnpm install` 성공
    - `turbo build` 오류 없음

- **P1-2.** `packages/shared` — 공통 기반 `[BE]`
  - `prisma/schema.prisma`
    - `Channel`: id, youtubeId, name, niche, refreshToken, uploadSchedule, affiliateUrl?, isActive, subscriberCount, totalViews(BigInt), isYPPQualified, createdAt, updatedAt
    - `Job`: id, channelId, topic, status(JobStatus), retryCount, failReason?, scriptContent?, audioS3Key?, subtitleS3Key?, videoS3Key?, youtubeVideoId?, privacyStatus(@default("public")), viewCount(BigInt), likeCount(BigInt), startedAt?, completedAt?, createdAt, updatedAt
    - `ChannelAnalytics`: id, channelId, date(@db.Date), views(BigInt), subscribers, estimatedRevenue, watchTimeMinutes(BigInt) — `@@unique([channelId, date])`
    - `JobStatus` enum: `PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED`
  - 검증
    - `prisma generate` 성공
    - `JobStatus` 타입 import 가능

- **P1-3.** `apps/api` — POST /jobs `[BE]`
  - NestJS v11 + Fastify Adapter
  - 3계층: `JobsController` → `JobsService` → `JobsRepository`
  - 검증
    - `curl -X POST /jobs` 시 DB에 PENDING Job 생성
    - SQS 메시지 발행 확인

- **P1-4.** `apps/workers/script` `[BE][AI]`
  - 모델: `gemini-2.5-flash` 고정
  - 출력 JSON 8개 필드: `title`, `hook`, `script`, `description`, `scenes[]`, `hashtags`, `thumbnail_text`, `comment_bait`
  - 콘텐츠 방향: 한국 뉴스·시사 특화, 35~45초, 강한 구어체, comment_bait 마무리
  - 검증
    - S3에 `jobs/{jobId}/script.json` 생성, 8개 필드 모두 존재
    - `tts-queue` 발행 확인

- **P1-5.** `apps/workers/tts` `[BE]`
  - Edge-TTS `ko-KR-SunHiNeural` → `audio.mp3`
  - 검증
    - S3에 `audio.mp3` 생성, `ffprobe` 길이 35~45초
    - `subtitle-queue` 발행 확인

- **P1-6.** `apps/workers/subtitle` _(Fargate)_ `[BE][DevOps]`
  - faster-whisper 없음 — VTT 기반 SRT 생성 (VTT 없으면 문자 수 비례 fallback)
  - Edge-TTS 생성 subtitle.vtt → 문장별 타이밍 → 20자 이하 청크 분할
  - 색상 하이라이트 미구현 (ASS BorderStyle=3 불투명 박스 자막만 사용)
  - 검증
    - 로컬 Docker로 S3에 `subtitle.srt` 생성
    - 타임스탬프 구간 합계 = 오디오 총 길이

- **P1-7.** `apps/workers/render` _(Fargate)_ `[BE][DevOps]`
  - `script.json`의 `scenes[]` 배열 기반 Pexels 동영상(우선)/이미지(fallback) 다운로드
  - zoompan 효과 (zoom-in/out, pan-left/right) 클립 생성, `-r 30` fps 정규화, `-stream_loop -1` 루프
  - 클립 concat + 헤더 오버레이(검정 패널+제목 2줄) + 오디오 + ASS 자막 burn-in (FontSize=76, BorderStyle=3 불투명박스, MarginV=510)
  - affiliate CTA 자막 없음
  - 검증
    - 로컬 Docker로 S3에 `output.mp4` 생성
    - 해상도 1080×1920, 오디오 싱크 정상

- **P1-8.** `apps/workers/upload` + 수동 E2E `[BE]`
  - 메타데이터: `title`, `hashtags`, `categoryId: '25'`(뉴스·정치), `privacyStatus: 'public'`, `containsSyntheticMedia: true`
  - 설명란: `scriptContent.description` (Gemini 생성 본문) + 해시태그 (`containsSyntheticMedia: true`로 AI 공시 처리)
  - `prisma.job.update({ youtubeVideoId, privacyStatus: 'public', completedAt, status: 'COMPLETED' })`
  - 검증
    - 각 Worker 개별 실행 성공
    - 모바일 유튜브 앱에서 `#Shorts` 분류·자막·오디오 품질 확인

- **P1-9.** Docker Compose 통합 로컬 환경 `[DevOps]`
  - `localstack`, `postgres`, `api`, 전체 Worker 서비스 구성
  - 검증
    - `docker-compose up` 한 번으로 전체 스택 기동
    - `POST /jobs` 한 번으로 PENDING → COMPLETED 자동 완료

**완료 기준** ✅
- [x] `docker-compose up` 한 번으로 전체 스택 기동
- [x] `POST /jobs` 한 번으로 PENDING → COMPLETED 자동 완료 (수동 개입 없음)
- [x] 모바일 유튜브 앱에서 자막·오디오 품질 합격

---

## Phase 2 — 웹 대시보드

> Next.js 대시보드에서 채널 연결·Job 모니터링·재시도를 사용할 수 있다.  
> docker-compose 로컬 API를 대상으로 개발·검증한다.

- **P2-1.** `apps/web` 초기화 + NextAuth Google OAuth `[FE]`
  - Next.js 15 App Router + TailwindCSS + shadcn/ui
  - TanStack Query v5, Zustand v4
  - 검증
    - Google 로그인 후 `/dashboard` 이동
    - 미인증 `/dashboard` 접근 시 `/login` 리다이렉트

- **P2-2.** `/` — 홈 (토픽 입력·Auto-News·Job 갤러리) `[FE][BE]`
  - 홈 마운트 시 자동 sync (`POST /channels/:id/sync`) 실행
  - Job 카드 갤러리: 상태 Badge, 제목, 조회수 실시간 표시 (2초 폴링)
  - 카테고리 버튼 (종합·경제·기술·의료·환경·사회) → `POST /jobs/auto-news` 호출
  - 검증
    - Job 상태 변경이 2초 이내 반영
    - 채널 미연결 시 입력 폼 disabled

- **P2-3.** `/dashboard/[id]` — 상태 타임라인 + 재시도 `[FE][BE]`
  - `StatusTimeline`: 각 단계 완료/진행/대기 표시
  - `FAILED` 상태: `failReason` 표시 + 재시도 버튼
  - 검증
    - 재시도 버튼 클릭 → `Job.status = PENDING` 초기화 및 파이프라인 재실행

- **P2-4.** `/channels/[id]` — 채널 관리 `[FE][BE]`
  - 업로드 스케줄: cron 표현식 입력 → `PATCH /channels/:id/schedule`
  - YPP 진행률 대시보드
    - 구독자: `subscriberCount / 1000 * 100%`
    - 시청 시간: Analytics `watchTimeMinutes / 240000 * 100%`
  - 성과 테이블: `GET /channels/:id/analytics` → 날짜별 views·subscribers·estimatedRevenue·watchTimeMinutes
  - 검증
    - YPP 진행률 정확 계산 및 표시

- **P2-5.** YouTube OAuth2 채널 연결 + `refresh_token` 암호화 저장 `[BE]`
  - OAuth 스코프: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`
  - `refresh_token` AES-256-GCM 암호화 → DB 저장
  - 검증
    - DB `Channel.refreshToken` 암호화 저장 확인

- **P2-6.** `POST /jobs/auto-news` — Google News RSS 수집 + Job 일괄 생성 `[BE]`
  - Google News RSS (`news.google.com/rss`, 한국어/KR) 파싱
  - 카테고리: top / business / technology / health / science / nation (politics 제거)
  - count 1~5개 Job 일괄 생성
  - 검증
    - 뉴스 제목이 topic으로 설정된 Job N개 생성 확인

- **P2-7.** `POST /channels/:id/sync` — 풀 동기화 `[BE]`
  - `channels.list(part: statistics)` → subscriberCount, totalViews 갱신
  - `youtubeAnalytics.reports.query(metrics: views,subscribersGained,estimatedMinutesWatched)` → 최근 30일 일별 upsert
  - `videos.list(part: id,statistics,status)` → viewCount, likeCount, privacyStatus 갱신
  - 검증
    - DB에 최근 30일 ChannelAnalytics 레코드 존재

- **P2-8.** 삭제 영상 자동 감지 + FAILED 처리 `[BE]`
  - `sync-videos`: YouTube에서 조회되지 않는 영상 → `status=FAILED`, `failReason='유튜브에서 영상이 삭제되었습니다.'`
  - 검증
    - 유튜브에서 삭제된 영상 Job이 DB에서 FAILED로 전환 확인

- **P2-9.** `Job.privacyStatus` 추적 `[BE]`
  - 업로드 완료 시 `privacyStatus: 'public'` 저장
  - sync-videos 시 YouTube API 응답의 `status.privacyStatus` 동기화
  - 검증
    - Job 상세에서 privacyStatus 표시

**완료 기준** ✅
- [x] 대시보드에서 채널·Job 관리 전 기능 동작
- [x] 재시도 기능 정상 동작
- [x] Analytics 데이터 수집 및 YPP 진행률 표시
- [x] 뉴스 자동 수집 + Job 생성 (`auto-news`)

> Playwright 검증 완료: 로그인, 대시보드 채널·Job 목록·통계, Job 상세·타임라인, 재시도, 2초 폴링, 채널 sync 모두 정상 동작.

---

## Phase 3 — DB 이관

> 로컬 Docker PostgreSQL에서 Supabase(관리형 PostgreSQL)로 DB를 이관하고, AWS Worker들이 사용할 프로덕션 DB 연결을 확보한다.

**전제 조건**
- Supabase 계정 및 프로젝트 생성 완료

- **P3-1.** Supabase 프로젝트 연결 설정 `[BE][DevOps]`
  - Supabase 프로젝트 생성 + Connection String 확인
  - `schema.prisma`에 `directUrl = env("DIRECT_URL")` 추가
  - `DATABASE_URL`: Transaction mode (pgBouncer, 포트 6543), `connection_limit=1`
  - `DIRECT_URL`: Session mode (포트 5432), 마이그레이션 전용
  - AWS Secrets Manager에 `DATABASE_URL`, `DIRECT_URL` 저장
  - 검증
    - Prisma가 Supabase에 연결 성공 (`prisma db pull` 또는 `prisma validate`)

- **P3-2.** 마이그레이션 실행 `[BE][DevOps]`
  - `DIRECT_URL` 기반 `prisma migrate deploy` 실행
  - 전체 테이블 + enum 존재 확인
  - 검증
    - `prisma.job.findMany({ take: 5 })` 성공
    - Supabase 대시보드 Table Editor에서 테이블 목록 확인

**완료 기준** ✅
- [x] Supabase에 마이그레이션 완료 (전체 테이블 + enum 존재)
- [x] `prisma.job.findMany({ take: 5 })` 성공
- [ ] AWS Secrets Manager에 DB 연결 정보 저장 완료 → P4-1 진행 시 처리

---

## Phase 4 — AWS 서버리스 이관

> 로컬 파이프라인을 Lambda + SQS + Fargate + S3로 이관하고, E2E 자동 업로드를 1회 성공시킨다.

**전제 조건**
- AWS 계정 및 IAM 관리자 권한 보유
- Phase 3 완료 (Supabase DB 연결 확보)

- **P4-1.** `infra/` — AWS 핵심 리소스 (Terraform) `[DevOps]`
  - S3 버킷, SQS 5큐+DLQ, IAM 역할, ECR 레포 (`subtitle-worker`, `render-worker`)
  - 검증
    - AWS 콘솔에서 S3 1개, SQS 10개, IAM 2개, ECR 2개 확인

- **P4-2.** Lambda 배포 — script / tts / upload worker `[DevOps][BE]`
  - 각 Worker `serverless.yml` (Serverless Framework v3)
  - 검증
    - Lambda 콘솔 테스트 이벤트 각 Worker 실행 성공

- **P4-3.** Fargate 배포 — subtitle / render worker `[DevOps]`
  - subtitle-worker: 2 vCPU, 8GB
  - render-worker: 4 vCPU, 16GB (`PEXELS_API_KEY` 환경변수 포함)
  - ECR 이미지 빌드 및 푸시 완료
  - ECS task definition revision 2 (SSM 시크릿 적용): `DATABASE_URL`, `PEXELS_API_KEY`
  - `FargateTaskExecutionRole`에 SSM 인라인 정책 추가
  - ECS 서비스 desired_count=1, 배포 COMPLETED
  - 검증
    - SQS Long Polling 시작 확인 ✅

- **P4-4.** API Gateway + Lambda (`apps/api`) `[DevOps][BE]`
  - `apps/api/src/lambda.ts` — `@fastify/aws-lambda` 핸들러 (NestJS + Fastify 래핑)
  - `apps/api/serverless.yml` — HTTP API (API Gateway v2), timeout 29s, 512MB
  - SSM 파라미터 추가: `SQS_SCRIPT_QUEUE_URL`, `API_INTERNAL_SECRET`, `WEB_ORIGIN`
  - API Gateway URL: `https://wc2kcpa4k3.execute-api.ap-northeast-2.amazonaws.com`
  - `shorts.prod.YOUTUBE_REDIRECT_URI` SSM 업데이트 완료 (OAuth callback URL 반영)
  - 검증
    - `GET /health` → `{ status: 'ok' }` ✅

- **P4-5.** AWS E2E 자동 업로드 검증 `[BE][DevOps]`
  - 검증
    - `POST /jobs` 한 번으로 YouTube 업로드 자동 완료

**완료 기준**
- [ ] AWS E2E 파이프라인 자동 완료 1회 성공
- [ ] S3에 4개 파일 모두 존재 (`script.json` / `audio.mp3` / `subtitle.srt` / `output.mp4`)
- [ ] CloudWatch에서 각 Worker 로그 확인 가능

---

## Phase 5 — 스케줄링 + 운영 안정화

> EventBridge로 매일 자동 Job 생성을 활성화하고, 7일 연속 무중단 운영을 검증한다.

- **P5-1.** EventBridge Scheduler — 채널별 cron `[DevOps][BE]`
  - API 인-프로세스 스케줄러(P2-10)를 EventBridge 외부 cron으로 대체
  - 채널 `uploadSchedule` 필드 기반 cron 스케줄 (채널별 EventBridge Rule 생성/삭제)
  - `topic: null` → `auto-news`로 자동 처리
  - 검증
    - 다음 날 지정 시간에 Job 자동 생성

- **P5-2.** DLQ 알림 Lambda `[BE][DevOps]`
  - 5개 DLQ 모두 동일 Lambda에 연결 → Slack/Discord Webhook
  - 검증
    - 3회 재시도 후 DLQ 적재 → 알림 수신 (1분 이내)

- **P5-3.** CloudWatch 알람 설정 `[DevOps]`
  - Lambda / Fargate 에러율 > 5% → SNS → 이메일 알람
  - 검증
    - CloudWatch 알람 설정 확인

- **P5-4.** 7일 연속 운영 검증 `[BE][DevOps]`
  - 실패율 = `FAILED / (COMPLETED + FAILED) * 100 ≤ 3%`
  - 검증
    - 7일간 실패율 3% 이하
    - 매일 YouTube 업로드 완료

**완료 기준**
- [ ] 7일 연속 자동 업로드 성공 (실패율 3% 이하)
- [ ] DLQ 적재 시 알림 수신 확인

---

## Phase 6 — Remotion 전환

> FFmpeg → Remotion으로 렌더러를 교체한다.

**전제 조건**: Remotion이 Fargate(Linux amd64) headless 환경에서 렌더링 가능한지 사전 검증

- **P6-1.** `render-worker` Remotion 전환 `[FE][BE]`
  - `ShortsVideo.tsx`: 루트 컴포넌트 (1080×1920, fps: 30)
  - `SubtitleLayer.tsx`: 현재 frame 기반 단어 하이라이트
  - `renderMedia()`: `codec: 'h264'`, headless
  - 검증
    - 1080×1920 `output.mp4` 생성
    - 단어별 자막 강조 동작 확인
    - 모바일 앱에서 기존 FFmpeg 출력과 동등 이상 품질

- **P6-2.** 고성과 스크립트 패턴 → Gemini 프롬프트 반영 `[AI][BE]`
  - `viewCount` 상위 20% Job의 `scriptContent` 분석
  - 고성과 hook 예시 3~5개 few-shot 삽입
  - 검증
    - 샘플 10개 생성 후 hook 품질 개선 확인

**완료 기준**
- [ ] Remotion 렌더링 결과 모바일 품질 합격

---

## Phase 7 — 멀티채널 + 스케일링

> 채널 10개를 추가 인프라 변경 없이 독립적으로 운영할 수 있다.

- **P7-1.** 채널별 EventBridge 스케줄 자동 생성/삭제 `[BE][DevOps]`
- **P7-2.** Fargate 동적 스케일링 `[DevOps]`
  - `render-queue` 메시지 수 기반 Auto Scaling
- **P7-3.** Analytics 다채널 수집 + 채널 3개 7일 운영 `[BE][DevOps]`

**완료 기준**
- [ ] 채널 3개 동시 운영 7일 성공 (실패율 3% 이하)

---

## Phase 8 — 프로덕션 준비

> CI/CD, 에러 추적, TTS 업그레이드, 30일 안정성 검증.

- **P8-1.** GitHub Actions CI/CD `[DevOps]`
- **P8-2.** Sentry 연동 `[BE]`
- **P8-3.** Edge-TTS → Clova Voice 교체 `[BE][AI]`
- **P8-4.** AWS Budget Alert `[DevOps]`
- **P8-5.** 30일 연속 운영 최종 검증 `[BE][DevOps][FE][AI]`

**완료 기준 (전체 플랫폼)**
- [ ] 채널 3개에서 30일 연속 자동 업로드 성공
- [ ] 실패율 3% 이하
- [ ] 월 운영 비용 $10 이하
- [ ] 모바일 유튜브 앱에서 자막·오디오 품질 합격
- [ ] 대시보드 전 기능 동작

---

## Phase 의존 관계

```
Phase 0 — 핵심 리스크 검증
  └── Phase 1 — 로컬 파이프라인 구현
        └── Phase 2 — 웹 대시보드 (docker-compose 기반 로컬 개발)
              └── Phase 3 — DB 이관 (Supabase)
                    └── Phase 4 — AWS 서버리스 이관
                          ├── Phase 5 — 스케줄링 + 운영 안정화
                          │     └── Phase 6 — Remotion 전환
                          └── Phase 7 — 멀티채널 + 스케일링
                                       │
                          Phase 6 + Phase 7 완료 ▼
                               Phase 8 — 프로덕션 준비
```

**Phase별 시작 조건:**

| Phase | 선행 Phase | 시작 조건 |
|---|---|---|
| Phase 1 | Phase 0 | TTS·FFmpeg·YouTube API 3종 로컬 검증 통과 |
| Phase 2 | Phase 1 | `docker-compose up` 한 번으로 `POST /jobs` → COMPLETED 자동 완료 |
| Phase 3 | Phase 2 | 대시보드 전 기능 로컬 동작, 재시도 기능 정상 동작 |
| Phase 4 | Phase 3 | Supabase DB 연결 및 마이그레이션 완료 |
| Phase 5 | Phase 4 | AWS E2E 자동 업로드 1회 성공 |
| Phase 6 | Phase 5 | 7일 연속 실패율 3% 이하 |
| Phase 7 | Phase 4 | AWS E2E 완료 |
| Phase 8 | Phase 6 + Phase 7 | Remotion 완료 AND 채널 3개 7일 운영 + 실패율 3% 이하 |
