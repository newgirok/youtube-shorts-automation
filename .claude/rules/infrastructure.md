# 인프라 규칙 (infra/)

## IaC 도구 분리 원칙 (ADR 006, 변경 금지)

| 대상 | 도구 | 위치 |
|---|---|---|
| S3, SQS, IAM, ECR, EventBridge | Terraform | `infra/terraform/*.tf` |
| Lambda 함수 배포, SQS 트리거 | Serverless Framework v3 | `apps/workers/*/serverless.yml` |

Terraform과 Serverless Framework를 CDK로 통일하지 말 것.

## Worker 배포 환경 결정 기준

| Worker | 환경 | 메모리 | 타임아웃 |
|---|---|---|---|
| script-worker | Lambda | 512MB | 60s |
| tts-worker | Lambda | 512MB | 120s |
| subtitle-worker | Lambda | 512MB | 120s |
| render-worker | Lambda Container Image | 3008MB | 600s |
| upload-worker | Lambda | 256MB | 300s |
| scheduler-worker | Lambda | 256MB | 60s |
| dlq-notifier | Lambda | 128MB | 30s |

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

## GitHub Actions CI/CD

### 워크플로우 파일

| 파일 | 트리거 대상 | 배포 방식 |
|---|---|---|
| `.github/workflows/deploy-api.yml` | `apps/api/src/**`, `apps/api/serverless.yml`, `apps/api/package.json`, `packages/shared/src/**`, `packages/shared/prisma/**` | `npx serverless@3 deploy --stage prod` |
| `.github/workflows/deploy-workers.yml` | `apps/workers/**/src/**`, `apps/workers/**/serverless.yml`, `apps/workers/**/package.json`, `packages/shared/src/**`, `packages/shared/prisma/**` | Lambda: `sls deploy` / render-worker: ECR push + `sls deploy` |
| `.github/workflows/deploy-web.yml` | `apps/web/**`, `packages/shared/**` | ECR push → EC2 `docker compose up -d` |

**path filter 원칙**: `src/**`, `serverless.yml`, `package.json`, `prisma/**`만 포함.
`*.md`, `CLAUDE.md` 등 문서 변경은 path filter 밖 → 불필요한 배포 방지.

### Slack 배포 알림

모든 워크플로우는 배포 완료·실패 시 Slack Block Kit 알림을 전송한다.

```yaml
- name: Slack 배포 결과 알림
  if: always()
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
    STATUS: ${{ job.status }}   # deploy-workers는 needs.*.result 사용
  run: |
    FIRST_LINE=$(echo "$COMMIT_MSG" | head -1 | \
      python3 -c "import sys; s=sys.stdin.read().strip(); print(s[:60]+'…' if len(s)>60 else s)")
    # jq로 Block Kit payload 구성 → curl Webhook 전송
```

- 성공: 좌측 컬러바 `#2eb886` + `✅` 아이콘
- 실패: 좌측 컬러바 `#e01e5a` + `❌` 아이콘
- 필드: 브랜치 / 커밋 SHA / 작성자 / 변경사항(60자 Python Unicode 슬라이싱)
- 버튼: Actions 보기 / 커밋 보기
- `SLACK_WEBHOOK_URL`은 GitHub Secret으로 관리

### deploy-workers 특이사항

matrix + 별도 `notify` job 구조:
```
deploy-lambda (matrix: script/tts/subtitle/upload/scheduler/dlq-notifier)
deploy-render (ECR build + push)
    ↓ needs: [deploy-lambda, deploy-render], if: always()
notify (Slack 알림 전송)
```

## 참고 ADR
- `docs/adr/001-lambda-vs-fargate.md` — 환경 결정 근거
- `docs/adr/003-sqs-standard-queue.md` — SQS 설정 근거
- `docs/adr/006-iac-terraform-serverless.md` — IaC 분리 근거
- `docs/adr/009-fargate-sqs-long-polling.md` — Fargate SQS Long Polling
