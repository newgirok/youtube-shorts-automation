import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CronExpressionParser } from 'cron-parser';
import { ChannelsRepository } from '../channels/channels.repository.js';
import { JobsRepository } from '../jobs/jobs.repository.js';
import { JobsService } from '../jobs/jobs.service.js';
import { createLogger } from '@shorts/shared';

const log = createLogger({});

function shouldRunNow(cronExpr: string): boolean {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: 'Asia/Seoul' });
    const prev = interval.prev().toDate();
    const diffMs = Date.now() - prev.getTime();
    return diffMs < 60_000;
  } catch {
    return false;
  }
}

@Injectable()
export class SchedulerService {
  constructor(
    private readonly channelsRepo: ChannelsRepository,
    private readonly jobsRepo: JobsRepository,
    private readonly jobsService: JobsService,
  ) {}

  @Cron('* * * * *')
  async tick() {
    const channels = await this.channelsRepo.getEnabledSchedules();
    for (const ch of channels) {
      if (!ch.uploadSchedule || !shouldRunNow(ch.uploadSchedule)) continue;

      const hasActive = await this.jobsRepo.hasActiveJob(ch.id);
      if (hasActive) {
        log.info({ channelId: ch.id }, '스케줄 스킵: 진행 중인 Job 있음');
        continue;
      }

      log.info({ channelId: ch.id, category: ch.schedulerCategory }, '스케줄 Job 생성');
      await this.jobsService.createFromNews({
        channelId: ch.id,
        category: ch.schedulerCategory as 'top' | 'politics' | 'business' | 'nation',
        count: 1,
      });
    }
  }
}
