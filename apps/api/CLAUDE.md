# @shorts/api

NestJS + Fastify 기반 REST API 서버.

## 주요 명령
- `pnpm dev` — tsx watch 개발 서버 (포트 3000)
- `pnpm build` — tsc 컴파일
- `pnpm start` — node dist/main.js 프로덕션 실행

## 의존성
- @shorts/shared (Prisma, S3, Pino 로거, Zod 환경변수)

## 주요 모듈
- `auth/` — Google OAuth 채널 연결
- `channels/` — YouTube 채널 CRUD
- `jobs/` — Job 생성 작업 트리거 → SQS 발행
