# @shorts/tts-worker

SQS tts-queue를 폴링해 Edge-TTS로 음성을 합성하는 워커.

파이프라인: tts-queue → [TTS 합성] → S3 저장 → subtitle-queue 발행

## 주요 모듈

- `TTSAdapter.ts` — TTS 인터페이스 (Phase 7 Clova Voice 교체 대비 추상화)
- `EdgeTTSAdapter.ts` — Edge-TTS `ko-KR-SunHiNeural` 구현체
- `handler.ts` — Lambda SQS 이벤트 핸들러
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
