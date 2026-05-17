# ADR 008: Whisper 구현체 및 모델 — faster-whisper large-v3

**상태:** Accepted

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

## 결과

- Fargate subtitle-worker 메모리 할당: 8GB 고정 (large-v3 3GB + 버퍼)
- 모델을 medium으로 줄이면 인식률 목표 미달 → 변경 금지
- 모델 파일은 Docker 이미지 빌드 시 캐시하거나 EFS 마운트로 관리 (Cold Start 최소화)
- `language: 'ko'` 명시 필수 — 자동 감지 시 일본어 오감지 발생
