import { request } from 'node:https';
import type { SQSHandler } from 'aws-lambda';
import * as Sentry from '@sentry/aws-serverless';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

const QUEUE_LABELS: Record<string, string> = {
  'prod-script-queue-dlq': 'Script (Gemini)',
  'prod-tts-queue-dlq': 'TTS (msedge-tts)',
  'prod-subtitle-queue-dlq': 'Subtitle',
  'prod-render-queue-dlq': 'Render (FFmpeg)',
  'prod-upload-queue-dlq': 'Upload (YouTube)',
};

function postSlack(url: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const parsed = new URL(url);
    const req = request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const _handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const queueName = record.eventSourceARN.split(':').pop() ?? record.eventSourceARN;
    const label = QUEUE_LABELS[queueName] ?? queueName;
    const receiveCount = record.attributes.ApproximateReceiveCount;

    let jobId = '알 수 없음';
    let channelId = '알 수 없음';
    let rawBody = record.body;

    try {
      const parsed = JSON.parse(record.body) as Record<string, unknown>;
      jobId = String(parsed['jobId'] ?? '알 수 없음');
      channelId = String(parsed['channelId'] ?? '알 수 없음');
      rawBody = JSON.stringify(parsed, null, 2);
    } catch {
      jobId = record.body.match(/jobId[:"' ]*([^,}\s'"]+)/)?.[1] ?? '알 수 없음';
      channelId = record.body.match(/channelId[:"' ]*([^,}\s'"]+)/)?.[1] ?? '알 수 없음';
    }

    const text = [
      `🚨 *DLQ 알림 — ${label}*`,
      `• 큐: \`${queueName}\``,
      `• Job ID: \`${jobId}\``,
      `• 채널 ID: \`${channelId}\``,
      `• 수신 횟수: ${receiveCount}회 (3회 초과 → DLQ 이동)`,
      `• 메시지:\n\`\`\`${rawBody}\`\`\``,
    ].join('\n');

    await postSlack(SLACK_WEBHOOK_URL, text);
  }
};

export const handler = Sentry.wrapHandler(_handler);
