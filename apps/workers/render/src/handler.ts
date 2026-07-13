import type { SQSHandler, SQSEvent } from 'aws-lambda';
import { SQSClient } from '@aws-sdk/client-sqs';
import { createLogger } from '@shorts/shared';
import { parseEnv } from './env.js';
import { processMessage } from './processor.js';

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

export const handler: SQSHandler = async (event: SQSEvent) => {
  const env = parseEnv();
  const log = createLogger({});

  for (const record of event.Records) {
    log.info({ messageId: record.messageId }, 'render-worker Lambda 처리 시작');
    await processMessage(record.body, sqs, env);
  }
};
