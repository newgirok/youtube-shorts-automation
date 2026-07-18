import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { createLogger } from '@shorts/shared';
import { ChannelsRepository } from './channels.repository.js';
import { decrypt } from '../auth/crypto.js';
import type { UpdateScheduleDto } from './dto/update-schedule.dto.js';

const log = createLogger({});

@Injectable()
export class ChannelsService {
  constructor(@Inject(ChannelsRepository) private readonly repo: ChannelsRepository) {}

  findAll(userId?: string) {
    return this.repo.findAll(userId);
  }

  async findById(id: string) {
    const [channel, yppStats] = await Promise.all([
      this.repo.findById(id),
      this.repo.getYPPStats(id),
    ]);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    const isYPPQualified =
      (channel.subscriberCount ?? 0) >= 500 &&
      yppStats.uploadCount90d >= 3 &&
      yppStats.shortsViews90d >= 3_000_000;
    return { ...channel, ...yppStats, isYPPQualified };
  }

  async getAnalytics(id: string) {
    const channel = await this.repo.findById(id);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    return this.repo.getAnalytics(id);
  }

  async updateSchedule(id: string, dto: UpdateScheduleDto) {
    const channel = await this.repo.findById(id);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');

    const data: Parameters<typeof this.repo.updateSchedule>[1] = {};
    if (dto.cronExpression !== undefined) {
      data.uploadSchedule = dto.cronExpression;
    }
    if (dto.schedulerEnabled !== undefined) {
      data.schedulerEnabled = dto.schedulerEnabled;
    }
    if (dto.schedulerCategory !== undefined) {
      data.schedulerCategory = dto.schedulerCategory;
    }
    return this.repo.updateSchedule(id, data);
  }

  async syncChannel(channelId: string): Promise<{ synced: number; deleted: number }> {
    log.info({ channelId }, '채널 통계 + 동영상 동기화 시작');

    const channelRow = await this.repo.findRefreshToken(channelId);
    if (!channelRow) throw new NotFoundException('채널을 찾을 수 없습니다.');

    const refreshToken = decrypt(channelRow.refreshToken);
    const client = new OAuth2Client(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
    );
    client.setCredentials({ refresh_token: refreshToken });
    const yt = google.youtube({ version: 'v3', auth: client });

    const channelRes = await yt.channels.list({ part: ['statistics'], id: [channelRow.youtubeId] });
    const stats = channelRes.data.items?.[0]?.statistics;
    if (stats) {
      await this.repo.updateChannelStats(channelId, {
        subscriberCount: parseInt(stats.subscriberCount ?? '0', 10),
        totalViews: parseInt(stats.viewCount ?? '0', 10),
      });
      log.info({ channelId, subscriberCount: stats.subscriberCount, viewCount: stats.viewCount }, '채널 통계 갱신 완료');
    }

    await this.syncAnalytics(channelId, channelRow.youtubeId, client).catch((err) => {
      log.warn({ channelId, err }, 'Analytics 동기화 실패 (scope 없음 — 채널 재연결 필요)');
    });

    return this.syncVideos(channelId);
  }

  private async syncAnalytics(channelId: string, youtubeId: string, client: OAuth2Client): Promise<void> {
    const ytAnalytics = google.youtubeAnalytics({ version: 'v2', auth: client });

    const endDate = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startDate = start.toISOString().split('T')[0];

    const res = await ytAnalytics.reports.query({
      ids: `channel==${youtubeId}`,
      startDate,
      endDate,
      metrics: 'views,subscribersGained,estimatedMinutesWatched',
      dimensions: 'day',
      sort: 'day',
    });

    const rows = res.data.rows ?? [];
    for (const row of rows) {
      const [dateStr, views, subscribers, watchTimeMinutes] = row as [string, number, number, number];
      await this.repo.upsertDailyAnalytics(channelId, {
        date: new Date(dateStr),
        views: BigInt(Math.round(views)),
        subscribers: Math.round(subscribers),
        watchTimeMinutes: BigInt(Math.round(watchTimeMinutes)),
      });
    }
    log.info({ channelId, rows: rows.length }, 'Analytics 동기화 완료');
  }

  async deactivate(id: string) {
    const channel = await this.repo.findById(id);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    return this.repo.deactivate(id);
  }

  async syncVideos(channelId: string): Promise<{ synced: number; deleted: number }> {
    log.info({ channelId }, 'YouTube 영상 동기화 시작');

    const channelRow = await this.repo.findRefreshToken(channelId);
    if (!channelRow) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }

    const jobs = await this.repo.findCompletedJobsWithVideoId(channelId);
    if (jobs.length === 0) {
      log.info({ channelId }, '동기화할 완료 영상 없음');
      return { synced: 0, deleted: 0 };
    }

    const refreshToken = decrypt(channelRow.refreshToken);
    const client = new OAuth2Client(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
    );
    client.setCredentials({ refresh_token: refreshToken });

    const yt = google.youtube({ version: 'v3', auth: client });

    // YouTube API는 한 번에 최대 50개 id 조회 가능
    const videoIds = jobs.map((j) => j.youtubeVideoId as string);
    const existingIds = new Set<string>();
    const viewCountUpdates: Array<{ youtubeVideoId: string; viewCount: number; likeCount: number; privacyStatus: string }> = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const res = await yt.videos.list({ part: ['id', 'statistics', 'status'], id: chunk });
      for (const item of res.data.items ?? []) {
        if (item.id) {
          existingIds.add(item.id);
          viewCountUpdates.push({
            youtubeVideoId: item.id,
            viewCount: parseInt(item.statistics?.viewCount ?? '0', 10),
            likeCount: parseInt(item.statistics?.likeCount ?? '0', 10),
            privacyStatus: item.status?.privacyStatus ?? 'public',
          });
        }
      }
    }

    const deletedJobs = jobs.filter((j) => !existingIds.has(j.youtubeVideoId as string));

    if (deletedJobs.length > 0) {
      await this.repo.markJobsDeleted(deletedJobs.map((j) => j.id));
      log.info({ channelId, deleted: deletedJobs.length }, '삭제된 YouTube 영상 Job 업데이트 완료');
    }

    if (viewCountUpdates.length > 0) {
      await this.repo.updateJobViewCounts(viewCountUpdates);
      log.info({ channelId, updated: viewCountUpdates.length }, '조회수 업데이트 완료');

      // 영상별 조회수 합산을 채널 총 조회수로 반영
      const totalVideoViews = viewCountUpdates.reduce((sum, v) => sum + v.viewCount, 0);
      await this.repo.updateTotalViews(channelId, totalVideoViews);
    }

    return { synced: jobs.length, deleted: deletedJobs.length };
  }
}
