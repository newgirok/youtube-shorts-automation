# @shorts/script-worker

SQS script-queue를 폴링해 Gemini API로 Shorts 스크립트를 생성하는 워커.

파이프라인: script-queue → [Gemini 생성] → S3 저장 → tts-queue 발행

## 주요 모듈

- `script-generator.ts` — Gemini API 호출 및 JSON 파싱, `generateScript(topic, channelId)` 내보냄
- `handler.ts` — Lambda SQS 이벤트 핸들러 (script-queue 수신, tts-queue 발행)
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
- `env.ts` — 환경변수 파싱 (`GEMINI_API_KEY`, `SQS_TTS_QUEUE_URL` 등)

## 모델 및 SDK

- 모델: `gemini-2.5-flash` (`@google/generative-ai` SDK)
- 503 응답 시 최대 3회 재시도, 재시도 간 지연 5초 × (시도 횟수)

## 출력 JSON 구조 (ScriptOutput)

```typescript
interface ScriptOutput {
  title: string;          // 20자 이내 영상 제목
  hook: string;           // 첫 2초 훅 문장
  script: string;         // 전체 낭독 스크립트 (180~250자)
  description: string;    // YouTube 영상 설명문 (3~5문단, 400~800자)
                          // ~다고 합니다 중립 보도 문체, 마지막 문단 면책 공지 포함
  scenes: Scene[];        // 4~6개 장면 (각 5~8초)
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
- 길이: 낭독 시 25~35초 분량 (스크립트 180~250자)
- 서사 구조: `[훅]→[긴장고조: 팩트 나열]→[감정피크: 강한 구어체 1문장]→[반전/해소]→[근거 보강]→[comment_bait]`
- 말투: 강한 구어체 (`맞짱 뜨고`, `인질삼아`, `보다못한`, `슬슬 꺾이기 시작한`, `개빡쳤다`, `~해 버린`, `~버리겠다면서`)
- 간접 인용 종결어: `~라고 함` / `~상황이라고` / `~분석이라고` 패턴을 2~3회 이상 사용해 뉴스 전달자처럼 포장
- 마무리: `comment_bait` 질문으로 반드시 종료 (공분·논란·의견 충돌 유발)

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
