# 모니터링 가이드

## 모니터링 전략 개요

| Phase | 구현 항목 | 상태 |
|-------|-----------|------|
| Phase 1~2 | 로컬 Docker Compose 로그, `docker compose logs -f` | ✅ 완료 |
| Phase 3 | Supabase 대시보드 (DB 상태 확인) | ✅ 완료 |
| Phase 4 | CloudWatch 로그 그룹 (각 Worker Lambda) | ✅ 완료 |
| Phase 5-3 | Lambda 에러율 알람 + DLQ 깊이 알람 → SNS 이메일 | ✅ 완료 |
| Phase 5-2 | SQS DLQ 알림 (dlq-notifier Lambda, Slack Webhook) | ✅ 완료 |
| Phase 8 | Sentry, AWS Budget Alert, CI/CD sourcemaps 업로드 | 미구현 |

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

**Lambda 에러율 > 5% 알람** — Worker 7개 개별 적용

```
prod-{worker}-error-rate  →  5분 윈도우 에러율 > 5%  →  SNS → 이메일
```

- 대상 Worker: script / tts / subtitle / render / upload / scheduler / dlq-notifier
- Metric Math: `IF(invocations > 0, errors / invocations * 100, 0)`
- `treat_missing_data = notBreaching` (호출 없을 때 알람 억제)

**DLQ 메시지 깊이 > 0 알람** — DLQ 5개 개별 적용

```
prod-{queue}-dlq-depth  →  ApproximateNumberOfMessagesVisible > 0  →  SNS → 이메일
```

**SNS 알림 대상**: `prod-shorts-alerts` 토픽 → `newgirok@gmail.com`

---

## SQS DLQ 알림 (Phase 5)

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

## Sentry (Phase 8)

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

GitHub Actions에서 빌드 후 Sentry CLI로 sourcemaps 업로드 (Phase 7 `deploy-workers.yml` 참고).

---

## AWS Budget Alert (Phase 8)

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
