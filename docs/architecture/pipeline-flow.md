# 파이프라인 흐름 상세

이 문서는 YouTube Shorts 자동화 파이프라인의 각 단계를 상세히 설명합니다. 시스템 전체 구조는 [아키텍처 개요](./overview.md), 데이터 모델은 [데이터 모델](./data-model.md)을 참고하세요.

---

## 5단계 파이프라인 다이어그램

```
사용자 / EventBridge Scheduler
         │
         ▼
   POST /jobs (API Gateway + NestJS Lambda)
         │ Job 생성 (status: PENDING)
         │ SQS 메시지 발행
         ▼
┌─────────────────────────────────────────────────────────┐
│  1단계: script-worker (Lambda)                           │
│                                                         │
│  SQS script-queue 수신                                   │
│  → Gemini 2.5 Flash API 호출                             │
│  → script.json 생성 (scenes 포함, script 210~350자)       │
│  → S3 저장: jobs/{jobId}/script.json                    │
│  → Job status: SCRIPT_PROCESSING → (다음 단계)           │
│  → SQS tts-queue 발행                                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  2단계: tts-worker (Lambda)                              │
│                                                         │
│  SQS tts-queue 수신                                      │
│  → S3에서 script.json 다운로드                            │
│  → Edge-TTS (ko-KR-SunHiNeural) 음성 합성               │
│  → S3 저장: jobs/{jobId}/audio.mp3, subtitle.vtt        │
│  → Job status: TTS_PROCESSING → (다음 단계)              │
│  → SQS subtitle-queue 발행                               │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  3단계: subtitle-worker (ECS Fargate, 상시 실행)          │
│                                                         │
│  SQS subtitle-queue Long Polling 수신                    │
│  → S3에서 audio.mp3, subtitle.vtt(선택) 다운로드          │
│  → VTT 기반 SRT 생성 (vtt 없으면 ffprobe 길이 측정 후     │
│     script.json 글자 비례 fallback), 20자 이하 청크 분할  │
│  → S3 저장: jobs/{jobId}/subtitle.srt                   │
│  → Job status: SUBTITLE_PROCESSING → (다음 단계)         │
│  → SQS render-queue 발행                                 │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  4단계: render-worker (ECS Fargate, 상시 실행)            │
│                                                         │
│  SQS render-queue Long Polling 수신                      │
│  → S3에서 audio.mp3, subtitle.srt 다운로드               │
│  → scenes별 Pexels 동영상/이미지 다운로드 (keyword 영어)  │
│  → FFmpeg: 동영상/이미지 → zoompan 클립 (1080×1920, 30fps)│
│  → FFmpeg: 클립 concat + 헤더 오버레이 + 오디오 + ASS 자막 burn-in │
│  → FFmpeg: `-vframes 1` 첫 프레임 썸네일 추출             │
│  → S3 저장: jobs/{jobId}/output.mp4, thumbnail.jpg      │
│  → Job status: RENDER_PROCESSING → (다음 단계)           │
│  → SQS upload-queue 발행                                 │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  5단계: upload-worker (Lambda)                           │
│                                                         │
│  SQS upload-queue 수신                                   │
│  → S3에서 output.mp4 다운로드                             │
│  → ffprobe 영상 품질 검증 (실패 시 FAILED)                │
│  → YouTube Data API v3 업로드                            │
│  → youtubeVideoId, 메타데이터 DB 저장                     │
│  → thumbnailUrl: https://i.ytimg.com/vi/{videoId}/hqdefault.jpg DB 저장
│  → Job status: UPLOAD_PROCESSING → COMPLETED            │
└─────────────────────────────────────────────────────────┘
```

---

## 각 단계별 입력/처리/출력

### 1단계: script-worker

| 항목 | 내용 |
|---|---|
| **실행 환경** | AWS Lambda (Node.js 20) |
| **SQS 큐** | `script-queue` |
| **입력** | `jobId`, `channelId`, `topic` |
| **처리** | Gemini 2.5 Flash API — 뉴스 시사 특화, 35~45초 분량 스크립트(210~350자, 최대 380자 검증) + scenes 생성 |
| **출력** | `jobs/{jobId}/script.json` (S3) |
| **다음 큐** | `tts-queue` |
| **상태 전이** | `PENDING` → `SCRIPT_PROCESSING` |

**SQS 메시지 구조:**
```typescript
interface ScriptMessage {
  jobId: string;
  channelId: string;
  topic: string;
}
```

### 2단계: tts-worker

