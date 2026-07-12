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
| subtitle-worker | - | 글자 비례 SRT 자막 생성 |
| render-worker | - | FFmpeg 영상 렌더링 |
| upload-worker | - | YouTube 업로드 |

---

## Web 앱 빌드 주의사항

`apps/web`의 `next.config.ts`는 `DOCKER_BUILD=true` 환경변수가 있을 때만 `output: 'standalone'`을 활성화합니다.

| 환경 | 명령어 | standalone |
|------|--------|------------|
| 로컬 개발/빌드 | `pnpm build` | 비활성 (Windows symlink 권한 오류 방지) |
| Docker 이미지 빌드 | `DOCKER_BUILD=true pnpm build` | 활성 (`.next/standalone` 생성) |

Dockerfile(`apps/web/Dockerfile`) builder 스테이지에 `DOCKER_BUILD=true`가 이미 설정되어 있습니다.

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
  --cluster prod-shorts \
  --service api \
  --force-new-deployment
```

> **ESM 주의**: `@shorts/api`, `@shorts/shared`를 포함한 모든 패키지가 `"type": "module"` (ESM)로 전환되어 있습니다. `require()` 또는 CommonJS 전용 라이브러리 추가 시 호환성을 확인하세요. `tsconfig.base.json`의 `module`은 `NodeNext`로 고정합니다.

### 배포 확인

```bash
aws ecs describe-services \
  --cluster prod-shorts \
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

> **P4-2 완료**: 각 Worker 디렉토리에 `serverless.yml`이 존재합니다. SSM 파라미터 이름 형식: `shorts.prod.{KEY}` (점 구분자, 슬래시 없음).

---

## Fargate Workers 배포 (Phase 4+)

subtitle-worker (스크립트 기반 SRT 생성)와 render-worker (FFmpeg)는 Fargate로 운영된다.

> subtitle-worker는 faster-whisper/STT를 사용하지 않습니다. `script.json`의 `script` 필드 + 오디오 길이 기반 글자 비례로 SRT를 생성하므로 GPU/모델 의존성이 없습니다. (2026-07-12: tts-worker가 msedge-tts로 교체되어 VTT 미생성 → 항상 글자 비례 방식 사용)

### ECS 서비스 이름

| Worker | ECS 서비스 명 | ECR 레포 |
|--------|--------------|----------|
| subtitle-worker | `subtitle-worker` | `682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/subtitle-worker` |
| render-worker | `render-worker` | `682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/render-worker` |

### ECR 로그인 (Windows)

PowerShell에서 파이프 대신 `--password` 플래그 직접 사용:

```powershell
$token = (aws ecr get-authorization-token --region ap-northeast-2 --query "authorizationData[0].authorizationToken" --output text)
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($token))
$pass = $decoded.Split(':')[1]
docker login --username AWS --password $pass 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com
```

### 빌드 및 배포

```bash
# 1. TypeScript 빌드 (dist/ 갱신)
pnpm --filter @shorts/shared build
pnpm --filter @shorts/subtitle-worker build
pnpm --filter @shorts/render-worker build

# 2. Docker 이미지 빌드 (프로젝트 루트에서 실행)
docker build -f apps/workers/subtitle/Dockerfile \
  -t 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/subtitle-worker:latest .
docker build -f apps/workers/render/Dockerfile \
  -t 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/render-worker:latest .

# 3. ECR 푸시
docker push 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/subtitle-worker:latest
docker push 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/render-worker:latest

# 4. ECS 서비스 업데이트 (새 이미지 반영)
aws ecs update-service --cluster prod-shorts --service subtitle-worker --force-new-deployment
aws ecs update-service --cluster prod-shorts --service render-worker --force-new-deployment
```

### ECS 환경변수 관리

task definition revision 2부터 SSM 시크릿 사용:

| 변수 | subtitle | render | 방식 |
|------|----------|--------|------|
| `DATABASE_URL` | ✅ | ✅ | SSM SecureString |
| `PEXELS_API_KEY` | - | ✅ | SSM SecureString |
| `S3_BUCKET_NAME` | ✅ | ✅ | env (평문) |
| `SQS_*_QUEUE_URL` | ✅ | ✅ | env (평문) |

SSM 파라미터 이름: `shorts.prod.DATABASE_URL`, `shorts.prod.PEXELS_API_KEY`

`FargateTaskExecutionRole`에 `ssm-read-inline` 인라인 정책 추가 필요 (이미 적용됨).

### Fargate 리소스 스펙

| Worker | vCPU | 메모리 |
|--------|------|--------|
| subtitle-worker | 2 | 8 GB |
| render-worker | 4 | 16 GB |

---

## API Lambda 배포 (Phase 4+)

`apps/api` NestJS 앱을 `@fastify/aws-lambda`로 래핑하여 API Gateway(HTTP API v2) + Lambda로 배포한다.

### 빌드 및 배포

```bash
cd apps/api
npx serverless deploy
```

### API Gateway URL 확인 및 OAuth 설정

배포 후 터미널 출력 또는 AWS 콘솔에서 API Gateway URL 확인 후:

1. SSM 업데이트:
   ```bash
   aws ssm put-parameter --name "shorts.prod.YOUTUBE_REDIRECT_URI" \
     --value "https://{api-id}.execute-api.ap-northeast-2.amazonaws.com/auth/youtube/callback" \
     --type String --overwrite
   aws ssm put-parameter --name "shorts.prod.WEB_ORIGIN" \
     --value "https://{web-url}" --type String --overwrite
   ```
2. Google Cloud Console → OAuth 2.0 클라이언트 → 승인된 리디렉션 URI에 추가
3. `serverless deploy` 재실행 (YOUTUBE_REDIRECT_URI 적용)

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
  --cluster prod-shorts \
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
  --cluster prod-shorts \
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
