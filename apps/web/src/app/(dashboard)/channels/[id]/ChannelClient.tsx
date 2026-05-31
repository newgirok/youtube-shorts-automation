'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { useChannelStore } from '@/lib/store';
import { cn } from '@/lib/utils';
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

type Freq = '매시간' | '매일' | '매주';
type Category = 'top' | 'politics' | 'business' | 'nation';

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? '자정' : i < 12 ? `오전${i}시` : i === 12 ? '정오' : `오후${i - 12}시`,
}));

const DAYS = [
  { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
  { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
  { value: 0, label: '일' },
];

const NEWS_CATEGORIES: { key: Category; label: string }[] = [
  { key: 'top', label: '종합' }, { key: 'politics', label: '정치' },
  { key: 'business', label: '경제' }, { key: 'nation', label: '사회' },
];

function cronToSchedule(cron: string): { freq: Freq; hour: number; day: number } {
  const [, h, , , d] = cron.trim().split(/\s+/);
  if (h === '*') return { freq: '매시간', hour: 9, day: 1 };
  if (d === '*') return { freq: '매일', hour: parseInt(h), day: 1 };
  return { freq: '매주', hour: parseInt(h), day: parseInt(d) };
}

function scheduleToCron(freq: Freq, hour: number, day: number): string {
  if (freq === '매시간') return '0 * * * *';
  if (freq === '매일') return `0 ${hour} * * *`;
  return `0 ${hour} * * ${day}`;
}

function scheduleLabel(freq: Freq, hour: number, day: number): string {
  const h = HOURS.find((x) => x.value === hour)?.label ?? `${hour}시`;
  if (freq === '매시간') return '매시간 정각';
  if (freq === '매일') return `매일 ${h}`;
  const d = DAYS.find((x) => x.value === day)?.label ?? '월요일';
  return `매주 ${d} ${h}`;
}

function SchedulerPanel({ channelId, channel }: { channelId: string; channel: Channel }) {
  const queryClient = useQueryClient();

  const init = cronToSchedule(channel.uploadSchedule ?? '0 9 * * *');
  const [enabled, setEnabled] = useState(channel.schedulerEnabled ?? false);
  const [freq, setFreq] = useState<Freq>(init.freq);
  const [hour, setHour] = useState(init.hour);
  const [day, setDay] = useState(init.day);
  const [category, setCategory] = useState<Category>((channel.schedulerCategory as Category) ?? 'top');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const stateRef = useRef({ enabled, freq, hour, day, category });
  stateRef.current = { enabled, freq, hour, day, category };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const s = stateRef.current;
      return apiPatch(`/channels/${channelId}/schedule`, {
        cronExpression: scheduleToCron(s.freq, s.hour, s.day),
        schedulerEnabled: s.enabled,
        schedulerCategory: s.category,
      });
    },
    onSuccess: () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('error');
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  function autoSave(immediate = false) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => mutation.mutate(), immediate ? 0 : 600);
  }

  function handleToggle() {
    setEnabled((v) => {
      stateRef.current.enabled = !v;
      autoSave(true);
      return !v;
    });
  }

  function handleFreq(v: Freq) { setFreq(v); autoSave(); }
  function handleHour(v: number) { setHour(v); autoSave(); }
  function handleDay(v: number) { setDay(v); autoSave(); }
  function handleCategory(v: Category) { setCategory(v); autoSave(); }

  return (
    <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0">
      {/* 활성화 토글 */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">자동 업로드</p>
            <p className="text-xs text-white/40 mt-0.5">
              {enabled ? scheduleLabel(freq, hour, day) : '비활성화됨'}
            </p>
            <p className={cn('text-[10px] mt-1 transition-opacity', saveStatus !== 'idle' ? 'opacity-100' : 'opacity-0', saveStatus === 'error' ? 'text-red-400' : 'text-green-400')}>
              {saveStatus === 'error' ? '저장 실패' : '✓ 저장됨'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors shrink-0',
              enabled ? 'bg-white/80' : 'bg-white/20'
            )}
            aria-pressed={enabled}
            aria-label="스케줄러 활성화"
          >
            <span className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-gray-900 transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
        </div>
      </div>

      {/* 업로드 주기 */}
      <div className={cn(
        'rounded-xl border border-white/10 bg-white/5 p-4 shrink-0 transition-opacity',
        !enabled && 'opacity-40 pointer-events-none'
      )}>
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">업로드 주기</p>
        {/* 주기 선택 */}
        <div className="flex gap-2">
          {(['매시간', '매일', '매주'] as Freq[]).map((f) => (
            <button
              key={f}
              onClick={() => handleFreq(f)}
              className={cn(
                'flex-1 py-2 rounded-xl text-xs font-medium transition-all border',
                freq === f
                  ? 'border-white/40 bg-white/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/50 hover:text-white hover:border-white/20'
              )}
            >{f}</button>
          ))}
        </div>
        {/* 시간/요일 — 아코디언 */}
        <div className={cn(
          'grid transition-all duration-300 ease-in-out',
          freq !== '매시간' ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'
        )}>
          <div className="overflow-hidden">
            <div className="flex flex-col gap-3 pb-0.5">
              {/* 시간 그리드 6×4 */}
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">시간</p>
                <div className="grid grid-cols-6 gap-1">
                  {HOURS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => handleHour(value)}
                      className={cn(
                        'py-1.5 rounded-lg text-[10px] font-medium transition-all border leading-none',
                        hour === value
                          ? 'border-white/40 bg-white/20 text-white'
                          : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/80 hover:border-white/20'
                      )}
                    >{label}</button>
                  ))}
                </div>
              </div>
              {/* 요일 그리드 — 내부 아코디언 */}
              <div className={cn(
                'grid transition-all duration-200 ease-in-out',
                freq === '매주' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}>
                <div className="overflow-hidden">
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">요일</p>
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => handleDay(value)}
                          className={cn(
                            'py-1.5 rounded-lg text-[10px] font-medium transition-all border leading-none',
                            day === value
                              ? 'border-white/40 bg-white/20 text-white'
                              : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/80 hover:border-white/20'
                          )}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 뉴스 카테고리 */}
      <div className={cn(
        'rounded-xl border border-white/10 bg-white/5 p-4 shrink-0 transition-opacity',
        !enabled && 'opacity-40 pointer-events-none'
      )}>
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">카테고리</p>
        <div className="grid grid-cols-2 gap-2">
          {NEWS_CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleCategory(key)}
              className={cn(
                'px-3 py-2.5 rounded-xl text-xs font-medium transition-colors border',
                category === key
                  ? 'border-white/50 bg-white/20 text-white'
                  : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
              )}
            >{label}</button>
          ))}
        </div>
      </div>

    </div>
  );
}

