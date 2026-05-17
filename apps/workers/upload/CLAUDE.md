# @shorts/upload-worker

SQS upload-queue를 폴링해 YouTube Data API로 영상을 업로드하는 워커.

파이프라인: upload-queue → [YouTube 업로드] → DB 상태 COMPLETED 업데이트
