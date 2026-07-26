# @shorts/scheduler-worker

EventBridge rate(1 min) 트리거로 채널별 업로드 스케줄을 점검하고, 조건 충족 시 Google News RSS에서 토픽을 수집해 script-queue에 Job을 발행하는 워커.

파이프라인: EventBridge → [스케줄 점검] → [뉴스 수집 + 필터] → Job 생성 → script-queue 발행

## 주요 모듈

- `handler.ts` — Lambda ScheduledHandler; 채널 순회·스케줄 평가·Job 생성
- `news-fetcher.ts` — Google News RSS 파싱 및 정치 키워드 필터
- `env.ts` — 환경변수 파싱

## 스케줄 실행 조건 (모두 충족해야 Job 생성)

1. `Channel.schedulerEnabled = true` AND `isActive = true`
2. `uploadSchedule` cron 표현식이 현재 분(Asia/Seoul) 내에 포함
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

필터 후 유효 토픽이 0개이면 해당 분기 스케줄을 스킵하고 다음 분기에 재시도한다.

## SQS 메시지 구조

발행 (`script-queue`):
```typescript
{ jobId: string; channelId: string; topic: string }
```
