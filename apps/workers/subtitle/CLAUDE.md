# @shorts/subtitle-worker

SQS subtitle-queue를 폴링해 Whisper로 자막을 생성하는 워커.

파이프라인: subtitle-queue → [Whisper 전사] → S3 저장 → render-queue 발행
