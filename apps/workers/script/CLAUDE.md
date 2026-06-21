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
- 서사 구조: 기승전결 4단계 — `[기: 팩트 나열]→[승: 감정피크 '~상황이라고']→[전: 반전 '~상황이라고 함.']→[결: comment_bait]`
- 말투: 강한 구어체 (`맞짱 뜨고`, `인질삼아`, `보다못한`, `슬슬 꺾이기 시작한`, `개빡쳤다`, `~해 버린`, `~버리겠다면서`)
- 감정 피크 표현 6종 (주제에 맞는 것 하나 선택, 반복 금지):
  `'진짜 어이가 없는 상황이라고'` / `'기가 막힌 상황이라고'` / `'분통이 터지는 상황이라고'` / `'경악스러운 상황이라고'` / `'말도 안 되는 상황이라고'` / `'진짜 개빡친 상황이라고'`
- 종결어 제한: `~라고 함` 계열 최대 2회, `~이라고/~상황이라고` 계열 최대 2회, 같은 계열 연속 배치 금지
- 마무리: `comment_bait` 질문으로 반드시 종료 (공분·논란·의견 충돌 유발)

### 레퍼런스 스크립트 — 카테고리별 3개 few-shot 예시

**[기] 공통 규칙**: 구체적 수치(금액·횟수·퍼센트·인원수)와 인물명·기관명 2개 이상 필수. 막연한 감성 표현만으로 채우는 것 절대 금지.

**[정치 예시]** — 혐의 수·법원 출두 횟수·의원 수·지지율 추세 포함  
**[경제 예시]** — 금리%·환율·물가 상승률·폐업 건수 포함  
**[사회 예시]** — 혈중알코올 수치·구형량·사고 증가율 포함

실제 예시 텍스트는 `script-generator.ts`의 `SYSTEM_PROMPT` 내 레퍼런스 섹션에 있음. `script-generator.ts` 수정 시 이 규칙과 일치하는지 검토 필요.

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
