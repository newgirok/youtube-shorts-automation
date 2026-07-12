# AI YouTube Shorts 자동화 플랫폼 — 문서 허브

토픽 또는 뉴스 RSS에서 자동 수집한 주제로 스크립트 생성 → TTS → 자막 → 영상 합성 → YouTube 업로드까지 전 과정이 자동화되는 플랫폼입니다. 한국 뉴스·시사 쇼츠 채널에 특화되어 있습니다.

---

## 빠른 시작

로컬 개발 환경 세팅은 [로컬 환경 세팅 가이드](./onboarding/local-setup.md)를 참고하세요.

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 설정
cp .env.example .env.local              # 루트 (API, workers 공통)
cp apps/web/.env.example apps/web/.env.local  # Next.js 전용

# 3. 전체 스택 기동 (LocalStack + PostgreSQL + 마이그레이션 자동 실행 + 전체 Worker)
docker compose up -d
```

환경변수 항목별 설명은 [환경변수 가이드](./onboarding/env-vars.md)를 확인하세요.

---

## 주요 문서

| 문서 | 설명 |
|---|---|
| [아키텍처 개요](./architecture/overview.md) | 시스템 전체 구조, 기술 스택, 외부 의존성 |
| [파이프라인 흐름](./architecture/pipeline-flow.md) | 5단계 파이프라인 상세, 상태 전이, 실패 처리 |
| [데이터 모델](./architecture/data-model.md) | Prisma 스키마, ER 다이어그램, 필드 설명 |
| [프로젝트 구조](./architecture/project-structure.md) | 전체 디렉토리 트리 및 파일별 역할 설명 |
| [ADR 목록](./adr/README.md) | 주요 기술 결정 기록 9개 |
| [비즈니스 규칙](./product/business-rules.md) | 핵심 도메인 규칙, 스크립트 출력 형식 |
| [용어 사전](./product/terminology.md) | 프로젝트 도메인 용어 정의 |
| [PRD](./prd.md) | 제품 요구사항 문서 |
| [로드맵](./roadmap.md) | Phase 0~7 개발 계획 |

### 온보딩 가이드

| 문서 | 설명 |
|---|---|
| [로컬 환경 세팅](./onboarding/local-setup.md) | Node.js, Docker, DB 초기 설정 |
| [API 키 설정](./onboarding/api-keys.md) | Gemini, YouTube OAuth2, NextAuth, 암호화 키, Pexels 발급 |
| [환경변수 레퍼런스](./onboarding/env-vars.md) | 전체 환경변수 목록 및 설명 |
| [개발 명령어](./onboarding/commands.md) | pnpm / Prisma / Docker Compose 명령어 레퍼런스 |

### 운영 가이드

| 문서 | 설명 |
|---|---|
| [배포 절차](./operations/runbook/deploy.md) | 로컬~AWS 배포 단계별 절차 |
| [모니터링](./operations/monitoring.md) | CloudWatch, DLQ 알림, Sentry, Budget Alert |
| [Gemini 할당량 오류](./operations/runbook/gemini-quota.md) | 429 오류 원인 및 해결책 |

### 백엔드 개발

| 문서 | 설명 |
|---|---|
| [개발 컨벤션](./backend/conventions.md) | NestJS 3계층, TypeScript, 로깅, Worker 설계 원칙 |
| [암호화 규격](./backend/security/encryption.md) | AES-256-GCM, DB 저장 포맷, 키 관리 |

---

## 핵심 명령어

```bash
# 전체 의존성 설치
pnpm install

# 인프라 컨테이너 시작
docker compose up -d

# 전체 개발 서버 시작 (Turborepo)
pnpm dev

# 특정 앱만 실행
pnpm --filter @shorts/web dev
pnpm --filter @shorts/api dev

# DB 마이그레이션
pnpm --filter @shorts/shared prisma:migrate

# Prisma Studio (DB 관리 UI)
pnpm --filter @shorts/shared exec prisma studio

# 전체 빌드
pnpm build

# 전체 테스트
pnpm test
```

---

## 현재 Phase 상태

| Phase | 목표 | 상태 |
|---|---|---|
| Phase 0 | TTS/FFmpeg/YouTube API 핵심 리스크 검증 | **완료** |
| Phase 1 | Monorepo 구성, 로컬 파이프라인 구현 (Docker Compose) | **완료** |
| Phase 2 | Next.js 대시보드 (NextAuth, 채널 연결, Job 모니터링, Analytics, sync) | **완료** |
| Phase 3 | Supabase DB 이관 (연결 설정 + 마이그레이션) | **완료** |
| Phase 4 | AWS 서버리스 이관 (Lambda + SQS + Fargate + S3) | **진행 중** (P4-1 Terraform 완료) |
| Phase 5 | EventBridge 스케줄링, DLQ 모니터링, 7일 무중단 운영 | 예정 |
| Phase 6 | Remotion 전환 | 예정 |
| Phase 7 | 멀티채널 독립 스케줄, Fargate 동적 스케일링 | 예정 |
| Phase 8 | GitHub Actions CI/CD, Sentry, Clova Voice 교체 | 예정 |

> Phase 4 진행 전 [ADR 001](./adr/001-lambda-vs-fargate.md), [ADR 006](./adr/006-iac-terraform-serverless.md)을 먼저 확인하세요.

---

## 비용 목표

채널 3개, 영상 90개/월 기준 **$10 이하**. 상세 항목은 [아키텍처 개요 — 비용 목표](./architecture/overview.md#비용-목표-및-예상-비용)를 확인하세요.
