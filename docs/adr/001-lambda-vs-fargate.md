# ADR 001: Worker 배포 환경 — Lambda vs ECS Fargate

**상태:** Accepted (부분 업데이트: 2026-05-21)

## 현황 업데이트

subtitle-worker는 2026-05-21 기준 faster-whisper를 제거하고 Edge-TTS VTT 기반 SRT 생성으로 전환됐다. Fargate 유지 이유가 "모델 메모리"에서 "SQS Long Polling 상시 실행"으로 변경됐다. Phase 3 배포 계획 기준 subtitle: 2vCPU/8GB, render: 4vCPU/16GB. render-worker는 FFmpeg CPU 집약 작업으로 여전히 Fargate 필수.

## 배경

5개 Worker(script, tts, subtitle, render, upload)를 각각 Lambda와 ECS Fargate 중 어디에 배포할지 결정이 필요했다. 잘못 선택하면 타임아웃 오류 또는 불필요한 컨테이너 비용이 발생한다.

## 결정

| Worker | 환경 | 근거 |
|---|---|---|
| script-worker | Lambda | Claude API 호출만, 60초 내 완료 |
| tts-worker | Lambda | Edge-TTS 스트리밍, 120초 내 완료 |
| upload-worker | Lambda | YouTube API 호출만, 300초 내 완료 |
| subtitle-worker | ECS Fargate | SQS Long Polling 상시 실행 필요 (faster-whisper 제거됨 — ADR 008 Superseded) |
| render-worker | ECS Fargate | FFmpeg CPU 집약적, 영상 길이에 따라 처리 시간 가변 |

**기준:**
- 실행 시간 > 15분 또는 메모리 > 3GB → Fargate
- 그 외 → Lambda

## 결과

- Lambda Workers: 콜드 스타트 있으나 비용 저렴, 관리 불필요
- Fargate Workers: 상시 최소 1태스크 유지 시 비용 발생, 대신 타임아웃 없음
- subtitle/render는 반드시 Fargate 유지 — SQS Long Polling 상시 실행 구조이므로 Lambda 트리거와 호환 불가 (ADR 009)
