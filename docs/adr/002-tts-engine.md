# ADR 002: TTS 엔진 — msedge-tts

**상태:** Accepted

## 배경

한국어 YouTube Shorts용 TTS가 필요하다. 선택지: msedge-tts(무료), Clova Voice(유료), ElevenLabs(유료).

## 결정

`msedge-tts` npm 패키지 `ko-KR-InJoonNeural +20%` 사용

- API 키 불필요
- Microsoft Azure 기반으로 음질 양호
- 무료 — 파이프라인 운영 비용 없음
- Lambda Layer 불필요 — 순수 Node.js WebSocket 클라이언트
- VTT 미생성 — subtitle-worker는 `script.json`의 `script` 필드 + 오디오 길이 기반 글자 비례 SRT 생성

## 결과

- tts-worker 내부 구현을 인터페이스로 추상화해두면 엔진 교체 시 worker 외부 변경 없음
- `msedge-tts`는 비공식 API 의존 — Microsoft 정책 변경 시 중단 가능성 있음 (수용)
- `ko-KR-InJoonNeural` 외 다른 음성 사용 시 품질 재검증 필요
- `+20%` 적용으로 기본 속도 대비 재생시간 ~17% 단축 → YouTube Shorts 60초 제한 내 수용 가능
