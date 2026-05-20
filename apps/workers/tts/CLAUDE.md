# @shorts/tts-worker

SQS tts-queue를 폴링해 Edge-TTS로 음성을 합성하는 워커.

파이프라인: tts-queue → [TTS 합성] → S3 저장 → subtitle-queue 발행

## 주요 모듈

- `TTSAdapter.ts` — TTS 인터페이스 (Phase 7 Clova Voice 교체 대비 추상화)
- `EdgeTTSAdapter.ts` — Edge-TTS `ko-KR-SunHiNeural` 구현체
- `handler.ts` — Lambda SQS 이벤트 핸들러
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
- `env.ts` — 환경변수 파싱 (`EDGE_TTS_PATH`, `SQS_SUBTITLE_QUEUE_URL` 등)

## TTS 설정 (변경 없음)

- 엔진: Edge-TTS
- 음성: `ko-KR-SunHiNeural`
- 입력: `script.script` 필드 (ScriptOutput의 script 문자열)
- 출력: `/tmp/{jobId}-audio.mp3` → S3 `jobs/{jobId}/audio.mp3`

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
```
