import { request } from 'node:https';
import type { SQSHandler } from 'aws-lambda';

const WEBHOOK_URL = process.env.WEBHOOK_URL!;

const QUEUE_LABELS: Record<string, string> = {
  'prod-script-queue-dlq': 'Script (Gemini)',
  'prod-tts-queue-dlq': 'TTS (Edge-TTS)',
  'prod-subtitle-queue-dlq': 'Subtitle',
  'prod-render-queue-dlq': 'Render (FFmpeg)',
  'prod-upload-queue-dlq': 'Upload (YouTube)',
};

function postWebhook(url: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isDiscord = url.includes('discord.com');
    const body = JSON.stringify(isDiscord ? { content: text } : { text });
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

export const handler: SQSHandler = async (event) => {
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
      // 파싱 실패 시 원본 body 유지
    }

    const text = [
      `🚨 *DLQ 알림 — ${label}*`,
      `• 큐: \`${queueName}\``,
      `• Job ID: \`${jobId}\``,
      `• 채널 ID: \`${channelId}\``,
      `• 수신 횟수: ${receiveCount}회 (3회 초과 → DLQ 이동)`,
      `• 메시지:\n\`\`\`${rawBody}\`\`\``,
    ].join('\n');

    await postWebhook(WEBHOOK_URL, text);
  }
};
