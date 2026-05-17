# @shorts/render-worker

SQS render-queue를 폴링해 FFmpeg으로 영상을 렌더링하는 워커.

파이프라인: render-queue → [FFmpeg 렌더링] → S3 저장 → upload-queue 발행

## 주요 모듈

- `processor.ts` — S3 오디오·SRT 다운로드 → FFmpeg 실행 → upload-queue 발행
- `renderer.ts` — FFmpeg 1080×1920 자막 burn-in 합성 + FFprobe 길이 측정
- `image-generator.ts` — Pexels API로 배경 이미지 검색·다운로드 (`PEXELS_API_KEY` 필요)
- `index.ts` — SQS Long Polling 진입점
