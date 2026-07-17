# @shorts/web

Next.js 15 App Router 기반 관리 대시보드.

## 적용 Rules
- `.claude/rules/frontend.md` — 컴포넌트 전략, TanStack Query, useEffect 금지
- `.claude/rules/security.md` — 환경변수, OAuth
- `.claude/rules/typescript.md` — strict, ESM

## 주요 명령
- `pnpm dev` — Next.js 개발 서버 (포트 3001)
- `pnpm build` — Next.js 빌드 (로컬, standalone 비활성)
- `DOCKER_BUILD=true pnpm build` — Docker 이미지용 빌드 (standalone 활성, `.next/standalone` 생성)

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
│   ├── api/
│   │   └── thumbnail/[id]/route.ts — S3 썸네일 same-origin 프록시 (API_INTERNAL_URL 경유)
│   ├── providers.tsx             — QueryClientProvider 래퍼
│   └── layout.tsx                — 루트 레이아웃
├── components/
│   ├── StatusTimeline.tsx        — Job 처리 단계 타임라인 + 재시도 버튼
│   ├── VideoCard.tsx             — Job 카드 (썸네일·상태 배지·삭제 오버레이, aspect-[9/16] max-h-36, thumbnailUrl 직접 사용 — 프록시 미경유)
│   ├── Sidebar.tsx               — 데스크톱 사이드 내비게이션
│   ├── BottomNav.tsx             — 모바일 하단 내비게이션
│   └── ui/                       — shadcn/ui 기본 컴포넌트
├── lib/
│   ├── types.ts                  — Job, Channel, AnalyticsRow, JobStatus 타입
│   ├── api.ts                    — apiGet / apiPost / apiPatch / apiDelete 헬퍼 (API_INTERNAL_URL → NEXT_PUBLIC_API_URL 폴백, NEXT_PUBLIC_API_SECRET Bearer 헤더 자동 첨부)
│   ├── store.ts                  — Zustand: selectedChannelId, setSelectedChannelId, clearSelectedChannelId
│   └── utils.ts                  — cn() 유틸 + toProxyThumbUrl() S3 썸네일 → 프록시 URL 변환
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
  thumbnailUrl: string | null;  // render-worker 완료 시 API 프록시 URL로 먼저 채워짐; sync-videos 후 YouTube URL로 대체될 수 있음
  privacyStatus: string; // 'public' | 'unlisted' | 'private'
}

