# @shorts/api

NestJS + Fastify 기반 REST API 서버.

## 적용 Rules
- `.claude/rules/nestjs-api.md` — 3계층 패턴, 로깅, 환경변수 검증
- `.claude/rules/database.md` — Prisma 쿼리 규칙, 싱글턴 패턴
- `.claude/rules/security.md` — 토큰 관리, OAuth 스코프
- `.claude/rules/typescript.md` — strict, any 금지, ESM .js 확장자

## 주요 명령
- `pnpm dev` — tsx watch 개발 서버 (포트 3000)
- `pnpm build` — tsc 컴파일
- `pnpm start` — node dist/main.js 프로덕션 실행

## Docker 빌드 주의사항
API Dockerfile은 로컬 `dist/`를 COPY하는 구조이므로 소스 수정 후 반드시:
1. `pnpm --filter @shorts/api build` — TypeScript 컴파일
2. `docker compose build api` — 이미지 빌드

Web은 `COPY . .` 후 Docker 내부에서 빌드하므로 `docker compose build web`만으로 충분.

## 의존성
- @shorts/shared (Prisma, S3, Pino 로거, Zod 환경변수)

## 주요 모듈

### `auth/`
Google OAuth2 채널 연결 처리.

- `GET /auth/youtube` — OAuth 인증 URL로 302 리다이렉트
- `GET /auth/youtube/callback` — 인증 코드로 토큰 교환, 채널 upsert 후 `/close?channelId={id}` 로 리다이렉트 (에러 시 `/close?auth_error={msg}`)

OAuth 스코프:
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

refresh_token은 AES-256-GCM으로 암호화 후 DB 저장. access_token은 DB에 저장하지 않음.

**isYPPQualified 실시간 계산** (`channels.service.ts`): DB 컬럼이 아닌 요청 시 동적 산출.
- `subscriberCount >= 500`
- `uploadCount90d >= 3` (최근 90일 업로드 수)
- `shortsViews90d >= 3_000_000` (최근 90일 쇼츠 조회수 합산)
세 조건 모두 충족 시 `isYPPQualified: true`. `GET /channels/:id` 응답에만 포함되며 DB에 저장하지 않는다.

**채널 upsert 규칙**: `auth.service.ts`의 `prisma.channel.upsert` `update` 블록에 반드시 `isActive: true` 포함.
채널을 `DELETE /channels/:id`로 해제(`isActive=false`)한 뒤 재연결하면 `update` 블록이 실행되므로,
`isActive: true`가 없으면 해제 상태가 그대로 유지된다.

### `channels/`
YouTube 채널 CRUD 및 동기화.

- `GET /channels` — isActive=true 채널 목록 (id, name, niche만 반환)
- `GET /channels/:id` — 채널 상세 + YPP 자격 실시간 계산 (`isYPPQualified`, `uploadCount90d`, `shortsViews90d`)
- `DELETE /channels/:id` — 채널 연결 해제 (isActive=false, 데이터 보존)
- `PATCH /channels/:id/schedule` — 스케줄 설정 업데이트 (cronExpression, schedulerEnabled, schedulerCategory 중 일부 또는 전체)
- `GET /channels/:id/analytics` — 최근 30일 일별 analytics (views, subscribers, estimatedRevenue, watchTimeMinutes)
- `POST /channels/:id/sync` — 채널 통계 + Analytics + 영상 조회수 풀 동기화 (YouTube Data API + YouTube Analytics API)
- `POST /channels/:id/sync-videos` — 영상 조회수·privacyStatus 동기화 + 삭제된 영상 FAILED 처리

`sync` 흐름:
1. `channels.list(part: statistics)` → subscriberCount, totalViews 갱신
2. `youtubeAnalytics.reports.query(metrics: views,subscribersGained,estimatedMinutesWatched, dimensions: day)` → 최근 30일 일별 upsert
3. `videos.list(part: id,statistics,status)` → viewCount, likeCount, privacyStatus 갱신; YouTube에서 삭제된 영상은 status=FAILED, failReason='유튜브에서 영상이 삭제되었습니다.'

> **GCP 사전 조건** — Analytics 동기화(2단계)가 동작하려면 GCP 프로젝트에서
> **YouTube Analytics API**가 활성화되어 있어야 한다.
> 비활성 상태면 403 `accessNotConfigured` 에러가 발생하고 `ChannelAnalytics` 테이블에 데이터가 쌓이지 않는다.
> 활성화 URL: `https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project={GCP_PROJECT_ID}`
> 에러는 `.catch(warn)` 으로 무시하므로 나머지 sync(채널 통계·영상 조회수)는 정상 동작한다.

