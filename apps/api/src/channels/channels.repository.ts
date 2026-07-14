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

  async findById(id: string) {
    const row = await prisma.channel.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        niche: true,
        uploadSchedule: true,
        schedulerEnabled: true,
        schedulerCategory: true,
        isActive: true,
        subscriberCount: true,
        totalViews: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    return { ...row, totalViews: Number(row.totalViews) };
  }

  updateSchedule(
    id: string,
    data: {
      uploadSchedule?: string | null;
      schedulerEnabled?: boolean;
      schedulerCategory?: string;
    },
  ) {
    return prisma.channel.update({
      where: { id },
      data,
      select: { id: true, uploadSchedule: true, schedulerEnabled: true, schedulerCategory: true },
    });
  }

  getEnabledSchedules() {
    return prisma.channel.findMany({
      where: {
        schedulerEnabled: true,
        uploadSchedule: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        uploadSchedule: true,
        schedulerCategory: true,
      },
    });
  }

  async getYPPStats(channelId: string) {
    const since90d = new Date();
    since90d.setDate(since90d.getDate() - 90);

    const jobs = await prisma.job.findMany({
      where: {
        channelId,
        status: 'COMPLETED',
        youtubeVideoId: { not: null },
        completedAt: { gte: since90d },
      },
      select: { viewCount: true },
    });

    return {
      uploadCount90d: jobs.length,
      shortsViews90d: jobs.reduce((s, j) => s + Number(j.viewCount), 0),
    };
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
      select: { refreshToken: true, youtubeId: true },
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

  async getAnalytics(id: string) {
    const rows = await prisma.channelAnalytics.findMany({
      where: { channelId: id },
      select: { date: true, views: true, subscribers: true, estimatedRevenue: true, watchTimeMinutes: true },
      orderBy: { date: 'asc' },
      take: 30,
    });
    return rows.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      views: Number(r.views),
      subscribers: r.subscribers,
      estimatedRevenue: r.estimatedRevenue,
      watchTimeMinutes: Number(r.watchTimeMinutes),
    }));
  }

  upsertDailyAnalytics(channelId: string, data: {
    date: Date;
    views: bigint;
    subscribers: number;
    watchTimeMinutes: bigint;
  }) {
    return prisma.channelAnalytics.upsert({
      where: { channelId_date: { channelId, date: data.date } },
      create: { channelId, ...data },
      update: { views: data.views, subscribers: data.subscribers, watchTimeMinutes: data.watchTimeMinutes },
      select: { id: true },
    });
  }

  updateJobViewCounts(updates: Array<{ youtubeVideoId: string; viewCount: number; likeCount: number; privacyStatus: string }>) {
    return Promise.all(
      updates.map(({ youtubeVideoId, viewCount, likeCount, privacyStatus }) =>
        prisma.job.updateMany({
          where: { youtubeVideoId },
          data: { viewCount, likeCount, privacyStatus },
        }),
      ),
    );
  }

  updateChannelStats(id: string, data: { subscriberCount: number; totalViews: number }) {
    return prisma.channel.update({
      where: { id },
      data,
      select: { id: true, subscriberCount: true, totalViews: true },
    });
  }

  updateTotalViews(id: string, totalViews: number) {
    return prisma.channel.update({
      where: { id },
      data: { totalViews },
      select: { id: true, totalViews: true },
    });
  }

  deactivate(id: string) {
    return prisma.channel.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });
  }
}
