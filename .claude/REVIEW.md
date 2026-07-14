# 코드 리뷰 기준

PR 리뷰 및 코드 검토 시 이 기준을 적용한다.

---

##  Critical — 머지 차단 (반드시 수정 후 머지)

### 파이프라인 무결성
- `JobStatus` enum 순서 변경 (파이프라인 로직 전체 영향)
- S3 키 형식 임의 변경 (`jobs/{jobId}/...` 규칙 위반)
- `ScriptOutput` 필드 추가/제거 시 downstream Worker 미수정

### 보안
- `access_token` DB 저장 시도
- `refresh_token` 평문 저장 (AES-256-GCM 미적용)
- `.env.local` 또는 실제 시크릿 값 커밋

### 인프라 안전성
- SQS Visibility Timeout 미준수 (Worker 타임아웃 × 2 규칙)
- subtitle/render Worker를 Fargate로 이전 시도 (ADR 001 위반)
- Terraform과 Serverless Framework 역할 혼용 (ADR 006 위반)

### 데이터 안전성
- `findMany()` select 없이 호출 (N+1, 데이터 과다 조회)

---

##  항상 확인

### 코드 품질
- [ ] `console.log` 프로덕션 코드 사용 여부 (Pino로 대체 필요)
- [ ] `any` 타입 사용 여부
- [ ] ESM import 경로 `.js` 확장자 누락 여부
- [ ] 로그에 `jobId`, `channelId` 필드 포함 여부

### 환경변수
- [ ] 새 환경변수 추가 시: `packages/shared/src/env.ts` Zod 스키마 업데이트
- [ ] `.env.example`에 키 이름 추가 (값 없이)
- [ ] Lambda 환경변수 섹션 업데이트 (serverless.yml environment)

### 파이프라인 연동
- [ ] Worker 수정 시 연동 Worker 함께 수정 여부 (.claude/rules/worker-pipeline.md 참조)
- [ ] `gemini-2.5-flash` 모델 고정 여부 (script-worker)

### 프론트엔드
- [ ] `useEffect` 데이터 페칭 사용 여부 (TanStack Query로 대체 필요)
- [ ] `/dashboard` 폴링 간격 2000ms 고정 여부

---

##  건너뛸 것 (리뷰 코멘트 불필요)

- 변수명/함수명 스타일 제안 (기존 컨벤션 따름)
- 코멘트 추가 제안 (코드가 명확하면 불필요)
- 불필요한 에러 처리 추가 제안
- ESLint/Prettier가 자동 처리하는 포맷팅
- TypeScript 스타일 세부 제안 (strict 통과 시)
- 성능 최적화 제안 (병목 미확인 상태)
- `agentcrumbs` 디버그 마커 코멘트

---

## 리뷰 우선순위

```
 Critical >  항상 확인 > 나머지
```

Critical 항목이 있으면 다른 항목보다 먼저 언급.
건너뛸 항목에 시간 쓰지 말 것.
