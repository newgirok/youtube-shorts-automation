'use client';

import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { apiGet } from '@/lib/api';
import type { AnalyticsRow, Channel } from '@/lib/types';

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-white/60">{label}</span>
        <div className="flex items-baseline gap-1">
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
  const { data: analytics = [] } = useQuery<AnalyticsRow[]>({
    queryKey: ['analytics', initial.id],
    queryFn: () => apiGet<AnalyticsRow[]>(`/channels/${initial.id}/analytics`),
  });

  const subscriberCount = initial.subscriberCount ?? 0;
  const totalViews = initial.totalViews ?? 0;
  const subPct = Math.min((subscriberCount / 1000) * 100, 100);
  // watch time hours 데이터 미수집 — totalViews는 조회수(views)이며 시청시간(hours)이 아님
  const viewPct = 0;
  const periodViews = analytics.reduce((s, r) => s + r.views, 0);
  const periodRevenue = analytics.reduce((s, r) => s + r.estimatedRevenue, 0);
  const periodSubGain = analytics.reduce((s, r) => s + r.subscribers, 0);

  return (
    <div className="flex flex-col px-4 py-4 md:px-6 gap-3 md:h-screen md:overflow-y-auto">
      {/* 상단: stat 4개 */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">구독자 수</p>
          <p className="text-2xl font-bold text-white truncate">{subscriberCount.toLocaleString()}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${subPct}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{subPct.toFixed(1)}% / 1,000 목표</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">총 조회수</p>
          <p className="text-2xl font-bold text-white truncate">{totalViews.toLocaleString()}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${viewPct}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">시청시간 데이터 미수집</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">YPP 달성률</p>
          <p className="text-2xl font-bold text-white truncate">{Math.round((subPct + viewPct) / 2)}%</p>
          <p className="text-xs text-white/40 mt-0.5 truncate">구독 {subPct.toFixed(0)}% · 시청 {viewPct.toFixed(0)}%</p>
        </div>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:flex-1 md:min-h-0">
        {/* 좌: 채널 정보 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-2.5 overflow-y-auto min-h-[200px] md:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">채널 정보</p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
            <p className="text-xs text-white/40 mb-0.5">채널 이름</p>
            <p className="text-base font-semibold text-white">{initial.name}</p>
          </div>
          {initial.niche && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
              <p className="text-xs text-white/40 mb-0.5">카테고리</p>
              <p className="text-sm font-medium text-white">{initial.niche}</p>
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
              <div className={`w-1.5 h-1.5 rounded-full ${initial.isActive ? 'bg-green-400' : 'bg-white/30'}`} />
              <span className="text-xs font-medium text-white">{initial.isActive ? '운영 중' : '중지됨'}</span>
            </div>
          </div>
        </div>

        {/* 중: YPP 달성 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-4 overflow-y-auto min-h-[200px] md:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">YPP 달성 현황</p>
          <div className="flex justify-around items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <PieChart width={100} height={100}>
                  <Pie
                    data={[{ value: subPct }, { value: Math.max(0, 100 - subPct) }]}
                    cx={45} cy={45}
                    innerRadius={30} outerRadius={46}
                    startAngle={90} endAngle={-270}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="rgba(255,255,255,0.85)" />
                    <Cell fill="rgba(255,255,255,0.1)" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{subPct.toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-xs text-white/40">구독자</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <PieChart width={100} height={100}>
                  <Pie
                    data={[{ value: viewPct }, { value: Math.max(0, 100 - viewPct) }]}
                    cx={45} cy={45}
                    innerRadius={30} outerRadius={46}
                    startAngle={90} endAngle={-270}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="rgba(255,255,255,0.85)" />
                    <Cell fill="rgba(255,255,255,0.1)" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{viewPct.toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-xs text-white/40">시청시간</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 flex-1">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-white/50 mb-2">남은 목표</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">구독자</span>
                  <span className="text-sm font-semibold text-white">{Math.max(0, 1000 - subscriberCount).toLocaleString()}명 남음</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">시청시간</span>
                  <span className="text-sm font-semibold text-white/40">데이터 미수집</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 우: 일별 데이터 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-3 overflow-y-auto min-h-[200px] md:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">일별 데이터</p>
          <AnalyticsTable analytics={analytics} />
        </div>
      </div>
    </div>
  );
}
