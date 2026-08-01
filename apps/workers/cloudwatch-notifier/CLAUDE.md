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
interface CloudWatchAlarm {
  AlarmName: string;          // 예: "prod-script-error-rate"
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;     // 임계값 초과 상세 설명
  StateChangeTime: string;    // ISO 8601
  Trigger: {
    MetricName: string;       // "Errors"
    Threshold: number;        // 5
    Period: number;           // 300
    Namespace: string;        // "AWS/Lambda"
    Dimensions: Array<{ name: string; value: string }>;
  };
}
```

## Slack 알림 형식 (Block Kit)

ALARM: `#e01e5a` (빨간) / OK 복구: `#2eb886` (초록) 왼쪽 보더.

```
🔴 *[PRD] {functionName} • {workerName}*
ALARM | {alarmName}
──────────────────────────────────────────
🖥️ Server    `{functionName}`    📦 Container  {workerName}
⏰ Time      {KST 시각}          🔧 Type       Errors
──────────────────────────────────────────
*Error Message*
```{NewStateReason}```
*Alarm Details*
```Metric / Threshold / Period / Namespace```
`aws logs tail /aws/lambda/{functionName} --follow --since 1h`
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
