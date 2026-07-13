import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { createLogger } from '@shorts/shared';
import { parseEnv } from './env.js';
import { processMessage } from './processor.js';

// Docker Compose 로컬 환경용 Long Polling runner
const env = parseEnv();
const log = createLogger({});
const sqs = new SQSClient({ region: env.AWS_REGION });

async function poll(): Promise<void> {
  log.info('render-worker SQS polling 시작');

  while (true) {
    try {
      const result = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: env.SQS_RENDER_QUEUE_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        })
      );

      const messages = result.Messages ?? [];
      for (const msg of messages) {
        if (!msg.Body || !msg.ReceiptHandle) continue;
        try {
          await processMessage(msg.Body, sqs, env);
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: env.SQS_RENDER_QUEUE_URL,
              ReceiptHandle: msg.ReceiptHandle,
            })
          );
        } catch (err) {
          log.error({ err }, '메시지 처리 실패 (DLQ로 이동 예정)');
        }
      }
    } catch (err) {
      log.error({ err }, 'SQS receive 오류, 5초 후 재시도');
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

poll().catch((err) => {
  log.error({ err }, 'render-worker 치명적 오류');
  process.exit(1);
});
