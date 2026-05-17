import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { createLogger } from '@shorts/shared';
import { ChannelsRepository } from './channels.repository.js';
import { decrypt } from '../auth/crypto.js';

const log = createLogger({});

@Injectable()
export class ChannelsService {
  constructor(@Inject(ChannelsRepository) private readonly repo: ChannelsRepository) {}

  findAll() {
    return this.repo.findAll();
  }

  async findById(id: string) {
    const channel = await this.repo.findById(id);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    return channel;
  }

  updateSchedule(id: string, cronExpression: string) {
    return this.repo.updateSchedule(id, cronExpression);
  }

  getAnalytics(id: string) {
    return this.repo.getAnalytics(id);
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
    const viewCountUpdates: Array<{ youtubeVideoId: string; viewCount: number; likeCount: number }> = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const res = await yt.videos.list({ part: ['id', 'statistics'], id: chunk });
      for (const item of res.data.items ?? []) {
        if (item.id) {
          existingIds.add(item.id);
          viewCountUpdates.push({
            youtubeVideoId: item.id,
            viewCount: parseInt(item.statistics?.viewCount ?? '0', 10),
            likeCount: parseInt(item.statistics?.likeCount ?? '0', 10),
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
    }

    return { synced: jobs.length, deleted: deletedJobs.length };
  }
}
