# 배포 절차

## 배포 환경 구분

| Phase | 배포 대상 | 방법 |
|-------|-----------|------|
| Phase 1~2 | 로컬 | Docker Compose |
| Phase 3 | Supabase | prisma migrate deploy |
| Phase 4+ | AWS | ECS, Lambda (Serverless Framework), Fargate |

---

## 로컬 개발 (Phase 1~2)

### Docker Compose 기동

```bash
# 전체 서비스 시작
docker compose up -d

# 특정 서비스만 재시작
docker compose up -d --force-recreate script-worker

# 로그 확인
docker compose logs -f api
docker compose logs -f script-worker
```

### 서비스 목록

| 서비스 | 포트 | 설명 |
|--------|------|------|
| postgres | 5432 | PostgreSQL 14 |
| localstack | 4566 | SQS / S3 에뮬레이터 |
| migrate | - | Prisma 마이그레이션 (one-shot) |
| api | 3000 | NestJS API |
| web | 3001 | Next.js 웹 |
| script-worker | - | Gemini 스크립트 생성 |
| tts-worker | - | TTS 음성 합성 |
| subtitle-worker | - | VTT 기반 SRT 자막 생성 |
| render-worker | - | FFmpeg 영상 렌더링 |
| upload-worker | - | YouTube 업로드 |

---

## API 배포 (ECS, Phase 4+)

GitHub Actions `deploy-api.yml` 워크플로우 (`workflow_dispatch` 트리거)가 빌드 → ECR 푸시를 자동으로 수행합니다.

수동 배포가 필요한 경우:

```bash
# 1. 빌드 (ESM 모듈, tsc 컴파일 후 dist/ 생성)
pnpm --filter @shorts/api build

# 2. Docker 이미지 빌드
docker build -f apps/api/Dockerfile -t [ECR_URI]:latest .

# 3. ECR 푸시
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin [ECR_URI]
docker push [ECR_URI]:latest

# 4. ECS 서비스 업데이트
aws ecs update-service \
  --cluster shorts \
  --service api \
  --force-new-deployment
```

> **ESM 주의**: `@shorts/api`, `@shorts/shared`를 포함한 모든 패키지가 `"type": "module"` (ESM)로 전환되어 있습니다. `require()` 또는 CommonJS 전용 라이브러리 추가 시 호환성을 확인하세요. `tsconfig.base.json`의 `module`은 `NodeNext`로 고정합니다.

### 배포 확인

```bash
aws ecs describe-services \
  --cluster shorts \
  --services api \
  --query 'services[0].deployments'
```

`PRIMARY` deployment의 `runningCount`가 `desiredCount`와 같아지면 완료.

---

## Lambda Workers 배포 (Serverless Framework, Phase 4+)

GitHub Actions `_deploy-worker.yml` 워크플로우는 재사용 가능한 워크플로우(reusable workflow)로, 현재 자동 트리거는 비활성화되어 있습니다. 배포는 수동으로 진행합니다.

수동 배포가 필요한 경우:

```bash
# 특정 Worker 배포 (apps/workers/script/ 에서 실행)
cd apps/workers/script
serverless deploy --stage prod

# 다른 Worker들
cd apps/workers/tts    && serverless deploy --stage prod
cd apps/workers/upload && serverless deploy --stage prod
```

각 Worker 디렉토리에 `serverless.yml`이 있으며, SQS 트리거 및 IAM 권한이 정의되어 있다.

---

## Fargate Workers 배포 (Phase 4+)

subtitle-worker (스크립트 기반 SRT 생성)와 render-worker (FFmpeg)는 Fargate로 운영된다.

> subtitle-worker는 faster-whisper를 사용하지 않습니다. tts-worker가 생성한 VTT(word-level timing)를 기반으로 SRT를 생성하므로 GPU/모델 의존성이 없습니다.

```bash
# 1. Docker 이미지 빌드
docker build -f apps/workers/subtitle/Dockerfile \
  -t [ECR_URI]/subtitle-worker:latest .

# 2. ECR 푸시
docker push [ECR_URI]/subtitle-worker:latest

# 3. ECS 서비스 업데이트
aws ecs update-service \
  --cluster shorts \
  --service subtitle-worker \
  --force-new-deployment
```

render-worker도 동일한 절차로 배포한다 (`service: render-worker`).

### Fargate 리소스 스펙

| Worker | vCPU | 메모리 |
|--------|------|--------|
| subtitle-worker | 2 | 8 GB |
| render-worker | 4 | 16 GB |

---

## DB 마이그레이션

### 로컬 (Docker Compose)

`migrate` 서비스가 `postgres` healthy 이후 자동으로 `prisma migrate deploy`를 실행하고 종료합니다. 별도 수동 실행은 필요하지 않습니다.

새 마이그레이션을 추가할 경우:

```bash
# 개발 환경에서 마이그레이션 파일 생성 (로컬 postgres 직접 연결 필요)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shorts \
  pnpm --filter @shorts/shared exec prisma migrate dev --name <이름>
```

### 프로덕션 (Supabase)

