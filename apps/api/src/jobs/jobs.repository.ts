import { Injectable } from '@nestjs/common';
import { prisma } from '@shorts/shared';

function resolveThumbUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/jobs/')) {
    const base = process.env.API_BASE_URL ?? 'http://localhost:3000';
    return `${base}${url}`;
  }
  return url;
}

@Injectable()
export class JobsRepository {
  async create(channelId: string, topic: string) {
    return prisma.job.create({
      data: { channelId, topic, status: 'PENDING' },
      select: { id: true, channelId: true, topic: true, status: true, retryCount: true },
    });
  }

  async findById(id: string) {
    const row = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true, channelId: true, topic: true, status: true, retryCount: true,
        failReason: true, scriptContent: true, audioS3Key: true, subtitleS3Key: true,
        videoS3Key: true, youtubeVideoId: true, thumbnailUrl: true, privacyStatus: true, viewCount: true, likeCount: true,
        createdAt: true, startedAt: true, completedAt: true,
      },
    });
    if (!row) return null;
    return { ...row, viewCount: Number(row.viewCount), likeCount: Number(row.likeCount), thumbnailUrl: resolveThumbUrl(row.thumbnailUrl) };
  }

  async resetToRetry(id: string, retryCount: number) {
    return prisma.job.update({
      where: { id },
      data: { status: 'PENDING', retryCount, failReason: null },
      select: { id: true, channelId: true, topic: true, status: true, retryCount: true },
    });
  }

  async findMany(channelId?: string) {
    const rows = await prisma.job.findMany({
      where: channelId ? { channelId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, channelId: true, topic: true, status: true, retryCount: true, createdAt: true, youtubeVideoId: true, thumbnailUrl: true, privacyStatus: true, viewCount: true, scriptContent: true, failReason: true },
    });
    return rows.map((r) => ({ ...r, viewCount: Number(r.viewCount), thumbnailUrl: resolveThumbUrl(r.thumbnailUrl) }));
  }

  async countCreatedToday(channelId: string, since: Date): Promise<number> {
    return prisma.job.count({
      where: { channelId, createdAt: { gte: since } },
    });
  }

  async hasActiveJob(channelId: string): Promise<boolean> {
    const count = await prisma.job.count({
      where: {
        channelId,
        status: {
          notIn: ['COMPLETED', 'FAILED'],
        },
      },
    });
    return count > 0;
  }

  async markFailed(id: string, failReason: string) {
    return prisma.job.update({
      where: { id },
      data: { status: 'FAILED', failReason },
      select: { id: true },
    });
  }
}
