# 용어 사전

이 문서는 AI YouTube Shorts 자동화 플랫폼에서 사용하는 도메인 용어를 정의합니다. 신규 팀원이 코드와 문서를 읽을 때 참고하세요.

---

## Job

단일 YouTube Shorts 영상 한 개를 생성·업로드하는 작업 단위입니다. 토픽 하나가 입력되면 Job이 생성되고, 5단계 파이프라인을 거쳐 YouTube에 업로드됩니다.

- DB 모델: `Job` ([데이터 모델 참고](../architecture/data-model.md#job-모델-필드-설명))
- 상태: `PENDING` → `SCRIPT_PROCESSING` → ... → `COMPLETED` / `FAILED`
- 식별자: CUID 형식의 `id` (예: `clxxxxxx`)

---

## Channel

플랫폼에 연결된 YouTube 채널 엔티티입니다. 하나의 Channel은 여러 Job을 가집니다. 채널별로 독립적인 업로드 스케줄, 토픽 큐, 쿠팡 파트너스 링크를 설정할 수 있습니다.

- DB 모델: `Channel` ([데이터 모델 참고](../architecture/data-model.md#channel-모델-필드-설명))
- `Channel.youtubeId`: YouTube 채널 고유 ID (예: `UCxxxxxx`)
- `Channel.isActive`: `false`이면 자동 업로드 스케줄에서 제외

---

## Pipeline

토픽 입력부터 YouTube 업로드까지의 5단계 자동화 흐름입니다.

```
script-worker → tts-worker → subtitle-worker → render-worker → upload-worker
```

각 단계는 SQS 메시지로 연결되며, 모두 AWS Lambda에서 실행됩니다 (render-worker는 Lambda Container Image). 상세 흐름은 [파이프라인 흐름](../architecture/pipeline-flow.md)을 참고하세요.

---

## DLQ (Dead Letter Queue)

SQS 메시지가 `Max Receive Count(3회)` 이상 실패했을 때 이동하는 별도의 SQS 큐입니다. DLQ에 메시지가 쌓이면 CloudWatch 알람이 발화되고 dlq-notifier Lambda가 Slack Webhook으로 알림을 전송합니다.

- DLQ 메시지 보관 기간: 14일
- 역할: 수동 디버깅, 재처리 (메시지를 원본 큐로 이동해 재처리 가능)
- 관련 ADR: [ADR 003](../adr/003-sqs-standard-queue.md)

---

## JobStatus

`Job.status` 필드의 가능한 값 목록입니다. 파이프라인의 현재 단계를 나타냅니다.

| 값 | 설명 |
|---|---|
| `PENDING` | Job 생성 직후, 아직 처리 시작 전 |
| `SCRIPT_PROCESSING` | script-worker가 Gemini API로 스크립트 생성 중 |
| `TTS_PROCESSING` | tts-worker가 Edge-TTS로 음성 합성 중 |
| `SUBTITLE_PROCESSING` | subtitle-worker가 script.json 글자 수 비례로 SRT 자막 생성 중 |
| `RENDER_PROCESSING` | render-worker가 FFmpeg으로 영상 합성 중 |
| `UPLOAD_PROCESSING` | upload-worker가 YouTube API로 업로드 중 |
| `COMPLETED` | 파이프라인 전 단계 완료, YouTube 업로드 성공 |
| `FAILED` | 처리 중 오류 발생. `Job.failReason` 참고 |

---

## Hook

쇼츠 스크립트의 **첫 1~2문장**입니다. 시청자가 첫 3초 안에 이탈하지 않도록 강렬한 질문이나 놀라운 사실로 시작하는 문구입니다.

- script.json의 `hook` 필드에 저장
- Gemini API 프롬프트에서 품질 기준으로 명시
- 예시: `"당신이 지금 이 ETF를 모른다면, 10년 후 후회할 수도 있어요."`

---

## Niche

채널의 콘텐츠 주제 카테고리입니다. `Channel.niche` 필드에 저장되며, Gemini API 스크립트 생성 시 프롬프트에 포함되어 채널 성격에 맞는 내용을 생성하는 데 사용됩니다.

- 예시: `"재테크"`, `"IT 뉴스"`, `"건강/다이어트"`, `"요리"`
- 채널 연결 시 설정, 이후 변경 가능

---

## privacyStatus

`Job.privacyStatus` 필드에 저장되는 YouTube 영상 공개 상태입니다. upload-worker가 YouTube Data API로 영상을 업로드할 때 설정되며, `COMPLETED` 상태의 Job에서만 의미 있는 값을 가집니다.

| 값 | 의미 | 대시보드 표시 |
|---|---|---|
| `public` | 공개 — 모든 사람이 검색·시청 가능 | 파란색 배지 |
| `unlisted` | 일부공개 — 링크가 있는 사람만 시청 가능 | 노란색 배지 |
| `private` | 비공개 — 채널 소유자만 시청 가능 | 반투명 흰색 배지 |

---

## comment_bait

`script.json`의 `comment_bait` 필드에 저장되는 댓글 유도 문구입니다. Gemini API가 스크립트 생성 시 함께 출력합니다.

- 목적: 댓글 참여를 유도해 YouTube 알고리즘의 참여도 지표를 높임
- 예시: `"여러분이라면 어떻게 하실 건가요? 댓글로 알려주세요!"`
- Job 상세 페이지(`/dashboard/[id]`) 스크립트 내용 패널의 "댓글 유도" 항목에 표시
- `affiliateUrl`과 무관하게 모든 채널 영상에 적용 가능

---

## watchTimeMinutes

`AnalyticsRow.watchTimeMinutes` 필드. YouTube Analytics에서 수집되는 일별 시청 시간(분 단위)입니다.

- YPP 2단계 달성 여부 계산에 사용: `analytics.reduce((s, r) => s + r.watchTimeMinutes, 0) / 60` → 총 시청 시간(시)
- `ChannelClient`에서 `totalWatchHours`로 변환 후 3,000시간 목표 대비 진행률로 표시
- `estimatedRevenue`와 함께 일별 Analytics 테이블에서 확인 가능

---

## YPP (YouTube Partner Program)

YouTube 수익화 자격 프로그램입니다. 이 플랫폼의 장기 목표 중 하나입니다.

달성 기준은 2단계로 나뉩니다:

**1단계 — 기본 수익 창출** (3가지 모두 충족):
- `Channel.subscriberCount` ≥ 500 (DB 저장, sync 시 YouTube Data API에서 갱신)
- `uploadCount90d` ≥ 3 (최근 90일 업로드 횟수 — 요청 시 Job 테이블에서 동적 계산)
- `shortsViews90d` ≥ 3,000,000 (최근 90일 쇼츠 조회수 — 요청 시 Job 테이블에서 동적 계산)

**2단계 — 광고 수익** (1가지 충족):
- `shortsViews90d` ≥ 10,000,000 (최근 90일 쇼츠 조회수)
- 또는 `watchTimeMinutes` 합산 ≥ 180,000분 (3,000시간, 12개월 기준)

- `isYPPQualified` — DB 컬럼 없음. `GET /channels/:id` 응답 시 위 조건을 실시간 판별해 반환
- YPP 달성 후 `AnalyticsRow.estimatedRevenue`에 예상 수익 기록
- 관련 규칙: [비즈니스 규칙 — YPP 달성 기준](./business-rules.md#7-ypp-달성-기준-추적-2단계)

---

## refresh_token / access_token

YouTube Data API 접근에 필요한 OAuth2 토큰 쌍입니다.

| 토큰 | 설명 | 저장 위치 |
|---|---|---|
| `refresh_token` | 장기 유효 토큰, `access_token` 재발급에 사용 | DB (`Channel.refreshToken`, AES-256-GCM 암호화) |
| `access_token` | 단기 유효 토큰(1시간), 실제 API 호출에 사용 | 저장 금지 — 런타임에 `refresh_token`으로 재발급 |

보안 규칙: `access_token`을 DB에 저장하면 탈취 시 즉시 API 악용 가능. 항상 런타임 재발급 방식 사용. 설정 방법: [YouTube API 설정 가이드](../runbook/youtube-api-setup.md)

---

## TTS (Text-to-Speech)

스크립트 텍스트를 음성 오디오 파일(MP3)로 변환하는 기술입니다.

| Phase | 사용 기술 | 특징 |
|---|---|---|
| Phase 1~6 | Edge-TTS `ko-KR-SunHiNeural +20%` | 무료, 자연스러운 한국어, Lambda Layer 불필요 |
| Phase 7~ | Clova Voice (Naver) | 더 자연스러운 억양, 유료 |

- 관련 ADR: [ADR 002 — TTS 엔진](../adr/002-tts-engine.md)
- Worker: `apps/workers/tts`
- 출력: `jobs/{jobId}/audio.mp3`

---

## STT (Speech-to-Text)

자막 생성에 사용하는 방식입니다.

- 구현: `ffprobe`로 오디오 총 길이 측정 → `script.json`의 `script` 필드를 글자 수 비례로 타임스탬프 산출 → 20자 이하 청크 분할 → SRT 생성
- Worker: `apps/workers/subtitle`
- 출력: `jobs/{jobId}/subtitle.srt`

---

## EventBridge Scheduler

AWS EventBridge의 스케줄러 기능으로, 채널별 지정 시간에 Job을 자동 생성합니다.

- `rate(1 minute)` 규칙으로 scheduler-worker Lambda를 매분 트리거
- `Channel.uploadSchedule` cron을 매분 평가해 해당 시각이면 `POST /jobs/auto-news` 호출
- 예시: `"0 9 * * *"` = 매일 UTC 오전 9시 Job 자동 생성

---

## SQS Long Polling

SQS 메시지를 효율적으로 수신하기 위해 최대 20초간 연결을 유지하는 방식입니다. 이 프로젝트의 모든 Worker는 Lambda SQS Event Source Mapping을 사용하며, AWS가 Long Polling을 관리합니다.

- `WaitTimeSeconds: 20` 설정 시 메시지가 없으면 최대 20초 대기 후 반환
- 메시지 도착 즉시 반환 (20초를 기다리지 않음)
- Short Polling 대비 API 호출 횟수 약 1/400 절감
- 관련 ADR: [ADR 009 — Fargate SQS Long Polling](../adr/009-fargate-sqs-long-polling.md) (Superseded)
