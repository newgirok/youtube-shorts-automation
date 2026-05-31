'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Job, JobStatus } from '@/lib/types';
import { apiPost } from '@/lib/api';

const STEPS: { status: JobStatus; label: string }[] = [
  { status: 'PENDING', label: '대기' },
  { status: 'SCRIPT_PROCESSING', label: '스크립트' },
  { status: 'TTS_PROCESSING', label: 'TTS' },
  { status: 'SUBTITLE_PROCESSING', label: '자막' },
  { status: 'RENDER_PROCESSING', label: '렌더링' },
  { status: 'UPLOAD_PROCESSING', label: '업로드' },
  { status: 'COMPLETED', label: '완료' },
];

const STATUS_ORDER: Record<JobStatus, number> = {
  PENDING: 0,
  SCRIPT_PROCESSING: 1,
  TTS_PROCESSING: 2,
  SUBTITLE_PROCESSING: 3,
  RENDER_PROCESSING: 4,
  UPLOAD_PROCESSING: 5,
  COMPLETED: 6,
  FAILED: -1,
};

const YOUTUBE_DELETED_REASON = '유튜브에서 영상이 삭제되었습니다.';

export function StatusTimeline({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const currentOrder = STATUS_ORDER[job.status];
  const isYoutubeDeleted = job.status === 'FAILED' && job.failReason === YOUTUBE_DELETED_REASON;

  async function handleRetry() {
    await apiPost(`/jobs/${job.id}/retry`, {});
    await queryClient.invalidateQueries({ queryKey: ['job', job.id] });
  }

  return (
    <div>
      <ol className="flex flex-col gap-1">
        {STEPS.map((step, idx) => {
          const stepOrder = STATUS_ORDER[step.status];
          const isDone = job.status !== 'FAILED' && (currentOrder > stepOrder || job.status === 'COMPLETED');
          const isActive = job.status !== 'FAILED' && job.status !== 'COMPLETED' && currentOrder === stepOrder;
          const isLast = idx === STEPS.length - 1;

          return (
            <li key={step.status} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    isDone ? 'bg-green-600 text-white' : '',
                    isActive ? 'bg-primary text-primary-foreground' : '',
                    !isDone && !isActive ? 'bg-muted text-muted-foreground border border-border' : '',
                  ].join(' ')}
                >
                  {isDone && <Check className="w-4 h-4" strokeWidth={2.5} />}
                  {isActive && <Loader2 className="w-4 h-4 animate-spin" />}
                  {!isDone && !isActive && (
                    <span className="text-xs">{idx + 1}</span>
                  )}
                </div>
                {!isLast && (
                  <div
                    className={`w-px flex-1 my-1 ${isDone ? 'bg-green-600' : 'bg-border'}`}
                    style={{ minHeight: '16px' }}
                  />
                )}
              </div>

              <div className="pb-5 pt-1">
                <span
                  className={[
                    'text-sm font-medium',
                    isDone ? 'text-green-400' : '',
                    isActive ? 'text-foreground' : '',
                    !isDone && !isActive ? 'text-muted-foreground' : '',
                  ].join(' ')}
                >
                  {step.label}
                </span>
                {step.status === 'PENDING' && job.startedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    시작: {new Date(job.startedAt).toLocaleString('ko-KR')}
                  </p>
                )}
                {step.status === 'COMPLETED' && job.completedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    완료: {new Date(job.completedAt).toLocaleString('ko-KR')}
                    {job.startedAt && (
                      <span className="ml-1">
                        ({Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}초)
                      </span>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {job.status === 'FAILED' && isYoutubeDeleted && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
              <X className="w-3.5 h-3.5 text-white/50" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-medium text-white/60">유튜브에서 영상이 삭제되었습니다</p>
          </div>
        </div>
      )}

      {job.status === 'FAILED' && !isYoutubeDeleted && (
        <div className="mt-4 rounded-lg border border-destructive bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive">
              <X className="w-3.5 h-3.5 text-destructive-foreground" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-semibold text-destructive">실패 원인</p>
          </div>
          <p className="text-sm text-muted-foreground break-all">{job.failReason ?? '알 수 없는 오류'}</p>
          <Button variant="destructive" size="sm" onClick={handleRetry} className="mt-4">
            재시도
          </Button>
        </div>
      )}
    </div>
  );
}
