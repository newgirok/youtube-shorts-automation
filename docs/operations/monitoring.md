# 모니터링 가이드

## 모니터링 채널 구성

| 채널 | 도구 | 대상 |
|------|------|------|
| **Slack** | dlq-notifier Lambda | DLQ 적재 — jobId·channelId 포함 |
| **Slack** | Sentry | Lambda 런타임 예외 — 스택 트레이스 |
| **Slack** | CloudWatch → SNS → cloudwatch-notifier Lambda | Lambda 에러율 > 5% (타임아웃 등 Sentry 사각지대) |
| **이메일** | AWS Budget Alert | 월 비용 $10 초과 |

---

## CloudWatch (Phase 4+)

### 로그 그룹

| 서비스 | 로그 그룹 |
|--------|-----------|
| API (Lambda) | `/aws/lambda/shorts-api-prod-api` |
| script-worker (Lambda) | `/aws/lambda/shorts-script-worker-prod-handler` |
| tts-worker (Lambda) | `/aws/lambda/shorts-tts-worker-prod-handler` |
| subtitle-worker (Lambda) | `/aws/lambda/shorts-subtitle-worker-prod-handler` |
| render-worker (Lambda) | `/aws/lambda/shorts-render-worker-prod-handler` |
| upload-worker (Lambda) | `/aws/lambda/shorts-upload-worker-prod-handler` |
| scheduler-worker (Lambda) | `/aws/lambda/shorts-scheduler-worker-prod-handler` |
| dlq-notifier (Lambda) | `/aws/lambda/shorts-dlq-notifier-prod-handler` |

### 핵심 메트릭

- **Lambda**: `Errors`, `Duration`, `Throttles`
- **SQS**: `NumberOfMessagesSent`, `ApproximateNumberOfMessagesNotVisible`, `NumberOfMessagesDeleted`

### 알람 설정 (운영 중)

**Lambda 에러율 > 5% 알람** — Worker 8개 개별 적용

```
prod-{worker}-error-rate  →  5분 윈도우 에러율 > 5%  →  SNS(prod-shorts-alerts) → cloudwatch-notifier Lambda → Slack #ops-alerts
```

- 대상 Worker: script / tts / subtitle / render / upload / scheduler / dlq-notifier / cloudwatch-notifier
- Metric Math: `IF(invocations > 0, errors / invocations * 100, 0)`
- `treat_missing_data = notBreaching` (호출 없을 때 알람 억제)

> **DLQ 깊이 알람 없음**: DLQ 적재 알림은 dlq-notifier Lambda → Slack이 담당하므로 CloudWatch DLQ 알람은 운영하지 않는다.

**SNS 알림 대상**: `prod-shorts-alerts` 토픽 → `cloudwatch-notifier` Lambda → Slack `#ops-alerts`

---

## SQS DLQ 알림 (Phase 5)

### dlq-notifier Lambda 동작

5개 DLQ 모두에 Event Source Mapping으로 연결된 단일 Lambda 함수.

```
[script-dlq]      ─┐
[tts-dlq]         ─┤
[subtitle-dlq]    ─┼─→ dlq-notifier Lambda → Slack Webhook
[render-dlq]      ─┤
[upload-dlq]      ─┘
```

### Slack Block Kit 알림 형식

```
🔴 *[DLQ] render-queue*
FAILED | shorts-render-worker-prod-handler
──────────────────────────────────
🖥️ Function  `shorts-render-worker-prod-handler`  📦 Queue  render-queue
⏰ Time      2026-08-01 22:40:33                   🔧 Type   DLQ
──────────────────────────────────
*Error Message*
```jobId: job_abc123\nchannelId: ch_xyz\n수신횟수: 3```
*Raw Body* (생략됨)
`aws logs tail /aws/lambda/shorts-render-worker-prod-handler --follow --since 1h`
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
curl -X POST https://wc2kcpa4k3.execute-api.ap-northeast-2.amazonaws.com/jobs/<job_id>/retry \
  -H "Authorization: Bearer <API_INTERNAL_SECRET>"
```

API가 `status = PENDING`으로 초기화하고 script-queue에 메시지를 재발행한다.

---

## Sentry → Slack 연동

Lambda 런타임 예외를 코드 레벨(스택 트레이스, 파일·라인 정보)로 추적하고 Slack으로 즉시 알린다.

### Slack 연동 현황

`newgirok.slack.com` 워크스페이스 연동 완료. Alert Rule 설정:

| 항목 | 설정값 |
|---|---|
| Rule 이름 | Send a notification for high priority issues |
| 트리거 | Sentry가 새 이슈를 high priority로 분류할 때 |
| 필터 | youtube-shorts-automation 프로젝트 전체 |
| 액션 | `#ops-alerts` 채널 Slack 메시지 전송 |
| Throttling | Get notified on every trigger |

### 구현 위치

`packages/shared/src/sentry.ts`에서 `initSentry`와 `Sentry` 인스턴스를 공통 제공한다.

```typescript
// packages/shared/src/sentry.ts
import * as Sentry from '@sentry/aws-serverless';

export function initSentry(): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

export { Sentry };
```

### Worker 적용 패턴

각 Worker handler 최상단에서 `initSentry()`를 호출하면 Lambda 실행 중 캐치되지 않은 예외가 자동으로 Sentry로 전송된다.

```typescript
// apps/workers/*/src/handler.ts
import { ..., initSentry, Sentry } from '@shorts/shared';
initSentry();

// 핸들러 내부 — 예외를 직접 캡처해야 할 경우
Sentry.captureException(error);
```

### API Lambda 적용

API Lambda(`apps/api/src/lambda.ts`)는 `Sentry.wrapHandler`로 핸들러를 감싸 예외를 자동 캡처한다.

```typescript
export const handler = Sentry.wrapHandler(_handler);
```

### DSN 설정

`SENTRY_DSN` 환경변수는 SSM Parameter Store(`shorts.prod.SENTRY_DSN`)에서 주입된다.  
Sentry 대시보드: `https://newgirok.sentry.io/organizations/newgirok/projects/youtube-shorts-automation/`

---

## AWS Budget Alert

월 운영 비용 초과를 이메일로 사전 경고한다.

- **월 예산**: $10
- **80% 도달 시** ($8): 경고 알림 (SNS → 이메일)
- **100% 도달 시** ($10): 초과 알림 (SNS → 이메일)

```hcl
resource "aws_budgets_budget" "monthly" {
  name         = "shorts-monthly-budget"
  budget_type  = "COST"
  limit_amount = "10"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["newgirok@gmail.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["newgirok@gmail.com"]
  }
}
```

---

## 관련 문서

- [배포 절차](./runbook/deploy.md)
- [로드맵 (Phase별 계획)](../roadmap.md)