### `scheduler/`
1분마다 실행되는 자동 업로드 스케줄러 (`@Cron('* * * * *')`).

- `schedulerEnabled=true`인 채널을 대상으로 `uploadSchedule` cron 표현식을 평가
- 직전 1분 이내에 cron이 트리거됐으면 (`shouldRunNow`) `createFromNews`로 Job 1개 생성
- 이미 진행 중인 Job이 있으면 스킵 (`hasActiveJob` 체크)
- 타임존: `Asia/Seoul` (`cron-parser` 사용)

### `jobs/`
Job 생성 및 상태 조회, 재시도.

- `POST /jobs` — 채널 + 토픽으로 Job 생성 후 script-queue에 발행
- `GET /jobs` — Job 목록 (channelId 쿼리로 필터링 가능)
- `GET /jobs/:id` — Job 상세 조회 (없으면 404)
- `GET /jobs/:id/thumbnail` — S3에서 썸네일 이미지(image/jpeg) 프록시 서빙 (없으면 404, `@Public()` 인증 제외)
- `POST /jobs/auto-news` — Google News RSS 수집 후 뉴스 제목으로 Job 일괄 생성
- `POST /jobs/:id/retry` — FAILED 상태 Job만 PENDING으로 초기화 후 script-queue 재발행

`thumbnailUrl` 반환 형식:
- render-worker가 `/jobs/{jobId}/thumbnail` 형태로 DB 저장
- `jobs.repository.ts`의 `resolveThumbUrl()`이 반환 시 `{API_BASE_URL}/jobs/{id}/thumbnail` 절대 URL로 변환
- sync-videos 이후 YouTube URL(`https://i.ytimg.com/vi/{id}/hqdefault.jpg`)로 대체될 수 있음

`auto-news` 요청 바디:
```json
{
  "channelId": "string",
  "category": "top | business | technology | health | science | nation",  // 기본값: "top"
  "count": 1~5  // 기본값: 3
}
```

뉴스 출처: Google News RSS (`news.google.com/rss`, 한국어/KR 로케일)

`retry` 조건: `Job.status === 'FAILED'`만 허용. Job이 없으면 404 NotFound, 다른 상태에서 호출 시 400 BadRequest.

### 인증 방식
전역 `InternalKeyGuard` 적용 — 모든 요청에 `Authorization: Bearer {API_INTERNAL_SECRET}` 헤더 필요.
추가로 `x-user-id` 헤더(web이 NextAuth session에서 추출해 전달)를 파싱해 `req.userId`에 주입.
`GET /channels`는 `req.userId`가 있으면 해당 userId의 채널만 반환, 없으면 전체 반환(Worker 내부 호출 대비).
예외: `@Public()` 데코레이터가 붙은 핸들러는 인증 제외.
- `GET /health` — `@Public()`
- `GET /jobs/:id/thumbnail` — `@Public()`
- `GET /auth/youtube` — `@Public()` (컨트롤러 단위), `?userId=` 쿼리로 OAuth state에 userId 포함
- `GET /auth/youtube/callback` — `@Public()` (컨트롤러 단위), state에서 userId 추출해 Channel 생성 시 userId 저장

### 필수 환경변수
```
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REDIRECT_URI
ENCRYPTION_KEY
SQS_SCRIPT_QUEUE_URL
API_INTERNAL_SECRET
WEB_ORIGIN     - CORS 허용 오리진 (https://shortsautomation.com)
API_BASE_URL   - thumbnailUrl 절대 URL 생성용 API Gateway URL
```
`main.ts` 시작 시 누락 여부를 직접 체크 후 즉시 종료. `@shorts/shared`의 `parseBaseEnv()`도 추가로 호출.

## Serverless Framework 배포 주의사항
`serverless.yml`의 `${ssm:...}` 참조는 **배포 시 해결**되어 Lambda 환경변수에 직접 저장된다.
SSM 값을 변경해도 Lambda를 재배포하지 않으면 이전 값이 그대로 남는다.

배포 없이 즉시 적용이 필요한 경우:
```bash
aws lambda update-function-configuration \
  --function-name <function-name> \
  --environment "file://env.json"
```
