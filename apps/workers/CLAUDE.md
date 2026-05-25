# apps/workers — Worker 파이프라인 개발 가이드

## 적용 Rules
- `.claude/rules/worker-pipeline.md` — Job 상태 전이, S3 키, SQS 설정, Fargate heartbeat
- `.claude/rules/database.md` — Prisma 싱글턴, findMany select
- `.claude/rules/security.md` — 토큰, 환경변수
- `.claude/rules/typescript.md` — strict, ESM .js

## Worker 역할 및 실행 환경

| Worker | 입력 | 출력 | 환경 | 타임아웃 |
|---|---|---|---|---|
| `script/` | topic, channelId | script.json | Lambda 512MB | 60s |
| `tts/` | script.json | audio.mp3 | Lambda 512MB | 120s |
| `subtitle/` | audio.mp3 + subtitle.vtt (선택) | subtitle.srt | Fargate 2vCPU/4GB | 300s |
| `render/` | audio.mp3 + subtitle.srt | output.mp4 | Fargate 4vCPU/16GB | 600s |
| `upload/` | output.mp4 | YouTube 업로드 | Lambda 256MB | 300s |

## 공통 Worker 패턴

### Lambda Worker
```typescript
export const handler = async (event: SQSEvent): Promise<void> => {
  const body = JSON.parse(event.Records[0].body);
  await db.job.update({ where: { id: body.jobId }, data: { status: '{NAME}_PROCESSING' } });
  try {
    const result = await process(body);
    // S3 저장
    await sqs.send(new SendMessageCommand({ QueueUrl: NEXT_QUEUE, MessageBody: JSON.stringify(result) }));
  } catch (err) {
    await db.job.update({ where: { id: body.jobId }, data: { status: 'FAILED', failReason: String(err) } });
    throw err; // SQS 재시도 유발
  }
};
```

### Fargate Worker (heartbeat 필수)
```typescript
// SQS Long Polling + heartbeat 패턴 (worker-pipeline.md 참조)
while (true) {
  const msg = await sqs.receiveMessage({ WaitTimeSeconds: 20, MaxNumberOfMessages: 1 });
  if (!msg.Messages?.length) continue;
  const heartbeat = setInterval(() => extendVisibility(msg), 30_000);
  try { await process(msg); await deleteMessage(msg); }
  finally { clearInterval(heartbeat); }
}
```

## 수정 시 체크리스트
Worker 코드 변경 시 `.claude/rules/worker-pipeline.md`의 파이프라인 수정 연동 규칙 참조.
