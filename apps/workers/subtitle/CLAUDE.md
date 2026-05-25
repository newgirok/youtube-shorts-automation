# @shorts/subtitle-worker

SQS subtitle-queue를 폴링해 VTT(또는 스크립트)를 기반으로 SRT 자막을 생성하는 워커.

파이프라인: subtitle-queue → [VTT → SRT 변환] → S3 저장 → render-queue 발행

## 주요 모듈

- `processor.ts` — 핵심 처리 로직 (VTT 파싱, SRT 생성)
- `index.ts` — SQS Long Polling 진입점 (Fargate 상시 실행)
- `env.ts` — 환경변수 파싱

## SRT 생성 방식

### 1차: VTT 기반 (edge-tts word-level timing 활용)

`subtitleVttS3Key`가 전달되면 VTT를 기반으로 정확한 타이밍을 산출한다.

1. S3에서 `jobs/{jobId}/subtitle.vtt` 다운로드
2. `parseVttEntries()`: VTT 파싱 (HTML 태그 제거 포함)
3. `skipTitleEntries()`: TTS 입력은 `"${title}.\n\n${script}"` 구조 — 제목 음성에 해당하는 앞부분 VTT 엔트리를 건너뜀 (자막은 스크립트 본문부터 표시)
4. `buildSrtFromVtt()`: 각 VTT 엔트리 내에서 문장 분할 → 글자 수 비례 타이밍 계산
5. `splitIntoDisplayChunks()`: 20자 초과 시 구어체 종결 패턴 우선 분할

#### skipTitleEntries 동작 원리
stripped 누적 문자 수가 제목 길이에 도달하는 엔트리까지 건너뜀:
```typescript
function skipTitleEntries(entries: VttEntry[], title: string): VttEntry[] {
  const strip = (s: string) => s.replace(/[\s'''""".,?!]/g, '').toLowerCase();
  const titleLen = strip(title).length;
  let accumulated = 0;
  for (let i = 0; i < entries.length; i++) {
    accumulated += strip(entries[i]!.text).length;
    if (accumulated >= titleLen) return entries.slice(i + 1);
  }
  return entries;
}
```

### 2차: 문자 비례 fallback

`subtitleVttS3Key` 없을 때:

1. `ffprobe`로 audio.mp3 길이 측정 (ms)
2. S3에서 `jobs/{jobId}/script.json` → `script` 필드 추출
3. `buildSrt()`: 전체 길이 대비 글자 수 비례로 타임스탬프 계산

## 핵심 상수

| 상수 | 값 | 설명 |
|---|---|---|
| `MAX_DISPLAY_CHARS` | 20 | 한 자막 청크 최대 글자 수 (공백 제외) |
| `CHARS_PER_SEC` | 6 | 한국어 TTS 발화 속도 상한 (글자/초) |
| `TERMINATOR_GAP_MS` | 800 | `함$` 종결어 뒤 정적 간격 (ms) |

## 타이밍 로직 상세 (buildSrtFromVtt)

- 각 VTT 엔트리를 `\.\s+|[?!]\s+|라고 함|상황이라고 함 …` 패턴으로 문장 분할
- 문장별 표시 종료 시간 = `min(비례 종료, 발화속도 종료)` (마지막 문장은 엔트리 종료에 맞춤)
- `함$`으로 끝나는 문장: 엔트리 내 비마지막 문장이면 즉시 `sentCursor += 800ms` 적용 (`nextGap`)
- VTT 엔트리 경계에서는 gap을 추가하지 않음 — `\n\n` 단락 분리로 edge-tts 오디오에 이미 자연 휴지가 생기고 VTT 타임스탬프가 실제 발화 시작점을 정확히 가리키므로, 경계에 gap을 더하면 자막이 음성보다 늦게 출현하는 이중 지연이 발생

## VTT 파싱 주의사항

edge-tts가 `--write-subtitles`로 생성하는 VTT에는 `<break>` 등 HTML 태그가 텍스트에 남을 수 있다. `parseVttEntries`에서 아래와 같이 제거한다:

```typescript
const text = raw
  .replace(/<[^>]*>/g, '')
  .replace(/\bbreak\s[^>]*\/>/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();
```

## SQS 메시지 구조

수신 (`subtitle-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string; subtitleVttS3Key?: string }
// subtitleVttS3Key = "jobs/{jobId}/subtitle.vtt" (VTT 있을 때만)
```

발행 (`render-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string; subtitleS3Key: string }
// subtitleS3Key = "jobs/{jobId}/subtitle.srt"
```
