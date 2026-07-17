# ADR 001: Worker 배포 환경 — Lambda

**상태:** Accepted

## 결정

모든 Worker를 Lambda로 배포한다.

**배포 환경 결정 기준:**
- 실행 시간 > 15분 또는 메모리 > 3GB → Fargate (현재 해당 없음)
- 그 외 → Lambda

| Worker | 환경 | 메모리 | 타임아웃 | 배포 방식 |
|---|---|---|---|---|
| script-worker | Lambda | 512MB | 60s | serverless deploy (esbuild) |
| tts-worker | Lambda | 512MB | 120s | serverless deploy (esbuild) |
| subtitle-worker | Lambda | 512MB | 120s | serverless deploy (esbuild) |
| render-worker | Lambda Container Image | 3008MB | 600s | Docker build → ECR → serverless deploy |
| upload-worker | Lambda | 256MB | 300s | serverless deploy (esbuild) |

## 근거

- **esbuild Workers**: SQS Event Source Mapping으로 트리거 자동 관리, 호출 기반 과금으로 유휴 비용 없음
- **render-worker Container Image**: FFmpeg·폰트·Pexels 클라이언트를 포함한 커스텀 이미지. Lambda 3008MB에서 약 2vCPU가 제공되며, 35~45초 Shorts 렌더링에 600s 타임아웃이 충분하다
