import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toProxyThumbUrl(thumbUrl: string | null | undefined): string | null {
  if (!thumbUrl) return null;
  const match = thumbUrl.match(/\/jobs\/([^/]+)\/thumbnail/);
  if (match) return `/api/thumbnail/${match[1]}`;
  return thumbUrl;
}

export function effectiveThumbUrl(youtubeVideoId: string | null | undefined, thumbnailUrl: string | null | undefined): string | null {
  if (youtubeVideoId) return `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  return toProxyThumbUrl(thumbnailUrl);
}
