# 모니터링 가이드

## 모니터링 전략 개요

| Phase | 구현 항목 |
|-------|-----------|
| Phase 1~2 (완료) | 로컬 Docker Compose 로그, `docker compose logs -f` |
| Phase 3 (진행 예정) | CloudWatch 로그 수집, Lambda/Fargate 에러율 알람, Supabase 대시보드 |
| Phase 4 | SQS DLQ 알림 (dlq-notifier Lambda, Slack/Discord Webhook) |
| Phase 7 | Sentry, AWS Budget Alert, CI/CD sourcemaps 업로드 |

---

## CloudWatch (Phase 3+)

### 로그 그룹

| 서비스 | 로그 그룹 |
|--------|-----------|
| API (ECS) | `/ecs/api` |
| subtitle-worker (Fargate) | `/ecs/subtitle-worker` |
| render-worker (Fargate) | `/ecs/render-worker` |
| script-worker (Lambda) | `/aws/lambda/script-worker-prod` |
| tts-worker (Lambda) | `/aws/lambda/tts-worker-prod` |
| upload-worker (Lambda) | `/aws/lambda/upload-worker-prod` |

### 핵심 메트릭

- **Lambda**: `Errors`, `Duration`, `Throttles`
- **Fargate**: `EssentialContainerExited` (태스크 강제 종료)
- **SQS**: `NumberOfMessagesSent`, `ApproximateNumberOfMessagesNotVisible`, `NumberOfMessagesDeleted`
- **API (ECS)**: 5xx 응답률

### 알람 설정

**Lambda/Fargate 에러율 5% 초과 알람**

```hcl
# Terraform 예시
resource "aws_cloudwatch_metric_alarm" "lambda_error_rate" {
  alarm_name          = "lambda-error-rate-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5

  metric_query {
    id          = "error_rate"
    expression  = "errors / invocations * 100"
    return_data = true
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}
```

**Fargate 태스크 실패 알람**

```hcl
resource "aws_cloudwatch_metric_alarm" "fargate_task_stopped" {
  alarm_name          = "fargate-essential-container-exited"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  metric_name         = "EssentialContainerExited"
  namespace           = "ECS/ContainerInsights"
  statistic           = "Sum"
  period              = 60
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
```

**SNS 알림 대상**: 팀 이메일 (AWS SNS → Email 구독)

---

## SQS DLQ 알림 (Phase 4)

### dlq-notifier Lambda 동작

5개 DLQ 모두에 Event Source Mapping으로 연결된 단일 Lambda 함수.

```
[script-dlq]      ─┐
[tts-dlq]         ─┤
[subtitle-dlq]    ─┼─→ dlq-notifier Lambda → Slack/Discord Webhook
[render-dlq]      ─┤
[upload-dlq]      ─┘
```

### Webhook 알림 메시지 형식

```json
{
  "channel": "#ops-alerts",
  "text": "[DLQ 알림] render-queue\njobId: job_abc123\nchannelId: ch_xyz\n실패 단계: render\n오류: FFmpeg exited with code 1"
}
```

### DLQ 설정 표준

| Worker | 큐 | Visibility Timeout | DLQ Retention |
|--------|----|--------------------|---------------|
| script-worker | script-queue | 120s | 14일 |
| tts-worker | tts-queue | 240s | 14일 |
| subtitle-worker | subtitle-queue | 600s | 14일 |
| render-worker | render-queue | 1,200s | 14일 |
| upload-worker | upload-queue | 600s | 14일 |

- Max Receive Count: 3회 초과 시 DLQ로 이동
- Message Retention: 4일 (본 큐), 14일 (DLQ)

---

## Job 상태 모니터링

### 대시보드 폴링

웹 대시보드는 Job 상태를 적응형 간격으로 폴링한다.

| 페이지 | 진행 중 Job 있을 때 | 모두 완료·실패일 때 |
|--------|-------------------|------------------|
| 홈 (`/`) | 2초 | 30초 |
| Job 상세 (`/dashboard/[id]`) | 2초 | 30초 |

| 상태 | 의미 |
|------|------|
| `PENDING` | SQS 메시지 전송 완료, Worker 미처리 |
| `SCRIPT_PROCESSING` | script-worker 처리 중 |
| `TTS_PROCESSING` | tts-worker 처리 중 |
| `SUBTITLE_PROCESSING` | subtitle-worker 처리 중 |
| `RENDER_PROCESSING` | render-worker 처리 중 |
| `UPLOAD_PROCESSING` | upload-worker 처리 중 |
| `COMPLETED` | 모든 단계 완료 |
| `FAILED` | 오류 발생, `failReason` 컬럼 확인 필요 |

### 운영 검증 SQL 쿼리

**최근 7일 실패 Job 목록**

```sql
SELECT
  id,
  channel_id,
  fail_reason,
  updated_at
FROM jobs
WHERE status = 'FAILED'
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
```

**최근 30일 Worker별 실패율**

```sql
SELECT
  fail_reason,
  COUNT(*) AS cnt,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS pct
FROM jobs
WHERE status = 'FAILED'
  AND updated_at > NOW() - INTERVAL '30 days'
GROUP BY fail_reason
ORDER BY cnt DESC;
```

**FAILED 상태 재시도**

대시보드 `/dashboard/[id]`에서 재시도 버튼을 클릭하거나, API를 직접 호출한다:

```bash
curl -X POST http://localhost:3000/jobs/<job_id>/retry \
  -H "x-internal-secret: <API_INTERNAL_SECRET>"
```

API가 `status = PENDING`으로 초기화하고 script-queue에 메시지를 재발행한다.

---

## Sentry (Phase 7)

### 초기화

```typescript
// apps/workers/shared/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
  });
}

export function setSentryContext(jobId: string, channelId: string) {
  Sentry.setContext('job', { jobId, channelId });
}
```

### Worker에서 사용

```typescript
import { initSentry, setSentryContext } from '../shared/sentry';
import * as Sentry from '@sentry/node';

initSentry();

// SQS 핸들러 내
try {
  setSentryContext(jobId, channelId);
  await processJob(jobId);
} catch (error) {
  Sentry.captureException(error);
  throw error;
}
```

### CI/CD sourcemaps 업로드

GitHub Actions에서 빌드 후 Sentry CLI로 sourcemaps 업로드 (Phase 7 `_deploy-worker.yml` 참고).

---

## AWS Budget Alert (Phase 7)

- **월 예산**: $20
- **80% 도달 시**: 경고 알림 (SNS → 이메일)
- **100% 도달 시**: 초과 알림 (SNS → 이메일)

```hcl
resource "aws_budgets_budget" "monthly" {
  name         = "shorts-monthly-budget"
  budget_type  = "COST"
  limit_amount = "20"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator = "GREATER_THAN"
    threshold           = 80
    threshold_type      = "PERCENTAGE"
    notification_type   = "ACTUAL"
    subscriber_email_addresses = ["tlswlsdnehd@gmail.com"]
  }

  notification {
    comparison_operator = "GREATER_THAN"
    threshold           = 100
    threshold_type      = "PERCENTAGE"
    notification_type   = "FORECASTED"
    subscriber_email_addresses = ["tlswlsdnehd@gmail.com"]
  }
}
```

---

## 관련 문서

- [배포 절차](./runbook/deploy.md)
- [로드맵 (Phase별 계획)](../roadmap.md)
