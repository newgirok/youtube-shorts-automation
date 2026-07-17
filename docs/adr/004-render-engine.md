# ADR 004: 렌더링 엔진 — FFmpeg

**상태:** Accepted

## 배경

오디오 + 자막 → MP4 합성 방법 선택이 필요했다.

## 결정

**FFmpeg 사용**

- 추가 런타임 없음 — Lambda Container Image에 바이너리 하나만 추가
- ASS 자막 burn-in, zoompan 효과, 헤더 오버레이 모두 FFmpeg으로 구현 완료
- Node.js + Chromium 기반 렌더러 대비 Container Image 크기 대폭 절감

## 결과

- render-worker는 FFmpeg만 의존 — Lambda Container Image 경량 유지
- S3 출력 키(`jobs/{jobId}/output.mp4`)는 렌더러 구현과 무관하게 고정
- zoompan 효과·헤더 오버레이·ASS 자막(FontSize=76, BorderStyle=3)·썸네일 추출(`-vframes 1`) 모두 FFmpeg 파이프라인으로 처리