| 항목 | 내용 |
|---|---|
| **실행 환경** | AWS Lambda (Node.js 20) |
| **SQS 큐** | `tts-queue` |
| **입력** | `jobId`, `channelId`, `scriptS3Key` |
| **처리** | Edge-TTS `ko-KR-SunHiNeural --rate +20%` 음성 합성 (60초 제한 대응) |
| **출력** | `jobs/{jobId}/audio.mp3` (S3) |
| **다음 큐** | `subtitle-queue` |
| **상태 전이** | `SCRIPT_PROCESSING` → `TTS_PROCESSING` |

**SQS 메시지 구조:**
```typescript
interface TTSMessage {
  jobId: string;
  channelId: string;
  scriptS3Key: string;  // "jobs/{jobId}/script.json"
}
```

### 3단계: subtitle-worker

| 항목 | 내용 |
|---|---|
| **실행 환경** | ECS Fargate (상시 실행, `desired_count: 1`) |
| **SQS 큐** | `subtitle-queue` |
| **입력** | `jobId`, `channelId`, `audioS3Key` |
| **처리** | S3에서 audio.mp3 + subtitle.vtt(선택) 다운로드 → VTT 기반 SRT 생성 (vtt 없으면 ffprobe 오디오 길이 측정 후 script.json 글자 비례 fallback), 20자 이하 청크 분할 |
| **출력** | `jobs/{jobId}/subtitle.srt` (S3) |
| **다음 큐** | `render-queue` |
| **상태 전이** | `TTS_PROCESSING` → `SUBTITLE_PROCESSING` |

**SQS 메시지 구조:**
```typescript
interface SubtitleMessage {
  jobId: string;
  channelId: string;
  audioS3Key: string;           // "jobs/{jobId}/audio.mp3"
  subtitleVttS3Key?: string;    // "jobs/{jobId}/subtitle.vtt" (Edge-TTS 생성, 없으면 비례 fallback)
}
```

### 4단계: render-worker

| 항목 | 내용 |
|---|---|
| **실행 환경** | ECS Fargate (상시 실행, `desired_count: 1`) |
| **SQS 큐** | `render-queue` |
| **입력** | `jobId`, `channelId`, `audioS3Key`, `subtitleS3Key` |
| **처리** | scenes별 Pexels 동영상/이미지 다운로드 → zoompan 클립 생성 → FFmpeg concat + 헤더 오버레이 + 오디오 + ASS 자막 burn-in (FontSize=76, BorderStyle=3, MarginV=510) → FFmpeg `-vframes 1` 첫 프레임 썸네일 추출 (헤더·푸터 오버레이 적용) |
| **출력** | `jobs/{jobId}/output.mp4`, `jobs/{jobId}/thumbnail.jpg` (S3) |
| **다음 큐** | `upload-queue` |
| **상태 전이** | `SUBTITLE_PROCESSING` → `RENDER_PROCESSING` |

**SQS 메시지 구조:**
```typescript
interface RenderMessage {
  jobId: string;
  channelId: string;
  audioS3Key: string;     // "jobs/{jobId}/audio.mp3"
  subtitleS3Key: string;  // "jobs/{jobId}/subtitle.srt"
}
```

### 5단계: upload-worker

| 항목 | 내용 |
|---|---|
| **실행 환경** | AWS Lambda (Node.js 20) |
| **SQS 큐** | `upload-queue` |
| **입력** | `jobId`, `channelId`, `videoS3Key` |
| **처리** | ffprobe 영상 품질 검증 → YouTube Data API v3 업로드 — 제목/태그/설명 설정 |
| **출력** | `youtubeVideoId` DB 저장, `thumbnailUrl: https://i.ytimg.com/vi/{videoId}/hqdefault.jpg` DB 저장, Job `COMPLETED` |
| **다음 큐** | 없음 (파이프라인 종료) |
| **상태 전이** | `RENDER_PROCESSING` → `UPLOAD_PROCESSING` → `COMPLETED` |

**SQS 메시지 구조:**
```typescript
interface UploadMessage {
  jobId: string;
  channelId: string;
  videoS3Key: string;   // "jobs/{jobId}/output.mp4"
}
```

---

## S3 키 규칙

모든 산출물은 `jobs/{jobId}/` 접두사 아래 고정된 이름으로 저장됩니다.

| 파일 | S3 키 | 생성 단계 |
|---|---|---|
| 스크립트 | `jobs/{jobId}/script.json` | 1단계 (script-worker) |
| 오디오 | `jobs/{jobId}/audio.mp3` | 2단계 (tts-worker) |
| 자막 | `jobs/{jobId}/subtitle.srt` | 3단계 (subtitle-worker) |
| 최종 영상 | `jobs/{jobId}/output.mp4` | 4단계 (render-worker) |
| 썸네일 | `jobs/{jobId}/thumbnail.jpg` | 4단계 (render-worker, FFmpeg 첫 프레임 추출 `-vframes 1` 후 S3 저장) |

