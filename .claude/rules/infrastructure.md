# 인프라 규칙 (infra/)

## IaC 도구 분리 원칙 (ADR 006, 변경 금지)

| 대상 | 도구 | 위치 |
|---|---|---|
| S3, SQS, IAM, ECS, ECR, EventBridge | Terraform | `infra/terraform/*.tf` |
| Lambda 함수 배포, SQS 트리거 | Serverless Framework v3 | `apps/workers/*/serverless.yml` |

Terraform과 Serverless Framework를 CDK로 통일하지 말 것.

## Worker 배포 환경 결정 기준

| Worker | 환경 | 메모리 | 타임아웃 |
|---|---|---|---|
| script-worker | Lambda | 512MB | 60s |
| tts-worker | Lambda | 512MB | 120s |
| upload-worker | Lambda | 256MB | 300s |
| subtitle-worker | Lambda | 512MB | 120s |
| render-worker | ECS Fargate | 4vCPU / 16GB | 600s |

**subtitle/render를 Lambda로 이전 금지** — SQS Long Polling 상시 실행 필요 (ADR 009).
기준: 실행시간 > 15분 또는 메모리 > 3GB → Fargate, 그 외 → Lambda.

## 새 Lambda Worker 추가 체크리스트
- [ ] `infra/terraform/modules/sqs-queue/`로 큐 + DLQ 정의
- [ ] `infra/terraform/` IAM 권한 추가
- [ ] `apps/workers/{name}/serverless.yml` 작성 (esbuild, `individually: true`)
- [ ] 이전 단계 Worker에 다음 큐 전송 로직 추가
- [ ] `JobStatus` enum에 새 상태 추가
- [ ] Visibility Timeout = Worker 타임아웃 × 2 적용

## 새 Fargate Worker 추가 체크리스트
- [ ] `docker/{worker}/Dockerfile` 작성 및 빌드
- [ ] ECR 푸시
- [ ] `infra/terraform/modules/ecs-worker/` Task Definition 작성
  - `SQS_QUEUE_URL` 환경변수 포함
  - `FargateTaskRole`에 `sqs:ChangeMessageVisibility` 권한 확인
- [ ] `aws ecs update-service --force-new-deployment`

## LocalStack 로컬 환경
- `docker-compose.yml`: LocalStack + PostgreSQL + 전체 Worker
- 환경변수: 루트 `.env.local` (`env_file: .env.local`)
- LocalStack init: `infra/localstack/init/init-aws.sh`
- 로컬 SQS URL 형식: `http://localhost:4566/000000000000/{queue-name}`

## 참고 ADR
- `docs/adr/001-lambda-vs-fargate.md` — 환경 결정 근거
- `docs/adr/003-sqs-standard-queue.md` — SQS 설정 근거
- `docs/adr/006-iac-terraform-serverless.md` — IaC 분리 근거
- `docs/adr/009-fargate-sqs-long-polling.md` — Fargate Long Polling 패턴
