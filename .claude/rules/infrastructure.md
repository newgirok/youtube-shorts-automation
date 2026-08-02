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
| cloudwatch-notifier | Lambda | 128MB | 30s |

**모든 Worker가 Lambda로 운영 중** (subtitle, render 포함) — Fargate ECS Worker 없음.
기준: 실행시간 > 15분 또는 메모리 > 3GB → Fargate, 그 외 → Lambda.

## 새 Lambda Worker 추가 체크리스트
- [ ] `infra/terraform/modules/sqs-queue/`로 큐 + DLQ 정의
- [ ] `infra/terraform/` IAM 권한 추가
- [ ] `apps/workers/{name}/serverless.yml` 작성 (esbuild, `individually: true`)
- [ ] 이전 단계 Worker에 다음 큐 전송 로직 추가
- [ ] `JobStatus` enum에 새 상태 추가
- [ ] Visibility Timeout = Worker 타임아웃 × 2 적용
- [ ] CloudWatch Lambda 에러율 알람은 `locals.lambda_workers` 맵에 추가하면 자동 생성됨 (DLQ 알람은 별도 추가하지 않음 — dlq-notifier가 커버)

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
| `.github/workflows/deploy-web.yml` | `apps/web/app/**`, `apps/web/src/**`, `apps/web/components/**`, `apps/web/lib/**`, `apps/web/middleware.ts`, `apps/web/next.config.ts`, `apps/web/package.json`, `apps/web/Dockerfile`, `packages/shared/src/**`, `packages/shared/prisma/**` | ECR push → EC2 `docker compose up -d` |

**path filter 원칙**: 소스 코드(`src/**`, `app/**`, `components/**`, `lib/**`)와 배포 설정(`serverless.yml`, `Dockerfile`, `package.json`, `prisma/**`)만 포함.
`*.md`, `CLAUDE.md`, `docs/` 등 문서 변경은 path filter 밖 → 불필요한 배포 방지.
workflow 파일 자체도 제외 — CI 수정 테스트는 `workflow_dispatch` 수동 실행으로 진행.

### Slack 배포 알림

모든 워크플로우는 배포 완료·실패 시 Slack Block Kit 알림을 전송한다.

**레이아웃 (세로 배치, 6블록)**:
```
✅ *[PRD] Deploy API*

🚀  *Platform*    AWS Lambda       ← deploy-api / deploy-workers
🖥️  *Server*    13.124.x.x (EC2)  ← deploy-web (EC2_HOST 시크릿)
📦  *App*    API | Workers | Web
⏰  *Time*    2026-08-02 15:45:33
🔧  *Trigger*    push → main
──────────────────────────────────
fix(ci): 커밋 메시지 한 줄
브랜치: main  ·  커밋: abc1234  ·  작성자: newgirok
[ 배포 로그 ]  [ 커밋 ]
```

**블록 구조**:
- `section` — 헤더(`✅/❌ *[PRD] Deploy {App}*`) — repo명·한글 접미사 없음
- `section` — Platform/Server + App + Time + Trigger 세로 나열 (단일 mrkdwn)
- `divider`
- `section` — 커밋 메시지 첫 줄
- `context` — 브랜치 · 커밋 · 작성자 (작은 글씨)
- `actions` — `배포 로그` / `커밋` 버튼 (화살표 없음)

**구현 요점**:
- deploy-api / deploy-workers: `Platform = AWS Lambda` (서버리스, EC2 없음)
- deploy-web: `Server = $EC2_HOST (EC2)` — env에 `EC2_HOST: ${{ secrets.EC2_HOST }}` 추가
- 커밋 메시지: `head -1`으로 첫 줄만 추출
- 작성자: `"${AUTHOR_NAME} <${AUTHOR_EMAIL}>"` 조합
- 시각: `TZ=Asia/Seoul date "+%Y-%m-%d %H:%M:%S"`
- 트리거: `workflow_dispatch` 또는 `push → {branch}`
- 성공: `#2eb886` / 실패: `#e01e5a`
- payload: `jq -n --arg ...` 로 구성 (특수문자 안전 처리)
- `SLACK_WEBHOOK_URL`은 GitHub Secret으로 관리

### deploy-workers 특이사항

matrix + 별도 `notify` job 구조:
```
deploy-lambda (matrix: script/tts/subtitle/upload/scheduler/dlq-notifier/cloudwatch-notifier)
deploy-render (ECR build + push)
    ↓ needs: [deploy-lambda, deploy-render], if: always()
notify (Slack 알림 전송)
```

## 참고 ADR
- `docs/adr/001-lambda-vs-fargate.md` — 환경 결정 근거
- `docs/adr/003-sqs-standard-queue.md` — SQS 설정 근거
- `docs/adr/006-iac-terraform-serverless.md` — IaC 분리 근거
- `docs/adr/009-fargate-sqs-long-polling.md` — Fargate SQS Long Polling
