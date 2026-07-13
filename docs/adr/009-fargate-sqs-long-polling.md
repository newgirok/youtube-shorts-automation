# ADR 009: Fargate Worker — SQS Long Polling 자체 구현

**상태:** Superseded (2026-07-14: subtitle·render 모두 Lambda로 전환됨)

> **이 결정은 번복됐다.** subtitle-worker(2026-07-12)와 render-worker(2026-07-14)가 모두 Lambda로 전환되면서 SQS 트리거가 AWS가 관리하는 Event Source Mapping으로 대체됐다. 아래 내용은 Fargate 운영 시절의 기록으로만 보존한다.

---

## 배경 (당시)

subtitle-worker와 render-worker(ECS Fargate)가 SQS 메시지를 수신하는 방법을 결정해야 했다. Lambda Worker는 AWS가 SQS 트리거를 자동으로 관리해주지만, Fargate에는 동일한 메커니즘이 없다.

## 당시 결정

**Fargate Worker 내부에서 SQS Long Polling 루프를 직접 구현**

```typescript
while (true) {
  const { Messages } = await sqs.receiveMessage({
    QueueUrl: process.env.SQS_QUEUE_URL,
    WaitTimeSeconds: 20,   // Long Polling
    MaxNumberOfMessages: 1,
  });
  if (Messages?.length) await processMessage(Messages[0]);
}
```

처리 시간이 Visibility Timeout을 초과하지 않도록 30초마다 `ChangeMessageVisibility`로 연장하는 heartbeat도 함께 구현했다.

## 번복 이유 (2026-07-14)

render-worker의 실제 메모리 사용량을 측정했을 때 16GB Fargate가 과다 할당임이 확인됐다. FFmpeg는 메모리보다 CPU 위주이며, Lambda 3008MB + 600s로 35~45초 Shorts 렌더링이 충분히 가능했다.

Lambda Container Image 방식(`aws-lambda-ric` + ECR)으로 전환하면서:
- SQS Long Polling 루프 → **AWS Event Source Mapping** (Lambda SQS 트리거) 으로 대체
- heartbeat(`ChangeMessageVisibility`) 불필요
- Fargate 상시 실행 비용 절감

## 현재 아키텍처

모든 Worker가 Lambda로 운영된다 (ADR 001 업데이트 참조).

| Worker | SQS 트리거 방식 |
|---|---|
| script / tts / subtitle / upload | Lambda SQS Event Source Mapping (esbuild 번들) |
| render | Lambda SQS Event Source Mapping (Container Image) |
