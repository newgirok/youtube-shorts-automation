# 데이터베이스 규칙 (Prisma v5)

## findMany 필수 규칙
`findMany()` 단독 호출 금지 — 반드시 `select` 명시:
```typescript
// ❌ 금지 — 모든 필드 조회
const jobs = await prisma.job.findMany();

// ✅ 올바름 — 필요한 필드만
const jobs = await prisma.job.findMany({
  where: { channelId, status: 'COMPLETED' },
  select: { id: true, topic: true, viewCount: true, completedAt: true },
  orderBy: { completedAt: 'desc' },
  take: 20,
});
```

## Lambda 싱글턴 패턴 (Lambda/Fargate 환경 필수)
```typescript
// packages/shared/src/db.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

## BigInt 직렬화
YouTube 조회수/구독자 수는 BigInt — JSON 직렬화 시 처리 필요:
```typescript
// apps/api/src/main.ts
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};
```
- `viewCount`, `likeCount`: `BigInt` (DB 스키마 고정)
- `subscriberCount`: `Int` (YouTube 한계 내)

## 스키마 변경 규칙
- `JobStatus` enum 순서 변경 금지 — 순서가 파이프라인 로직과 연동됨
- 새 필드 추가 시: `@default` 반드시 지정 (기존 row 보호)
- 새 인덱스 추가 시: 마이그레이션 파일 분리 (기존 테이블 lock 방지)

## DIRECT_URL 분리 (ADR 007)
```
DATABASE_URL      → Prisma (connection pooler, Supabase PgBouncer)
DIRECT_URL        → 마이그레이션 전용 (직접 연결)
```
마이그레이션 실행 시 반드시 `DIRECT_URL` 사용 확인.

## 연관 수정 체크리스트
`schema.prisma` 변경 시 반드시 함께 수정:
- [ ] 해당 Worker의 타입 참조 코드
- [ ] `packages/shared/src/types.ts` (필요 시)
- [ ] `JobStatus` enum 변경 → 모든 Worker 상태 업데이트 코드
