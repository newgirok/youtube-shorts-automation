# @shorts/scheduler-worker

두 가지 이벤트를 처리하는 Lambda.

1. **채널 업로드 스케줄** — 채널별 EventBridge 규칙이 `{ channelId }` 페이로드로 호출. 해당 채널의 활성 여부 확인 후 Google News RSS에서 토픽을 수집해 script-queue에 Job을 발행한다.
2. **일일 Analytics 동기화** — Terraform 관리 EventBridge 규칙이 매일 KST 06:00에 `{ type: 'daily-analytics-sync' }` 페이로드로 호출. `POST /channels/sync-all`을 통해 모든 활성 채널의 Analytics를 갱신한다.

## 주요 모듈

- `handler.ts` — Lambda ScheduledHandler; 페이로드 타입에 따라 채널 단건 Job 생성 또는 전체 Analytics sync 분기
- `news-fetcher.ts` — Google News RSS 파싱 및 정치 키워드 필터

## EventBridge 규칙 구조

**채널 업로드 스케줄 규칙** (채널마다 독립, API가 동적 생성/삭제)
- 규칙 이름: `shorts-channel-{channelId}-scheduler`
- 타겟 페이로드: `{ channelId: string }`
- cron 변환: 표준 5필드 → EventBridge 6필드 (`toEventBridgeCron`, dom/dow `?` 규칙 적용)
- 생성/삭제: `apps/api/src/channels/eventbridge.ts`

**일일 Analytics 동기화 규칙** (Terraform 관리, 고정)
- 규칙 이름: `shorts-daily-analytics-sync`
- schedule: `cron(0 21 * * ? *)` (KST 06:00)
- 타겟 페이로드: `{ type: 'daily-analytics-sync' }`

## Job 생성 조건 (채널 업로드 스케줄, 모두 충족해야 Job 생성)

1. 이벤트에 `channelId` 포함 (없으면 스킵)
2. `Channel.schedulerEnabled = true` AND `isActive = true`
3. 해당 채널에 `PENDING`~`UPLOAD_PROCESSING` 상태 Job이 없음

## 뉴스 수집 로직 (news-fetcher.ts)

### 카테고리

| 값 | Google News RSS URL |
|---|---|
| `top` | `https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko` (기본값) |
| `business` | `…/topic/BUSINESS` |
| `technology` | `…/topic/TECHNOLOGY` |
| `health` | `…/topic/HEALTH` |
| `science` | `…/topic/SCIENCE` |
| `nation` | `…/topic/NATION` |

`Channel.schedulerCategory` 미설정 시 `top` 사용.

### 정치 키워드 필터

RSS에서 후보 20개를 파싱한 후, 아래 키워드를 포함한 뉴스 제목은 제외하고 나머지 중 첫 번째를 topic으로 사용한다.

```typescript
const BLOCK_KEYWORDS = [
  // 정당
  '민주당', '국민의힘', '정의당', '개혁신당', '조국혁신당',
  // 주요 정치인
  '이재명', '한동훈', '윤석열',
  // 여야 관계
  '여당', '야당',
  // 선거
  '총선', '대선', '지방선거',
  // 당직·의회 정치
  '당대표', '원내대표', '국회의원',
  // 정치 사법 절차
  '탄핵', '특검',
];
```

필터 후 유효 토픽이 0개이면 해당 실행을 스킵하고 다음 스케줄 시각에 재시도한다.

## SQS 메시지 구조

발행 (`script-queue`):
```typescript
{ jobId: string; channelId: string; topic: string }
```

## 필수 환경변수

```
DATABASE_URL           — Prisma (SSM: shorts.prod.DATABASE_URL)
SQS_SCRIPT_QUEUE_URL   — script-queue URL
API_BASE_URL           — daily-analytics-sync 시 sync-all 호출 대상 (SSM: shorts.prod.API_BASE_URL)
API_INTERNAL_SECRET    — sync-all 인증 헤더 (SSM: shorts.prod.API_INTERNAL_SECRET)
```
