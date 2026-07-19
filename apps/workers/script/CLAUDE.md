# @shorts/script-worker

SQS script-queue를 폴링해 Gemini API로 Shorts 스크립트를 생성하는 워커.

파이프라인: script-queue → [Gemini 생성] → S3 저장 → tts-queue 발행

## 주요 모듈

- `script-generator.ts` — Gemini API 호출 및 JSON 파싱, `generateScript(topic, channelId)` 내보냄
- `handler.ts` — Lambda SQS 이벤트 핸들러 (script-queue 수신, tts-queue 발행)
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
- `env.ts` — 환경변수 파싱 (`GEMINI_API_KEY`, `SQS_TTS_QUEUE_URL` 등)

## 에러 메시지 인코딩 처리

Windows 로컬 환경에서 `failReason`에 깨진 문자(`�`) 저장 방지:

```typescript
const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, '?');
```

`failReason` DB 저장 시 `toSafeMsg(err)` 사용.

## 모델 및 SDK

- 모델: `gemini-2.5-flash` (`@google/generative-ai` SDK)
- 503 응답, `SCRIPT_TOO_LONG`, `SCRIPT_FORMAL_ENDING`, `SCRIPT_QUESTION_OPENING` 오류 시 최대 3회 재시도, 재시도 간 지연 5초 × (시도 횟수)
- `SCRIPT_FORMAL_ENDING`: script 필드에 `~습니다|~입니다` 패턴이 포함된 경우 (`parseOutput` 내 코드 검증)
- `SCRIPT_QUESTION_OPENING`: script의 마지막 문장(comment_bait) 제외 나머지 문장 중 `~니까|~십니까` 의문형이 있는 경우 — hook 의문형이 script 본문에 혼입되는 패턴 차단

## 출력 JSON 구조 (ScriptOutput)

```typescript
interface ScriptOutput {
  title: string;          // 22자 이내 영상 제목
  hook: string;           // 첫 2초 훅 문장
  script: string;         // 전체 낭독 스크립트 (210~350자, 최대 380자 검증, title TTS 포함 총 35~45초)
  description: string;    // YouTube 영상 설명문 (3~5문단, 400~800자)
                          // 뉴스 직접 서술체 ('~했습니다', '~됩니다'). ~이라고 합니다 반복 금지. 마지막 문단 면책 공지 포함
  scenes: Scene[];        // 4~5개 장면, start~end 합산 총 35~43초
  hashtags: string[];     // 해시태그 배열
  thumbnail_text: string; // 썸네일 임팩트 문구 (8자 이내)
  comment_bait: string;   // 댓글 유도 질문 (25자 이내)
}

interface Scene {
  start: number;          // 시작 시간 (초)
  end: number;            // 종료 시간 (초)
  text: string;           // 해당 구간 낭독 텍스트
  keyword: string;        // Pexels 검색용 영어 키워드 (2~3단어)
  effect: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
}
```

필드 추가/변경 시 tts-worker, subtitle-worker 파싱 로직 함께 수정 필요.

## 콘텐츠 방향

- 장르: 한국 시사/사회 이슈 특화 YouTube Shorts
- 길이: `title` TTS 포함 총 35~45초 분량 (스크립트 단독 210~260자, 최대 380자 검증)
- 서사 구조: 기승전결 **4박자** — 각 단계가 독립된 한 박자로 끊김
- 말투: 강한 구어체 (`맞짱 뜨고`, `인질삼아`, `보다못한`, `슬슬 꺾이기 시작한`, `개빡쳤다`, `~해 버린`, `~버리겠다면서`)
- 마무리: `comment_bait` 질문으로 반드시 종료 (공분·논란·의견 충돌 유발)

### 기승전결 4박자 종결어 패턴

| 단계 | 역할 | 종결어 |
|---|---|---|
| [기] | 인물명·기관명·수치 2~3개를 한 호흡으로 연결 | 반드시 `~다고 함.` 또는 `~됐다고 함.`으로 끊을 것 (선택 아님) |
| [승] | 감정 최고조 문장 1개 | 6개 표현 중 하나: `진짜 어이가 없는 상황이라고` / `기가 막힌 상황이라고` / `분통이 터지는 상황이라고` / `경악스러운 상황이라고` / `말도 안 되는 상황이라고` / `진짜 개빡친 상황이라고` |
| [전] | `하지만`으로 시작, 반전 팩트 1문장 | `~상황이라고 하는데.` 마침표로 끊어 [결]과 분리된 독립 문장 |
| [결] | `여러분은 ...`으로 시작 | `~십니까?` 격식체 의문문. [전] 다음 독립 문장. 구체적 이슈·주체 언급 필수 |

**흐름 요약:** `~다고 함.` | `~상황이라고.` | `~상황이라고 하는데.` | `여러분은 ...?`

**종결어 한도:** `~라고 함` 계열 최대 2회 + `~이라고/~상황이라고` 계열 최대 2회. 같은 계열 연속 배치 금지.

### TTS 출력 주의사항

- 기관명·단체명 뒤 영문 약자 괄호 표기 금지 — TTS가 괄호와 영문을 그대로 읽어 어색해짐
  - 예: `주택도시보증공사(HUG)` → `주택도시보증공사`
- comment_bait 종결어: 반드시 `~십니까?` 격식체 사용 (`보세요?` 등 비격식체 금지)

### 레퍼런스 스크립트 — 카테고리별 few-shot 예시

**[기] 공통 규칙**: 구체적 수치(금액·횟수·퍼센트·인원수)와 인물명·기관명 2개 이상 필수.

실제 예시 텍스트(정치·경제·사회 3개)는 `script-generator.ts`의 `SYSTEM_PROMPT` 내 레퍼런스 섹션에 있음. `script-generator.ts` 수정 시 이 규칙과 일치하는지 검토 필요.

## SQS 메시지 구조

수신 (`script-queue`):
```typescript
{ jobId: string; channelId: string; topic: string }
```

발행 (`tts-queue`):
```typescript
{ jobId: string; channelId: string; scriptS3Key: string }
// scriptS3Key = "jobs/{jobId}/script.json"
```
