# 개발 명령어

## 전체 패키지

```bash
pnpm install          # 의존성 설치
pnpm build            # 전체 패키지 빌드 (Turborepo)
pnpm lint             # 전체 ESLint 검사
pnpm test             # 전체 테스트
```

## 개별 패키지 개발 서버

```bash
pnpm --filter @shorts/api dev
pnpm --filter @shorts/web dev
```

## Prisma (`packages/shared` 기준)

```bash
pnpm --filter @shorts/shared prisma:generate   # Prisma Client 재생성
pnpm --filter @shorts/shared prisma migrate dev  # 개발 마이그레이션 생성
pnpm --filter @shorts/shared prisma:migrate    # 프로덕션 마이그레이션 적용
pnpm --filter @shorts/shared prisma studio     # DB GUI
```

## Docker Compose (로컬 통합 환경)

```bash
docker-compose up             # 전체 스택 기동 (LocalStack·PostgreSQL·전체 Worker 포함)
docker-compose up localstack  # LocalStack만 기동
docker-compose down -v        # 스택 종료 + 볼륨 삭제
```
