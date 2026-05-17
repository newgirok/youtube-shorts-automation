export type JobStatus =
  | 'PENDING'
  | 'SCRIPT_PROCESSING'
  | 'TTS_PROCESSING'
  | 'SUBTITLE_PROCESSING'
  | 'RENDER_PROCESSING'
  | 'UPLOAD_PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface Channel {
  id: string;
  name: string;
  niche: string;
  isActive: boolean;
  subscriberCount?: number;
  totalViews?: number;
}

export interface Job {
  id: string;
  channelId: string;
  topic: string;
  status: JobStatus;
  retryCount: number;
  failReason: string | null;
  scriptContent: {
    title?: string;
    hook?: string;
    script?: string;
    hashtags?: string[];
    thumbnail_text?: string;
    affiliate_cta?: string;
    affiliate_product?: string;
  } | null;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  youtubeVideoId: string | null;
}

export interface AnalyticsRow {
  date: string;
  views: number;
  subscribers: number;
  estimatedRevenue: number;
}
