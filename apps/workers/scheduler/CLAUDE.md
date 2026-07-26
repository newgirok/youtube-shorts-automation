# @shorts/scheduler-worker

채널별 EventBridge 규칙에서 직접 호출되는 Lambda. 호출 시 이벤트 페이로드에 `channelId`가 포함되며, 해당 채널의 활성 여부 확인 후 Google News RSS에서 토픽을 수집해 script-queue에 Job을 발행한다.

파이프라인: 채널 EventBridge 규칙 → handler(`{ channelId }`) → [채널 상태 확인] → [뉴스 수집 + 필터] → Job 생성 → script-queue 발행

## 주요 모듈

- `handler.ts` — Lambda ScheduledHandler; 채널 단건 확인·Job 생성
- `news-fetcher.ts` — Google News RSS 파싱 및 정치 키워드 필터

## EventBridge 규칙 구조

각 채널마다 독립 EventBridge 규칙이 존재하며, API가 `PATCH /channels/:id/schedule` 호출 시 자동으로 생성/삭제한다 (`apps/api/src/channels/eventbridge.ts`).

- 규칙 이름: `shorts-channel-{channelId}-scheduler`
- 타겟 페이로드: `{ channelId: string }`
- cron 변환: 표준 5필드 → EventBridge 6필드 (`toEventBridgeCron`, dom/dow `?` 규칙 적용)

## Job 생성 조건 (모두 충족해야 Job 생성)

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
