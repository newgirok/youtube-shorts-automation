# ADR 001: Worker 배포 환경 — Lambda vs ECS Fargate

**상태:** Accepted (최종 업데이트: 2026-07-14)

## 현황

**모든 Worker가 Lambda로 운영 중.** Fargate ECS Worker 없음.

| Worker | 환경 | 메모리 | 타임아웃 | 배포 방식 |
|---|---|---|---|---|
| script-worker | Lambda | 512MB | 60s | serverless deploy (esbuild) |
| tts-worker | Lambda | 512MB | 120s | serverless deploy (esbuild) |
| subtitle-worker | Lambda | 512MB | 120s | serverless deploy (esbuild) |
| render-worker | Lambda Container Image | 3008MB | 600s | Docker build → ECR → serverless deploy |
| upload-worker | Lambda | 256MB | 300s | serverless deploy (esbuild) |

## 배경

5개 Worker(script, tts, subtitle, render, upload)를 각각 Lambda와 ECS Fargate 중 어디에 배포할지 결정이 필요했다. 잘못 선택하면 타임아웃 오류 또는 불필요한 컨테이너 비용이 발생한다.

## 결정 (최종)

**기준:**
- 실행 시간 > 15분 또는 메모리 > 3GB → Fargate
- 그 외 → Lambda

**render-worker를 Lambda Container Image로 전환한 이유 (2026-07-14):**

초기에는 render-worker를 FFmpeg CPU 집약 작업을 이유로 Fargate(4vCPU/16GB)에 배포했다. 그러나 실제 35~45초 Shorts 렌더링은 16GB가 과다 할당임이 확인됐다. Lambda의 메모리-CPU 비례 관계상 3008MB 할당 시 약 2vCPU가 제공되며 이는 Shorts 렌더링에 충분하다. Lambda Container Image 방식으로 FFmpeg, 폰트, Pexels 클라이언트를 포함한 커스텀 이미지를 사용해 전환했다.

**subtitle-worker를 Lambda로 전환한 이유 (2026-07-12):**

초기에는 SQS Long Polling 상시 실행 목적으로 Fargate에서 운영했다. tts-worker가 msedge-tts로 교체되면서 VTT 미생성 → music-metadata 순수 JS로 오디오 길이 측정 방식으로 변경됐고, 플랫폼 바이너리 의존성이 사라져 Lambda esbuild 번들 배포가 가능해졌다.

## 결과

- **Lambda esbuild Workers**: 콜드 스타트 있으나 비용 저렴, SQS Event Source Mapping으로 트리거 자동 관리
- **Lambda Container Image (render)**: Docker 빌드 단계가 있으나 Fargate 상시 실행 비용 없음, 600s 타임아웃으로 Shorts 렌더링 충분
- **Fargate 폐지**: subtitle(2026-07-12), render(2026-07-14) 순으로 제거 완료