export function ChannelClient({ channel: initial }: { channel: Channel }) {
  const queryClient = useQueryClient();
  const { setSelectedChannelId } = useChannelStore();

  const { data: channel = initial } = useQuery<Channel>({
    queryKey: ['channel', initial.id],
    queryFn: () => apiGet<Channel>(`/channels/${initial.id}`),
    initialData: initial,
    staleTime: 0,
    refetchInterval: 30000,
  });

  useEffect(() => {
    setSelectedChannelId(initial.id);
  }, [initial.id, setSelectedChannelId]);

  useEffect(() => {
    apiPost(`/channels/${initial.id}/sync`, {})
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['channel', initial.id] });
      })
      .catch(() => {});
  }, [initial.id, queryClient]);

  const { data: analytics = [] } = useQuery<AnalyticsRow[]>({
    queryKey: ['analytics', initial.id],
    queryFn: () => apiGet<AnalyticsRow[]>(`/channels/${initial.id}/analytics`),
    staleTime: 60000,
    refetchInterval: 60000,
  });

  // 오늘 기준 28일치 날짜 범위를 고정 생성 — 데이터 없는 날은 0으로 채움
  const toLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const analyticsMap = new Map(analytics.map((r) => [r.date, r]));
  const chartData = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    const key = toLocalDate(d);
    const row = analyticsMap.get(key);
    const [, mm, dd] = key.split('-');
    return { date: `${parseInt(mm!)}/${parseInt(dd!)}`, views: row?.views ?? 0, subscribers: row?.subscribers ?? 0 };
  });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 모바일: 9일 간격(균일) + 마지막 날짜 항상 포함 → 0, 9, 18, 27
  const mobileTicks = (() => {
    const result: string[] = [];
    for (let i = 0; i < chartData.length; i += 9) result.push(chartData[i]!.date);
    const last = chartData[chartData.length - 1]!.date;
    if (!result.includes(last)) result.push(last);
    return result;
  })();

  const subscriberCount = channel.subscriberCount ?? 0;
  const totalViews = Number(channel.totalViews ?? 0);
  const uploadCount90d = channel.uploadCount90d ?? 0;
  const shortsViews90d = channel.shortsViews90d ?? 0;
  const stage1Done = subscriberCount >= 500 && uploadCount90d >= 3 && shortsViews90d >= 3_000_000;
  const stage2Done = shortsViews90d >= 10_000_000;

  return (
    <div className="flex flex-col px-4 py-4 md:px-6 gap-3 lg:h-screen lg:overflow-y-auto">
      {/* 상단: stat 4개 */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">구독자 수</p>
          <p className="text-2xl font-bold text-white truncate">{subscriberCount.toLocaleString()}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min((subscriberCount / 500) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{subscriberCount >= 500 ? '달성' : `${(500 - subscriberCount).toLocaleString()}명 남음`}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">쇼츠 조회수 (90일)</p>
          <p className="text-2xl font-bold text-white truncate">{shortsViews90d.toLocaleString()}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min((shortsViews90d / 3_000_000) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{shortsViews90d >= 3_000_000 ? '달성' : `${((shortsViews90d / 3_000_000) * 100).toFixed(2)}% / 300만`}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">업로드 횟수 (90일)</p>
          <p className="text-2xl font-bold text-white truncate">{uploadCount90d}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min((uploadCount90d / 3) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-white/40 mt-1 truncate">{uploadCount90d >= 3 ? '달성' : `${3 - uploadCount90d}회 남음`}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-1 truncate">총 조회수</p>
          <p className="text-2xl font-bold text-white truncate">{totalViews.toLocaleString()}</p>
          <p className="text-xs text-white/40 mt-1 truncate">채널 누적</p>
        </div>
      </div>

      {/* 채널 성과 추이 */}
      <div className="shrink-0 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-white">채널 성과 추이</p>
          <p className="text-xs text-white/40">
            최근 28일 · {analytics.length > 0 ? `${analytics.length}일 수집됨` : 'YouTube Analytics 미연동'}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">조회수</p>
            <div style={{ height: 140 }} className="[&_*]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255,255,255,0.15)" stopOpacity={1} />
                      <stop offset="95%" stopColor="rgba(255,255,255,0)" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" interval={0} ticks={isMobile ? mobileTicks : undefined} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={false} contentStyle={{ background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.85)' }} labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }} itemStyle={{ color: 'rgba(255,255,255,0.85)' }} />
                  <Area type="monotone" dataKey="views" name="조회수" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="url(#viewsGradient)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">구독자 증가</p>
            <div style={{ height: 140 }} className="[&_*]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="subsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255,255,255,0.12)" stopOpacity={1} />
                      <stop offset="95%" stopColor="rgba(255,255,255,0)" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" interval={0} ticks={isMobile ? mobileTicks : undefined} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 8 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={false} contentStyle={{ background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.85)' }} labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }} itemStyle={{ color: 'rgba(255,255,255,0.85)' }} />
                  <Area type="monotone" dataKey="subscribers" name="구독자" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} fill="url(#subsGradient)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 3컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 lg:min-h-0">
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
            <p className="text-xs text-white/40 mb-1.5">운영 상태</p>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${channel.isActive ? 'bg-green-400' : 'bg-white/30'}`} />
              <span className="text-xs font-medium text-white">{channel.isActive ? '운영 중' : '중지됨'}</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
            <p className="text-xs text-white/40 mb-1.5">YPP 자격</p>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${channel.isYPPQualified ? 'bg-yellow-400' : 'bg-white/20'}`} />
              <span className="text-xs font-medium text-white">
                {channel.isYPPQualified ? '수익 창출 적격' : '미달성'}
              </span>
            </div>
          </div>
          {(() => {
            const sched = cronToSchedule(channel.uploadSchedule ?? '0 9 * * *');
            const catLabel = NEWS_CATEGORIES.find(c => c.key === (channel.schedulerCategory ?? 'top'))?.label ?? '종합';
            return (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
                <p className="text-xs text-white/40 mb-1.5">업로드 설정</p>
                <p className="text-xs font-medium text-white">
                  {channel.schedulerEnabled ? scheduleLabel(sched.freq, sched.hour, sched.day) : '자동 업로드 꺼짐'}
                </p>
                {channel.schedulerEnabled && (
                  <p className="text-xs text-white/40 mt-0.5">{catLabel}</p>
                )}
              </div>
            );
          })()}
          {channel.createdAt && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 shrink-0">
              <p className="text-xs text-white/40 mb-0.5">채널 개설일</p>
              <p className="text-xs font-medium text-white">
                {(() => {
                  const [y, m, d] = channel.createdAt!.slice(0, 10).split('-');
                  return `${y}년 ${parseInt(m!)}월 ${parseInt(d!)}일`;
                })()}
              </p>
            </div>
          )}
        </div>

        {/* 중: YPP 달성 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col gap-3 overflow-y-auto min-h-[200px] lg:min-h-0">
          <p className="text-sm font-semibold text-white shrink-0">YPP 달성 현황</p>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 shrink-0">
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stage1Done ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                {stage1Done ? '달성' : '1단계'}
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

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stage2Done ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                {stage2Done ? '달성' : '2단계'}
              </span>
              <p className="text-xs text-white/60 font-medium">광고 수익</p>
            </div>
            <ProgressBar value={shortsViews90d} max={10_000_000} label="쇼츠 조회수 1,000만 (90일)" />
            <p className="text-[10px] text-white/25 mt-2.5">달성 시 쇼츠 피드 광고 수익 창출</p>
          </div>
        </div>

        {/* 우: 자동 업로드 스케줄러 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 flex flex-col min-h-[200px] lg:min-h-0 overflow-hidden">
          <p className="text-sm font-semibold text-white mb-4 shrink-0">자동 업로드 스케줄러</p>
          <SchedulerPanel channelId={initial.id} channel={channel} />
        </div>
      </div>
    </div>
  );
}