interface Channel {
  id: string;
  name: string;
  niche: string;
  isActive: boolean;
  subscriberCount?: number;
  totalViews?: number;
  uploadCount90d?: number;
  shortsViews90d?: number;
  uploadSchedule?: string | null;
  schedulerEnabled?: boolean;
  schedulerCategory?: string;
  isYPPQualified?: boolean;  // YPP 자격 여부
  createdAt?: string;        // 채널 등록일 (ISO 8601)
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

### 썸네일 표시 전략
- `thumbnailUrl`은 두 가지 값을 가질 수 있음:
  1. **S3 URL** (`https://*.s3.amazonaws.com/jobs/{jobId}/thumbnail.jpg`): render-worker 완료 직후 상태. CORS 문제 방지를 위해 `toProxyThumbUrl()`로 `/api/thumbnail/{jobId}` 프록시 URL로 변환 후 사용
  2. **YouTube URL** (`https://i.ytimg.com/vi/{videoId}/hqdefault.jpg`): upload-worker 완료 시 DB에 직접 저장. 프록시 불필요, 직접 사용
- `toProxyThumbUrl(url)`: S3 URL이면 `/api/thumbnail/{jobId}` 반환, 그 외(YouTube URL 등)는 원본 반환
- `/api/thumbnail/[id]` route: `API_INTERNAL_URL/jobs/{id}/thumbnail` 경유로 S3 콘텐츠를 same-origin으로 프록시. `Cache-Control: public, max-age=3600`

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

### 채널 연결 해제
- `Sidebar.tsx` YouTube 버튼: 연결 상태에서 클릭 → confirm → `DELETE /channels/:id` → `clearSelectedChannelId()` → `/` 이동
- 순서 중요: API 호출 완료 후 store 초기화 → 홈 이동 (순서 바뀌면 홈 서버 fetch 시점에 DB가 아직 active라 재설정됨)
- `HomeClient.tsx`: 서버에서 받은 `channels` 목록에 `selectedChannelId`가 없으면 자동 초기화 (`clearSelectedChannelId`)
- `ChannelClient.tsx`: 마운트 시 `setSelectedChannelId(initial.id)` 호출 — OAuth 후 `/channels/:id`로 직접 랜딩해도 GNB 즉시 표시

### 스크립트 입력 비활성화
- 홈 화면 토픽 입력 textarea: `disabled={!activeChannelId}` — 채널 미연결 시 입력 불가
- `cursor-not-allowed` 등 커서 스타일 변경 금지 (Tailwind `disabled:cursor-not-allowed` 미적용)

### 홈 갤러리 표시 조건
- `activeChannelId` 없으면 갤러리 전체 숨김
- 연/월 필터는 항상 표시, 현재 연도는 jobs 없어도 기본 포함
- `close/page.tsx`: `useSearchParams`로 `channelId` / `auth_error` 파싱 → 올바른 대상 URL로 이동 후 팝업 닫기 (`Suspense` 필수)

### 채널 sync
- 홈·채널 페이지 마운트 시 `POST /channels/:id/sync` 호출 → Jobs 목록/채널 정보 refetch
- 홈 페이지: 잡이 완료되는 순간(`hasProcessing: true → false` 전환) `POST /channels/:id/sync-videos` 자동 호출 → thumbnailUrl DB 갱신 → 갤러리 썸네일 즉시 표시
- `/dashboard/[id]` 페이지: `youtubeVideoId` 최초 감지 시 `sync-videos` 즉시 호출 후 10초·40초 뒤 재호출 (YouTube CDN 썸네일 처리 완료 대기, `syncedRef` 패턴으로 중복 실행 방지)

#### invalidate 범위 (쿼리 누락 방지)
| sync 호출 위치 | invalidate 대상 |
|---|---|
| `ChannelClient` sync 완료 | `['channel', id]` + `['analytics', id]` 모두 |
| `HomeClient` sync 완료 | `['jobs', channelId]` |
| `HomeClient` sync-videos 완료 | `['jobs', channelId]` |
| `JobDetailPage` sync-videos 완료 | `['job', id]` + `['jobs', channelId]` 모두 |

`analytics` 누락 시: 채널 성과 추이 차트가 최초 진입 시 빈 상태로 표시되다가 새로고침 후에야 나타나는 버그 발생
- 채널 상세 페이지의 **채널 성과 추이** 차트는 `ChannelAnalytics` 테이블 데이터를 사용한다.
  - 데이터는 sync 시 YouTube Analytics API로 채운다.
  - GCP 프로젝트에서 YouTube Analytics API가 비활성화되어 있으면 차트가 skeleton placeholder로 표시된다. (→ `apps/api/CLAUDE.md` GCP 사전 조건 참고)

### 채널 상세 페이지 (`ChannelClient.tsx`)

**차트 규칙:**
- 오늘 기준 28일 범위 고정 (`d.setDate(d.getDate() - (27 - i))`)
- X축 포맷: M/D 형식 (`${parseInt(mm!)}/${parseInt(dd!)}`) — `toLocaleDateString` 사용 금지 (hydration 오류)
- `interval={0}` 으로 모든 28개 tick 표시 (데스크톱)
- 날짜 선 정렬: `margin={{ top: 4, right: 20, left: 20, bottom: 0 }}` (두 차트 모두 적용) — left/right 대칭 20px 여백으로 첫·마지막 날짜 레이블 모두 표시, 선이 날짜 범위 내에서만 그려짐
- 모바일(`window.innerWidth < 768`): `ticks` prop에 9일 간격(인덱스 0, 9, 18, 27) + 마지막 날짜 항상 포함하는 `mobileTicks` 배열 전달 — `interval={0}` 유지하면서 tick 목록을 직접 제한
- 차트 클릭 시 흰색 outline 제거: `[&_*]:outline-none` (두 차트 모두 적용 — svg·wrapper 포함 모든 자식 대상)

**스케줄러 패널 (overflow 처리):**
- 외부 컨테이너: `overflow-hidden` (내부 컨텐츠가 패널 밖으로 나가지 않도록)
- SchedulerPanel 내부: `flex flex-col gap-4 flex-1 overflow-y-auto min-h-0` (그리드 내 스크롤)
- "저장됨" 상태 표시: 항상 `<p>` 렌더링, `opacity-0/opacity-100` CSS transition → 레이아웃 이동 없음
- `saveTimerRef` 패턴으로 중복 타이머 방지

**채널 정보 패널 하단 카드:**
- YPP 자격 카드: `channel.isYPPQualified` 기반, 달성/미달성 dot 표시
- 업로드 설정 카드: 스케줄 레이블 + 카테고리 (`schedulerEnabled` 시에만 카테고리 노출)
- 채널 등록일 카드: `channel.createdAt!.slice(0, 10).split('-')` 으로 파싱 (`toLocaleDateString` 금지)

**NEWS_CATEGORIES (ChannelClient · HomeClient 공통 카테고리 목록):**
```typescript
const NEWS_CATEGORIES = [
  { key: 'top',        label: '종합' },
  { key: 'business',   label: '경제' },
  { key: 'technology', label: '기술' },
  { key: 'health',     label: '의료' },
  { key: 'science',    label: '환경' },
  { key: 'nation',     label: '사회' },
];
```
- `politics` 카테고리 제거 — Pexels 소재 부족으로 자동화 파이프라인 부적합
- Google News RSS: TECHNOLOGY · HEALTH · SCIENCE 카테고리 추가

### YouTube 인라인 플레이어 (`/dashboard/[id]`)

- `youtubeVideoId` 있는 Job만 재생 가능 (COMPLETED 상태)
- 썸네일 hover → 재생 버튼 오버레이 (`group-hover:opacity-100`, `pointer-events-none`)
- 클릭 → `showPlayer = true` → YouTube iframe으로 전환 (autoplay, rel=0)
- 썸네일·플레이어 컨테이너: `h-60` 고정 (전환 시 레이아웃 변화 없음)
- X 버튼: `absolute top-2 right-2 z-10`, 클릭 시 `showPlayer = false`
- iframe src: `https://www.youtube.com/embed/{youtubeVideoId}?autoplay=1&rel=0`
- `youtubeVideoId` 없으면 클릭 무반응 (재생 버튼 미노출)

### YPP 달성 기준 (2단계)
- 1단계 (기본 수익 창출): 구독자 ≥ 500 AND 90일 업로드 ≥ 3회 AND 쇼츠 조회수(90일) ≥ 300만
- 2단계 (광고 수익): 쇼츠 조회수(90일) ≥ 1,000만

### 인증
- `src/auth.ts`: GoogleProvider + JWT 세션, `secret`은 `AUTH_SECRET` 우선 → `NEXTAUTH_SECRET` 폴백
- **signIn 콜백**: Prisma `User` 테이블 조회 → 등록된 이메일만 로그인 허용. Google 인증 성공 후에도 미등록 이메일은 차단됨. 허용 이메일 추가는 Supabase `User` 테이블에 직접 row insert.
- `src/middleware.ts`: `api|_next/static|_next/image|_next|login|close|popup|favicon.ico|이미지·영상 확장자(.jpg/.jpeg/.png/.gif/.svg/.webp/.ico/.mp4/.webm/.ogg)` 경로 제외 후 미인증 접근을 `/login`으로 리다이렉트
