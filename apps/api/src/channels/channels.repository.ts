import { Injectable } from '@nestjs/common';
import { prisma } from '@shorts/shared';
import type { JobStatus } from '@shorts/shared';

@Injectable()
export class ChannelsRepository {
  findAll() {
    return prisma.channel.findMany({
      where: { isActive: true },
      select: { id: true, name: true, niche: true },
    });
  }

  findById(id: string) {
    return prisma.channel.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        niche: true,
        uploadSchedule: true,
        isActive: true,
        subscriberCount: true,
        totalViews: true,
        isYPPQualified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  updateSchedule(id: string, uploadSchedule: string) {
    return prisma.channel.update({
      where: { id },
      data: { uploadSchedule },
      select: { id: true, uploadSchedule: true },
    });
  }

  getAnalytics(id: string) {
    return prisma.channelAnalytics.findMany({
      where: { channelId: id },
      select: { date: true, views: true, subscribers: true, estimatedRevenue: true },
      orderBy: { date: 'desc' },
      take: 30,
    });
  }

  findCompletedJobsWithVideoId(channelId: string) {
    return prisma.job.findMany({
      where: {
        channelId,
        status: 'COMPLETED' satisfies JobStatus,
        youtubeVideoId: { not: null },
      },
      select: { id: true, youtubeVideoId: true },
    });
  }

  findRefreshToken(channelId: string) {
    return prisma.channel.findUnique({
      where: { id: channelId },
      select: { refreshToken: true },
    });
  }

  markJobsDeleted(jobIds: string[]) {
    return prisma.job.updateMany({
      where: { id: { in: jobIds } },
      data: {
        youtubeVideoId: null,
        status: 'FAILED' satisfies JobStatus,
        failReason: '유튜브에서 영상이 삭제되었습니다.',
      },
    });
  }

  updateJobViewCounts(updates: Array<{ youtubeVideoId: string; viewCount: number; likeCount: number }>) {
    return Promise.all(
      updates.map(({ youtubeVideoId, viewCount, likeCount }) =>
        prisma.job.updateMany({
          where: { youtubeVideoId },
          data: { viewCount, likeCount },
        }),
      ),
    );
  }
}
