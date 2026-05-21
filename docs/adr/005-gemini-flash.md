# ADR 005: 스크립트 생성 모델 — Google Gemini Flash

**상태:** Accepted (업데이트: 2026-05-20)

## 배경

script-worker에서 YouTube Shorts 스크립트(JSON)를 생성할 AI 모델을 선택해야 한다.

선택지: Google Gemini, Anthropic Claude, OpenAI GPT. 구조화된 JSON 출력이 주목적이므로 모델 품질보다 비용과 무료 한도가 핵심 기준이다.

## 결정

**`gemini-2.5-flash` 고정** (`@google/generative-ai` SDK)

- Google AI Studio 무료 티어: 1,500 req/day, 비용 $0
- 구조화된 JSON 출력 품질 충분 — 8개 필드 생성 정확도 검증 완료
- SDK: `@google/generative-ai` (공식 Google SDK)
- 환경변수: `GEMINI_API_KEY` (Google AI Studio에서 발급)
- 503 응답 시 최대 3회 재시도 (지연: 5초, 10초, 15초)

**호출 패턴:**
```typescript
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const result = await model.generateContent(prompt);
const text = result.response.text();
```

**출력 JSON 필드 (변경 금지):**
`title`, `hook`, `script`, `description`, `scenes`, `hashtags`, `thumbnail_text`, `comment_bait`

필드 변경 시 이후 모든 Worker(tts, subtitle 등)의 파싱 로직 함께 수정 필요.

## 모델 이력

| 시점 | 모델 | 변경 이유 |
|---|---|---|
| Phase 0 도입 | `gemini-2.0-flash` | 무료 티어, JSON 출력 품질 충분 |
| 2026-05-20 | `gemini-2.5-flash` | scenes 필드 추가 등 복잡한 JSON 생성 안정성 향상 |

## 결과

- API 비용 $0 (무료 티어 한도 내 운영 기준)
- 언어 품질 문제 발생 시 모델 교체보다 **프롬프트 개선**을 먼저 시도
- 무료 한도(1,500 req/day) 초과 시 유료 플랜 전환 검토
