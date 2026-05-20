# @shorts/render-worker

SQS render-queue를 폴링해 FFmpeg으로 영상을 렌더링하는 워커.

파이프라인: render-queue → [Pexels 이미지 다운로드 + zoompan 클립 생성 + FFmpeg 합성] → S3 저장 → upload-queue 발행

## 주요 모듈

- `processor.ts` — S3 파일 다운로드, scenes 기반 클립 생성, FFmpeg 최종 합성, upload-queue 발행
- `renderer.ts` — FFmpeg zoompan 클립 렌더링 (`renderSceneClip`), 클립 concat + 자막 burn-in (`concatClipsWithAudio`)
- `image-generator.ts` — Pexels API로 scene keyword 기반 배경 이미지 검색·다운로드 (`PEXELS_API_KEY` 필요)
- `index.ts` — SQS Long Polling 진입점 (Fargate 상시 실행)
- `env.ts` — 환경변수 파싱 (`PEXELS_API_KEY`, `FFMPEG_PATH` 등)

## 렌더링 파이프라인

1. S3에서 audio.mp3, subtitle.srt 다운로드
2. DB의 `scriptContent.scenes` 배열 순회
   - 각 scene의 `keyword`(영어)로 Pexels 이미지 다운로드
   - Pexels 실패 시 `job.topic`으로 재시도
   - `renderSceneClip()`: 이미지 → zoompan 효과 → 1080×1920 MP4 클립
3. scenes가 없는 경우: topic 키워드로 단일 이미지 fallback (50초 zoom-in)
4. `concatClipsWithAudio()`: 클립 concat → 오디오 + 자막 burn-in → output.mp4

## zoompan 효과

| effect | 동작 |
|---|---|
| `zoom-in` | 1.0 → 1.5 확대 (중앙 고정) |
| `zoom-out` | 1.5 → 1.0 축소 (중앙 고정) |
| `pan-left` | 좌→우 패닝 (zoom 1.2 고정) |
| `pan-right` | 우→좌 패닝 (zoom 1.2 고정) |

출력 해상도: 1080×1920 (Shorts 세로 포맷), fps: 30

## 자막 스타일 (ASS force_style)

```
FontSize=46, Bold=1, Outline=8, Shadow=3
Alignment=2 (하단 중앙), MarginV=130, MarginL=40, MarginR=40
PrimaryColour=&H00FFFFFF (흰색), OutlineColour=&H00000000 (검정)
FontName: 'Malgun Gothic Bold' (Windows) / 'NanumGothicExtraBold' (Linux)
```

affiliate CTA 자막은 제거됨.

## SQS 메시지 구조

수신 (`render-queue`):
```typescript
{ jobId: string; channelId: string; audioS3Key: string; subtitleS3Key: string }
```

발행 (`upload-queue`):
```typescript
{ jobId: string; channelId: string; videoS3Key: string }
// videoS3Key = "jobs/{jobId}/output.mp4"
```
