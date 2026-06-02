import type { SQSHandler, SQSEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { prisma, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import { generateScript } from './script-generator.js';
import { parseEnv } from './env.js';

interface SQSMessage {
  jobId: string;
  channelId: string;
  topic: string;
}

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

// Windows CP949 → UTF-8 잘못 해석 시 나타나는 replacement character 제거
const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, '?');

export const handler: SQSHandler = async (event: SQSEvent) => {
  const env = parseEnv();

  for (const record of event.Records) {
    const { jobId, channelId, topic } = JSON.parse(record.body) as SQSMessage;
    const log = createLogger({ jobId, channelId });

    try {
      log.info({ topic }, 'script-worker 시작');

      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'SCRIPT_PROCESSING', startedAt: new Date() },
      });

      const script = await generateScript(topic, channelId);
      log.info('스크립트 생성 완료');

      const s3Key = jobKey(jobId, 'script.json');
      await uploadToS3(s3Key, JSON.stringify(script, null, 2));

      await prisma.job.update({
        where: { id: jobId },
        data: { scriptContent: JSON.parse(JSON.stringify(script)) },
      });

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: env.SQS_TTS_QUEUE_URL,
          MessageBody: JSON.stringify({ jobId, channelId, scriptS3Key: s3Key }),
        })
      );

      log.info({ s3Key }, 'script-worker 완료, tts-queue 발행');
    } catch (err) {
      const log2 = createLogger({ jobId, channelId });
      log2.error({ err }, 'script-worker 실패');
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          failReason: toSafeMsg(err),
        },
      });
      throw err;
    }
  }
};
