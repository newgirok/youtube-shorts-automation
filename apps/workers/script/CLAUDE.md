# @shorts/script-worker

SQS script-queue를 폴링해 Gemini API로 Shorts 스크립트를 생성하는 워커.

파이프라인: script-queue → [Gemini 생성] → S3 저장 → tts-queue 발행
