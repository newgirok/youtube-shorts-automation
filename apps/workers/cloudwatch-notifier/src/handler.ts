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

interface CloudWatchDimension {
  name?: string;
  value?: string;
  Name?: string;
  Value?: string;
}

interface CloudWatchAlarm {
  AlarmName: string;
  AlarmDescription: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string;
  Trigger: {
    MetricName?: string;
    Namespace: string;
    Period: number;
    Statistic: string;
    Threshold: number;
    Dimensions?: CloudWatchDimension[];
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

    // CloudWatch SNS는 name/value(소문자) 또는 Name/Value(대문자) 두 형식 모두 가능
    const fnDim = alarm.Trigger.Dimensions?.find((d) => (d.name ?? d.Name) === 'FunctionName');
    const functionNameFromDimension = fnDim?.value ?? fnDim?.Value;
    // Dimensions 없을 때 AlarmName(예: prod-script-error-rate)에서 역산
    const workerNameFromAlarm = alarm.AlarmName.replace(/^prod-/, '').replace(/-error-rate$/, '');
    const functionName = functionNameFromDimension ?? `shorts-${workerNameFromAlarm}-prod-handler`;
    const workerName = functionName.replace('shorts-', '').replace('-prod-handler', '');
    const metricName = alarm.Trigger.MetricName ?? 'Errors';
    const time = new Date(alarm.StateChangeTime)
      .toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
      .replace('T', ' ');

    const infoText = [
      `⚙️  *Function*    \`${functionName}\``,
      `🏷️  *Worker*    ${workerName}`,
      `⏰  *Time*    ${time}`,
      `📊  *Metric*    ${metricName} > ${alarm.Trigger.Threshold}%`,
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
            { type: 'section', text: { type: 'mrkdwn', text: infoText } },
            { type: 'divider' },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `\`\`\`${alarm.NewStateReason}\`\`\`` },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Period: ${alarm.Trigger.Period}s  ·  Namespace: ${alarm.Trigger.Namespace}`,
                },
              ],
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `\`${logCommand}\`` }] },
          ],
        },
      ],
    };

    await postSlack(SLACK_WEBHOOK_URL, payload);
  }
};

export const handler = Sentry.wrapHandler(_handler);
