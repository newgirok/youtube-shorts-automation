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

const QUEUE_TO_FUNCTION: Record<string, string> = {
  'prod-script-queue-dlq': 'shorts-script-worker-prod-handler',
  'prod-tts-queue-dlq': 'shorts-tts-worker-prod-handler',
  'prod-subtitle-queue-dlq': 'shorts-subtitle-worker-prod-handler',
  'prod-render-queue-dlq': 'shorts-render-worker-prod-handler',
  'prod-upload-queue-dlq': 'shorts-upload-worker-prod-handler',
};

function postSlack(url: string, payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
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
    const functionName = QUEUE_TO_FUNCTION[queueName] ?? queueName;
    const receiveCount = record.attributes.ApproximateReceiveCount;
    const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

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

    const errorMessage = [
      `jobId: ${jobId}`,
      `channelId: ${channelId}`,
      `수신 횟수: ${receiveCount}회 (3회 초과 → DLQ 이동)`,
    ].join('\n');

    const logCommand = `aws logs tail /aws/lambda/${functionName} --follow --since 1h`;

    const payload = {
      attachments: [
        {
          color: '#e01e5a',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🔴 *[PRD] ${functionName} • ${label}*\nDLQ 적재 | \`${queueName}\``,
              },
            },
            { type: 'divider' },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `🖥️ *Server*\n\`${functionName}\`` },
                { type: 'mrkdwn', text: `📦 *Container*\n${label}` },
                { type: 'mrkdwn', text: `⏰ *Time*\n${time}` },
                { type: 'mrkdwn', text: `🔧 *Type*\n\`${queueName}\`` },
              ],
            },
            { type: 'divider' },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Error Message*\n\`\`\`${errorMessage}\`\`\``,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Message Body*\n\`\`\`${rawBody.slice(0, 2000)}\`\`\``,
              },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `\`${logCommand}\`` }],
            },
          ],
        },
      ],
    };

    await postSlack(SLACK_WEBHOOK_URL, payload);
  }
};

export const handler = Sentry.wrapHandler(_handler);
