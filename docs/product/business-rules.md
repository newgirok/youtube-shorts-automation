# 비즈니스 규칙

이 문서는 플랫폼의 핵심 도메인 규칙을 정리합니다. 제품 전체 요구사항은 [PRD](../prd.md), 개발 로드맵은 [로드맵](../roadmap.md)을 참고하세요.

---

## 핵심 운영 규칙

### 1. 채널당 매일 1개 쇼츠 업로드

- EventBridge Scheduler가 채널별 `uploadSchedule` (cron 형식)에 따라 매일 Job을 자동 생성합니다.
- `Channel.isActive = false`인 채널은 스케줄에서 제외됩니다.
- 스케줄 기본값: `"0 9 * * *"` (UTC 오전 9시, KST 오후 6시)
- 채널별로 독립적인 스케줄 설정이 가능합니다.

### 2. 토픽 큐 소진 시 자동 생성

- 채널에 사전 등록된 토픽 큐가 있으면 순서대로 사용합니다.
- 토픽 큐가 소진되면 script-worker가 Gemini API로 채널 niche에 맞는 토픽을 자동 생성합니다.
- 자동 생성된 토픽은 다시 큐에 저장되지 않습니다 (매번 새로 생성).

### 3. 보안 규칙

- YouTube `refresh_token`은 **AES-256-GCM**으로 암호화하여 DB에 저장합니다.
- `access_token`은 DB에 저장하지 않습니다. 런타임에 `refresh_token`으로 재발급합니다.
- 암호화 키(`ENCRYPTION_KEY`)는 AWS Secrets Manager에서 주입합니다. `.env.local`에 임시 보관 가능하지만 Git 커밋 금지입니다.
- 설정 방법: [암호화 키 설정 가이드](../runbook/encryption-key-setup.md)

### 4. 업로드 공개 상태 (`privacyStatus`)

- `Job.privacyStatus` 필드는 YouTube 업로드 시 설정된 공개 상태를 나타냅니다.
- 가능한 값: `'public'`(공개) | `'unlisted'`(일부공개) | `'private'`(비공개)
- 대시보드 `/dashboard/[id]`에서 `COMPLETED` 상태인 Job에 한해 공개 상태 배지를 표시합니다.
  - `public` → 파란색 배지
  - `unlisted` → 노란색 배지
  - `private` → 반투명 흰색 배지
- 진행 중이거나 실패한 Job에는 배지를 표시하지 않습니다.

### 5. 삭제된 YouTube 영상 감지

- upload-worker 또는 analytics-sync가 YouTube API 호출 중 해당 영상이 존재하지 않음을 감지하면 `Job.failReason = '유튜브에서 영상이 삭제되었습니다.'`로 갱신하고 `status = 'FAILED'`로 전환합니다.
- 프론트엔드는 이 특수 `failReason` 값을 감지해 상태 배지를 "실패" 대신 "삭제"로 표시합니다.
- "삭제" 상태에서는 재시도 버튼을 노출하지 않습니다 (재업로드해도 동일 영상이 없는 상태이므로).
- 판별 조건: `job.status === 'FAILED' && job.failReason === '유튜브에서 영상이 삭제되었습니다.'`

### 6. Job 재시도 규칙

- SQS `Max Receive Count = 3`: Worker가 메시지를 3회 실패하면 DLQ로 이동합니다.
- `Job.retryCount`는 Worker 처리 실패마다 1씩 증가합니다.
- `Job.failReason`에는 마지막 실패 원인(에러 메시지)이 저장됩니다.
- 대시보드 `/dashboard/[id]`에서 수동 재시도 가능합니다. 수동 재시도 시 `status = PENDING`으로 초기화됩니다.
- DLQ 적재 시 CloudWatch 알람 → Slack/Discord 알림 (Phase 4 구현).

### 7. YPP 달성 기준 추적 (2단계)

YouTube Partner Program은 2단계로 나뉩니다.

**1단계 — 기본 수익 창출** (3가지 모두 충족):
- 구독자 수 ≥ 500명
- 최근 90일 업로드 횟수 ≥ 3회
- 최근 90일 쇼츠 조회수 ≥ 300만 회
- 달성 시 멤버십·슈퍼챗·쇼핑 기능 활성화

