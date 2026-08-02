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

```typescript
interface CloudWatchDimension {
  name?: string;   // 소문자 형식
  value?: string;
  Name?: string;   // 대문자 형식 (CloudWatch 알람 유형에 따라 혼용)
  Value?: string;
}

interface CloudWatchAlarm {
  AlarmName: string;          // 예: "prod-script-error-rate"
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;     // 임계값 초과 상세 설명
  StateChangeTime: string;    // ISO 8601
  Trigger: {
    MetricName?: string;      // "Errors" (일부 알람 유형에서 undefined 가능)
    Threshold: number;        // 5
    Period: number;           // 300
    Namespace: string;        // "AWS/Lambda"
    Dimensions?: CloudWatchDimension[]; // 알람 유형에 따라 undefined 가능
  };
}
```

`Dimensions`와 `MetricName`은 CloudWatch 알람 유형에 따라 전달되지 않을 수 있으므로 반드시 옵셔널 처리:

```typescript
// FunctionName: 소문자/대문자 양쪽 체크
const fnDim = alarm.Trigger.Dimensions?.find((d) => (d.name ?? d.Name) === 'FunctionName');
const functionNameFromDimension = fnDim?.value ?? fnDim?.Value;

// Dimensions 없을 때 AlarmName에서 역산 (prod-script-error-rate → shorts-script-prod-handler)
const workerNameFromAlarm = alarm.AlarmName.replace(/^prod-/, '').replace(/-error-rate$/, '');
const functionName = functionNameFromDimension ?? `shorts-${workerNameFromAlarm}-prod-handler`;
```

## Slack 알림 형식 (Block Kit)

ALARM: `#e01e5a` (빨간) / OK 복구: `#2eb886` (초록) 왼쪽 보더.
Time 포맷: `sv-SE` 로케일 → `YYYY-MM-DD HH:MM:SS` (KST).

```
🔴 *[PRD] shorts-script-prod-handler • script*
ALARM | prod-script-error-rate

⚙️  *Function*    `shorts-script-prod-handler`
🏷️  *Worker*    script
⏰  *Time*    2026-08-02 03:06:40
📊  *Metric*    Errors > 5%
──────────────────────────────────────────
```Threshold Crossed: ...```
Period: 300s  ·  Namespace: AWS/Lambda
`aws logs tail /aws/lambda/shorts-script-prod-handler --follow --since 1h`
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
