# @shorts/cloudwatch-notifier

CloudWatch Lambda 에러율 알람을 SNS로 수신해 Slack Block Kit 카드로 전송하는 Lambda.

파이프라인: CloudWatch 알람 → SNS(`prod-shorts-alerts`) → cloudwatch-notifier Lambda → Slack Block Kit

## 주요 모듈

- `handler.ts` — SNS 이벤트 핸들러 (CloudWatch 알람 파싱 + Slack 전송)

## 트리거

SNS 구독(`prod-shorts-alerts` 토픽)은 Terraform `main.tf`에서 관리.

```hcl
resource "aws_sns_topic_subscription" "cloudwatch_notifier" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = "arn:aws:lambda:ap-northeast-2:682251233572:function:shorts-cloudwatch-notifier-prod-handler"
}
```

## CloudWatch Alarm SNS 메시지 구조

Terraform의 `aws_cloudwatch_metric_alarm`은 `metric_query` (수식 기반) 타입으로 구성되어 있다.
이 경우 SNS 페이로드의 `Trigger`에 최상위 `Namespace` · `Dimensions`가 없고, `Metrics[]` 배열 내부에 개별 지표 정보가 nested 된다.

```typescript
interface CloudWatchDimension {
  name?: string;   // 소문자 형식
  value?: string;
  Name?: string;   // 대문자 형식 (CloudWatch 알람 유형에 따라 혼용)
  Value?: string;
}

interface CloudWatchMetricItem {
  Id: string;
  Expression?: string;          // 수식 알람의 계산식
  MetricStat?: {
    Metric: {
      Namespace: string;
      MetricName: string;
      Dimensions?: CloudWatchDimension[];
    };
  };
}

interface CloudWatchAlarm {
  AlarmName: string;            // 예: "prod-upload-error-rate"
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string;      // ISO 8601
  Trigger: {
    MetricName?: string;        // 수식 알람에서 undefined
    Namespace?: string;         // 수식 알람에서 undefined
    Period: number;             // 300
    Statistic: string;
    Threshold: number;          // 5
    Dimensions?: CloudWatchDimension[];   // 수식 알람에서 undefined
    Metrics?: CloudWatchMetricItem[];     // 수식 알람에서 메트릭 정보 포함
  };
}
```

## FunctionName / Namespace 추출 패턴

수식 알람은 `Trigger.Dimensions`가 없으므로 `Trigger.Metrics[]`에서 FunctionName을 추출해야 한다.
AlarmName 역산 시 Terraform 맵 키의 언더스코어(`dlq_notifier`)를 대시로 정규화한 뒤 `FUNCTION_NAMES` 맵에서 조회한다.

```typescript
// 1단계: 최상위 Dimensions에서 FunctionName 추출 (단순 알람)
const fnDim = alarm.Trigger.Dimensions?.find((d) => (d.name ?? d.Name) === 'FunctionName');
let functionNameFromDimension = fnDim?.value ?? fnDim?.Value;

// 2단계: 수식 알람 — Metrics[] 내부에서 추출
if (!functionNameFromDimension && alarm.Trigger.Metrics) {
  for (const m of alarm.Trigger.Metrics) {
    const dim = m.MetricStat?.Metric.Dimensions?.find((d) => (d.name ?? d.Name) === 'FunctionName');
    if (dim) { functionNameFromDimension = dim.value ?? dim.Value; break; }
  }
}

// 3단계: AlarmName 역산 폴백 (prod-dlq_notifier-error-rate → 'dlq-notifier')
const workerKey = alarm.AlarmName
  .replace(/^prod-/, '')
  .replace(/-error-rate$/, '')
  .replace(/_/g, '-');              // Terraform 언더스코어 키 → 대시 정규화
const functionName = functionNameFromDimension ?? FUNCTION_NAMES[workerKey] ?? `shorts-${workerKey}-prod-handler`;

// Namespace 추출 (수식 알람은 최상위에 없으므로 Metrics에서 추출)
const namespace =
  alarm.Trigger.Namespace ??
  alarm.Trigger.Metrics?.find((m) => m.MetricStat)?.MetricStat?.Metric.Namespace ??
  'AWS/Lambda';
```

`FUNCTION_NAMES` 맵은 Terraform `locals.lambda_workers`와 1:1 동기화 유지:

```typescript
const FUNCTION_NAMES: Record<string, string> = {
  'script':               'shorts-script-worker-prod-handler',
  'tts':                  'shorts-tts-worker-prod-handler',
  'subtitle':             'shorts-subtitle-worker-prod-handler',
  'render':               'shorts-render-worker-prod-handler',
  'upload':               'shorts-upload-worker-prod-handler',
  'scheduler':            'shorts-scheduler-worker-prod-handler',
  'dlq-notifier':         'shorts-dlq-notifier-prod-handler',
  'cloudwatch-notifier':  'shorts-cloudwatch-notifier-prod-handler',
};
```

> Terraform에 새 Worker를 추가할 때 반드시 `FUNCTION_NAMES`와 `WORKER_LABELS`도 함께 업데이트한다.

## Slack 알림 형식 (Block Kit)

ALARM: `#e01e5a` (빨간) / OK 복구: `#2eb886` (초록) 왼쪽 보더.
Time 포맷: `sv-SE` 로케일 → `YYYY-MM-DD HH:MM:SS` (KST).

```
🔴 *[ALARM] Upload (YouTube) — 에러율 초과*
shorts-upload-worker-prod-handler | prod-upload-error-rate

⚙️  *Function*    `shorts-upload-worker-prod-handler`
🏷️  *Worker*    Upload (YouTube)
⏰  *Time*    2026-08-03 15:45:33
📊  *Metric*    Errors > 5%
──────────────────────────────────────────
```Threshold Crossed: no datapoints were received for 1 period...```
Period: 300s  ·  Namespace: AWS/Lambda
`aws logs tail /aws/lambda/shorts-upload-worker-prod-handler --follow --since 1h`
```

## 환경변수

| 변수 | SSM 키 | 설명 |
|---|---|---|
| `SLACK_WEBHOOK_URL` | `shorts.prod.SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |
| `SENTRY_DSN` | `shorts.prod.SENTRY_DSN` | Sentry DSN |

## 배포 순서 주의

Lambda가 먼저 존재해야 Terraform이 SNS 구독을 생성할 수 있음:
1. `sls deploy --stage prod` (cloudwatch-notifier Lambda 배포)
2. `terraform apply` (SNS → Lambda 구독 생성)
