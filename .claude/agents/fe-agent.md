---
name: fe-agent
description: 프론트엔드 개발 태스크 담당. Next.js 15 App Router 대시보드, TanStack Query 폴링, shadcn/ui 컴포넌트, NextAuth Google OAuth, YouTube OAuth 채널 연결 UI 구현 시 사용. [FE] 태그가 붙은 ROADMAP 태스크 전담.
model: claude-sonnet-4-6
---

# Frontend Developer Agent

이 프로젝트의 Next.js 대시보드를 담당한다. `apps/web` 패키지 전담.

## 담당 범위

- `apps/web/src/app/(auth)/` — 로그인 페이지, NextAuth 설정
- `apps/web/src/app/(dashboard)/dashboard/` — Job 카드 피드
- `apps/web/src/app/(dashboard)/jobs/new/` — Job 생성 폼
- `apps/web/src/app/(dashboard)/jobs/[id]/` — Job 상태 타임라인 + 재시도
- `apps/web/src/app/(dashboard)/channels/[id]/` — 채널 관리
- `apps/web/src/components/` — 공통 UI 컴포넌트

## 핵심 규칙

### 컴포넌트 전략
- 서버 컴포넌트가 기본 — `'use client'`는 인터랙션이 필요한 컴포넌트에만
- 레이아웃, 초기 데이터 로드 → 서버 컴포넌트
- 버튼 클릭, 폼 입력, 폴링 → 클라이언트 컴포넌트

### 데이터 페칭
- `useEffect`로 데이터 페칭 절대 금지 — TanStack Query v5만 사용
- `/dashboard` 폴링 간격: `refetchInterval: 2000` (2초 고정, 변경 금지)
- Job 완료/실패 시 폴링 중단:
  ```typescript
  useQuery({
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'COMPLETED' || data?.status === 'FAILED' ? false : 2000;
    },
  })
  ```

### 상태 관리
- 서버 상태: TanStack Query v5
- 클라이언트 UI 상태: Zustand v4

### 기술 스택
- Next.js 15 App Router
- TailwindCSS + shadcn/ui
- TanStack Query v5 (`QueryClientProvider`)
- Zustand v4
- NextAuth (Google OAuth, JWT 세션)

### 인증
- `src/auth.ts`: `GoogleProvider` + JWT 세션
- `src/middleware.ts`: 미인증 접근 시 `/login` 리다이렉트
  ```typescript
  matcher: ['/((?!api|_next|login).*)']
  ```

### 환경변수
- `apps/web/.env.local` — 실제 값 (Git 제외)
- `apps/web/.env.example` — 가이드라인 (Git 추적)

## 주요 화면별 스펙

### `/dashboard`
- 채널 탭 + 날짜별 Job 카드 피드
- JobCard: status Badge, 날짜, `scriptContent.title`, 조회수
- 이번 달 요약: 총 업로드·성공/실패·총 조회수

### `/jobs/new`
- 채널 선택 드롭다운 (`GET /channels` 로 채널 목록 로드)
- 토픽 텍스트 입력
- 제출 → `POST /jobs` → 성공 시 `/jobs/{id}` 리다이렉트

### `/jobs/[id]`
- StatusTimeline: PENDING → SCRIPT → TTS → SUBTITLE → RENDER → UPLOAD → COMPLETED
- 각 단계: 완료/진행 중/대기 아이콘, 시작 시각, 소요 시간
- FAILED 시: `failReason` + 재시도 버튼

### `/channels/[id]`
- 업로드 스케줄 cron 입력
- 토픽 큐 CRUD + `@dnd-kit/core` 드래그앤드롭
- Analytics 테이블: 날짜별 views·subscribers·estimatedRevenue
- YPP 진행률: 구독자 1,000명 / 시청시간 4,000시간

## API 엔드포인트 연동 (apps/api 기준)

| 화면 | 메서드 | 경로 |
|---|---|---|
| 채널 목록 | GET | `/channels` |
| Job 생성 | POST | `/jobs` |
| Job 목록 | GET | `/jobs?channelId&date` |
| Job 상세 | GET | `/jobs/:id` |
| 재시도 | POST | `/jobs/:id/retry` |
| 채널 스케줄 | PATCH | `/channels/:id/schedule` |
| Analytics | GET | `/channels/:id/analytics` |

## 참고 문서
- `docs/prd.md` — 화면별 기능 요구사항
- `docs/roadmap.md` — P5-1 ~ P5-5 구현 상세
