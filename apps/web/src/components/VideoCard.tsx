'use client';

import { Eye, Video } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Job as JobType, JobStatus } from '@/lib/types';
import { effectiveThumbUrl } from '@/lib/utils';

const STATUS_LABEL: Record<JobStatus, string> = {
  PENDING: '대기',
  SCRIPT_PROCESSING: '스크립트 처리 중',
  TTS_PROCESSING: 'TTS 처리 중',
  SUBTITLE_PROCESSING: '자막 처리 중',
  RENDER_PROCESSING: '렌더링 중',
  UPLOAD_PROCESSING: '업로드 중',
  COMPLETED: '완료',
  FAILED: '실패',
};

const YOUTUBE_DELETED_REASON = '유튜브에서 영상이 삭제되었습니다.';

function StatusBadge({ status }: { status: JobStatus }) {
  if (status === 'COMPLETED') {
    return (
      <Badge className="bg-green-700 text-white">{STATUS_LABEL[status]}</Badge>
    );
  }
  if (status === 'FAILED') {
    return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === 'PENDING') {
    return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
  }
  return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function VideoCard({ video }: { video: JobType }) {
  const title = video.scriptContent?.title ?? video.topic;
  const isDeleted = video.status === 'FAILED' && video.failReason === YOUTUBE_DELETED_REASON;
  const thumbnailSrc = effectiveThumbUrl(video.youtubeVideoId, video.thumbnailUrl);

  return (
    <Card className="overflow-hidden cursor-pointer hover:ring-1 hover:ring-border transition-all">
      <div className="relative aspect-[9/16] max-h-36 bg-muted">
        {!isDeleted && thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        {/* 삭제된 영상 오버레이 */}
        {isDeleted && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-xs font-semibold text-white tracking-widest">삭제</span>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5">
          {!isDeleted && <StatusBadge status={video.status} />}
        </div>
      </div>

      <CardContent className="p-2 min-w-0">
        <p className="text-xs text-foreground line-clamp-1 leading-snug mb-1" title={title}>{title}</p>
        <div className="flex items-center justify-between min-w-0">
          <p className="text-xs text-muted-foreground truncate" title={formatDate(video.createdAt)}>
            {video.viewCount > 0 ? (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {video.viewCount.toLocaleString()}
              </span>
            ) : (
              formatDate(video.createdAt)
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
