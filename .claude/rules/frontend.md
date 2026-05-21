# 프론트엔드 규칙 (apps/web)

## 컴포넌트 전략
- 서버 컴포넌트가 기본값 — `'use client'`는 인터랙션이 필요한 최소 범위에만
- 레이아웃, 초기 데이터 → 서버 컴포넌트
- 버튼 클릭, 폼 입력, 폴링 → 클라이언트 컴포넌트

## 데이터 페칭 (절대 규칙)
- `useEffect`로 데이터 페칭 **절대 금지** — TanStack Query v5만 사용
- `/dashboard` 폴링 간격: `refetchInterval: 2000` (2초 고정, **변경 금지**)

```typescript
// ✅ 올바름 — TanStack Query 폴링
const { data: jobs } = useQuery({
  queryKey: ['jobs', channelId, date],
  queryFn: () => fetchJobs(channelId, date),
  refetchInterval: (query) => {
    const hasActive = query.state.data?.some(
      j => j.status !== 'COMPLETED' && j.status !== 'FAILED'
    );
    return hasActive ? 2000 : false;
  },
});

// ❌ 금지 — useEffect 데이터 페칭
useEffect(() => {
  fetch('/api/jobs').then(r => r.json()).then(setJobs);
}, []);
```

## 상태 관리
- 서버 상태: TanStack Query v5
- 클라이언트 UI 상태 (모달 열림, 탭 선택 등): Zustand v4
- 서버 상태를 Zustand에 복사하지 말 것

## 기술 스택 (변경 시 논의 필요)
- Next.js 15 App Router
- TailwindCSS + shadcn/ui
- TanStack Query v5 (`QueryClientProvider` 필수)
- Zustand v4
- NextAuth v5-beta (Google OAuth, JWT 세션)

## 인증 패턴
```typescript
// src/middleware.ts
matcher: ['/((?!api|_next|login|favicon).*)']
// 미인증 → /login 리다이렉트
```

## 환경변수
- `apps/web/.env.local` — 실제 값 (Git 제외)
- `apps/web/.env.example` — 키 이름만 (Git 추적)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_API_URL` 필수

## 금지 패턴
```typescript
// ❌ useEffect 데이터 페칭
// ❌ 서버 상태를 useState로 관리
// ❌ 'use client' 남발 (레이아웃, 정적 컴포넌트에 적용)
// ❌ API URL 하드코딩 ('http://localhost:3000' 등)
```
