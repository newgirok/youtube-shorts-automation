# ADR 008: 자막 생성 방식 — 글자 비례 SRT

**상태:** Accepted

## 결정

subtitle-worker는 ML 모델(STT) 없이 `script.json`의 `script` 필드와 오디오 길이를 기반으로 **글자 비례 타임스탬프**를 산출해 SRT를 생성한다.

## 근거

tts-worker(`msedge-tts`)가 생성하는 음성은 `script` 필드의 텍스트를 그대로 낭독한다. 텍스트와 음성이 완전히 일치하므로 STT(음성 인식)로 텍스트를 역추출하는 단계가 불필요하다.

글자 비례 생성 절차:
1. `ffprobe`로 `audio.mp3`의 총 재생 시간 측정
2. `script` 필드 전체 글자 수 대비 각 청크의 글자 수 비율로 타임스탬프 계산
3. 20자 이하 단위로 청크 분할 후 SRT 포맷으로 저장

## 결과

- subtitle-worker를 Lambda 512MB / 120s 환경에서 실행 가능 (ML 모델 로딩 불필요)
- `subtitle.vtt` 미생성 — `subtitle.srt`만 S3에 저장
- 타임스탬프 정확도: TTS 생성 음성은 스크립트와 일치하므로 글자 비례 배분으로 충분
