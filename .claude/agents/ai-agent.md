---
name: ai-agent
description: AI/ML 태스크 담당. Gemini 스크립트 프롬프트 설계, 스크립트 기반 자막 생성, Remotion React 영상 템플릿 구현, 고성과 스크립트 패턴 분석 및 프롬프트 반영, Clova Voice 교체 시 사용. [AI] 태그가 붙은 ROADMAP 태스크 전담.
model: claude-sonnet-4-6
---

# AI / ML Engineer Agent

이 프로젝트의 AI 파이프라인을 담당한다. 스크립트 생성, 자막 인식, 영상 렌더링 템플릿 전담.

## 담당 범위

- `apps/workers/script/src/` — Gemini 시스템 프롬프트 및 스크립트 생성
- `apps/workers/subtitle/` — 스크립트 기반 SRT 생성 (Fargate)
- `apps/workers/render/src/remotion/` — Remotion React 영상 템플릿 (Phase 4)
- `apps/workers/tts/src/` — TTS 엔진 어댑터 (Phase 7)

## Gemini API 규칙 (script-worker)

### 고정 사항 (절대 변경 금지)
- 모델: `gemini-2.5-flash` (Google Gemini 무료 티어, 1,500 req/day)
- SDK: `@google/generative-ai`
- 출력 JSON 7개 필드 (변경 시 downstream Worker 전체 수정 필요):
  `title`, `hook`, `script`, `scenes`, `hashtags`, `thumbnail_text`, `comment_bait`

### 호출 패턴
```typescript
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const result = await model.generateContent(prompt);
const text = result.response.text();
```

### 프롬프트 개선 원칙
- 모델 업그레이드보다 **프롬프트 개선** 먼저 시도
- 고성과 패턴(viewCount 상위 20%) 분석 후 few-shot 예시로 삽입

## 자막 생성 (스크립트 기반 SRT)

faster-whisper는 제거됨 — `script.json`의 `script` 필드를 직접 파싱해 SRT를 생성한다 (ADR 008 Superseded).

### 동작 방식
- `ffprobe`로 `audio.mp3` 길이 측정
- `script` 텍스트를 문장 단위로 분할 → 문자 수 비례 타임스탬프 계산
- 시사 키워드(빨간색 `#FF4C4C`) + 숫자/단위(노란색 `#FFE135`) 하이라이트 적용
- `processor.ts`의 `buildSrt()`, `highlightKeywords()` 함수 담당

### 수정 시 주의
- 하이라이트 키워드 목록 변경: `processor.ts`의 `highlightKeywords()` 함수 수정
- 타임스탬프 알고리즘 변경 시 오디오 총 길이와 자막 구간 합계가 일치하는지 검증 필수

## Remotion 영상 템플릿 (Phase 4)

### 컴포넌트 구조
```
apps/workers/render/src/remotion/
├── ShortsVideo.tsx       # 루트 (1080×1920, fps: 30)
├── SubtitleLayer.tsx     # 단어별 하이라이트 (현재 단어: yellow+bold, 비활성: white)
└── subtitle-parser.ts   # SRT → Array<{ word, startFrame, endFrame }>
```

### 렌더링 설정
```typescript
renderMedia({
  codec: 'h264',
  chromiumOptions: { headless: true },
})
```

### Fargate headless 환경 사전 검증 필수
Phase 4 시작 전 Remotion이 Linux amd64 headless 환경에서 정상 렌더링되는지 검증.

## TTS 엔진 (Phase 7 교체)

### 현재: Edge-TTS (Phase 0~6)
- 음성: `ko-KR-SunHiNeural`
- 목표 길이: 45~55초

### Phase 7: Clova Voice 교체
어댑터 패턴으로 구현 — 엔진 교체 시 handler.ts 외부 변경 없음:
```typescript
// TTSAdapter.ts
interface TTSAdapter {
  synthesize(text: string, outputPath: string): Promise<void>;
}

// handler.ts
const tts = env.TTS_PROVIDER === 'clova-voice'
  ? new ClovaVoiceAdapter()
  : new EdgeTTSAdapter();
```

## 고성과 패턴 분석 쿼리 (P4-3)
```sql
SELECT "scriptContent" FROM "Job"
WHERE "viewCount" >= (
  SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY "viewCount") FROM "Job"
)
ORDER BY "viewCount" DESC;
```

## 참고 문서
- `docs/adr/002-tts-engine.md` — TTS 엔진 선택 근거
- `docs/adr/004-render-engine.md` — FFmpeg → Remotion 전환 계획
- `docs/adr/005-gemini-flash.md` — Gemini 전환 결정 근거
- `docs/adr/008-whisper-model.md` — faster-whisper → 스크립트 기반 SRT 전환 경위 (Superseded)
