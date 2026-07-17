# ADR 002: TTS 엔진 — msedge-tts (→ Phase 7: Clova Voice)

**상태:** Accepted

## 배경

한국어 YouTube Shorts용 TTS가 필요하다. 선택지: Edge-TTS(무료), Clova Voice(유료), ElevenLabs(유료).

## 결정

**Phase 1~6:** `msedge-tts` npm 패키지 `ko-KR-SunHiNeural +20%` 사용

- API 키 불필요
- Microsoft Azure 기반으로 음질 양호
- 무료 — 파이프라인 운영 비용 없음
- Lambda Layer 불필요 — 순수 Node.js WebSocket 클라이언트
- VTT 미생성 — subtitle-worker는 `script.json`의 `script` 필드 + 오디오 길이 기반 글자 비례 SRT 생성

**Phase 7 이후:** Clova Voice로 전환 검토

- 더 자연스러운 한국어 억양
- 감정 표현 지원 (구독 유도 CTA에 효과적)
- 월정액 비용 발생 → 수익화 이후 전환

## 결과

- tts-worker 내부 구현을 인터페이스로 추상화해두면 엔진 교체 시 worker 외부 변경 없음
- `msedge-tts`는 비공식 API 의존 — Microsoft 정책 변경 시 중단 가능성 있음 (수용)
- `ko-KR-SunHiNeural` 외 다른 음성 사용 시 품질 재검증 필요
- `+20%` 적용으로 기본 속도 대비 재생시간 ~17% 단축 → YouTube Shorts 60초 제한 내 수용 가능
