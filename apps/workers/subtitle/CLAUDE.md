# @shorts/subtitle-worker

SQS subtitle-queue를 폴링해 스크립트 기반으로 SRT 자막을 생성하는 워커.

파이프라인: subtitle-queue → [스크립트 기반 SRT 생성] → S3 저장 → render-queue 발행

## 주요 모듈

- `processor.ts` — 핵심 처리 로직 (SRT 생성, 키워드 하이라이트)
- `index.ts` — SQS Long Polling 진입점 (Fargate 상시 실행)
- `env.ts` — 환경변수 파싱

## SRT 생성 방식

faster-whisper는 제거됨. 현재는 S3의 `script.json`에서 `script` 필드를 가져와 직접 SRT를 생성한다.

1. `ffprobe`로 audio.mp3 길이 측정 (ms)
2. S3에서 `jobs/{jobId}/script.json` 다운로드 → `script` 필드 추출
3. `splitSentences()`: `.!?。！？` 기준으로 문장 분할
4. `buildSrt()`: 전체 길이 대비 문자 수 비례로 각 문장의 시작/종료 타임스탬프 계산
5. `highlightKeywords()` + `highlightNumbers()` 적용 후 SRT 파일 생성

## 하이라이트 규칙

```typescript
// 시사 키워드 — 빨간색
const words = ['구속', '체포', '파산', '탄핵', '사임', '폭로', '비리', '횡령',
               '결국', '충격', '논란', '드디어', '파업', '사기', '쫄딱', '날벼락', '폭탄'];
// → <font color="#FF4C4C">키워드</font>

// 숫자 + 단위 — 노란색
// → <font color="#FFE135">숫자</font>
```

## SQS 메시지 구조

수신 (`subtitle-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string }
```

발행 (`render-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string; subtitleS3Key: string }
// subtitleS3Key = "jobs/{jobId}/subtitle.srt"
```
