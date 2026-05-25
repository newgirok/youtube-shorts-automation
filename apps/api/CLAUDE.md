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

## 의존성
- @shorts/shared (Prisma, S3, Pino 로거, Zod 환경변수)

## 주요 모듈

### `auth/`
Google OAuth2 채널 연결 처리.

- `GET /auth/youtube` — OAuth 인증 URL로 302 리다이렉트
- `GET /auth/youtube/callback` — 인증 코드로 토큰 교환, 채널 upsert 후 Web으로 리다이렉트

OAuth 스코프:
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

refresh_token은 AES-256-GCM으로 암호화 후 DB 저장. access_token은 DB에 저장하지 않음.

### `channels/`
YouTube 채널 CRUD 및 동기화.

- `GET /channels` — isActive=true 채널 목록 (id, name, niche만 반환)
- `GET /channels/:id` — 채널 상세 + YPP 통계(uploadCount90d, shortsViews90d)
- `PATCH /channels/:id/schedule` — uploadSchedule cron 표현식 업데이트
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

### `jobs/`
Job 생성 및 상태 조회, 재시도.

- `POST /jobs` — 채널 + 토픽으로 Job 생성 후 script-queue에 발행
- `GET /jobs` — Job 목록 (channelId 쿼리로 필터링 가능)
- `GET /jobs/:id` — Job 상세 조회
- `POST /jobs/auto-news` — Google News RSS 수집 후 뉴스 제목으로 Job 일괄 생성
- `POST /jobs/:id/retry` — FAILED 상태 Job만 PENDING으로 초기화 후 script-queue 재발행

`auto-news` 요청 바디:
```json
{
  "channelId": "string",
  "category": "top | politics | business | nation",  // 기본값: "top"
  "count": 1~5  // 기본값: 3
}
```

뉴스 출처: Google News RSS (`news.google.com/rss`, 한국어/KR 로케일)

`retry` 조건: `Job.status === 'FAILED'`만 허용. 다른 상태에서 호출 시 400 BadRequest.
