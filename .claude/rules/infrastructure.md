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
| render-worker | Lambda Container Image | 3008MB | 600s |

**모든 Worker가 Lambda로 운영 중** (subtitle, render 포함) — Fargate ECS Worker 없음.
기준: 실행시간 > 15분 또는 메모리 > 3GB → Fargate, 그 외 → Lambda.

## 새 Lambda Worker 추가 체크리스트
- [ ] `infra/terraform/modules/sqs-queue/`로 큐 + DLQ 정의
- [ ] `infra/terraform/` IAM 권한 추가
- [ ] `apps/workers/{name}/serverless.yml` 작성 (esbuild, `individually: true`)
- [ ] 이전 단계 Worker에 다음 큐 전송 로직 추가
- [ ] `JobStatus` enum에 새 상태 추가
- [ ] Visibility Timeout = Worker 타임아웃 × 2 적용

## Serverless Framework SSM 참조 주의사항
`serverless.yml`의 `${ssm:...}` 값은 `sls deploy` 시점에 해결되어 Lambda 환경변수에 직접 저장됨.
SSM 파라미터 값을 업데이트해도 재배포 전까지 Lambda에 반영되지 않음.
즉시 반영이 필요한 경우 `aws lambda update-function-configuration`으로 직접 수정:
```bash
aws lambda update-function-configuration \
  --function-name <function-name> \
  --environment "Variables={API_BASE_URL=<new-value>, ...}"
```
단, 이 방법은 다음 `sls deploy` 시 덮어씌워지므로 근본 해결은 재배포가 원칙.

## LocalStack 로컬 환경
- `docker-compose.yml`: LocalStack + PostgreSQL + 전체 Worker
- 환경변수: 루트 `.env.local` (`env_file: .env.local`)
- LocalStack init: `infra/localstack/init/init-aws.sh`
- 로컬 SQS URL 형식: `http://localhost:4566/000000000000/{queue-name}`

## 참고 ADR
- `docs/adr/001-lambda-vs-fargate.md` — 환경 결정 근거
- `docs/adr/003-sqs-standard-queue.md` — SQS 설정 근거
- `docs/adr/006-iac-terraform-serverless.md` — IaC 분리 근거
- `docs/adr/009-fargate-sqs-long-polling.md` — Fargate Long Polling (Superseded, Lambda 전환 경위 기록)
