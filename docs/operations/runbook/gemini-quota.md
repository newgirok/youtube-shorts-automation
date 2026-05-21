# Gemini API 할당량 오류 트러블슈팅

## 증상

script-worker 로그에 아래 오류가 반복될 때:

```
GoogleGenerativeAIFetchError: [429 Too Many Requests]
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests
limit: 0, model: gemini-2.5-flash
```

UI에서는 Job이 즉시 **실패** 상태로 전환되고, 실패 원인에 "알 수 없는 오류"가 표시된다.

---

## `limit: 0` vs 일반 할당량 소진의 차이

| 상황 | 에러 내 limit 값 | 의미 |
|------|-----------------|------|
| 일일 할당량(1,500 req) 소진 | `limit: 1500` | 오늘 이미 다 씀 → UTC 자정 리셋 |
| **무료 티어 자체 미활성화** | **`limit: 0`** | 프로젝트에 결제 계정 미연결 |

`limit: 0`이 찍히는 경우는 단순 소진이 아니다.  
**API 키가 속한 Google Cloud 프로젝트에 결제 계정이 연결되지 않아 무료 티어 할당량 자체가 부여되지 않은 상태**다.

---

## 원인 확인

### 1단계 — 어떤 프로젝트의 키인지 확인

[Google AI Studio](https://aistudio.google.com) → **Get API key** → 키 목록에서 현재 `.env.local`의 `GEMINI_API_KEY`가 어느 프로젝트에 속하는지 확인

### 2단계 — 해당 프로젝트 결제 상태 확인

[Google Cloud Console](https://console.cloud.google.com) → 상단 프로젝트 선택 → 좌측 메뉴 **결제(Billing)**

- **결제 계정 없음**: 무료 티어 할당량이 0으로 설정되어 있음 → 아래 해결책 A
- **결제 계정 있음 + limit: 0**: 프로젝트가 결제 계정에서 분리되었거나 정지 상태 → 아래 해결책 B

---

## 해결책

### A. 결제 계정 연결 (권장)

결제 계정을 연결하면 무료 티어 할당량(1,500 req/day)이 자동으로 부여된다.  
실제 과금은 무료 한도 초과 시에만 발생한다.

1. [Google Cloud Console](https://console.cloud.google.com) → 해당 프로젝트 선택
2. 좌측 메뉴 → **결제** → **결제 계정 연결**
3. 결제 계정이 없다면 새로 생성 (최초 가입 시 $300 무료 크레딧 제공)
4. 연결 후 수 분 내 할당량 반영

### B. 새 프로젝트로 API 키 재발급

1. [Google AI Studio](https://aistudio.google.com) → **Get API key** → **Create API key**
2. 팝업에서 **"Create API key in new project"** 선택
   - 기존 프로젝트를 선택하면 동일한 문제 반복됨
3. 생성된 키를 복사
4. `.env.local` 수정:
   ```
   GEMINI_API_KEY=새로_발급받은_키
   ```
5. script-worker 재시작:
   ```bash
   docker compose up -d --force-recreate script-worker
   ```

### C. 키 동작 여부 사전 검증

새 키 적용 전에 아래 명령으로 정상 동작 여부를 먼저 확인한다:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"안녕"}]}]}'
```

정상 응답 예시 (`candidates[0].content.parts[0].text`가 있으면 OK):

```json
{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "안녕하세요!" }]
      }
    }
  ]
}
```

오류 응답 예시 (재발급 필요):

```json
{
  "error": {
    "code": 429,
    "status": "RESOURCE_EXHAUSTED"
  }
}
```

---

## 일반 할당량 소진인 경우 (limit: 1500)

`limit: 0`이 아닌 `limit: 1500`과 함께 429가 뜨는 경우는 오늘의 일일 할당량 소진이다.  
**UTC 자정(한국 시간 오전 9시)에 자동 리셋**된다.

단기 해결:
- 내일까지 기다리거나
- 결제 계정이 연결된 프로젝트로 전환 (유료 티어는 분당 2,000 req 가능)

---

## 관련 문서

- [Gemini API 키 최초 발급](../../onboarding/api-keys.md)
- 환경변수 위치: 루트 `.env.local` → `GEMINI_API_KEY`
- 영향받는 워커: `apps/workers/script/` (script-worker)
