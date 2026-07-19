import { Injectable, Inject } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createLogger, downloadFromS3, jobKey } from '@shorts/shared';
import { JobsRepository } from './jobs.repository.js';
import { JobNotFoundError, JobNotRetryableError, DailyQuotaExceededError } from './jobs.errors.js';
import { fetchNewsTopics } from './news-fetcher.js';
import type { AutoNewsJobDto } from './dto/auto-news.dto.js';

const DAILY_LIMIT = 3;

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
const log = createLogger({});

function getTodayStartSeoul(): Date {
  const seoulDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${seoulDate}T00:00:00+09:00`);
}

@Injectable()
export class JobsService {
  constructor(@Inject(JobsRepository) private readonly repo: JobsRepository) {}

  async create(channelId: string, topic: string) {
    const createdToday = await this.repo.countCreatedToday(channelId, getTodayStartSeoul());
    if (createdToday >= DAILY_LIMIT) throw new DailyQuotaExceededError(channelId);

    const job = await this.repo.create(channelId, topic);
    log.info({ jobId: job.id, channelId }, 'Job 생성');

    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.SQS_SCRIPT_QUEUE_URL,
          MessageBody: JSON.stringify({ jobId: job.id, channelId, topic }),
        })
      );
      log.info({ jobId: job.id, channelId }, 'script-queue 발행 완료');
    } catch (err) {
      log.error({ jobId: job.id, channelId, err }, 'SQS 발행 실패, Job FAILED 처리');
      await this.repo.markFailed(job.id, 'SQS 발행 실패');
      throw err;
    }

    return job;
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  findMany(channelId?: string) {
    return this.repo.findMany(channelId);
  }

  async createFromNews(dto: AutoNewsJobDto) {
    const items = await fetchNewsTopics(dto.category, dto.count);
    if (items.length === 0) throw new Error('수집된 뉴스 없음');
    log.info({ category: dto.category, count: items.length }, '뉴스 자동 수집 완료');

    const results = [];
    for (const item of items) {
      try {
        results.push(await this.create(dto.channelId, item.title));
      } catch (err) {
        if (err instanceof DailyQuotaExceededError) break;
        throw err;
      }
    }
    return results;
  }

  async getThumbnail(id: string): Promise<Buffer | null> {
    try {
      return await downloadFromS3(jobKey(id, 'thumbnail.jpg'));
    } catch {
      return null;
    }
  }

  async retry(id: string) {
    const job = await this.repo.findById(id);
    if (!job) throw new JobNotFoundError(id);
    if (job.status !== 'FAILED') throw new JobNotRetryableError(job.status);

    const updated = await this.repo.resetToRetry(id, job.retryCount + 1);
    log.info({ jobId: id, channelId: job.channelId }, 'Job 재시도 상태 초기화');

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_SCRIPT_QUEUE_URL,
        MessageBody: JSON.stringify({ jobId: job.id, channelId: job.channelId, topic: job.topic }),
      })
    );
    log.info({ jobId: id, channelId: job.channelId }, 'script-queue 재발행 완료');

    return updated;
  }
}
