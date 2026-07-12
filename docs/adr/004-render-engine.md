# ADR 004: 렌더링 엔진 — FFmpeg (→ Phase 6: Remotion)

**상태:** Accepted (Phase 6에서 재검토)

## 배경

오디오 + 자막 → MP4 합성 방법으로 FFmpeg과 Remotion(React 기반) 중 선택이 필요하다.

## 결정

**Phase 1~5:** FFmpeg 사용

- 추가 런타임 없음 — ECS 이미지에 바이너리 하나만 추가
- ASS 자막 burn-in, zoompan 효과, 헤더 오버레이 모두 FFmpeg으로 구현 완료
- 빠른 파이프라인 검증 가능

**Phase 6:** Remotion으로 전환

- React 컴포넌트로 영상 템플릿 관리 → 디자인 변경 시 코드 수정만으로 대응
- 채널별 브랜딩(로고, 색상, 폰트) 템플릿화 가능
- Puppeteer(Chromium) 필요 → ECS 이미지 크기 증가 감수

## 결과

- Phase 1~5 render-worker는 FFmpeg만 의존 — 이미지 경량
- Phase 6 전환 시 render-worker 내부만 교체, S3 출력 키(`jobs/{jobId}/output.mp4`)는 동일 유지
- Remotion은 Node.js 환경 필요 — Lambda 이전 불가, Fargate 유지
