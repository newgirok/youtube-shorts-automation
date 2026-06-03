# ADR 003: SQS Standard Queue (FIFO 아님)

**상태:** Accepted

## 배경

Worker 간 메시지 전달에 SQS를 사용할 때 Standard Queue와 FIFO Queue 중 선택이 필요하다.

## 결정

**Standard Queue 사용**

- 각 Job은 독립적 — Job 간 처리 순서 보장이 불필요
- Standard Queue 처리량: 무제한 TPS vs FIFO: 300 TPS (배치 시 3,000)
- FIFO는 MessageGroupId 관리 오버헤드 추가, 이점 없음
- At-least-once 전달 → Worker는 멱등성(idempotent) 설계로 중복 처리 대응

**설정값 고정:**
| 항목 | 값 | 이유 |
|---|---|---|
| Visibility Timeout | Worker 타임아웃 × 2 | 처리 중 다른 Consumer가 메시지 가져가는 것 방지 |
| Message Retention | 4일 | DLQ 이동 전 재시도 시간 확보 |
| Max Receive Count | 3 | 과도한 재시도로 인한 비용 방지 |
| DLQ Retention | 14일 | 실패 원인 분석 시간 확보 |

## 결과

- 같은 Job 메시지가 두 번 처리될 수 있음 — S3 업로드는 키가 동일하면 덮어쓰므로 안전
- DLQ에 쌓인 메시지는 CloudWatch 알람으로 감지 (Phase 4에서 구현)
