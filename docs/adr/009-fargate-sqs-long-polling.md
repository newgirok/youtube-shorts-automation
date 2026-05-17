# ADR 009: Fargate Worker — SQS Long Polling 자체 구현

**상태:** Accepted

## 배경

subtitle-worker와 render-worker(ECS Fargate)가 SQS 메시지를 수신하는 방법을 결정해야 했다. Lambda Worker는 AWS가 SQS 트리거를 자동으로 관리해주지만, Fargate에는 동일한 메커니즘이 없다.

## 결정

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

## Lambda SQS 트리거를 Fargate에 쓸 수 없는 이유

Lambda SQS 트리거는 AWS Lambda 서비스가 SQS를 폴링해 Lambda **함수**를 호출하는 구조다. ECS Service는 이미 실행 중인 컨테이너 프로세스이며, Lambda 호출 인터페이스가 없다. 트리거를 붙이면 메시지가 올 때마다 **새 Fargate 태스크**가 시작된다.

새 태스크 방식의 문제:
- faster-whisper large-v3 모델 로딩: 태스크 시작 후 약 30~60초 소요
- 1개 Job에 1~2분 지연 추가 발생
- 태스크 시작/종료 반복으로 Fargate 비용 증가

**상시 실행(ECS Service) + 자체 폴링**을 선택하면 모델이 메모리에 상주해 메시지 수신 즉시 처리 가능.

## Long Polling(`WaitTimeSeconds: 20`)을 선택한 이유

| 방식 | SQS API 호출 | 비용 | 지연 |
|---|---|---|---|
| Short Polling | 초당 수십 회 | 높음 | 즉시 |
| Long Polling (20s) | 분당 3회 | 낮음 | 즉시 (메시지 도착 시) |

Long Polling은 연결을 최대 20초 유지하다가 메시지가 도착하면 즉시 반환한다. 대기 비용은 Short Polling과 동일하지 않으며, 메시지가 없으면 20초마다 1회 API 호출만 발생한다.

## EventBridge Pipes를 선택하지 않은 이유

EventBridge Pipes는 SQS → ECS Task를 연결할 수 있으나, 메시지마다 새 태스크를 시작한다. 위에서 설명한 Cold Start 문제가 동일하게 발생한다.

## 결과

- Fargate Worker는 `desired_count: 1` ECS Service로 상시 실행 유지
- 메시지 처리 중 Visibility Timeout이 만료되지 않도록 `heartbeat`(ChangeMessageVisibility) 구현 필요
- 프로세스 종료 시 진행 중인 메시지가 Visibility Timeout 후 자동 재처리됨 (멱등성 전제)
- Lambda 트리거로 통일하면 모델 Cold Start 문제 재발 — 변경 금지
