'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, BarChart, Bar } from 'recharts';
import { apiGet, apiPost } from '@/lib/api';
import type { AnalyticsRow, Channel } from '@/lib/types';

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="text-xs text-white/60 min-w-0 leading-tight">{label}</span>
        <div className="flex items-baseline gap-1 shrink-0 ml-1">
          <span className="text-sm font-semibold text-white">{value.toLocaleString()}</span>
          <span className="text-xs text-white/40">/ {max.toLocaleString()}</span>
          <span className="ml-1 text-xs text-white/60">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-1.5 rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AnalyticsEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <p className="text-xs font-medium text-white/40">Analytics 데이터 없음</p>
        <p className="text-xs text-white/25 mt-1">아직 수집된 데이터가 없습니다</p>
      </div>
    </div>
  );
}

function AnalyticsTable({ analytics }: { analytics: AnalyticsRow[] }) {
  if (analytics.length === 0) return <AnalyticsEmpty />;
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/20 text-left">
            <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-white/40">날짜</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-white/40">조회수</th>
            <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-white/40">구독자</th>
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wider text-white/40">예상 수익</th>
          </tr>
        </thead>
        <tbody>
          {analytics.map((row) => (
            <tr key={row.date} className="border-b border-white/10 transition-colors hover:bg-white/5 last:border-0">
              <td className="py-2 pr-4 font-medium text-white">{row.date}</td>
              <td className="py-2 pr-4 text-right text-white/80">{row.views.toLocaleString()}</td>
              <td className="py-2 pr-4 text-right text-white/80">{row.subscribers.toLocaleString()}</td>
              <td className="py-2 text-right text-white/80">${row.estimatedRevenue.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChannelClient({ channel: initial }: { channel: Channel }) {
  const queryClient = useQueryClient();

  const { data: channel = initial } = useQuery<Channel>({
    queryKey: ['channel', initial.id],
    queryFn: () => apiGet<Channel>(`/channels/${initial.id}`),
    initialData: initial,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const { data: analytics = [] } = useQuery<AnalyticsRow[]>({
    queryKey: ['analytics', initial.id],
    queryFn: () => apiGet<AnalyticsRow[]>(`/channels/${initial.id}/analytics`),
  });

  useEffect(() => {
    apiPost(`/channels/${initial.id}/sync`, {})
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['channel', initial.id] });
      })
      .catch(() => {});
  }, [initial.id, queryClient]);

  const subscriberCount = channel.subscriberCount ?? 0;
  const uploadCount90d = channel.uploadCount90d ?? 0;
  const shortsViews90d = channel.shortsViews90d ?? 0;
  const totalWatchMinutes = analytics.reduce((s, r) => s + r.watchTimeMinutes, 0);
  const totalWatchHours = Math.round(totalWatchMinutes / 60);
  const periodViews = analytics.reduce((s, r) => s + r.views, 0);
  const periodRevenue = analytics.reduce((s, r) => s + r.estimatedRevenue, 0);
  const periodSubGain = analytics.reduce((s, r) => s + r.subscribers, 0);
  // YPP 1단계: 구독자 500 + 업로드 3회(90일) + 쇼츠조회수 300만(90일)
  const stage1Done = subscriberCount >= 500 && uploadCount90d >= 3 && shortsViews90d >= 3_000_000;
  // YPP 2단계: 쇼츠 1,000만(90일) 또는 시청시간 3,000h(12개월)
  const stage2Done = shortsViews90d >= 10_000_000 || totalWatchHours >= 3000;

  return (
    <div className="flex flex-col px-4 py-4 md:px-6 gap-3 lg:h-screen lg:overflow-y-auto">
      {/* 상단: stat 4개 */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 구독자 / 500 목표 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">구독자 수</p>
          <p className="text-2xl font-bold text-white truncate">{subscriberCount.toLocaleString()}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min((subscriberCount / 500) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{subscriberCount >= 500 ? '✓ 달성' : `${(500 - subscriberCount).toLocaleString()}명 남음 (목표 500)`}</p>
        </div>
        {/* 쇼츠 조회수 90일 / 300만 목표 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">쇼츠 조회수 (90일)</p>
          <p className="text-2xl font-bold text-white truncate">{shortsViews90d.toLocaleString()}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min((shortsViews90d / 3_000_000) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{shortsViews90d >= 3_000_000 ? '✓ 달성' : `${((shortsViews90d / 3_000_000) * 100).toFixed(2)}% / 300만 목표`}</p>
        </div>
        {/* 업로드 횟수 90일 / 3회 목표 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">업로드 횟수 (90일)</p>
          <p className="text-2xl font-bold text-white truncate">{uploadCount90d}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min((uploadCount90d / 3) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{uploadCount90d >= 3 ? '✓ 달성' : `${3 - uploadCount90d}회 남음 (목표 3회)`}</p>
        </div>
        {/* 기간 예상수익 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">기간 예상수익</p>
          <p className="text-2xl font-bold text-white truncate">${periodRevenue.toFixed(2)}</p>
          <p className="text-xs text-white/40 mt-0.5 truncate">{analytics.length > 0 ? `${analytics.length}일 합산` : '데이터 없음'}</p>
        </div>
      </div>

      {/* 대형 차트 패널 */}
      <div className="shrink-0 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-white">채널 성과 추이</p>
            <p className="text-xs text-white/40">{analytics.length > 0 ? `최근 ${analytics.length}일간` : '아직 수집된 데이터가 없습니다'}</p>
          </div>
        </div>
        {analytics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="md:col-span-3">
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">조회수</p>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="rgba(255,255,255,0.15)" stopOpacity={1} />
                        <stop offset="95%" stopColor="rgba(255,255,255,0)" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: 'white' }} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} />
                    <Area type="monotone" dataKey="views" name="조회수" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="url(#viewsGradient)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">구독자 증가</p>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: 'white' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="subscribers" name="구독자" fill="rgba(255,255,255,0.45)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="md:col-span-3">
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">조회수</p>
              <div className="flex items-end gap-1 h-[140px]">
                {[0.3, 0.5, 0.2, 0.7, 0.4, 0.6, 0.35, 0.45, 0.55, 0.3, 0.65, 0.4, 0.5, 0.7].map((h, i) => (
                  <div key={i} className="flex-1 rounded-sm bg-white/[0.06] animate-pulse" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.07}s` }} />
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">구독자 증가</p>
              <div className="flex items-end gap-1.5 h-[140px]">
                {[0.4, 0.6, 0.3, 0.5, 0.7, 0.4, 0.55].map((h, i) => (
                  <div key={i} className="flex-1 rounded-sm bg-white/[0.06] animate-pulse" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 메인 3컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:flex-1 lg:min-h-0">
        {/* 좌: 채널 정보 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-2.5 overflow-y-auto min-h-[200px] lg:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">채널 정보</p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
            <p className="text-xs text-white/40 mb-0.5">채널 이름</p>
            <p className="text-base font-semibold text-white">{channel.name}</p>
          </div>
          {channel.niche && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
              <p className="text-xs text-white/40 mb-0.5">카테고리</p>
              <p className="text-sm font-medium text-white">{channel.niche}</p>
            </div>
          )}
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
            <p className="text-xs text-white/40 mb-2">일평균</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <p className="text-[10px] text-white/30 mb-0.5">조회수</p>
                <p className="text-sm font-bold text-white">{analytics.length > 0 ? Math.round(periodViews / analytics.length).toLocaleString() : '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 mb-0.5">구독자+</p>
                <p className="text-sm font-bold text-white">{analytics.length > 0 ? `+${(periodSubGain / analytics.length).toFixed(1)}` : '-'}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex-1">
            <p className="text-xs text-white/40 mb-1.5">운영 상태</p>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${channel.isActive ? 'bg-green-400' : 'bg-white/30'}`} />
              <span className="text-xs font-medium text-white">{channel.isActive ? '운영 중' : '중지됨'}</span>
            </div>
          </div>
        </div>

        {/* 중: YPP 달성 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-3 overflow-y-auto min-h-[200px] lg:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">YPP 달성 현황</p>

          {/* 1단계: 기본 수익 창출 */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 shrink-0">
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stage1Done ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                {stage1Done ? '✓ 달성' : '1단계'}
              </span>
              <p className="text-xs text-white/60 font-medium">기본 수익 창출 (3가지 모두 충족)</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <ProgressBar value={subscriberCount} max={500} label="구독자" />
              <ProgressBar value={uploadCount90d} max={3} label="업로드 횟수 (90일)" />
              <ProgressBar value={shortsViews90d} max={3_000_000} label="쇼츠 조회수 (90일)" />
            </div>
            <p className="text-[10px] text-white/25 mt-2.5">달성 시 멤버십·슈퍼챗·쇼핑 기능 활성화</p>
          </div>

          {/* 2단계: 광고 수익 */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stage2Done ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                {stage2Done ? '✓ 달성' : '2단계'}
              </span>
              <p className="text-xs text-white/60 font-medium">광고 수익 (아래 중 1가지)</p>
            </div>
            <div className="flex flex-col gap-2">
              <ProgressBar value={shortsViews90d} max={10_000_000} label="쇼츠 조회수 1,000만 (90일)" />
              <div className="flex items-center gap-2 py-0.5">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] text-white/30">또는</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <ProgressBar value={totalWatchHours} max={3000} label="시청시간 (12개월)" />
            </div>
            <p className="text-[10px] text-white/25 mt-2.5">달성 시 쇼츠 피드 광고 수익 창출</p>
          </div>
        </div>

        {/* 우: 일별 데이터 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-3 overflow-y-auto min-h-[200px] lg:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">일별 데이터</p>
          <AnalyticsTable analytics={analytics} />
        </div>
      </div>
    </div>
  );
}
