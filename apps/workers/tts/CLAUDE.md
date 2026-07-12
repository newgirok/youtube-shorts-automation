# @shorts/tts-worker

SQS tts-queue를 폴링해 msedge-tts(npm 패키지)로 음성을 합성하는 워커.

파이프라인: tts-queue → [TTS 합성] → S3 저장 → subtitle-queue 발행

## 주요 모듈

- `TTSAdapter.ts` — TTS 인터페이스 (Phase 8 Clova Voice 교체 대비 추상화)
- `EdgeTTSAdapter.ts` — `ko-KR-SunHiNeural` 구현체 (msedge-tts WebSocket API 사용)
- `handler.ts` — Lambda SQS 이벤트 핸들러
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
- `env.ts` — 환경변수 파싱 (`SQS_SUBTITLE_QUEUE_URL` 등)

## 에러 메시지 인코딩 처리

Windows 로컬 환경에서 `failReason`에 깨진 문자(`�`) 저장 방지:

```typescript
const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, '?');
```

`failReason` DB 저장 시 `toSafeMsg(err)` 사용.

## TTS 설정

- 엔진: `msedge-tts` npm 패키지 (Azure Edge TTS WebSocket API 직접 호출)
- 음성: `ko-KR-SunHiNeural`
- 재생속도: `+20%` (YouTube Shorts 60초 제한 대응)
- 입력: `title` + `script` 필드 (ScriptOutput)
- 출력: `/tmp/{jobId}-audio.mp3` → S3 `jobs/{jobId}/audio.mp3`

> **Lambda Layer 불필요**: msedge-tts는 순수 Node.js npm 패키지이므로 Python이나 Lambda Layer가 필요 없다.
> Python CLI 방식(`edge-tts`)은 Lambda nodejs22.x에 python3가 없어 exit code 127로 실패했다.

## TTS 입력 전처리 (handler.ts)

2단계 전처리 후 msedge-tts에 전달한다.

```typescript
// 1. comment_bait 앞 구두점 제거 후 공백으로 연결 → '~하는데 여러분은~' 자연스러운 흐름
//    (\n\n 삽입 방식은 TTS가 마침표 정지처럼 과도하게 끊어 읽는 문제 발생)
let processedScript = script;
if (comment_bait) {
  const idx = processedScript.lastIndexOf(comment_bait);
  if (idx > 0) {
    const before = processedScript.slice(0, idx).trimEnd().replace(/[.!?,，。]+$/, '');
    processedScript = `${before} ${processedScript.slice(idx)}`;
  }
}

// 2. 숫자+배수어 뒤 공백 제거 ("80만 명" → "80만명") — VTT 분리 방지
const ttsInput = `${title}.\n\n${normalizeNumberUnits(processedScript).replace(/([.!?])\s+(?=[가-힣A-Z])/g, '$1\n\n')}`;
await tts.synthesize(ttsInput, audioPath);
```

## VTT 출력

msedge-tts는 VTT(타이밍 자막)를 생성하지 않는다.
subtitle-worker는 항상 `script.json`의 `script` 필드 + 오디오 길이 기반 **글자 비례 fallback**으로 SRT를 생성한다.

## SQS 메시지 구조

수신 (`tts-queue`):
```typescript
{ jobId: string; channelId: string; scriptS3Key: string }
// scriptS3Key = "jobs/{jobId}/script.json"
```

발행 (`subtitle-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string }
// audioS3Key = "jobs/{jobId}/audio.mp3"
// VTT 미생성 — subtitle-worker가 항상 글자 비례 fallback 사용
```
