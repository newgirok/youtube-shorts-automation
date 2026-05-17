# 로드맵 — AI 유튜브 쇼츠 자동화 플랫폼

> 기반 문서: docs/prd.md, shrimp-rules.md  
> 원칙: 각 Phase의 완료 기준을 충족해야 다음 Phase로 진행한다.

---

## 진행 현황

- **Phase 0** — 핵심 리스크 검증
  - [✓] P0-1. `scripts/test-tts.ts` — TTS 음성 품질 `[BE]` _(52.4초, PASS)_
  - [✓] P0-2. `scripts/test-whisper.ts` — Whisper 자막 인식률 `[BE][AI]` _(한국어 7블록, PASS)_
  - [✓] P0-3. `scripts/test-render.ts` — FFmpeg 렌더링 품질 `[BE][DevOps]` _(1080×1920, 54초, PASS)_
  - [✓] P0-4. `scripts/test-upload.ts` — YouTube Data API 업로드 `[BE]` _(videoId: HEHyy3p7zpc, private 업로드·#Shorts 분류·refresh_token 재발급 PASS)_
- **Phase 1** — 로컬 파이프라인 구현
  - [✓] P1-1. Monorepo 초기화 `[DevOps]`
  - [✓] P1-2. `packages/shared` — 공통 기반 `[BE]`
  - [✓] P1-3. `apps/api` — POST /jobs `[BE]`
  - [✓] P1-4. `apps/workers/script` `[BE][AI]`
  - [✓] P1-5. `apps/workers/tts` `[BE]`
  - [✓] P1-6. `apps/workers/subtitle` _(Fargate)_ `[BE][AI][DevOps]`
  - [✓] P1-7. `apps/workers/render` _(Fargate)_ `[BE][DevOps]`
  - [✓] P1-8. `apps/workers/upload` + 수동 E2E `[BE]`
  - [✓] P1-9. Docker Compose 통합 로컬 환경 `[DevOps]`
- **Phase 2** — 웹 대시보드
  - [✓] P2-1. `apps/web` 초기화 + NextAuth Google OAuth `[FE]`
  - [✓] P2-2. `/dashboard` — Job 카드 피드 + 2초 폴링 `[FE][BE]`
  - [✓] P2-3. `/dashboard/[id]` — 상태 타임라인 + 재시도 `[FE][BE]`
  - [✓] P2-4. `/channels/[id]` — 채널 관리 `[FE][BE]`
  - [✓] P2-5. YouTube OAuth2 채널 연결 + `refresh_token` 암호화 저장 `[BE]`
- **Phase 3** — AWS 서버리스 이관
  - [ ] P3-1. `infra/` — AWS 핵심 리소스 (Terraform) `[DevOps]`
  - [ ] P3-2. Supabase 연결 + 마이그레이션 `[BE][DevOps]`
  - [ ] P3-3. Lambda 배포 — script / tts / upload worker `[DevOps][BE]`
  - [ ] P3-4. Fargate 배포 — subtitle / render worker `[DevOps]`
  - [ ] P3-5. API Gateway + Lambda (`apps/api`) `[DevOps][BE]`
  - [ ] P3-6. AWS E2E 자동 업로드 검증 `[BE][DevOps]`
- **Phase 4** — 스케줄링 + 운영 안정화
  - [ ] P4-1. EventBridge Scheduler — 채널별 cron `[DevOps][BE]`
  - [ ] P4-2. DLQ 알림 Lambda `[BE][DevOps]`
  - [ ] P4-3. CloudWatch 알람 + 쿠팡 파트너스 CTA 렌더링 `[DevOps][BE]`
  - [ ] P4-4. 7일 연속 운영 검증 `[BE][DevOps]`
- **Phase 5** — Remotion 전환 + Analytics
  - [ ] P5-1. `render-worker` Remotion 전환 `[FE][BE]`
  - [ ] P5-2. YouTube Analytics API 수집 `[BE]`
  - [ ] P5-3. 고성과 스크립트 패턴 → Gemini 프롬프트 반영 `[AI][BE]`
- **Phase 6** — 멀티채널 + 스케일링
  - [ ] P6-1. 채널별 EventBridge 스케줄 자동 생성/삭제 `[BE][DevOps]`
  - [ ] P6-2. Fargate 동적 스케일링 `[DevOps]`
  - [ ] P6-3. Analytics 다채널 수집 + 채널 3개 7일 운영 `[BE][DevOps]`
- **Phase 7** — 프로덕션 준비
  - [ ] P7-1. GitHub Actions CI/CD `[DevOps]`
  - [ ] P7-2. Sentry 연동 `[BE]`
  - [ ] P7-3. Edge-TTS → Clova Voice 교체 `[BE][AI]`
  - [ ] P7-4. AWS Budget Alert `[DevOps]`
  - [ ] P7-5. 30일 연속 운영 최종 검증 `[BE][DevOps][FE][AI]`

---

## Phase 0 — 핵심 리스크 검증

> 인프라 구성 전, 단독 스크립트로 콘텐츠 품질과 외부 API 연동 가능성을 검증한다.

- **P0-1.** `scripts/test-tts.ts` — TTS 음성 품질 `[BE]`
  - 구현
    - `edge-tts` 설치, 음성: `ko-KR-SunHiNeural`
    - 입력: 500자 한국어 샘플 스크립트
    - 출력: `scripts/output/test-audio.mp3`
    - `ffprobe -show_entries format=duration` 으로 길이 자동 측정·출력
  - 검증
    - MP3 길이 45~55초
    - AI 억양 최소화, 자연스러운 한국어 발음

- **P0-2.** `scripts/test-whisper.ts` — Whisper 자막 인식률 `[BE][AI]`
  - 구현
    - Python `faster-whisper`, 모델: `large-v3`, 언어: `ko`
    - `child_process.execSync` 로 Python 스크립트 호출
    - 입력: `scripts/output/test-audio.mp3`
    - 출력: `scripts/output/test-subtitle.srt`
    - 원본 스크립트와 단어 단위 비교 → 인식률(%) 콘솔 출력
    - 타임스탬프 오차(초) 계산·출력
  - 검증
    - 한국어 인식률 90% 이상
    - 타임스탬프 오차 ±0.3초 이내

- **P0-3.** `scripts/test-render.ts` — FFmpeg 렌더링 품질 `[BE][DevOps]`
  - 구현
    - 배경: `scripts/assets/bg.mp4` 또는 FFmpeg `color` 필터로 생성
    - FFmpeg: 1080×1920 crop/scale + 오디오 `-shortest` + `subtitles` 필터 (`NanumGothic`, `MarginV=120`)
    - 출력: `scripts/output/test-output.mp4`
    - `ffprobe` 로 해상도·길이·오디오 스트림 정보 출력
    - 실제 모바일 기기에서 자막 잘림·싱크 육안 확인
  - 검증
    - 해상도 1080×1920
    - 한글 자막 정상 렌더링, 안전 영역 이탈 없음
    - 오디오 싱크 정상

- **P0-4.** `scripts/test-upload.ts` — YouTube Data API 업로드 `[BE]`
  - 구현
    - `googleapis` `OAuth2Client` 초기화
    - `.env.local` 에서 `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` Zod 검증 로드
    - `refresh_token → access_token` 재발급 흐름 실행·로그 출력
    - `scripts/output/test-output.mp4` → `privacyStatus: 'private'` 업로드
    - `videoId` 추출, `#Shorts` 분류 여부 확인
    - 소비된 API quota 콘솔 출력
    - `.env.example` 생성 (키 이름만, 실제 값 없음)
  - 검증
    - private 영상 업로드 성공
    - `#Shorts` 분류 확인
    - `refresh_token` 재발급 정상
    - quota 소비량 출력

**완료 기준**
- [✓] P0-1 ~ P0-4 모두 검증 통과
- [✓] 실패 항목 원인 문서화 및 해결 방법 확정 _(전 항목 PASS, 실패 없음)_

---

## Phase 1 — 로컬 파이프라인 구현

> 로컬에서 토픽 → YouTube 업로드까지 전 과정을 1회 성공시킨다.

**전제 조건**
- YouTube OAuth2 `refresh_token` 수동 발급 후 `.env.local` 주입 가능
- 로컬 FFmpeg, Python + faster-whisper 설치 완료

- **P1-1.** Monorepo 초기화 `[DevOps]`
  - `package.json` (루트): `private: true`, `packageManager: "pnpm@9.x"`
  - `pnpm-workspace.yaml`: `packages: ["apps/*", "apps/workers/*", "packages/*"]`
  - `turbo.json`: `build` · `dev` · `lint` · `test` 파이프라인 정의
  - `tsconfig.base.json`: `strict: true`, `target: "ES2022"`, `module: "NodeNext"`
  - `.eslintrc.js`: `no-explicit-any: "error"`, `no-console: "error"`
  - `.gitignore`: `.env`, `.env.*`, `!.env.example`, `!**/.env.example`, `node_modules`, `dist`, `.turbo`
  - 검증
    - `pnpm install` 성공
    - `turbo build` 오류 없음

- **P1-2.** `packages/shared` — 공통 기반 `[BE]`
  - `prisma/schema.prisma`
    - `Channel`: id, youtubeId, name, niche, refreshToken, uploadSchedule, affiliateUrl?, isActive, subscriberCount, totalViews, isYPPQualified
    - `Job`: id, channelId, topic, status(JobStatus), retryCount, failReason?, scriptContent?, audioS3Key?, subtitleS3Key?, videoS3Key?, youtubeVideoId?, viewCount, likeCount, startedAt?, completedAt?, createdAt
    - `ChannelAnalytics`: id, channelId, date(@db.Date), views, subscribers, estimatedRevenue — `@@unique([channelId, date])`
    - `JobStatus` enum: `PENDING → SCRIPT_PROCESSING → TTS_PROCESSING → SUBTITLE_PROCESSING → RENDER_PROCESSING → UPLOAD_PROCESSING → COMPLETED / FAILED`
  - `src/prisma.ts`: Lambda 싱글턴 패턴
  - `src/s3.ts`: `uploadToS3(key, body)`, `downloadFromS3(key)`, `jobKey(jobId, filename)` → `jobs/${jobId}/${filename}`
  - `src/logger.ts`: `createLogger({ jobId, channelId })` → 모든 로그에 컨텍스트 자동 바인딩
  - `src/env.ts`: Zod — `DATABASE_URL`, `AWS_REGION`, `S3_BUCKET_NAME` (각 Worker가 extend)
  - 검증
    - `prisma generate` 성공
    - `JobStatus` 타입 import 가능
    - `createLogger` 반환 로그에 `jobId` / `channelId` 포함

- **P1-3.** `apps/api` — POST /jobs `[BE]`
  - NestJS v11 + Fastify Adapter
  - 3계층: `JobsController` (파싱만) → `JobsService` (비즈니스) → `JobsRepository` (Prisma)
  - `CreateJobDto`: `channelId`, `topic` Zod 검증
  - `JobsService.create()`
    - `prisma.job.create({ data: { channelId, topic, status: 'PENDING' } })`
    - `@aws-sdk/client-sqs` `SendMessageCommand` → `SQS_SCRIPT_QUEUE_URL`
    - 메시지 바디: `{ jobId, channelId, topic }`
  - `packages/shared/src/env.ts` 에 `SQS_SCRIPT_QUEUE_URL` 추가
  - 검증
    - `curl -X POST /jobs` 시 DB에 PENDING Job 생성
    - SQS 메시지 발행 확인

- **P1-4.** `apps/workers/script` `[BE][AI]`
  - 입력: `SQSEvent` → `{ jobId, channelId, topic }`
  - `Job.status → SCRIPT_PROCESSING`, `startedAt: new Date()`
  - Google Gemini API
    - `model: 'gemini-2.0-flash'` 고정
    - 출력 JSON 7개 필드 검증: `title`, `hook`, `script`, `hashtags`, `thumbnail_text`, `affiliate_product`, `affiliate_cta`
  - S3: `jobs/${jobId}/script.json` 업로드, `prisma.job.update({ scriptContent })`
  - SQS: `SQS_TTS_QUEUE_URL` → `{ jobId, channelId, scriptS3Key }`
  - 실패 시: `status: 'FAILED', failReason: error.message`
  - 검증
    - S3에 `jobs/{jobId}/script.json` 생성, 7개 필드 모두 존재
    - `tts-queue` 발행 확인

- **P1-5.** `apps/workers/tts` `[BE]`
  - 입력: `{ jobId, channelId, scriptS3Key }`
  - S3 `script.json` → `script` 필드 추출
  - `Job.status → TTS_PROCESSING`
  - Edge-TTS `ko-KR-SunHiNeural` → `/tmp/audio.mp3`
  - S3: `jobs/${jobId}/audio.mp3` 업로드, `prisma.job.update({ audioS3Key })`
  - SQS: `SQS_SUBTITLE_QUEUE_URL` → `{ jobId, channelId, audioS3Key }`
  - 검증
    - S3에 `audio.mp3` 생성, `ffprobe` 길이 45~55초
    - `subtitle-queue` 발행 확인

- **P1-6.** `apps/workers/subtitle` _(Fargate)_ `[BE][AI][DevOps]`
  - SQS Long Polling 루프 (`WaitTimeSeconds: 20`)
  - heartbeat: 처리 중 30초마다 `ChangeMessageVisibility` 호출 → Visibility Timeout 연장 (처리 완료 전 만료 방지)
  - S3 `audio.mp3` → `/tmp/{jobId}-audio.mp3`
  - `Job.status → SUBTITLE_PROCESSING`
  - `execSync`: `faster-whisper --model large-v3 --language ko --output_format srt /tmp/{jobId}-audio.mp3`
  - S3: `jobs/${jobId}/subtitle.srt` 업로드, `prisma.job.update({ subtitleS3Key })`
  - SQS: `SQS_RENDER_QUEUE_URL` → `{ jobId, channelId, audioS3Key, subtitleS3Key }`
  - `apps/workers/subtitle/Dockerfile`
    - `python:3.11-slim` + `faster-whisper`
    - `node:20-slim` 멀티스테이지 빌드
  - 검증
    - 로컬 Docker로 S3에 `subtitle.srt` 생성
    - 한국어 인식률 90% 이상

- **P1-7.** `apps/workers/render` _(Fargate)_ `[BE][DevOps]`
  - SQS Long Polling 루프
  - heartbeat: 처리 중 30초마다 `ChangeMessageVisibility` 호출 → Visibility Timeout 연장
  - S3 `audio.mp3`, `subtitle.srt` 다운로드
  - `Job.status → RENDER_PROCESSING`
  - `Channel.affiliateUrl` 조회 → 존재 시 SRT 끝에 CTA 세그먼트 추가
    - 타이밍: `영상 길이 - 8초 ~ 끝`
    - 텍스트: `script.json`의 `affiliate_cta`
  - FFmpeg: 1080×1920 crop/scale + `subtitles` 필터 (`NanumGothic`, `FontSize=18`, `MarginV=120`) + `-c:v libx264 -crf 23 -c:a aac -shortest`
  - S3: `jobs/${jobId}/output.mp4` 업로드, `prisma.job.update({ videoS3Key })`
  - SQS: `SQS_UPLOAD_QUEUE_URL` → `{ jobId, channelId, videoS3Key }`
  - `apps/workers/render/Dockerfile`: FFmpeg + NanumGothic 폰트
  - 검증
    - 로컬 Docker로 S3에 `output.mp4` 생성
    - 해상도 1080×1920, 오디오 싱크 정상

- **P1-8.** `apps/workers/upload` + 수동 E2E `[BE]`
  - 입력: `{ jobId, channelId, videoS3Key }`
  - `Job.status → UPLOAD_PROCESSING`
  - DB `Channel.refreshToken` → AES-256-GCM 복호화
  - `OAuth2Client.refreshAccessToken()` → `access_token` (DB 저장 금지)
  - S3 `output.mp4` 스트리밍 → `youtube.videos.insert()` resumable upload
  - 메타데이터: `title`, `hashtags`, `categoryId: '22'`, `privacyStatus: 'public'`
  - `prisma.job.update({ youtubeVideoId, completedAt, status: 'COMPLETED' })`
  - 실패 시: `status: 'FAILED', failReason`
  - 수동 E2E 절차 (각 Worker 개별 동작 확인)
    1. `POST /jobs` → PENDING Job 생성
    2. script-worker 수동 실행 → S3 `script.json` 확인
    3. tts-worker 수동 실행 → S3 `audio.mp3` 확인
    4. subtitle-worker Docker → S3 `subtitle.srt` 확인
    5. render-worker Docker → S3 `output.mp4` 확인
    6. upload-worker 수동 실행 → YouTube 업로드 확인
  - 검증
    - 각 Worker 개별 실행 성공
    - 모바일 앱에서 `#Shorts` 분류·자막·오디오 품질 확인

- **P1-9.** Docker Compose 통합 로컬 환경 `[DevOps]`
  - `docker-compose.yml` 서비스 구성
    - `localstack`: SQS 5개 큐 + S3 버킷 자동 생성
    - `postgres`: PostgreSQL 14, `prisma migrate deploy` 자동 실행
    - `api`: NestJS (`http://localhost:3000`)
    - `script-worker`, `tts-worker`, `upload-worker`: Lambda 핸들러를 Node.js SQS 폴링 루프로 직접 실행
    - `subtitle-worker`, `render-worker`: 기존 `docker/*/Dockerfile` 재사용
  - `localstack/init/init-aws.sh`
    - `awslocal sqs create-queue --queue-name script-queue` (5개 큐 + DLQ 5개)
    - `awslocal s3 mb s3://jobs-local`
  - `.env.local`: `localhost` 기준 주소 사용 (`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shorts`, `AWS_ENDPOINT_URL=http://localhost:4566`). Docker Compose 실행 시 `docker-compose.yml`의 `x-docker-env` 앵커가 컨테이너 내부 호스트명(`postgres:5432`, `localstack:4566`)으로 자동 오버라이드
  - 검증
    - `docker-compose up` 한 번으로 전체 스택 기동 (AWS 자격증명·과금 없음)
    - `curl -X POST http://localhost:3000/jobs` → LocalStack SQS 전파 → DB `COMPLETED` + S3 `output.mp4` 자동 생성
    - upload-worker만 실제 YouTube 자격증명 사용 (`.env.local`에 `YOUTUBE_REFRESH_TOKEN` 주입)

**완료 기준**
- [ ] `docker-compose up` 한 번으로 전체 스택 기동
- [ ] `POST /jobs` 한 번으로 PENDING → COMPLETED 자동 완료 (수동 개입 없음)
- [ ] 모바일 유튜브 앱에서 자막·오디오 품질 합격

---

## Phase 2 — 웹 대시보드

> Next.js 대시보드에서 채널 연결·Job 모니터링·재시도를 사용할 수 있다.  
> docker-compose 로컬 API를 대상으로 개발·검증한다.

- **P2-1.** `apps/web` 초기화 + NextAuth Google OAuth `[FE]`
  - Next.js 15 App Router + TailwindCSS + shadcn/ui
  - 컴포넌트 설계 원칙: 서버 컴포넌트가 기본 — `'use client'`는 인터랙션이 필요한 컴포넌트에만
    - 레이아웃, 초기 데이터 로드 → 서버 컴포넌트
    - 버튼 클릭, 폼 입력, TanStack Query 폴링 → 클라이언트 컴포넌트
  - TanStack Query v5 (`QueryClientProvider`), Zustand v4
  - `src/auth.ts`: `GoogleProvider`, `JWT` 세션 전략
  - `src/middleware.ts`: `matcher: ['/((?!api|_next|login).*)']` → 미인증 시 `/login` 리다이렉트
  - `src/app/(auth)/login/page.tsx`: `signIn('google')` 버튼
  - 환경변수: `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - 검증
    - Google 로그인 후 `/dashboard` 이동
    - 미인증 `/dashboard` 접근 시 `/login` 리다이렉트

- **P2-2.** `/dashboard` — Job 카드 피드 + 2초 폴링 `[FE][BE]`
  - `app/(dashboard)/dashboard/page.tsx`: 서버 컴포넌트, 채널 목록 초기 로드
  - `DashboardClient` (`'use client'`): 채널 탭 + 날짜별 Job 카드 피드
  - `useQuery({ queryKey: ['jobs', channelId, date], refetchInterval: 2000 })` → `GET /api/jobs?channelId&date`
  - `JobCard`: status Badge, 날짜, 제목 (`scriptContent.title`), 조회수
  - 이번 달 요약 카드: 총 업로드·성공/실패 수·총 조회수
  - `app/(dashboard)/page.tsx` (`HomeClient`): 토픽 입력 폼 통합 + `POST /jobs` 호출 → 생성된 `/dashboard/{id}` 리다이렉트
  - `apps/api` 에 `GET /channels` 엔드포인트 추가
    - `prisma.channel.findMany({ where: { isActive: true }, select: { id, name, niche } })`
  - `apps/api` 에 `GET /jobs` 엔드포인트 추가
    - `prisma.job.findMany({ where, select: { id, status, createdAt, scriptContent, viewCount }, orderBy })`
  - 검증
    - Job 상태 변경이 2초 이내 반영
    - 채널 탭 전환 시 해당 채널 Job만 표시
    - `/dashboard` 토픽 입력 → `POST /jobs` 성공 후 `/dashboard/{id}` 리다이렉트

- **P2-3.** `/dashboard/[id]` — 상태 타임라인 + 재시도 `[FE][BE]`
  - `StatusTimeline`: `PENDING → SCRIPT → TTS → SUBTITLE → RENDER → UPLOAD → COMPLETED` 단계별 표시
    - 각 단계: 완료/진행 중/대기 아이콘, 시작 시각, 소요 시간
  - `FAILED` 상태: `failReason` 표시 + 재시도 버튼
  - `POST /jobs/:id/retry`: `status: 'PENDING'`, `retryCount + 1`, `failReason: null` → `script-queue` 재발행
  - YouTube 완료 시: 영상 썸네일 + 링크 표시
  - `useQuery({ refetchInterval: (data) => data?.status === 'COMPLETED' || data?.status === 'FAILED' ? false : 2000 })`
  - 검증
    - 재시도 버튼 클릭 → `Job.status = PENDING` 초기화 및 파이프라인 재실행

- **P2-4.** `/channels/[id]` — 채널 관리 `[FE][BE]`
  - 업로드 스케줄: cron 표현식 입력 → `PATCH /channels/:id/schedule` → EventBridge `UpdateScheduleCommand`
  - 토픽 큐: CRUD + `@dnd-kit/core` 드래그앤드롭 순서 변경
  - 성과 테이블: `GET /channels/:id/analytics` → `ChannelAnalytics` 날짜별 views·subscribers·estimatedRevenue
  - YPP 진행률
    - 구독자: `subscriberCount / 1000 * 100%`
    - 시청 시간: `totalViews / 4000 * 100%`
  - 채널 토글: `isActive` → EventBridge `ENABLED` / `DISABLED`
  - 검증
    - 스케줄 변경 후 EventBridge 콘솔 cron 업데이트 확인
    - 토픽 큐 CRUD 동작, YPP 진행률 정확 계산

- **P2-5.** YouTube OAuth2 채널 연결 + `refresh_token` 암호화 저장 `[BE]`
  - `GET /auth/youtube`: Google OAuth 동의 화면 redirect (scope: `youtube.upload`, `youtube.readonly`)
  - `GET /auth/youtube/callback`: `code → tokens` 교환
  - `refresh_token` AES-256-GCM 암호화
    - `iv = crypto.randomBytes(12)`
    - `aes-256-gcm` 암호화 → DB 저장 형식: `${iv.hex}:${authTag.hex}:${encrypted.hex}`
  - `access_token` DB 저장 금지 (런타임에서만 사용)
  - `Channel` upsert: `youtubeId`, `name`, `refreshToken`(암호화), `niche`
  - 연결 완료 후 `/channels/{channelId}` 리다이렉트
  - 검증
    - DB `Channel.refreshToken` 암호화 저장 확인
    - DB에 `access_token` 컬럼 없음 확인

**완료 기준**
- [✓] 대시보드에서 채널·Job 관리 전 기능 동작
- [✓] 재시도 기능 정상 동작

> Playwright 검증 (2026-05-11): 로그인 ✓, 대시보드 채널·Job 목록·통계 패널 ✓, Job 상세·처리 단계 타임라인 ✓, 재시도 버튼 → PENDING 전환·retryCount 증가 ✓, 2초 폴링 상태 자동 갱신 ✓.

---

## Phase 3 — AWS 서버리스 이관

> 로컬 파이프라인을 Lambda + SQS + Fargate + S3로 이관하고, E2E 자동 업로드를 1회 성공시킨다.

**전제 조건**
- AWS 계정 및 IAM 관리자 권한 보유
- ECR 레포지토리 생성 권한 보유

- **P3-1.** `infra/` — AWS 핵심 리소스 (Terraform) `[DevOps]`
  - `infra/s3.tf`
    - 버킷명: `youtube-shorts-jobs-{env}`
    - 수명 주기: 30일 후 객체 만료, 퍼블릭 액세스 차단
  - `infra/sqs.tf`
    - 큐 5개: `script-queue`, `tts-queue`, `subtitle-queue`, `render-queue`, `upload-queue`
    - 각 큐별 DLQ, `maxReceiveCount: 3`, DLQ 보존 14일
    - Visibility Timeout: script 120s / tts 240s / subtitle 600s / render 1,200s / upload 600s
  - `infra/iam.tf`
    - `LambdaExecutionRole`: S3(Get·Put) + SQS(Receive·Delete·Send) + Secrets Manager(Get)
    - `FargateTaskRole`: S3(Get·Put) + SQS(Receive·Delete·Send·ChangeMessageVisibility)
  - `infra/ecr.tf`: 레포 `subtitle-worker`, `render-worker`
  - 검증
    - AWS 콘솔에서 S3 버킷 1개, SQS 큐 10개(본 5 + DLQ 5), IAM 역할 2개, ECR 레포 2개 확인

- **P3-2.** Supabase 연결 + 마이그레이션 `[BE][DevOps]`
  - Supabase 프로젝트 생성, `DATABASE_URL`(pgBouncer) + `DIRECT_URL` 확보
  - `schema.prisma` 에 `directUrl = env("DIRECT_URL")` 추가 (마이그레이션 전용)
  - `prisma migrate deploy` → 테이블 생성
  - Secrets Manager에 `DATABASE_URL`, `DIRECT_URL` 저장
  - Lambda URL 파라미터: `connection_limit=1`
  - 검증
    - `prisma.job.findMany({ take: 5 })` 성공
    - Connection 오류 없음

- **P3-3.** Lambda 배포 — script / tts / upload worker `[DevOps][BE]`
  - 각 Worker에 `serverless.yml` (Serverless Framework v3) 작성
  - Lambda 설정

    | Worker | 메모리 | 타임아웃 | SQS 트리거 |
    |---|---|---|---|
    | script-worker | 512MB | 60s | script-queue |
    | tts-worker | 512MB | 120s | tts-queue |
    | upload-worker | 256MB | 300s | upload-queue |

  - 환경변수: Secrets Manager ARN 참조 (`GEMINI_API_KEY`, `ENCRYPTION_KEY`, `DATABASE_URL`)
  - esbuild 번들링, `individually: true`
  - 검증
    - Lambda 콘솔 테스트 이벤트(SQS 형식) 각 Worker 실행 성공
    - CloudWatch 로그에서 Pino 구조적 로그 출력 확인

- **P3-4.** Fargate 배포 — subtitle / render worker `[DevOps]`
  - Docker 이미지 빌드 → ECR 푸시
  - `infra/ecs.tf` — ECS Task Definition

    | Worker | vCPU | 메모리 |
    |---|---|---|
    | subtitle-worker | 2 | 8GB |
    | render-worker | 4 | 16GB |

  - ECS Service: `desired_count: 1`, `launch_type: FARGATE`
  - Task IAM Role: `FargateTaskRole` 연결
  - CloudWatch Log Group: `/ecs/subtitle-worker`, `/ecs/render-worker`
  - 검증
    - CloudWatch 로그에서 SQS Long Polling 시작 확인
    - 테스트 메시지 발행 후 S3에 결과 파일 생성 확인

- **P3-5.** API Gateway + Lambda (`apps/api`) `[DevOps][BE]`
  - `@codegenie/serverless-express` 로 NestJS 래핑
  - `src/lambda.ts`: NestJS 앱 초기화를 핸들러 외부에서 실행 (Cold Start 최소화)
  - `serverless.yml`: HTTP API Gateway + Lambda 연동
  - `DATABASE_URL` Secrets Manager 참조
  - 검증
    - API Gateway URL로 `POST /jobs` → 3초 이내 응답
    - DB에 PENDING Job 생성 확인

- **P3-6.** AWS E2E 자동 업로드 검증 `[BE][DevOps]`
  - `POST /jobs` (API Gateway) → CloudWatch에서 Worker 순서 로그 확인
    1. script-worker → S3 `script.json`
    2. tts-worker → S3 `audio.mp3`
    3. subtitle-worker → S3 `subtitle.srt`
    4. render-worker → S3 `output.mp4`
    5. upload-worker → YouTube 업로드
  - DB `Job.status = 'COMPLETED'`, `youtubeVideoId` 존재 확인
  - YouTube에서 영상 재생, `#Shorts` 분류 확인
  - 검증
    - `POST /jobs` 한 번으로 YouTube 업로드 자동 완료
    - S3에 4개 파일 모두 존재
    - 각 Worker CloudWatch 로그 확인

**완료 기준**
- [ ] AWS E2E 파이프라인 자동 완료 1회 성공
- [ ] S3에 `script.json` / `audio.mp3` / `subtitle.srt` / `output.mp4` 모두 존재
- [ ] CloudWatch에서 각 Worker 로그 확인 가능

---

## Phase 4 — 스케줄링 + 운영 안정화

> EventBridge로 매일 자동 Job 생성을 활성화하고, 7일 연속 무중단 운영을 검증한다.

- **P4-1.** EventBridge Scheduler — 채널별 cron `[DevOps][BE]`
  - `infra/eventbridge.tf`: 채널별 `aws_scheduler_schedule` 리소스
    - `schedule_expression = "cron(0 9 * * ? *)"` (채널 `uploadSchedule` 필드 값)
    - 타겟: API Gateway `POST /jobs`, payload: `{ "channelId": "...", "topic": null }`
  - `topic: null` 수신 시 `script-worker` 처리
    - DB `Topic` 큐에서 미사용 토픽 조회 (없으면 Gemini API로 자동 생성)
  - `apps/api` 에 `POST /channels/:id/schedule` 엔드포인트 추가
    - `@aws-sdk/client-scheduler` `CreateScheduleCommand` 호출
    - 스케줄 이름 규칙: `channel-{channelId}-upload`
  - 검증
    - 다음 날 지정 시간에 Job 자동 생성
    - CloudWatch Events에서 트리거 로그 확인

- **P4-2.** DLQ 알림 Lambda `[BE][DevOps]`
  - `apps/workers/dlq-notifier/src/handler.ts` Lambda 생성
  - SQS 트리거: 5개 DLQ 모두 동일 Lambda에 연결
  - 메시지 파싱: `jobId`, 원본 큐명, 오류 내역
  - Slack / Discord Webhook POST
    - 내용: 채널명, `jobId`, 실패 단계, 오류 메시지
  - 환경변수: `SLACK_WEBHOOK_URL` 또는 `DISCORD_WEBHOOK_URL` (Secrets Manager)
  - 처리 완료 후 `deleteMessage` 호출
  - 검증
    - Worker 의도적 예외 → 3회 재시도 → DLQ 적재 → 알림 수신 (1분 이내)

- **P4-3.** CloudWatch 알람 + 쿠팡 파트너스 CTA 렌더링 `[DevOps][BE]`
  - CloudWatch 알람 (`infra/cloudwatch.tf`)
    - Lambda / Fargate 에러율 > 5% → SNS → 이메일 알람
    - Fargate 태스크 실패 (`EssentialContainerExited`) → 알람
  - CTA 렌더링 (`render-worker` 수정)
    - `Channel.affiliateUrl` 존재 시
      - `ffprobe` 로 `audioDuration` 측정
      - SRT 끝에 세그먼트 추가: `{audioDuration - 8.000} --> {audioDuration}` + `affiliate_cta` 텍스트
    - 수정된 SRT 로 FFmpeg 실행
  - 검증
    - CloudWatch 알람 설정 확인
    - `affiliateUrl` 보유 채널의 `output.mp4` 마지막 8초 CTA 자막 확인

- **P4-4.** 7일 연속 운영 검증 `[BE][DevOps]`
  - 채널 1개 이상 EventBridge 스케줄 활성화 → 7일 운영
  - 매일 CloudWatch에서 Job 성공·실패 수 확인
  - 실패 Job 발생 시: DLQ 알림 수신 → 원인 분석 → `POST /jobs/:id/retry`
  - 7일 후 집계
    ```sql
    SELECT status, COUNT(*) AS cnt
    FROM "Job"
    WHERE "createdAt" >= NOW() - INTERVAL '7 days'
    GROUP BY status;
    ```
  - 실패율 = `FAILED / (COMPLETED + FAILED) * 100 ≤ 3%`
  - 검증
    - 7일간 실패율 3% 이하
    - DLQ 알림 정상 수신
    - 매일 YouTube 업로드 완료

**완료 기준**
- [ ] 7일 연속 자동 업로드 성공 (실패율 3% 이하)
- [ ] DLQ 적재 시 알림 수신 확인

---

## Phase 5 — Remotion 전환 + Analytics

> FFmpeg → Remotion으로 렌더러를 교체하고, YouTube Analytics 데이터를 DB에 수집한다.

**전제 조건**: Phase 5 시작 전, Remotion이 Fargate(Linux amd64) headless 환경에서 렌더링 가능한지 사전 검증

- **P5-1.** `render-worker` Remotion 전환 `[FE][BE]`
  - `apps/workers/render/src/remotion/`
    - `ShortsVideo.tsx`: 루트 컴포넌트 (1080×1920, fps: 30)
      - `<Audio src={audioSrc} />` 레이어
      - `<Background src={bgSrc} />` 레이어
      - `<SubtitleLayer words={words} currentFrame={frame} />` 레이어
    - `SubtitleLayer.tsx`: 현재 `frame` 에 해당하는 단어 하이라이트 (`yellow` + `bold`), 비활성 단어 `white`
    - `subtitle-parser.ts`: SRT → `Array<{ word, startFrame, endFrame }>` 변환
  - `renderMedia()`: `codec: 'h264'`, `chromiumOptions: { headless: true }`
  - `apps/workers/render/Dockerfile`: Chromium headless 의존성 추가
  - 검증
    - 1080×1920 `output.mp4` 생성
    - 단어별 자막 강조 동작 확인
    - 모바일 앱에서 기존 FFmpeg 출력과 동등 이상 품질

- **P5-2.** YouTube Analytics API 수집 `[BE]`
  - `apps/workers/analytics/src/handler.ts` Lambda 생성
  - `youtubeAnalytics.reports.query()`: 전날 `views`, `subscribersGained` 채널별 조회
  - `Job.viewCount`, `likeCount`: `youtube.videos.list({ part: 'statistics' })` 동기화
  - DB upsert: `@@unique([channelId, date])` 제약 활용
  - `infra/eventbridge.tf`: 매일 새벽 2시 스케줄 추가 (`cron(0 17 * * ? *)` UTC)
  - 검증
    - `ChannelAnalytics` 테이블에 날짜별 레코드 생성
    - 매일 자동 수집 동작 (CloudWatch 로그)

- **P5-3.** 고성과 스크립트 패턴 → Gemini 프롬프트 반영 `[AI][BE]`
  - DB 쿼리: `viewCount` 상위 20% `Job`의 `scriptContent` 조회
    ```sql
    SELECT "scriptContent" FROM "Job"
    WHERE "viewCount" >= (
      SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY "viewCount") FROM "Job"
    )
    ORDER BY "viewCount" DESC;
    ```
  - 공통 패턴 분석: hook 첫 문장 길이·구조, 오프닝 키워드
  - `apps/workers/script/src/prompts/system.ts`
    - 고성과 hook 예시 3~5개 few-shot 삽입
    - 패턴 조건 명시적 지시 추가
  - 검증
    - 프롬프트에 고성과 패턴 조건 포함 확인
    - 샘플 10개 생성 후 hook 품질 개선 확인

**완료 기준**
- [ ] Remotion 렌더링 결과 모바일 품질 합격
- [ ] Analytics 데이터 매일 수집 확인

---

## Phase 6 — 멀티채널 + 스케일링

> 채널 10개를 추가 인프라 변경 없이 독립적으로 운영할 수 있다.

- **P6-1.** 채널별 EventBridge 스케줄 자동 생성/삭제 `[BE][DevOps]`
  - `ChannelsService` 에 `@aws-sdk/client-scheduler` 연동

    | 이벤트 | EventBridge 동작 |
    |---|---|
    | 채널 생성 | `CreateScheduleCommand` (이름: `channel-{channelId}-upload`) |
    | 채널 삭제 | `DeleteScheduleCommand` |
    | `isActive: false` | `UpdateScheduleCommand` → `State: DISABLED` |
    | `isActive: true` | `UpdateScheduleCommand` → `State: ENABLED` |
    | 스케줄 변경 | `UpdateScheduleCommand` (새 `schedule_expression`) |

  - `LambdaExecutionRole` 에 `scheduler:CreateSchedule`, `UpdateSchedule`, `DeleteSchedule` 권한 추가
  - 검증
    - 채널 3개 독립 스케줄 동작 확인
    - 채널 비활성화 시 해당 채널만 중단, 타 채널 영향 없음

- **P6-2.** Fargate 동적 스케일링 `[DevOps]`
  - `infra/ecs.tf` 에 Application Auto Scaling 추가
    - `ScalableTarget`: `render-worker` ECS Service
    - `ScalingPolicy`: `SQS/ApproximateNumberOfMessagesVisible` (`render-queue`) 기반
    - 스케일 아웃: 메시지 ≥ 5 → Task 수 +1 (최대 5개)
    - 스케일 인: 메시지 = 0 → Task 수 1개 복구 (쿨다운 300초)
  - 검증
    - `render-queue` 에 5개 메시지 → Task 수 자동 증가
    - 큐 소진 후 Task 수 1개 복구

- **P6-3.** Analytics 다채널 수집 + 채널 3개 7일 운영 `[BE][DevOps]`
  - `analytics-worker`: `Promise.allSettled` 로 활성 채널 병렬 처리
    - 개별 채널 실패가 다른 채널 수집에 영향 없도록 격리
  - 채널 3개 EventBridge 스케줄 동시 활성화 → 7일 운영
  - 7일 후 채널별 실패율 집계
    ```sql
    SELECT "channelId",
      ROUND(COUNT(*) FILTER (WHERE status = 'FAILED') * 100.0 / COUNT(*), 2) AS "failRate"
    FROM "Job"
    WHERE "createdAt" >= NOW() - INTERVAL '7 days'
    GROUP BY "channelId";
    ```
  - 검증
    - 채널 3개 `ChannelAnalytics` 동시 수집 확인
    - 7일 연속 채널별 실패율 3% 이하

**완료 기준**
- [ ] 채널 3개 동시 운영 7일 성공 (실패율 3% 이하)

---

## Phase 7 — 프로덕션 준비

> CI/CD, 에러 추적, TTS 업그레이드, 30일 안정성 검증.

- **P7-1.** GitHub Actions CI/CD `[DevOps]`
  - `.github/workflows/ci.yml` (PR 트리거)
    - `pnpm install --frozen-lockfile`
    - `turbo lint` → `turbo build` → `turbo test`
    - `tsc --noEmit` (타입 검사)
    - `actions/cache`: pnpm store, `.turbo`
  - `.github/workflows/deploy.yml` (main 머지 트리거)
    - Lambda: `serverless deploy --stage prod` (Worker별 병렬 실행)
    - Fargate: Docker 빌드 → ECR 푸시 → `aws ecs update-service --force-new-deployment`
    - GitHub Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
  - 검증
    - PR 생성 시 CI 파이프라인 통과
    - `main` 머지 시 Lambda/Fargate 자동 배포 완료

- **P7-2.** Sentry 연동 `[BE]`
  - `packages/shared/src/sentry.ts`
    - `initSentry()`: `Sentry.init({ dsn, environment })`
    - `setSentryContext(jobId, channelId)`: `Sentry.setContext('job', { jobId, channelId })`
  - 각 Worker 핸들러 시작 시 `initSentry()`, `setSentryContext()` 호출
  - catch 블록: `Sentry.captureException(error)`
  - CI/CD 에 `sentry-cli sourcemaps upload` 추가
  - 환경변수: `SENTRY_DSN` (Secrets Manager)
  - 검증
    - 의도적 예외 → Sentry 이슈 생성
    - 이슈에 `jobId` / `channelId` 컨텍스트 포함 확인

- **P7-3.** Edge-TTS → Clova Voice 교체 `[BE][AI]`
  - `apps/workers/tts/src/tts/`
    - `TTSAdapter.ts`: `interface TTSAdapter { synthesize(text: string, outputPath: string): Promise<void> }`
    - `EdgeTTSAdapter.ts`: 기존 Edge-TTS 로직 이전
    - `ClovaVoiceAdapter.ts`: Clova Voice API (`nara` 또는 `mijin` 음성)
  - `src/handler.ts`: `env.TTS_PROVIDER === 'clova-voice' ? new ClovaVoiceAdapter() : new EdgeTTSAdapter()`
  - 환경변수: `TTS_PROVIDER`, `CLOVA_API_KEY`, `CLOVA_API_GATEWAY_URL`
  - 검증
    - `TTS_PROVIDER=clova-voice` 로 45~55초 MP3 생성
    - 음성 품질 Edge-TTS 이상 확인

- **P7-4.** AWS Budget Alert `[DevOps]`
  - `infra/budget.tf`: 월 예산 $20
    - 80% 도달($16) 시 경고 알림
    - 100% 도달($20) 시 초과 알림
  - Cost Explorer에서 서비스별 비용 분석 (Fargate 렌더링이 최대 항목 예상)
  - 검증
    - AWS Budgets 콘솔 알람 설정 확인
    - Cost Explorer 월 예상 비용 $10 이하 확인

- **P7-5.** 30일 연속 운영 최종 검증 `[BE][DevOps][FE][AI]`
  - 채널 3개 EventBridge 스케줄 30일 연속 활성화
  - 매주 CloudWatch에서 성공·실패율 점검
  - 30일 후 최종 집계
    ```sql
    SELECT
      COUNT(*) FILTER (WHERE status = 'COMPLETED') AS success,
      COUNT(*) FILTER (WHERE status = 'FAILED')    AS failed,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'FAILED') * 100.0 / NULLIF(COUNT(*), 0), 2
      ) AS "failRate(%)"
    FROM "Job"
    WHERE "createdAt" >= NOW() - INTERVAL '30 days';
    ```
  - 대시보드 전 기능 최종 점검
    - 채널 연결 (YouTube OAuth2)
    - Job 생성·상태 폴링
    - 실패 Job 재시도
    - 스케줄 설정 및 EventBridge 반영
    - Analytics 데이터 조회
  - 모바일 유튜브 앱에서 최근 영상 자막·오디오 품질 최종 확인
  - 검증
    - 30일 실패율 3% 이하
    - 월 운영비 $10 이하
    - 대시보드 전 기능 동작
    - 모바일 영상 품질 합격

**완료 기준 (전체 플랫폼)**
- [ ] 채널 3개에서 30일 연속 자동 업로드 성공
- [ ] 실패율 3% 이하
- [ ] 월 운영 비용 $10 이하
- [ ] 모바일 유튜브 앱에서 자막·오디오 품질 합격
- [ ] 대시보드 전 기능 동작

---

## Phase 의존 관계

웹 대시보드(Phase 2)는 docker-compose 로컬 환경으로 먼저 완성한 뒤 AWS 이관(Phase 3)을 진행한다.  
대시보드가 먼저 완성되면 AWS 이관 이후 별도 UI 검증 없이 바로 운영 단계로 진입할 수 있다.

```
Phase 0 — 핵심 리스크 검증
  └── Phase 1 — 로컬 파이프라인 구현
        └── Phase 2 — 웹 대시보드 (docker-compose 기반 로컬 개발)
              └── Phase 3 — AWS 서버리스 이관
                    ├── Phase 4 — 스케줄링 + 운영 안정화
                    │     └── Phase 5 — Remotion + Analytics
                    └── Phase 6 — 멀티채널 + 스케일링
                                 │
                    Phase 5 + Phase 6 완료 ▼
                         Phase 7 — 프로덕션 준비
```

**Phase별 시작 조건:**

| Phase | 선행 Phase | 시작 조건 |
|---|---|---|
| Phase 1 | Phase 0 | TTS·Whisper·FFmpeg·YouTube API 4종 로컬 검증 통과 |
| Phase 2 | Phase 1 | `docker-compose up` 한 번으로 `POST /jobs` → COMPLETED 자동 완료 |
| Phase 3 | Phase 2 | 대시보드 전 기능 로컬 동작, 재시도 기능 정상 동작 |
| Phase 4 | Phase 3 | AWS E2E 자동 업로드 1회 성공 |
| Phase 5 | Phase 4 | 7일 연속 실패율 3% 이하 |
| Phase 6 | Phase 3 | AWS E2E 완료 (Phase 2는 Phase 3 이전에 완료) |
| Phase 7 | Phase 5 + Phase 6 | Remotion·Analytics 완료 **AND** 채널 3개 7일 운영 + 실패율 3% 이하 |
