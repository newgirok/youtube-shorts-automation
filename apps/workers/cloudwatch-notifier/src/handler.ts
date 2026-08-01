import { request } from 'node:https';
import type { SNSHandler } from 'aws-lambda';
import * as Sentry from '@sentry/aws-serverless';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

interface CloudWatchAlarm {
  AlarmName: string;
  AlarmDescription: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string;
  Trigger: {
    MetricName: string;
    Namespace: string;
    Period: number;
    Statistic: string;
    Threshold: number;
    Dimensions: Array<{ name: string; value: string }>;
  };
}

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

const _handler: SNSHandler = async (event) => {
  for (const record of event.Records) {
    const alarm = JSON.parse(record.Sns.Message) as CloudWatchAlarm;
    const isAlarm = alarm.NewStateValue === 'ALARM';

    const functionName =
      alarm.Trigger.Dimensions.find((d) => d.name === 'FunctionName')?.value ?? '알 수 없음';
    const workerName = functionName.replace('shorts-', '').replace('-prod-handler', '');
    const time = new Date(alarm.StateChangeTime).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
    });

    const alarmDetails = [
      `Metric: ${alarm.Trigger.MetricName}`,
      `Threshold: > ${alarm.Trigger.Threshold}%`,
      `Period: ${alarm.Trigger.Period}s`,
      `Namespace: ${alarm.Trigger.Namespace}`,
    ].join('\n');

    const logCommand = `aws logs tail /aws/lambda/${functionName} --follow --since 1h`;

    const payload = {
      attachments: [
        {
          color: isAlarm ? '#e01e5a' : '#2eb886',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${isAlarm ? '🔴' : '🟢'} *[PRD] ${functionName} • ${workerName}*\n${alarm.NewStateValue} | ${alarm.AlarmName}`,
              },
            },
            { type: 'divider' },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `🖥️ *Server*\n\`${functionName}\`` },
                { type: 'mrkdwn', text: `📦 *Container*\n${workerName}` },
                { type: 'mrkdwn', text: `⏰ *Time*\n${time}` },
                { type: 'mrkdwn', text: `🔧 *Type*\n${alarm.Trigger.MetricName}` },
              ],
            },
            { type: 'divider' },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Error Message*\n\`\`\`${alarm.NewStateReason}\`\`\``,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Alarm Details*\n\`\`\`${alarmDetails}\`\`\``,
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
