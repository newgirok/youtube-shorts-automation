# @shorts/dlq-notifier

5개 DLQ SQS 이벤트를 수신해 실패 Job 정보를 Slack으로 알리는 Lambda.

파이프라인: DLQ (5개) → [메시지 파싱] → Slack Webhook 전송

## 주요 모듈

- `handler.ts` — SQS 이벤트 핸들러 (메시지 파싱 + Slack 전송)

## 큐 매핑

```typescript
const QUEUE_LABELS: Record<string, string> = {
  'prod-script-queue-dlq':    'Script (Gemini)',
  'prod-tts-queue-dlq':       'TTS (Edge-TTS)',
  'prod-subtitle-queue-dlq':  'Subtitle',
  'prod-render-queue-dlq':    'Render (FFmpeg)',
  'prod-upload-queue-dlq':    'Upload (YouTube)',
};
```

5개 DLQ 모두 동일한 Lambda에 Event Source Mapping으로 연결.

## 메시지 파싱 전략

정상 JSON인 경우 `JSON.parse()`로 파싱 → `jobId`, `channelId` 추출.
비정상 메시지(JSON 파싱 실패)는 regex로 필드를 추출해 "알 수 없음" 방지:

```typescript
try {
  const parsed = JSON.parse(record.body) as Record<string, unknown>;
  jobId = String(parsed['jobId'] ?? '알 수 없음');
  channelId = String(parsed['channelId'] ?? '알 수 없음');
} catch {
  jobId     = record.body.match(/jobId[:"' ]*([^,}\s'"]+)/)?.[1]     ?? '알 수 없음';
  channelId = record.body.match(/channelId[:"' ]*([^,}\s'"]+)/)?.[1] ?? '알 수 없음';
}
```

## Slack 알림 형식

```
🚨 *DLQ 알림 — {큐 레이블}*
• 큐: `{queueName}`
• Job ID: `{jobId}`
• 채널 ID: `{channelId}`
• 수신 횟수: {n}회 (3회 초과 → DLQ 이동)
• 메시지:
```{원문 JSON}```
```

plain-text Webhook(`{ text: "..." }`) 형식 — Block Kit 불필요.

## 환경변수

| 변수 | 설명 |
|---|---|
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

## SQS 메시지 구조

수신 (DLQ 5개):
```typescript
// 정상 케이스
{ jobId: string; channelId: string; /* Worker별 추가 필드 */ }

// 비정상 케이스 — JSON 파싱 실패 시 regex fallback 처리
```

`ApproximateReceiveCount`가 3 초과인 메시지만 DLQ에 도달 (SQS Max Receive Count = 3).
