# ADR 009: SQS 트리거 — Lambda Event Source Mapping

**상태:** Accepted

## 결정

모든 Worker의 SQS 메시지 수신은 AWS Lambda Event Source Mapping을 사용한다.

## 근거

Lambda SQS 트리거는 폴링·가시성 타임아웃 연장·동시성 제어를 AWS가 자동으로 관리하므로, 별도의 polling 루프나 heartbeat 구현이 불필요하다.

| Worker | 큐 | 트리거 방식 |
|---|---|---|
| script / tts / subtitle / upload | 각 Worker SQS 큐 | Lambda SQS Event Source Mapping (esbuild 번들) |
| render | render-queue | Lambda SQS Event Source Mapping (Container Image) |

> 관련 배포 환경 결정: [ADR 001](./001-lambda-vs-fargate.md)
