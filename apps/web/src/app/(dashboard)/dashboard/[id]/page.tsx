'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Eye, ThumbsUp, Clock, RefreshCw, ExternalLink } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { StatusTimeline } from '@/components/StatusTimeline';
import type { Job } from '@/lib/types';

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR');
}

function calcProcessingSeconds(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '-';
  const diff = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  return `${diff}초`;
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: () => apiGet<Job>(`/jobs/${id}`),
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return 2000;
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return 30000;
      return 2000;
    },
  });

  if (isLoading) {
    return <div className="py-32 text-center text-sm text-white/50">불러오는 중...</div>;
  }

  if (!job) {
    return <div className="py-32 text-center text-sm text-white/50">찾을 수 없습니다.</div>;
  }

  const title = job.scriptContent?.title ?? job.topic;
  const processingTime = calcProcessingSeconds(job.startedAt, job.completedAt);
  const thumbnailUrl = job.youtubeVideoId
    ? `https://img.youtube.com/vi/${job.youtubeVideoId}/mqdefault.jpg`
    : null;
  const sc = job.scriptContent;

  return (
    <div className="flex flex-col px-4 py-4 md:px-6 gap-3 md:h-screen md:overflow-y-auto">
      {/* 헤더 */}
      <div className="shrink-0 flex items-center gap-3 justify-between">
        <h1 className="text-base font-semibold text-white truncate">{title}</h1>
        {job.youtubeVideoId && (
          <a
            href={`https://youtube.com/shorts/${job.youtubeVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:opacity-80 transition-opacity shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            YouTube에서 보기
          </a>
        )}
      </div>

      {/* stat 4개 — 모바일도 4열 한 줄 */}
      <div className="shrink-0 grid grid-cols-4 gap-2">
        {/* 조회수: 10k 목표 진행 바 */}
        <div className="rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm p-2.5 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
            <Eye className="w-3 h-3 text-white/40 shrink-0" />
            <span className="text-[10px] text-white/40 truncate">조회수</span>
          </div>
          <p className="text-base font-bold text-white truncate">{(job.viewCount ?? 0).toLocaleString()}</p>
          <div className="mt-1.5 h-0.5 w-full rounded-full bg-white/10">
            <div className="h-0.5 rounded-full bg-white/50 transition-all duration-500" style={{ width: `${Math.min(((job.viewCount ?? 0) / 10000) * 100, 100)}%` }} />
          </div>
          <p className="text-[9px] text-white/20 mt-0.5">/ 10,000</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm p-2.5 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
            <ThumbsUp className="w-3 h-3 text-white/40 shrink-0" />
            <span className="text-[10px] text-white/40 truncate">좋아요</span>
          </div>
          <p className="text-base font-bold text-white truncate">{(job.likeCount ?? 0).toLocaleString()}</p>
          <div className="mt-1.5 h-0.5 w-full rounded-full bg-white/10">
            <div className="h-0.5 rounded-full bg-white/50 transition-all duration-500" style={{ width: `${job.viewCount ? Math.min(((job.likeCount ?? 0) / job.viewCount) * 100, 100) : 0}%` }} />
          </div>
          <p className="text-[9px] text-white/20 mt-0.5">조회 대비</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm p-2.5 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3 h-3 text-white/40 shrink-0" />
            <span className="text-[10px] text-white/40 truncate">처리시간</span>
          </div>
          <p className="text-base font-bold text-white truncate">{processingTime}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm p-2.5 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <RefreshCw className="w-3 h-3 text-white/40 shrink-0" />
            <span className="text-[10px] text-white/40 truncate">재시도</span>
          </div>
          <p className="text-base font-bold text-white truncate">{job.retryCount}회</p>
        </div>
      </div>

      {/* 메인 가로 3컬럼 */}
      <div className="flex flex-col md:grid md:grid-cols-12 gap-3 flex-1 md:min-h-0">
        {/* 좌: 썸네일 + 날짜 */}
        <div className="order-3 md:order-1 md:col-span-3 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-4 flex flex-col gap-3 min-h-[300px] md:min-h-0">
          <p className="text-xs font-semibold text-white shrink-0">영상 정보</p>
          <div className="shrink-0">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={title} className="w-full rounded-xl object-cover aspect-video" />
            ) : (
              <div className="w-full rounded-xl bg-white/5 aspect-video flex items-center justify-center">
                <span className="text-xs text-white/30">썸네일 없음</span>
              </div>
            )}
          </div>
          <p className="text-xs text-white/70 leading-snug line-clamp-2 shrink-0">{title}</p>
          <div className="flex flex-col gap-1.5 shrink-0">
            {[
              { label: '생성', value: formatDateTime(job.createdAt) },
              { label: '시작', value: formatDateTime(job.startedAt) },
              { label: '완료', value: formatDateTime(job.completedAt) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-white/40 shrink-0">{label}</p>
                <p className="text-xs font-medium text-white text-right">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 중: 처리 단계 */}
        <div className="order-1 md:order-2 md:col-span-4 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 overflow-y-auto min-h-[300px] md:min-h-0">
          <p className="text-sm font-semibold text-white mb-4">처리 단계</p>
          <StatusTimeline job={job} />
        </div>

        {/* 우: 스크립트 */}
        <div className="order-2 md:order-3 md:col-span-5 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-sm p-5 overflow-y-auto min-h-[300px] md:min-h-0">
          <p className="text-sm font-semibold text-white mb-4">스크립트 내용</p>
          {sc ? (
            <div className="space-y-4">
              {sc.hook && (
                <div>
                  <p className="text-xs text-white/40 mb-1.5">후크 문구</p>
                  <p className="text-sm font-medium text-white italic">&ldquo;{sc.hook}&rdquo;</p>
                </div>
              )}
              {sc.thumbnail_text && (
                <div>
                  <p className="text-xs text-white/40 mb-1.5">썸네일 텍스트</p>
                  <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80">
                    {sc.thumbnail_text}
                  </span>
                </div>
              )}
              {sc.hashtags && sc.hashtags.length > 0 && (
                <div>
                  <p className="text-xs text-white/40 mb-1.5">해시태그</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sc.hashtags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/70">
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {sc.script && (
                <div>
                  <p className="text-xs text-white/40 mb-1.5">스크립트</p>
                  <div className="rounded-xl bg-white/5 p-3">
                    <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{sc.script}</p>
                  </div>
                </div>
              )}
              {(sc.affiliate_product || sc.affiliate_cta) && (
                <div>
                  <p className="text-xs text-white/40 mb-1.5">제휴 정보</p>
                  {sc.affiliate_product && <p className="text-xs text-white/50">상품: {sc.affiliate_product}</p>}
                  {sc.affiliate_cta && <p className="text-xs text-white/50 mt-0.5">CTA: {sc.affiliate_cta}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-xs text-white/40 mb-1.5">주제</p>
                <p className="text-sm text-white/80 leading-relaxed">{job.topic}</p>
              </div>
              {job.status === 'FAILED' && job.failReason && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-xs text-red-400/70 mb-1">실패 사유</p>
                  <p className="text-xs text-red-300/80 leading-relaxed">{job.failReason}</p>
                </div>
              )}
              {job.status !== 'FAILED' && (
                <div className="rounded-xl bg-white/5 p-4 flex flex-col gap-2">
                  <p className="text-xs text-white/30">
                    {job.status === 'PENDING' ? '처리 대기 중입니다.' : '스크립트를 생성하고 있습니다...'}
                  </p>
                  {job.status !== 'PENDING' && (
                    <div className="flex gap-1">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
