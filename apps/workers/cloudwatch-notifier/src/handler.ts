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
    Dimensions: Array<{ name: string; value: string }>;
  };
}

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

    const text = [
      `${isAlarm ? '🚨' : '✅'} *Lambda 에러율 알람 — ${alarm.AlarmName}*`,
      `• 상태: \`${alarm.NewStateValue}\``,
      `• Worker: \`${workerName}\``,
      `• 함수: \`${functionName}\``,
      `• 시각: ${time}`,
      `• 원인: ${alarm.NewStateReason}`,
    ].join('\n');

    await postSlack(SLACK_WEBHOOK_URL, text);
  }
};

export const handler = Sentry.wrapHandler(_handler);
