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

각 단계는 SQS 메시지로 연결되며, AWS Lambda 또는 ECS Fargate에서 실행됩니다. 상세 흐름은 [파이프라인 흐름](../architecture/pipeline-flow.md)을 참고하세요.

---

## DLQ (Dead Letter Queue)

SQS 메시지가 `Max Receive Count(3회)` 이상 실패했을 때 이동하는 별도의 SQS 큐입니다. DLQ에 메시지가 쌓이면 CloudWatch 알람이 발화되고 Slack/Discord에 알림이 전송됩니다 (Phase 4 구현).

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
| `SUBTITLE_PROCESSING` | subtitle-worker가 Whisper로 자막 생성 중 |
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

## Affiliate CTA

쿠팡 파트너스 링크 유도 자막(Call to Action)입니다. `Channel.affiliateUrl`이 설정된 채널의 영상 마지막 8초에 삽입됩니다.

- CTA 문구: `script.json`의 `affiliate_cta` 필드 (Gemini가 생성)
- 링크: 영상 설명란에 `Channel.affiliateUrl` 포함
- 예시: `"지금 쿠팡에서 확인하세요! 링크는 설명란에 ↓"`
- 관련 규칙: [비즈니스 규칙 — 쿠팡 파트너스 CTA](./business-rules.md#4-쿠팡-파트너스-cta-자막-삽입)

---

## YPP (YouTube Partner Program)

YouTube 수익화 자격 프로그램입니다. 이 플랫폼의 장기 목표 중 하나입니다.

- **달성 기준**: 구독자 1,000명 + 최근 365일 시청 시간 4,000시간
- `Channel.isYPPQualified = true`로 자동 관리
- YPP 달성 후 `ChannelAnalytics.estimatedRevenue`에 예상 수익 기록

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
| Phase 1~6 | Edge-TTS `ko-KR-SunHiNeural` | 무료, 자연스러운 한국어 |
| Phase 7~ | Clova Voice (Naver) | 더 자연스러운 억양, 유료 |

- 관련 ADR: [ADR 002 — TTS 엔진](../adr/002-tts-engine.md)
- Worker: `apps/workers/tts`
- 출력: `jobs/{jobId}/audio.mp3`

---

## STT (Speech-to-Text)

오디오 파일을 텍스트(자막)로 변환하는 기술입니다. 이 플랫폼에서는 MP3 → SRT 자막 파일 생성에 사용합니다.

- 사용 모델: faster-whisper large-v3
- 한국어 인식률: 93%
- 메모리: ~3GB → Lambda 불가, ECS Fargate 전용
- 관련 ADR: [ADR 008 — Whisper 모델](../adr/008-whisper-model.md)
- Worker: `apps/workers/subtitle`
- 출력: `jobs/{jobId}/subtitle.srt`

---

## Remotion

React 컴포넌트로 영상을 렌더링하는 프레임워크입니다. 현재는 FFmpeg을 사용하고 있으며, Phase 5부터 render-worker를 Remotion으로 전환합니다.

- 전환 이유: 코드로 영상 레이아웃 제어 (텍스트 위치, 애니메이션, 자막 스타일), React 개발자 친화적
- 현재 상태: Phase 1~4는 FFmpeg 유지
- 관련 ADR: [ADR 004 — 렌더링 엔진](../adr/004-render-engine.md)

---

## EventBridge Scheduler

AWS EventBridge의 스케줄러 기능으로, 채널별 지정 시간에 Job을 자동 생성합니다.

- `Channel.uploadSchedule` cron 표현식을 기반으로 동작
- Phase 4에서 구현 예정
- 예시: `"0 9 * * *"` = 매일 UTC 오전 9시 Job 생성
- 대안으로 고려했던 방식: Lambda + CloudWatch Events (동일 결과, EventBridge가 더 세밀한 스케줄 지원)

---

## SQS Long Polling

SQS 메시지를 효율적으로 수신하기 위해 최대 20초간 연결을 유지하는 방식입니다. Fargate Worker는 AWS Lambda와 달리 SQS 트리거를 사용할 수 없어 자체 Long Polling 루프를 구현합니다.

- `WaitTimeSeconds: 20` 설정 시 메시지가 없으면 최대 20초 대기 후 반환
- 메시지 도착 즉시 반환 (20초를 기다리지 않음)
- Short Polling 대비 API 호출 횟수 약 1/400 절감
- 관련 ADR: [ADR 009 — Fargate SQS Long Polling](../adr/009-fargate-sqs-long-polling.md)
