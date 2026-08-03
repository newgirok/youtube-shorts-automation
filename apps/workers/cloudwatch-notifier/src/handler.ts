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

const WORKER_LABELS: Record<string, string> = {
  'script': 'Script (Gemini)',
  'tts': 'TTS (msedge-tts)',
  'subtitle': 'Subtitle',
  'render': 'Render (FFmpeg)',
  'upload': 'Upload (YouTube)',
  'scheduler': 'Scheduler',
  'dlq-notifier': 'DLQ Notifier',
  'cloudwatch-notifier': 'CloudWatch Notifier',
};

// Terraform lambda_workers 맵과 동기화 — 폴백 시 정확한 함수명 보장
const FUNCTION_NAMES: Record<string, string> = {
  'script': 'shorts-script-worker-prod-handler',
  'tts': 'shorts-tts-worker-prod-handler',
  'subtitle': 'shorts-subtitle-worker-prod-handler',
  'render': 'shorts-render-worker-prod-handler',
  'upload': 'shorts-upload-worker-prod-handler',
  'scheduler': 'shorts-scheduler-worker-prod-handler',
  'dlq-notifier': 'shorts-dlq-notifier-prod-handler',
  'cloudwatch-notifier': 'shorts-cloudwatch-notifier-prod-handler',
};

interface CloudWatchDimension {
  name?: string;
  value?: string;
  Name?: string;
  Value?: string;
}

interface CloudWatchMetricItem {
  Id: string;
  Expression?: string;
  MetricStat?: {
    Metric: {
      Namespace: string;
      MetricName: string;
      Dimensions?: CloudWatchDimension[];
    };
  };
}

interface CloudWatchAlarm {
  AlarmName: string;
  AlarmDescription: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string;
  Trigger: {
    MetricName?: string;
    Namespace?: string;
    Period: number;
    Statistic: string;
    Threshold: number;
    Dimensions?: CloudWatchDimension[];
    Metrics?: CloudWatchMetricItem[];
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
    let functionNameFromDimension = fnDim?.value ?? fnDim?.Value;
    // 수식 알람(metric_query)은 Dimensions가 최상위에 없고 Metrics[] 안에 nested 됨
    if (!functionNameFromDimension && alarm.Trigger.Metrics) {
      for (const m of alarm.Trigger.Metrics) {
        const dim = m.MetricStat?.Metric.Dimensions?.find((d) => (d.name ?? d.Name) === 'FunctionName');
        if (dim) {
          functionNameFromDimension = dim.value ?? dim.Value;
          break;
        }
      }
    }
    // Dimensions 없을 때 AlarmName(예: prod-script-error-rate)에서 역산
    // Terraform 키는 언더스코어(dlq_notifier)지만 알람명/레이블은 대시(dlq-notifier) 기준
    const workerKey = alarm.AlarmName
      .replace(/^prod-/, '')
      .replace(/-error-rate$/, '')
      .replace(/_/g, '-');
    const functionName = functionNameFromDimension ?? FUNCTION_NAMES[workerKey] ?? `shorts-${workerKey}-prod-handler`;
    // 수식 알람은 Namespace가 최상위에 없으므로 Metrics에서 추출
    const namespace =
      alarm.Trigger.Namespace ??
      alarm.Trigger.Metrics?.find((m) => m.MetricStat)?.MetricStat?.Metric.Namespace ??
      'AWS/Lambda';
    const workerLabel = WORKER_LABELS[workerKey] ?? workerKey;
    const metricName = alarm.Trigger.MetricName ?? 'Errors';
    const time = new Date(alarm.StateChangeTime)
      .toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
      .replace('T', ' ');

    const title = isAlarm
      ? `🔴 *[ALARM] ${workerLabel} — 에러율 초과*`
      : `🟢 *[OK] ${workerLabel} — 에러율 정상*`;
    const subtitle = `${functionName} | ${alarm.AlarmName}`;

    const infoText = [
      `⚙️  *Function*    \`${functionName}\``,
      `🏷️  *Worker*    ${workerLabel}`,
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
              text: { type: 'mrkdwn', text: `${title}\n${subtitle}` },
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
                  text: `Period: ${alarm.Trigger.Period}s  ·  Namespace: ${namespace}`,
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