**2단계 — 광고 수익** (아래 중 1가지 충족):
- 최근 90일 쇼츠 조회수 ≥ 1,000만 회
- 또는 최근 12개월 시청 시간 ≥ 3,000시간 (`watchTimeMinutes / 60`으로 계산)
- 달성 시 쇼츠 피드 광고 수익 창출

**데이터 소스**:
- `Channel.subscriberCount`, `Channel.uploadCount90d`, `Channel.shortsViews90d` — 채널 동기화(`POST /channels/:id/sync`) 시 갱신
- `totalWatchHours` — `ChannelAnalytics.watchTimeMinutes` 합산으로 계산
- `Channel.isYPPQualified`는 YouTube Analytics 수집 시 자동으로 업데이트됩니다.
- 대시보드 `/channels/[id]`에서 1·2단계 진행률을 ProgressBar로 확인할 수 있습니다.
- YPP 달성 후 `AnalyticsRow.estimatedRevenue` 필드에 예상 수익이 기록됩니다.

---

## 스크립트 출력 형식 (`script.json`)

Gemini API가 생성하는 스크립트는 아래 JSON 형식을 따릅니다:

```json
{
  "title": "영상 제목 (22자 이내, 충격·클릭 유도)",
  "hook": "첫 2초 훅 문장 (의문형 또는 충격 선언)",
  "script": "전체 낭독 스크립트 (210~350자, 기승전결 구조, comment_bait 마무리)",
  "description": "YouTube 영상 설명문 (3~5문단, 400~800자). ~다고 합니다 중립 보도 문체. 마지막 문단 면책 공지.",
  "scenes": [{ "start": 0, "end": 6, "text": "...", "keyword": "영어 키워드", "effect": "zoom-in" }],
  "hashtags": ["#Shorts", "#시사", "#뉴스"],
  "thumbnail_text": "썸네일 임팩트 문구 (8자 이내)",
  "comment_bait": "댓글 유도 질문 (25자 이내)"
}
```

### 각 필드 규칙

| 필드 | 규칙 | 비고 |
|---|---|---|
| `title` | 22자 이내, 충격·클릭 유도 | YouTube 제목으로 사용; TTS로 선행 낭독 |
| `hook` | 첫 2초 훅 문장, 의문형 또는 충격 선언 | 시청자 이탈 방지용 ([용어 사전 참고](./terminology.md#hook)) |
| `script` | 210~350자, 기승전결 구어체 (최대 380자 검증) | TTS 입력; title 포함 총 35~45초; comment_bait으로 마무리 |
| `description` | 3~5문단, 400~800자, `~다고 합니다` 중립 문체 | YouTube 영상 설명문으로 사용, 마지막 문단은 면책 공지 |
| `hashtags` | 최소 `#Shorts` 포함 | YouTube description 말미에 삽입 |
| `thumbnail_text` | 8자 이내 강렬한 문구 | 썸네일 이미지 오버레이 텍스트 |
| `comment_bait` | 댓글 유도 질문, 25자 이내 | 공분·논란·의견 충돌 유발 |

---

## 멱등성 보장 규칙

SQS Standard Queue는 at-least-once 전달이므로 같은 메시지가 중복 처리될 수 있습니다. 아래 규칙으로 안전성을 보장합니다:

- **S3 덮어쓰기**: 같은 `jobId`로 재처리하면 S3 파일이 덮어써집니다. 최종 결과는 동일합니다.
- **업로드 중복 방지**: `Job.youtubeVideoId`가 이미 존재하면 upload-worker가 재업로드를 건너뜁니다.
- **상태 확인**: 각 Worker는 처리 시작 전 `Job.status`를 확인해 이미 완료된 단계를 건너뜁니다.

---

## 관련 문서

- [PRD](../prd.md) — 전체 제품 요구사항
- [로드맵](../roadmap.md) — Phase별 개발 계획
- [파이프라인 흐름](../architecture/pipeline-flow.md) — 기술 구현 상세
- [데이터 모델](../architecture/data-model.md) — DB 스키마
- [용어 사전](./terminology.md) — 도메인 용어 정의
