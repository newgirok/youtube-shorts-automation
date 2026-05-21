# @shorts/web

Next.js 15 App Router 기반 관리 대시보드.

## 적용 Rules
- `.claude/rules/frontend.md` — 컴포넌트 전략, TanStack Query, useEffect 금지
- `.claude/rules/security.md` — 환경변수, OAuth
- `.claude/rules/typescript.md` — strict, ESM

## 주요 명령
- `pnpm dev` — Next.js 개발 서버 (포트 3001)
- `pnpm build` — Next.js 빌드

## 주요 페이지 및 담당 컴포넌트

| 경로 | 서버 컴포넌트 | 클라이언트 컴포넌트 |
|---|---|---|
| `/` (홈) | `(dashboard)/page.tsx` | `HomeClient.tsx` |
| `/dashboard/[id]` | — | `(dashboard)/dashboard/[id]/page.tsx` (전체 client) |
| `/channels/[id]` | `(dashboard)/channels/[id]/page.tsx` | `ChannelClient.tsx` |
| `/login` | `(auth)/login/page.tsx` | — |

## 컴포넌트 구조

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx        — Google 로그인 페이지
│   │   ├── popup/page.tsx        — OAuth 팝업 처리
│   │   └── close/page.tsx        — 팝업 완료 후 닫기
│   ├── (dashboard)/
│   │   ├── layout.tsx            — 사이드바 포함 레이아웃 (서버)
│   │   ├── page.tsx              — 홈 (서버, 채널 목록 로드 후 HomeClient 전달)
│   │   ├── HomeClient.tsx        — 토픽 입력 폼 + 갤러리 카루셀 (클라이언트)
│   │   ├── dashboard/[id]/page.tsx — Job 상세: 상태 배지·privacyStatus·타임라인·스크립트 (클라이언트)
│   │   └── channels/[id]/
│   │       ├── page.tsx          — 채널 초기 데이터 로드 (서버)
│   │       └── ChannelClient.tsx — YPP 현황·차트·일별 테이블 (클라이언트)
│   ├── providers.tsx             — QueryClientProvider 래퍼
│   └── layout.tsx                — 루트 레이아웃
├── components/
│   ├── StatusTimeline.tsx        — Job 처리 단계 타임라인 + 재시도 버튼
│   ├── VideoCard.tsx             — Job 카드 (썸네일·상태 배지·삭제 오버레이)
│   ├── Sidebar.tsx               — 데스크톱 사이드 내비게이션
│   ├── BottomNav.tsx             — 모바일 하단 내비게이션
│   └── ui/                       — shadcn/ui 기본 컴포넌트
├── lib/
│   ├── types.ts                  — Job, Channel, AnalyticsRow, JobStatus 타입
│   ├── api.ts                    — apiGet / apiPost / apiPatch 헬퍼
│   ├── store.ts                  — Zustand: selectedChannelId
│   └── utils.ts                  — cn() 유틸
├── auth.ts                       — NextAuth v5 (GoogleProvider + JWT)
└── middleware.ts                 — 미인증 접근 → /login 리다이렉트
```

## 핵심 타입 (`src/lib/types.ts`)

```typescript
interface Job {
  id: string;
  channelId: string;
  topic: string;
  status: JobStatus;
  retryCount: number;
  failReason: string | null;
  scriptContent: {
    title?: string; hook?: string; script?: string;
    hashtags?: string[]; thumbnail_text?: string; comment_bait?: string;
  } | null;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  youtubeVideoId: string | null;
  privacyStatus: string; // 'public' | 'unlisted' | 'private'
}

interface AnalyticsRow {
  date: string;
  views: number;
  subscribers: number;
  estimatedRevenue: number;
  watchTimeMinutes: number;
}
```

## 주요 동작 규칙

### 폴링
- 홈(`/`): 진행 중 Job이 있으면 2초, 모두 완료/실패면 30초
- Job 상세(`/dashboard/[id]`): 완료/실패 시 30초, 진행 중 2초

### 삭제된 YouTube 영상 감지
- `job.status === 'FAILED' && job.failReason === '유튜브에서 영상이 삭제되었습니다.'`
- 상태 배지를 "실패" 대신 "삭제"로 표시, 재시도 버튼 미노출

### privacyStatus 배지
- `COMPLETED` 상태에서만 표시
- `public` → 파란색, `unlisted` → 노란색, `private` → 흰색/반투명

### 처리시간 표시
- `calcProcessingTime(startedAt, completedAt)` → 시/분/초 조합 포맷
  - 예: `"2분 34초"`, `"1시간 5분 12초"`

### 채널 sync
- 홈·채널 페이지 마운트 시 `POST /channels/:id/sync` 호출 → Jobs 목록/채널 정보 refetch

### YPP 달성 기준 (2단계)
- 1단계 (기본 수익 창출): 구독자 ≥ 500 AND 90일 업로드 ≥ 3회 AND 쇼츠 조회수(90일) ≥ 300만
- 2단계 (광고 수익): 쇼츠 조회수(90일) ≥ 1,000만 OR 시청시간(12개월) ≥ 3,000시간

### 인증
- `src/auth.ts`: GoogleProvider + JWT 세션
- `src/middleware.ts`: `api|_next|login|close|popup|favicon|이미지·영상 확장자` 경로 제외 후 미인증 접근을 `/login`으로 리다이렉트
