import { prisma, createLogger } from '@shorts/shared';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { CronExpressionParser } from 'cron-parser';
import { fetchNewsTopics } from './news-fetcher.js';
import type { ScheduledHandler } from 'aws-lambda';

const log = createLogger({});
const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

function shouldRunNow(cronExpr: string): boolean {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: 'Asia/Seoul' });
    const prev = interval.prev().toDate();
    return Date.now() - prev.getTime() < 60_000;
  } catch {
    return false;
  }
}

export const handler: ScheduledHandler = async () => {
  const channels = await prisma.channel.findMany({
    where: { schedulerEnabled: true, isActive: true, uploadSchedule: { not: null } },
    select: { id: true, uploadSchedule: true, schedulerCategory: true },
  });

  log.info({ count: channels.length }, '스케줄 점검 시작');

  for (const ch of channels) {
    if (!ch.uploadSchedule || !shouldRunNow(ch.uploadSchedule)) continue;

    const activeJob = await prisma.job.findFirst({
      where: { channelId: ch.id, status: { notIn: ['COMPLETED', 'FAILED'] } },
      select: { id: true },
    });

    if (activeJob) {
      log.info({ channelId: ch.id }, '스케줄 스킵: 진행 중인 Job 있음');
      continue;
    }

    const category = (ch.schedulerCategory ?? 'top') as
      | 'top'
      | 'business'
      | 'technology'
      | 'health'
      | 'science'
      | 'nation';
    const topics = await fetchNewsTopics(category, 1);

    if (topics.length === 0) {
      log.warn({ channelId: ch.id, category }, '뉴스 수집 실패: 토픽 없음');
      continue;
    }

    const topic = topics[0]!.title;
    const job = await prisma.job.create({
      data: { channelId: ch.id, topic, status: 'PENDING' },
      select: { id: true },
    });

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_SCRIPT_QUEUE_URL,
        MessageBody: JSON.stringify({ jobId: job.id, channelId: ch.id, topic }),
      })
    );

    log.info({ channelId: ch.id, jobId: job.id, category }, '스케줄 Job 생성 완료');
  }
};
