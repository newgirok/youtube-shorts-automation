# ADR 001: Worker 배포 환경 — Lambda vs ECS Fargate

**상태:** Accepted

## 배경

5개 Worker(script, tts, subtitle, render, upload)를 각각 Lambda와 ECS Fargate 중 어디에 배포할지 결정이 필요했다. 잘못 선택하면 타임아웃 오류 또는 불필요한 컨테이너 비용이 발생한다.

## 결정

| Worker | 환경 | 근거 |
|---|---|---|
| script-worker | Lambda | Claude API 호출만, 60초 내 완료 |
| tts-worker | Lambda | Edge-TTS 스트리밍, 120초 내 완료 |
| upload-worker | Lambda | YouTube API 호출만, 300초 내 완료 |
| subtitle-worker | ECS Fargate | faster-whisper 모델 ~1.5GB, Lambda 메모리 한계 초과 |
| render-worker | ECS Fargate | FFmpeg CPU 집약적, 영상 길이에 따라 처리 시간 가변 |

**기준:**
- 실행 시간 > 15분 또는 메모리 > 3GB → Fargate
- 그 외 → Lambda

## 결과

- Lambda Workers: 콜드 스타트 있으나 비용 저렴, 관리 불필요
- Fargate Workers: 상시 최소 1태스크 유지 시 비용 발생, 대신 타임아웃 없음
- subtitle/render는 반드시 Fargate 유지 — Lambda로 이전 시 모델 로딩 실패
