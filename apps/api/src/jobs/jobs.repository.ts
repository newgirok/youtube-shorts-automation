import { Injectable } from '@nestjs/common';
import { prisma } from '@shorts/shared';

@Injectable()
export class JobsRepository {
  async create(channelId: string, topic: string) {
    return prisma.job.create({
      data: { channelId, topic, status: 'PENDING' },
      select: { id: true, channelId: true, topic: true, status: true, retryCount: true },
    });
  }

  async findById(id: string) {
    return prisma.job.findUnique({
      where: { id },
      select: {
        id: true, channelId: true, topic: true, status: true, retryCount: true,
        failReason: true, scriptContent: true, audioS3Key: true, subtitleS3Key: true,
        videoS3Key: true, youtubeVideoId: true, viewCount: true, likeCount: true,
        createdAt: true, startedAt: true, completedAt: true,
      },
    });
  }

  async resetToRetry(id: string, retryCount: number) {
    return prisma.job.update({
      where: { id },
      data: { status: 'PENDING', retryCount, failReason: null },
      select: { id: true, channelId: true, topic: true, status: true, retryCount: true },
    });
  }

  async findMany(channelId?: string) {
    return prisma.job.findMany({
      where: channelId ? { channelId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, channelId: true, topic: true, status: true, retryCount: true, createdAt: true, youtubeVideoId: true, viewCount: true, scriptContent: true, failReason: true },
    });
  }

  async markFailed(id: string, failReason: string) {
    return prisma.job.update({
      where: { id },
      data: { status: 'FAILED', failReason },
      select: { id: true },
    });
  }
}
