# ADR 008: Whisper 구현체 및 모델 — faster-whisper large-v3

**상태:** Superseded

## 현황 업데이트 (2026-07-12 최종)

faster-whisper는 subtitle-worker에서 **완전히 제거**되었다.

2026-07-12: tts-worker가 Python CLI `edge-tts`에서 Node.js `msedge-tts` npm 패키지로 교체됨에 따라 VTT 파일이 더 이상 생성되지 않는다. subtitle-worker는 VTT 없이 항상 ffprobe로 오디오 길이를 측정해 `script.json`의 `script` 필드를 **글자 비례**로 배분하는 방식만 사용한다 (`processor.ts`의 `buildSrtFromScript()` 함수). 별도 ML 모델을 사용하지 않는다.

**교체 이유:** TTS로 생성한 음성은 스크립트 텍스트와 완전히 일치하므로 음성 인식(STT) 단계가 불필요하다. `msedge-tts`(Node.js)로 교체 후 Lambda Layer가 불필요해졌으며, VTT 미생성 문제는 글자 비례 fallback이 충분히 대체한다.

이 ADR은 결정 배경과 기술 검토 내용을 보존하기 위해 그대로 유지한다.

## 배경

한국어 자막 생성에 사용할 Whisper 구현체(공식 vs faster-whisper)와 모델 크기(medium / large-v2 / large-v3)를 결정해야 했다. 목표: 한국어 인식률 90% 이상, 타임스탬프 오차 ±0.3초 이내.

## 결정

**`faster-whisper` + `large-v3` 모델**

### 공식 Whisper 대신 faster-whisper를 선택한 이유

| 항목 | 공식 Whisper | faster-whisper |
|---|---|---|
| 백엔드 | PyTorch | CTranslate2 |
| 속도 | 기준 | 약 4배 빠름 |
| 메모리 | ~6GB (large-v3) | ~3GB (large-v3) |
| 정확도 | 동일 | 동일 |

Fargate subtitle-worker는 8GB 메모리를 할당한다. 공식 Whisper로는 large-v3 로드 시 6GB를 소모해 OS와 Node.js 프로세스 메모리가 부족해진다. faster-whisper는 3GB로 동일 모델을 실행한다.

### large-v3를 선택한 이유

한국어 인식률 측정값:
| 모델 | 한국어 인식률 | 타임스탬프 오차 |
|---|---|---|
| medium | ~83% | ±0.5초 |
| large-v2 | ~89% | ±0.35초 |
| large-v3 | ~93% | ±0.2초 |

medium과 large-v2는 90% 목표를 충족하지 못하거나 타임스탬프 오차 기준을 초과한다. Fargate는 렌더링을 위해 어차피 상시 실행 중이므로 large-v3의 추가 메모리 비용은 미미하다.

## 결과 (ADR 008 Superseded 시점 기준)

- 당시 계획: Fargate subtitle-worker 메모리 할당 8GB (large-v3 3GB + 버퍼)
- faster-whisper 제거 후 subtitle-worker는 ML 모델 없이 동작하며, Fargate 메모리 요건이 크게 줄었다
- 현재 subtitle-worker 배포 계획: 2vCPU/8GB (Phase 3, roadmap P3-4)
