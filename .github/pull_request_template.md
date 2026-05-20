## 변경 내용
<!-- 무엇을, 왜 변경했는지 -->

## 테스트
- [ ] 로컬에서 `docker compose up` 확인
- [ ] 빌드 통과 (`pnpm build`)
- [ ] 타입 검사 통과 (`pnpm typecheck`)

## DB 마이그레이션
<!-- 새 마이그레이션 파일이 있으면 체크 -->
- [ ] 해당 없음
- [ ] `packages/shared/prisma/migrations/` 에 마이그레이션 파일 추가됨
- [ ] 로컬에서 `docker compose up migrate` 또는 `prisma:migrate` 로 검증 완료