```bash
# DIRECT_URL(Session mode 포트 5432)로 마이그레이션 적용
pnpm --filter @shorts/shared prisma:migrate
```

### 최근 마이그레이션 이력

| 파일 | 내용 |
|------|------|
| `20260511123832_init` | 초기 스키마 생성 |
| `20260519000000_add_watch_time_minutes` | `ChannelAnalytics.watchTimeMinutes` 컬럼 추가 |
| `20260520000000_add_privacy_status` | `Job.privacyStatus` 컬럼 추가 (기본값 `public`) |
| `20260525152454_add_scheduler_fields` | `Channel.schedulerEnabled`, `schedulerCategory`, `uploadSchedule` 컬럼 추가 |
| `20260525180000_add_job_thumbnail_url` | `Job.thumbnailUrl` 컬럼 추가 |
| `20260525190000_drop_channel_analytics` | `ChannelAnalytics` 테이블 삭제 |
| `20260525200000_restore_channel_analytics` | `ChannelAnalytics` 테이블 복원 |

---

## Supabase 연결 (Phase 3, P3-1~P3-2)

### 1. 연결 문자열 확인

Supabase 대시보드 → Settings → Database → Connection string

| 용도 | 모드 | 포트 | 환경변수 |
|------|------|------|----------|
| 런타임 (Lambda) | Transaction (pgBouncer) | 6543 | `DATABASE_URL` |
| 마이그레이션 전용 | Session | 5432 | `DIRECT_URL` |

Lambda는 연결을 재사용할 수 없으므로 Transaction mode(pgBouncer)를 사용하고, URL에 `connection_limit=1`을 추가한다.

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?connection_limit=1
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
```

> 실제 호스트는 Supabase 대시보드 → Connect → Transaction pooler/Session pooler에서 확인한다. 리전에 따라 `aws-0`/`aws-1` 등이 다를 수 있다.

### 2. schema.prisma 설정

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### 3. 마이그레이션 실행

```bash
# DIRECT_URL을 사용해 마이그레이션 적용
pnpm prisma migrate deploy
```

### 4. Secrets Manager에 저장

```bash
aws secretsmanager create-secret \
  --name "shorts/prod/database" \
  --secret-string '{"DATABASE_URL":"...","DIRECT_URL":"..."}'
```

---

## 롤백

### ECS 롤백 (API / Fargate Workers)

ECS는 이전 태스크 정의(Task Definition) 리비전으로 되돌린다.

```bash
# 태스크 정의 리비전 목록 확인
aws ecs list-task-definitions \
  --family-prefix shorts-api \
  --sort DESC

# 이전 리비전으로 서비스 업데이트 (예: revision 5)
aws ecs update-service \
  --cluster shorts \
  --service api \
  --task-definition shorts-api:5
```

### Lambda 롤백 (Serverless Framework)

```bash
# 이전 배포 목록 확인
serverless deploy list --stage prod

# 특정 타임스탬프로 롤백
serverless rollback --timestamp 2024-01-15T12:00:00.000Z --stage prod
```

---

## 공통 오류 해결

### DB 연결 오류 (Lambda)

**증상**: `too many connections` 또는 연결 타임아웃

**원인**: Lambda 동시 실행 시 연결 수 폭발

**해결**:
1. `DATABASE_URL`에 `connection_limit=1` 파라미터 추가 확인
2. pgBouncer Transaction mode(포트 6543) 사용 확인
3. Supabase 대시보드 → Database → Connection Pooling 설정 확인

### Lambda Cold Start 대응

**증상**: 첫 호출 시 5~10초 지연

**대응**:
- Provisioned Concurrency 설정 (비용 증가 주의)
- 또는 SQS Visibility Timeout을 Lambda 타임아웃의 2배로 설정 (현재 표준 적용됨)
- Bundle 사이즈 최소화 (`esbuild` 번들링, `devDependencies` 제외)

### ECS 태스크 시작 실패

**증상**: ECS 콘솔에서 태스크가 즉시 STOPPED 상태

**확인**:
```bash
aws ecs describe-tasks \
  --cluster shorts \
  --tasks [TASK_ARN] \
  --query 'tasks[0].stoppedReason'
```

**주요 원인**:
- ECR 이미지 미존재 → `docker push` 완료 여부 확인
- Secrets Manager 접근 권한 없음 → FargateTaskRole IAM 정책 확인
- 메모리 초과 → CloudWatch 로그에서 OOM 메시지 확인

---

## pnpm 스크립트를 통한 Lambda Worker 배포

각 Worker에 `deploy:prod` 스크립트가 정의되어 있는 경우 루트에서도 배포 가능합니다.

```bash
pnpm --filter @shorts/script-worker deploy:prod
pnpm --filter @shorts/tts-worker deploy:prod
pnpm --filter @shorts/upload-worker deploy:prod
```

---

## 관련 문서

- [모니터링 가이드](../monitoring.md)
- [로컬 개발 환경 설정](../../onboarding/local-setup.md)
- [IaC 전략 ADR](../../adr/006-iac-terraform-serverless.md)
- [데이터베이스 전략 ADR](../../adr/007-database-strategy.md)
