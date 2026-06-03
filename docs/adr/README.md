# ADR (Architecture Decision Record) 목록

ADR은 이 프로젝트에서 내린 주요 기술 결정과 그 근거를 영구 기록으로 남기는 문서입니다. 한 번 내려진 결정을 번복할 때는 새 ADR을 추가하거나 기존 ADR의 상태를 `Superseded`로 변경합니다. 결정을 내린 시점의 맥락을 보존해 미래의 팀원이 "왜 이렇게 됐지?"를 추적할 수 있도록 합니다.

---

## ADR 목록

| 번호 | 제목 | 한 줄 요약 | 상태 |
|---|---|---|---|
| [ADR 001](./001-lambda-vs-fargate.md) | Worker 배포 환경 — Lambda vs ECS Fargate | script/tts/upload → Lambda, subtitle/render → Fargate (메모리·타임아웃 기준) | Accepted |
| [ADR 002](./002-tts-engine.md) | TTS 엔진 선택 — Edge-TTS | 무료 + 한국어 자연스러움, Phase 7에서 Clova Voice로 교체 예정 | Accepted |
| [ADR 003](./003-sqs-standard-queue.md) | SQS Standard Queue (FIFO 불사용) | Job 간 순서 보장 불필요, 멱등성 설계로 at-least-once 중복 처리 대응 | Accepted |
| [ADR 004](./004-render-engine.md) | 렌더링 엔진 — FFmpeg | Phase 1~4는 FFmpeg(완료), Phase 5부터 Remotion으로 전환 예정 | Accepted |
| [ADR 005](./005-gemini-flash.md) | AI 모델 — Gemini 2.5 Flash | 무료 1,500 req/day, 한국어 쇼츠 스크립트 품질 합격 | Accepted |
| [ADR 006](./006-iac-terraform-serverless.md) | IaC 전략 — Terraform + Serverless Framework | 인프라(VPC/Fargate/RDS)는 Terraform, Lambda 배포는 Serverless Framework | Accepted |
| [ADR 007](./007-database-strategy.md) | DB 전략 — Supabase (pgBouncer) | Lambda connection_limit=1, pgBouncer 내장으로 연결 폭증 방지 | Accepted |
| [ADR 008](./008-whisper-model.md) | STT 모델 — faster-whisper large-v3 | Superseded: faster-whisper 제거, Edge-TTS VTT 기반 SRT 생성으로 교체 | Superseded |
| [ADR 009](./009-fargate-sqs-long-polling.md) | Fargate SQS Long Polling 자체 구현 | Cold Start 방지를 위해 ECS Service 상시 실행 + 자체 폴링 루프 | Accepted |

---

## ADR 작성 규칙

새 ADR을 추가할 때는 다음 구조를 따릅니다:

```
# ADR NNN: 제목

**상태:** Accepted | Superseded by ADR NNN | Deprecated

## 배경
왜 이 결정이 필요했는가.

## 결정
무엇을 선택했는가. 비교표 포함 권장.

## 결과
선택의 트레이드오프, 향후 주의사항.
```
