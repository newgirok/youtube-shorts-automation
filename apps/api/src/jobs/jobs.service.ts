import { Injectable, Inject } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createLogger } from '@shorts/shared';
import { JobsRepository } from './jobs.repository.js';
import { JobNotFoundError, JobNotRetryableError } from './jobs.errors.js';

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
const log = createLogger({});

@Injectable()
export class JobsService {
  constructor(@Inject(JobsRepository) private readonly repo: JobsRepository) {}

  async create(channelId: string, topic: string) {
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
