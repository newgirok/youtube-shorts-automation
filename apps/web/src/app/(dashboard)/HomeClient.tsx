'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Video, Eye } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useChannelStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { cn, toProxyThumbUrl } from '@/lib/utils';
import type { Channel, Job as JobType } from '@/lib/types';

function useCarouselSize() {
  const [size, setSize] = useState(6);
  useEffect(() => {
    function update() {
      if (window.innerWidth < 640) setSize(2);
      else if (window.innerWidth < 1024) setSize(4);
      else setSize(6);
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}


function GalleryCard({ job }: { job: JobType }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const rawThumb = job.status !== 'FAILED' ? toProxyThumbUrl(job.thumbnailUrl) : null;
  const thumb = rawThumb && !imgError ? rawThumb : null;

  useEffect(() => {
    setImgError(false);
  }, [rawThumb]);

  // YouTube CDN 썸네일 미처리(404) 시 15초 후 자동 재시도
  useEffect(() => {
    if (!imgError) return;
    if (!rawThumb?.includes('ytimg.com')) return;
    const timer = setTimeout(() => setImgError(false), 15_000);
    return () => clearTimeout(timer);
  }, [imgError, rawThumb]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        transition: 'box-shadow 0.2s, background-color 0.2s',
        boxShadow: hovered
          ? 'inset 0 0 0 2px rgba(255,255,255,0.65)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        backgroundColor: hovered ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
      }}
      className="w-full rounded-md overflow-hidden cursor-pointer"
    >
      <div className="aspect-video relative">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            onError={() => setImgError(true)}
            style={{ filter: hovered ? 'brightness(1.12)' : 'brightness(1)', transition: 'filter 0.2s' }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            <Video className="w-4 h-4 text-white/30" />
          </div>
        )}
        {job.status === 'FAILED' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-white">
              {job.failReason === '유튜브에서 영상이 삭제되었습니다.' ? '삭제' : '실패'}
            </span>
          </div>
        )}
        {job.status === 'PENDING' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-[10px] text-white/60">대기</span>
          </div>
        )}
        {job.status === 'COMPLETED' && (job.viewCount ?? 0) > 0 && (
          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5">
            <Eye className="w-2.5 h-2.5 text-white/70" />
            <span className="text-[9px] text-white/80 font-medium">{(job.viewCount ?? 0).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function JobCarousel({ jobs }: { jobs: JobType[] }) {
  const CAROUSEL_SIZE = useCarouselSize();
  const [start, setStart] = useState(0);

  useEffect(() => {
    setStart(0);
  }, [jobs]);
  const containerRef = useRef<HTMLDivElement>(null);
  const accRef = useRef(0); // 휠 누적 delta

  const canPrev = start > 0;
  const canNext = start + CAROUSEL_SIZE < jobs.length;
  const maxStart = Math.max(0, jobs.length - CAROUSEL_SIZE);

  const prev = () => setStart((s) => Math.max(0, s - 1));
  const next = () => setStart((s) => Math.min(maxStart, s + 1));

  // 휠 / 트랙패드 스크롤 — passive:false로 기본 스크롤 차단
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const THRESHOLD = 40;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      accRef.current += delta;
      if (accRef.current > THRESHOLD) {
        accRef.current = 0;
        setStart((s) => Math.min(maxStart, s + 1));
      } else if (accRef.current < -THRESHOLD) {
        accRef.current = 0;
        setStart((s) => Math.max(0, s - 1));
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [maxStart]);

  // 키보드 — 갤러리 컨테이너에 포커스(tabIndex=0)되면 ← → 작동
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="영상 갤러리"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex items-center gap-2 px-2 w-full focus:outline-none"
    >
      {/* ARIA 라이브 리전 — 스크린 리더용 */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {jobs.length > 0
          ? `${start + 1}–${Math.min(start + CAROUSEL_SIZE, jobs.length)} / ${jobs.length}`
          : '영상 없음'}
      </div>

      <button
        onClick={prev}
        disabled={!canPrev}
        aria-label="이전"
        className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-20 shrink-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* 엣지 페이드 마스크 — 양옆에 더 있음을 암시 */}
      <div
        className="flex gap-1.5 flex-1"
        style={{
          WebkitMaskImage: `linear-gradient(to right,
            ${canPrev ? 'transparent 0%, black 4%' : 'black 0%'},
            black 50%,
            ${canNext ? 'black 96%, transparent 100%' : 'black 100%'})`,
          maskImage: `linear-gradient(to right,
            ${canPrev ? 'transparent 0%, black 4%' : 'black 0%'},
            black 50%,
            ${canNext ? 'black 96%, transparent 100%' : 'black 100%'})`,
        }}
      >
        {Array.from({ length: CAROUSEL_SIZE }, (_, i) => {
          const job = jobs[start + i];
          return (
            <div key={job?.id ?? `empty-${i}`} className="flex-1 min-w-0">
              {job ? (
                <Link
                  href={`/dashboard/${job.id}`}
                  aria-label={`영상: ${job.scriptContent?.title ?? job.topic}`}
                >
                  <GalleryCard job={job} />
                </Link>
              ) : (
                <div className="w-full aspect-video rounded-md bg-white/5" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={next}
        disabled={!canNext}
        aria-label="다음"
        className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-20 shrink-0"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function HomeClient({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedChannelId, setSelectedChannelId, clearSelectedChannelId } = useChannelStore();

  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoNewsLoading, setAutoNewsLoading] = useState(false);

  useEffect(() => {
    if (channels.length === 0) {
      clearSelectedChannelId();
    } else if (!selectedChannelId || !channels.some((ch) => ch.id === selectedChannelId)) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId, setSelectedChannelId, clearSelectedChannelId]);

  const activeChannelId = selectedChannelId ?? channels[0]?.id ?? '';

  // 채널 변경 시 sync 호출 → 조회수 DB 갱신 후 Jobs 목록 refetch
  useEffect(() => {
    if (!activeChannelId) return;
    apiPost(`/channels/${activeChannelId}/sync`, {})
      .then(() => queryClient.invalidateQueries({ queryKey: ['jobs', activeChannelId] }))
      .catch(() => {});
  }, [activeChannelId, queryClient]);

  const hadProcessingRef = useRef(false);

  const { data: realJobs = [] } = useQuery<JobType[]>({
    queryKey: ['jobs', activeChannelId],
    queryFn: () => apiGet<JobType[]>(`/jobs?channelId=${activeChannelId}`),
    enabled: Boolean(activeChannelId),
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      if (data.length === 0) return 2000;
      const hasProcessing = data.some((s) => s.status !== 'COMPLETED' && s.status !== 'FAILED');
      return hasProcessing ? 2000 : 30000;
    },
  });

  // 잡 완료 직후 sync-videos 호출 → thumbnailUrl DB 갱신 후 갤러리 반영
  useEffect(() => {
    if (!activeChannelId || realJobs.length === 0) return;
    const hasProcessing = realJobs.some((j) => j.status !== 'COMPLETED' && j.status !== 'FAILED');
    if (hadProcessingRef.current && !hasProcessing) {
      apiPost(`/channels/${activeChannelId}/sync-videos`, {})
        .then(() => queryClient.invalidateQueries({ queryKey: ['jobs', activeChannelId] }))
        .catch(() => {});
    }
    hadProcessingRef.current = hasProcessing;
  }, [realJobs, activeChannelId, queryClient]);

  const jobs = realJobs;

  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);

  const years = useMemo(() => {
    const set = new Set(jobs.map((v) => new Date(v.createdAt).getFullYear()));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [jobs]);

  const months = useMemo(() => {
    const base = filterYear
      ? jobs.filter((v) => new Date(v.createdAt).getFullYear() === filterYear)
      : jobs;
    const set = new Set(base.map((v) => new Date(v.createdAt).getMonth() + 1));
    return Array.from(set).sort((a, b) => a - b);
  }, [jobs, filterYear]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((v) => {
      const d = new Date(v.createdAt);
      if (filterYear !== null && d.getFullYear() !== filterYear) return false;
      if (filterMonth !== null && d.getMonth() + 1 !== filterMonth) return false;
      return true;
    });
  }, [jobs, filterYear, filterMonth]);

  function handleYearSelect(year: number | null) {
    setFilterYear(year);
    setFilterMonth(null);
  }

  const NEWS_CATEGORIES = [
    { key: 'top', label: '종합' },
    { key: 'politics', label: '정치' },
    { key: 'business', label: '경제' },
    { key: 'nation', label: '사회' },
  ] as const;

  async function handleAutoNews(category: string) {
    if (!activeChannelId) return;
    setAutoNewsLoading(true);
    setSubmitError(null);
    try {
      await apiPost('/jobs/auto-news', { channelId: activeChannelId, category, count: 1 });
      queryClient.invalidateQueries({ queryKey: ['jobs', activeChannelId] });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '자동 수집 오류');
    } finally {
      setAutoNewsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannelId || !topic.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await apiPost<JobType>('/jobs', { channelId: activeChannelId, topic: topic.trim() });
      router.push(`/dashboard/${data.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* 상단 여백 — 배경 노출 */}
      <div className="h-[46vh]" />

      {/* 채널 탭 */}
      {channels.length > 1 && (
        <div className="mb-3 flex items-center gap-1 rounded-full bg-black/30 backdrop-blur-sm p-1 w-fit">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setSelectedChannelId(ch.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                activeChannelId === ch.id ? 'bg-white text-gray-900' : 'text-white/70 hover:text-white',
              )}
            >
              {ch.name}
            </button>
          ))}
        </div>
      )}

      {/* 프롬프트 — 버튼 포함 */}
      <div className="w-full max-w-2xl px-4">
        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              required
              disabled={!activeChannelId}
              placeholder={`Shorts 주제를 입력하세요\n스크립트 · TTS · 자막 · 렌더링 · YouTube 업로드까지 자동으로 처리됩니다`}
              className="flex w-full bg-transparent px-5 pt-4 pb-2 text-sm md:text-base text-white placeholder:text-white/40 placeholder:text-xs md:placeholder:text-sm focus:outline-none resize-none [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40"
            />
            <div className="flex items-center justify-end px-4 pb-3">
              {submitError && <p className="text-sm text-red-400 mr-auto">{submitError}</p>}
              <Button
                type="submit"
                disabled={submitting || !activeChannelId || !topic.trim()}
                className="bg-white hover:bg-white/90 text-gray-900 font-bold rounded-full px-5 h-8 text-sm"
              >
                {submitting ? '생성 중...' : '생성하기'}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* 뉴스 자동 수집 */}
      <div className="w-full max-w-2xl px-4 mt-2 flex items-center gap-2 flex-wrap">
        {NEWS_CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleAutoNews(key)}
            disabled={autoNewsLoading || !activeChannelId}
            className="text-xs px-3 py-1 rounded-full border border-white/20 text-white/50 hover:text-white hover:border-white/50 transition-colors disabled:opacity-30"
          >
            {label}
          </button>
        ))}
        {autoNewsLoading && <span className="text-xs text-white/30">수집 중...</span>}
      </div>

      {/* 갤러리 — 채널 연결 시에만 표시 */}
      {activeChannelId && <div className="w-full max-w-5xl mt-6 md:mt-10 bg-black/30 backdrop-blur-sm rounded-xl">
        {/* 연/월 필터 */}
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-2 border-b border-white/10 flex-wrap rounded-t-xl">
            <button
              onClick={() => handleYearSelect(null)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full transition-colors',
                filterYear === null ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white',
              )}
            >
              전체
            </button>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => handleYearSelect(y)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  filterYear === y ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white',
                )}
              >
                {y}
              </button>
            ))}
            {filterYear !== null && months.length > 0 && (
              <>
                <div className="w-px h-3 bg-white/20 mx-0.5 self-center" />
                {months.map((m) => (
                  <button
                    key={m}
                    onClick={() => setFilterMonth(filterMonth === m ? null : m)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full transition-colors',
                      filterMonth === m ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white',
                    )}
                  >
                    {m}월
                  </button>
                ))}
              </>
            )}
        </div>
        <div className="py-2 overflow-visible">
          <JobCarousel jobs={filteredJobs} />
        </div>
      </div>}

      <div className="flex-1" />
    </div>
  );
}
