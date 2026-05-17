import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { createLogger } from '@shorts/shared';
import { handler } from './handler.js';

const QUEUE_URL = process.env.SQS_TTS_QUEUE_URL!;
const REGION = process.env.AWS_REGION ?? 'ap-northeast-2';
const ENDPOINT = process.env.AWS_ENDPOINT_URL;

const sqs = new SQSClient({
  region: REGION,
  ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
});
const log = createLogger({});

log.info('tts-worker local polling 시작');

async function poll() {
  while (true) {
    try {
      const result = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        })
      );
      for (const msg of result.Messages ?? []) {
        if (!msg.Body || !msg.ReceiptHandle) continue;
        try {
          await handler(
            {
              Records: [
                {
                  messageId: msg.MessageId ?? '',
                  receiptHandle: msg.ReceiptHandle,
                  body: msg.Body,
                  attributes: {} as never,
                  messageAttributes: {},
                  md5OfBody: '',
                  eventSource: 'aws:sqs',
                  eventSourceARN: '',
                  awsRegion: REGION,
                },
              ],
            },
            {} as never,
            () => {}
          );
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: msg.ReceiptHandle,
            })
          );
        } catch (err) {
          log.error({ err }, '메시지 처리 실패');
        }
      }
    } catch (err) {
      log.error({ err }, 'SQS receive 오류, 5초 후 재시도');
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

poll();
