# 로컬 개발 환경 세팅 가이드

## 사전 요구사항

| 도구 | 최소 버전 | 설치 확인 |
|------|-----------|-----------|
| Node.js | 20+ | `node -v` |
| pnpm | 9+ | `pnpm -v` |
| Docker Desktop | 최신 | `docker -v` |

**Windows 사용자 추가 설정:**

- Docker Desktop은 WSL2 백엔드 모드로 실행하는 것을 권장합니다.
- Python, FFmpeg는 로컬에 설치할 필요 없습니다. Worker 컨테이너 내부에 포함되어 있습니다.

---

## 초기 설정 단계

### 1. 레포지토리 클론

```bash
git clone <repo-url> youtube-shorts-automation
cd youtube-shorts-automation
```

### 2. 환경변수 파일 생성

```bash
# 루트 환경변수 (API, workers 공통)
cp .env.example .env.local

# web 전용 환경변수 (Next.js)
cp apps/web/.env.example apps/web/.env.local
```

이후 각 파일을 열어 실제 값을 입력합니다. 변수별 설명은 [`env-vars.md`](./env-vars.md)를, API 키 발급 방법은 [`api-keys.md`](./api-keys.md)를 참고하세요.

### 3. 의존성 설치

```bash
pnpm install
```

### 4. Docker Compose 실행 (LocalStack + PostgreSQL)

```bash
docker compose up -d
```

서비스 목록:

| 서비스 | 역할 |
|--------|------|
| `postgres` | PostgreSQL 14 |
| `localstack` | SQS 큐 5개 + DLQ 5개, S3 버킷 자동 생성 |
| `migrate` | Prisma 마이그레이션 실행 후 종료 (one-shot) |
| `api` | NestJS API 서버 (포트 3000) |
| `web` | Next.js 대시보드 (포트 3001) |
| `script-worker` | SQS 폴링 → Gemini 스크립트 생성 |
| `tts-worker` | SQS 폴링 → edge-tts 음성 합성 |
| `subtitle-worker` | SQS 폴링 → 스크립트 기반 SRT 자막 생성 |
| `render-worker` | SQS 폴링 → FFmpeg 영상 렌더링 |
| `upload-worker` | SQS 폴링 → YouTube 업로드 |

> `migrate` 서비스는 `postgres` healthy 이후 자동 실행되고 종료됩니다. 수동 마이그레이션은 불필요합니다.

> LocalStack과 PostgreSQL만 먼저 띄우려면: `docker compose up -d postgres localstack`

### 5. 개발 서버 실행

```bash
pnpm dev
```

> Docker Compose 전체 환경(`docker compose up -d`)을 사용할 경우 `pnpm dev`는 불필요합니다. 빌드 없이 컨테이너만으로 전체 파이프라인이 동작합니다.

---

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 전체 패키지 개발 서버 실행 (Turborepo) |
| `pnpm build` | 전체 패키지 빌드 |
| `pnpm test` | 전체 테스트 실행 |
| `pnpm lint` | 전체 린트 검사 |
| `pnpm --filter @shorts/api dev` | API 서버만 실행 |
| `pnpm --filter @shorts/web dev` | Next.js만 실행 |
| `pnpm --filter @shorts/shared prisma:migrate` | Prisma 마이그레이션 (Docker 외부 실행 시) |
| `pnpm --filter @shorts/shared exec prisma studio` | Prisma Studio (DB GUI) |

---

## 포트 정보

| 서비스 | 포트 | 용도 |
|--------|------|------|
| NestJS API | `3000` | REST API |
| Next.js Web | `3001` | 대시보드 |
| PostgreSQL | `5432` | 데이터베이스 |
| LocalStack | `4566` | SQS / S3 에뮬레이터 |

---

## 로컬 동작 확인

Docker Compose 실행 후 다음 명령으로 job 생성 → 파이프라인 전 과정이 트리거되는지 확인합니다.

```bash
# job 생성 요청 (수동 토픽)
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"topic": "오늘의 한국사 퀴즈", "channelId": "<채널ID>"}'

# 뉴스 자동 수집 → 일괄 job 생성
curl -X POST http://localhost:3000/jobs/auto-news \
  -H "Content-Type: application/json" \
  -d '{"channelId": "<채널ID>", "category": "top", "count": 3}'
```