**썸네일 URL 전환 흐름:**
- render-worker 완료 → `thumbnailUrl` = S3 URL. web은 `/api/thumbnail/{jobId}` 프록시로 표시
- upload-worker 완료 → `thumbnailUrl` = `https://i.ytimg.com/vi/{videoId}/hqdefault.jpg` 로 덮어씀

---

## Job 상태 전이 다이어그램

```
                    ┌─────────┐
    POST /jobs ───► │ PENDING │
                    └────┬────┘
                         │ script-worker 시작
                         ▼
               ┌──────────────────┐
               │ SCRIPT_PROCESSING│
               └────────┬─────────┘
                         │ script-worker 완료
                         ▼
                ┌────────────────┐
                │ TTS_PROCESSING │
                └───────┬────────┘
                         │ tts-worker 완료
                         ▼
             ┌───────────────────┐
             │SUBTITLE_PROCESSING│
             └────────┬──────────┘
                         │ subtitle-worker 완료
                         ▼
              ┌──────────────────┐
              │ RENDER_PROCESSING│
              └────────┬─────────┘
                         │ render-worker 완료
                         ▼
              ┌──────────────────┐
              │UPLOAD_PROCESSING │
              └────────┬─────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         ┌─────────┐          ┌────────┐
         │COMPLETED│          │ FAILED │
         └─────────┘          └────────┘
                         ▲
                         │ 어느 단계에서든 예외 발생 시
```

---

## Worker 타임아웃 및 SQS Visibility Timeout

| Worker | 실행 환경 | 타임아웃 | Visibility Timeout |
|---|---|---|---|
| api (NestJS Lambda) | Lambda | 30초 | — |
| script-worker | Lambda | 60초 | 120초 |
| tts-worker | Lambda | 120초 | 240초 |
| subtitle-worker | Fargate | 300초 | 600초 |
| render-worker | Fargate | 600초 | 1,200초 |
| upload-worker | Lambda | 300초 | 600초 |

**Visibility Timeout = Worker 타임아웃 × 2**: 처리 중인 메시지가 다른 Consumer에게 재배달되는 것을 방지합니다.

**Fargate heartbeat**: render-worker와 subtitle-worker는 처리 중 `ChangeMessageVisibility`를 주기적으로 호출해 Visibility Timeout을 연장합니다([ADR 009](../adr/009-fargate-sqs-long-polling.md)).

### SQS 공통 설정

| 항목 | 값 | 이유 |
|---|---|---|
| Message Retention | 4일 | 주말 포함 장애 대응 |
| Max Receive Count | 3 | DLQ 이동 전 재시도 횟수 |
| DLQ Retention | 14일 | 실패 원인 수동 분석 시간 확보 |

---

## 실패 처리

### Worker 실패 시 흐름

1. Worker에서 예외 발생
2. `Job.status = 'FAILED'`, `Job.failReason` = 오류 메시지 저장
3. SQS 메시지를 `deleteMessage` 하지 않으면 Visibility Timeout 후 자동 재배달
4. `Max Receive Count = 3` 초과 시 DLQ(Dead Letter Queue)로 이동
5. DLQ 적재 → CloudWatch 알람 → Slack/Discord 알림 (Phase 4에서 구현)

### 재시도 카운트

```typescript
// Job.retryCount가 증가할 때마다 failReason도 갱신
await prisma.job.update({
  where: { id: jobId },
  data: {
    status: 'FAILED',
    retryCount: { increment: 1 },
    failReason: error.message,
  },
});
```

### 수동 재시도

대시보드 `/dashboard/[id]` 페이지에서 실패한 Job을 재시도할 수 있습니다. 재시도 시 `status`를 `PENDING`으로 초기화하고 첫 번째 SQS 큐(`script-queue`)에 메시지를 다시 발행합니다.

---

## 멱등성 보장

SQS Standard Queue는 at-least-once 전달을 보장하므로 같은 메시지가 두 번 처리될 수 있습니다([ADR 003](../adr/003-sqs-standard-queue.md)). 중복 처리에 대한 안전성은 다음과 같이 확보합니다:

- **S3 덮어쓰기**: 같은 `jobs/{jobId}/script.json` 키로 재업로드하면 이전 파일이 교체됩니다. 최종 결과는 동일합니다.
- **YouTube 업로드**: upload-worker는 `Job.youtubeVideoId`가 이미 있으면 재업로드를 건너뜁니다.
- **상태 체크**: Worker 시작 시 `Job.status`를 확인해 이미 완료된 단계는 건너뜁니다.

---

## 관련 문서

- [ADR 003 — SQS Standard Queue](../adr/003-sqs-standard-queue.md)
- [ADR 009 — Fargate SQS Long Polling](../adr/009-fargate-sqs-long-polling.md)
- [아키텍처 개요](./overview.md)
- [데이터 모델](./data-model.md)
