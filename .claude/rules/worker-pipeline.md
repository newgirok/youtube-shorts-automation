# Worker 파이프라인 규칙

## Job 상태 전이 (순서 변경 금지)
```
PENDING
  → SCRIPT_PROCESSING  (script-worker 시작)
  → TTS_PROCESSING     (tts-worker 시작)
  → SUBTITLE_PROCESSING (subtitle-worker 시작)
  → RENDER_PROCESSING  (render-worker 시작)
  → UPLOAD_PROCESSING  (upload-worker 시작)
  → COMPLETED / FAILED
```
- 순서 건너뛰기 금지
- 상태 업데이트는 Worker 진입 직후 즉시 수행

## S3 키 규칙 (형식 변경 절대 금지)
```
jobs/{jobId}/script.json
jobs/{jobId}/audio.mp3
jobs/{jobId}/subtitle.vtt    — tts-worker가 생성 (선택적, 없으면 subtitle-worker가 글자 비례 fallback)
jobs/{jobId}/subtitle.srt
jobs/{jobId}/output.mp4
jobs/{jobId}/thumbnail.jpg   — render-worker가 FFmpeg -vframes 1 첫 프레임으로 생성
```

## SQS 고정값

| 항목 | 값 |
|---|---|
| Visibility Timeout | Worker 타임아웃 × 2 |
| Message Retention | 4일 (345,600초) |
| Max Receive Count | 3 (DLQ 이동 전) |
| DLQ Retention | 14일 (1,209,600초) |

Worker별 Visibility Timeout:
- script: 120s / tts: 240s / subtitle: 600s / render: 1,200s / upload: 600s

## Fargate Worker 필수 패턴 (subtitle, render)
```typescript
// SQS Long Polling
const result = await sqs.receiveMessage({
  QueueUrl: env.SQS_QUEUE_URL,
  WaitTimeSeconds: 20,          // Long Polling 필수
  MaxNumberOfMessages: 1,
});

// Heartbeat — 30초마다 Visibility Timeout 연장
const heartbeat = setInterval(() =>
  sqs.changeMessageVisibility({
    QueueUrl, ReceiptHandle, VisibilityTimeout: 60
  }), 30_000
);
try {
  await processMessage();
} finally {
  clearInterval(heartbeat);     // 반드시 정리
}
```
`FargateTaskRole`에 `sqs:ChangeMessageVisibility` IAM 권한 필수.

## Gemini API 재시도 (script-worker)
- 모델: `gemini-2.5-flash` 고정 (변경 금지)
- 503 응답 시 최대 3회 재시도, 지연: `5초 × 시도 횟수`
```typescript
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    return await model.generateContent(prompt);
  } catch (err) {
    if (err.status === 503 && attempt < 3) {
      await sleep(5000 * attempt);
      continue;
    }
    throw err;
  }
}
```

## ScriptOutput 8개 필드 (변경 시 downstream 전체 수정)
```typescript
interface ScriptOutput {
  title: string;          // 22자 이내
  hook: string;           // 첫 2초 훅
  script: string;         // 210~350자 (최대 380자 검증, title TTS 포함 총 35~45초)
  description: string;    // YouTube 영상 설명문 (3~5문단, 400~800자, 면책 공지 포함)
  scenes: Scene[];        // 4~5개
  hashtags: string[];
  thumbnail_text: string; // 8자 이내
  comment_bait: string;   // 25자 이내
}
```

## 파이프라인 수정 연동 규칙
| 변경 대상 | 반드시 함께 수정 |
|---|---|
| SQS 큐 추가 | infra/ 큐 정의 + 해당 Worker + 이전 단계 Worker |
| JobStatus enum | 모든 Worker 상태 업데이트 코드 |
| ScriptOutput 필드 | script-worker + tts-worker 파싱 코드 |
| S3 키 패턴 | 모든 Worker 업로드/다운로드 경로 |
