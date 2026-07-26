import { prisma, createLogger } from '@shorts/shared';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { fetchNewsTopics } from './news-fetcher.js';
import type { ScheduledHandler } from 'aws-lambda';

const log = createLogger({});
const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

type NewsCategory = 'top' | 'business' | 'technology' | 'health' | 'science' | 'nation';

export const handler: ScheduledHandler = async (event) => {
  const channelId = (event as unknown as { channelId?: string }).channelId;
  if (!channelId) {
    log.warn('channelId 없음 — 스킵');
    return;
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, schedulerEnabled: true, isActive: true, schedulerCategory: true },
  });

  if (!channel?.schedulerEnabled || !channel.isActive) {
    log.info({ channelId }, '스케줄 스킵: 비활성 채널');
    return;
  }

  const activeJob = await prisma.job.findFirst({
    where: { channelId, status: { notIn: ['COMPLETED', 'FAILED'] } },
    select: { id: true },
  });

  if (activeJob) {
    log.info({ channelId }, '스케줄 스킵: 진행 중인 Job 있음');
    return;
  }

  const category = (channel.schedulerCategory ?? 'top') as NewsCategory;
  const topics = await fetchNewsTopics(category, 1);

  if (topics.length === 0) {
    log.warn({ channelId, category }, '뉴스 수집 실패: 정치 키워드 필터 후 유효 토픽 없음');
    return;
  }

  const topic = topics[0]!.title;
  const job = await prisma.job.create({
    data: { channelId, topic, status: 'PENDING' },
    select: { id: true },
  });

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.SQS_SCRIPT_QUEUE_URL,
      MessageBody: JSON.stringify({ jobId: job.id, channelId, topic }),
    }),
  );

  log.info({ channelId, jobId: job.id, category }, '스케줄 Job 생성 완료');
};
