# ADR 007: DB 전략 — Supabase (dev) → RDS (prod)

**상태:** Accepted

## 배경

PostgreSQL 호스팅 전략과 Lambda 환경의 DB 연결 관리 방법 결정이 필요했다.

## 결정

**Phase 1~6: Supabase, Phase 7+: RDS 전환 검토**

**Supabase를 초기에 선택한 이유:**
- 별도 인프라 설정 없이 즉시 PostgreSQL 사용 가능
- 내장 pgBouncer — Lambda Cold Start 시 발생하는 다수 연결 관리에 필수
- Free tier로 파이프라인 검증 비용 없음

**RDS 전환 기준 (둘 중 하나 충족 시):**
- 월 Supabase 비용 > RDS 비용 (채널 10개 이상 운영 시점)
- VPC 내 DB 격리 보안 요건 발생 시

## `DATABASE_URL` vs `DIRECT_URL` 분리 이유

Prisma는 두 URL을 다른 목적으로 사용한다:

| 변수 | 경유 | 용도 |
|---|---|---|
| `DATABASE_URL` | pgBouncer (포트 6543) | 런타임 쿼리 (Lambda가 사용) |
| `DIRECT_URL` | PostgreSQL 직접 (포트 5432) | `prisma migrate deploy` (DDL 전용) |

pgBouncer는 `CREATE TABLE` 같은 DDL 구문을 지원하지 않으므로 마이그레이션은 반드시 `DIRECT_URL`을 통해야 한다.

## Lambda `connection_limit=1` 이유

Lambda 인스턴스가 동시에 100개 실행되면 각 인스턴스가 DB 연결을 만든다. `connection_limit=1`을 `DATABASE_URL` 파라미터에 명시하지 않으면 pgBouncer 최대 연결 수를 초과해 `too many clients` 오류가 발생한다.

```
DATABASE_URL=postgresql://...?connection_limit=1&pool_timeout=10
```

## 결과

- `DIRECT_URL`은 CI/CD 마이그레이션 단계에서만 사용 — 런타임 Worker 환경변수에 포함 금지
- Supabase → RDS 전환 시 `DATABASE_URL` 값만 교체, 코드 변경 없음
- `connection_limit` 제거 시 Lambda 동시 실행 환경에서 DB 연결 고갈 발생
