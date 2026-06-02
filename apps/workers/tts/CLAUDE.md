# @shorts/tts-worker

SQS tts-queue를 폴링해 Edge-TTS로 음성을 합성하는 워커.

파이프라인: tts-queue → [TTS 합성] → S3 저장 → subtitle-queue 발행

## 주요 모듈

- `TTSAdapter.ts` — TTS 인터페이스 (Phase 7 Clova Voice 교체 대비 추상화)
- `EdgeTTSAdapter.ts` — Edge-TTS `ko-KR-SunHiNeural` 구현체
- `handler.ts` — Lambda SQS 이벤트 핸들러
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
- `env.ts` — 환경변수 파싱 (`EDGE_TTS_PATH`, `SQS_SUBTITLE_QUEUE_URL` 등)

## TTS 설정

- 엔진: Edge-TTS
- 음성: `ko-KR-SunHiNeural`
- 재생속도: `--rate +20%` (YouTube Shorts 60초 제한 대응)
- 입력: `title` + `script` 필드 (ScriptOutput)
- 출력: `/tmp/{jobId}-audio.mp3` → S3 `jobs/{jobId}/audio.mp3`

## TTS 입력 전처리 (handler.ts)

3단계 전처리 후 edge-tts에 전달한다.

```typescript
// 1. comment_bait 앞 구두점 제거 후 공백으로 연결 → '~하는데 여러분은~' 자연스러운 흐름
//    (\n\n 삽입 방식은 TTS가 마침표 정지처럼 과도하게 끊어 읽는 문제 발생)
let processedScript = script;
if (comment_bait) {
  const idx = processedScript.lastIndexOf(comment_bait);
  if (idx > 0) {
    const before = processedScript.slice(0, idx).trimEnd().replace(/[.!?,，。]+$/, '');
    processedScript = `${before} ${processedScript.slice(idx)}`;
  }
}

// 2. 숫자+배수어 뒤 공백 제거 ("80만 명" → "80만명") — edge-tts VTT 엔트리 과분할 방지
// 3. 마침표/느낌표/물음표 뒤 한글·대문자 → \n\n 단락 분리 → 문장별 VTT 엔트리 생성
const ttsInput = `${title}.\n\n${normalizeNumberUnits(processedScript).replace(/([.!?])\s+(?=[가-힣A-Z])/g, '$1\n\n')}`;
await tts.synthesize(ttsInput, audioPath);
```

- 1단계: comment_bait 앞 구두점 제거 → 공백 연결로 '~하는데 여러분은~' 자연스럽게 이어줌
- 2단계: `normalizeNumberUnits` — `(\d+[만억조천백십])\s+([명원개월일년주배곳건채팀회차])` 패턴의 공백 제거 → edge-tts가 숫자+단위를 별도 VTT 엔트리로 분할하는 현상 방지
- 3단계: 마침표/느낌표/물음표 뒤에 한글 또는 대문자가 이어지면 `\n\n`으로 분리 → 문장별 VTT 엔트리 생성, subtitle-worker의 자막 타이밍 정확도 향상
- 이 처리 없이 전달하면 VTT가 긴 블록으로 묶여 자막 타이밍이 부정확해짐

## VTT 출력

edge-tts `--write-subtitles` 옵션으로 생성. 단락 분리 덕분에 문장 수준 타임스탬프를 가진 VTT 엔트리가 생성된다.

- VTT 파일: `/tmp/{jobId}-audio.vtt` → S3 `jobs/{jobId}/subtitle.vtt`
- subtitle-worker가 이 VTT를 기반으로 SRT를 생성한다 (`subtitleVttS3Key` 필드로 전달)

## SQS 메시지 구조

수신 (`tts-queue`):
```typescript
{ jobId: string; channelId: string; scriptS3Key: string }
// scriptS3Key = "jobs/{jobId}/script.json"
```

발행 (`subtitle-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string; subtitleVttS3Key?: string }
// audioS3Key = "jobs/{jobId}/audio.mp3"
// subtitleVttS3Key = "jobs/{jobId}/subtitle.vtt" (VTT 생성 성공 시)
```