응답에서 `jobId`를 확인한 뒤 상태를 폴링합니다:

```bash
curl http://localhost:3000/jobs/<jobId>
```

LocalStack SQS 메시지 확인:

```bash
# 큐 목록 확인
aws --endpoint-url=http://localhost:4566 sqs list-queues

# 특정 큐의 메시지 수 확인
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/script-queue \
  --attribute-names ApproximateNumberOfMessages
```

---

## Docker 없이 직접 실행 (선택)

Docker를 사용하지 않고 개발할 경우 다음을 직접 준비해야 합니다:

1. **PostgreSQL 직접 실행**: 로컬에 PostgreSQL 14+ 설치 후 `DATABASE_URL` 설정
2. **마이그레이션 수동 실행**: `pnpm --filter @shorts/shared prisma:migrate`
3. **LocalStack 대신 실제 AWS**: `AWS_ENDPOINT_URL` 변수를 제거하고 실제 SQS/S3 사용
4. **각 워커 개별 실행**:

```bash
pnpm --filter @shorts/script-worker dev
pnpm --filter @shorts/tts-worker dev
# ... 나머지 워커
```

> 직접 실행 시 `.env.local`의 호스트명이 `localhost` 기준으로 설정되어 있는지 확인합니다. Docker 내부 호스트명(`postgres`, `localstack`)은 직접 실행 환경에서 동작하지 않습니다.

> subtitle-worker는 `ffprobe`가 PATH에 있어야 합니다 (Docker 컨테이너 외부 실행 시). faster-whisper 제거 후 python3 불필요.

---

## Phase 3: Supabase 사용 시 설정 차이 (완료 — 현재 적용됨)

루트 `.env.local`이 이미 Supabase로 설정되어 있습니다 (`DATABASE_URL`, `DIRECT_URL`).

신규 환경에서 세팅할 경우:

```bash
# .env.local
# Transaction pooler (포트 6543) — 런타임 쿼리용, connection_limit=1 필수
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?connection_limit=1

# Session pooler (포트 5432) — 마이그레이션 전용
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
```

> 실제 호스트는 Supabase 대시보드 → Connect 버튼 → Transaction pooler/Session pooler에서 확인.  
> `pgbouncer=true` 파라미터는 구형 포맷이므로 사용하지 않는다.

`schema.prisma` 설정 (이미 적용됨):

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

자세한 내용은 `docs/operations/runbook/deploy.md` 및 `docs/adr/007-database-strategy.md`를 참고하세요.

---

## Phase 2 — 웹 대시보드 (로컬 개발)

`docker compose up -d`로 로컬 API를 기동한 상태에서 대시보드를 개발·검증한다.

```bash
# 웹 개발 서버 시작 (docker compose up -d가 실행 중이어야 함)
pnpm --filter web dev
```

- `http://localhost:3001` 에서 대시보드 확인
- Google OAuth 로그인
- `/dashboard` — Job 카드 피드 (2초 폴링), 조회수 실시간 표시
- `/dashboard/[id]` — 상태 타임라인 + 재시도
- `/channels/[id]` — 채널 관리 + YPP 진행률

---

## Phase 4+ 추가 사전 요구사항

AWS 이관(Phase 4~)부터는 아래 도구도 필요합니다.

| 도구 | 버전 | 용도 |
|------|------|------|
| FFmpeg | 최신 | 렌더링 (`ffmpeg`, `ffprobe` PATH 등록) |
| AWS CLI | v2 | AWS 이관 |
| Terraform | 1.6+ | 인프라 프로비저닝 |

> Phase 1~2(로컬 파이프라인)에서는 FFmpeg·AWS CLI·Terraform이 불필요합니다. Worker 컨테이너 내부에 포함되어 있습니다.

---

## 관련 문서

- [`env-vars.md`](./env-vars.md) — 전체 환경변수 레퍼런스
- [`api-keys.md`](./api-keys.md) — API 키 발급 가이드
- [`../runbook/deploy.md`](../runbook/deploy.md) — 프로덕션 배포 절차
- [`commands.md`](./commands.md) — 개발 명령어 레퍼런스
