# @shorts/render-worker

SQS render-queue를 폴링해 FFmpeg으로 영상을 렌더링하는 워커.

파이프라인: render-queue → [Pexels 동영상/이미지 다운로드 + zoompan 클립 생성 + FFmpeg 합성] → S3 저장 → upload-queue 발행

## 주요 모듈

- `processor.ts` — S3 파일 다운로드, scenes 기반 클립 생성, FFmpeg 최종 합성, upload-queue 발행
- `renderer.ts` — FFmpeg zoompan 클립 렌더링 (`renderSceneClip`, `renderSceneFromVideo`), 클립 concat + 헤더 + 자막 burn-in (`concatClipsWithAudio`)
- `image-generator.ts` — Pexels API로 scene keyword 기반 배경 동영상/이미지 검색·다운로드 (`PEXELS_API_KEY` 필요)
- `index.ts` — SQS Long Polling 진입점 (Fargate 상시 실행)
- `env.ts` — 환경변수 파싱 (`PEXELS_API_KEY`, `FFMPEG_PATH` 등)

## 에러 메시지 인코딩 처리

Windows 로컬 개발 환경에서 `execSync` 실패 시 cmd.exe stderr가 CP949로 출력되어 `failReason`에 `�`(replacement character)가 포함되는 문제 방지:

```typescript
const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, '?');
```

`failReason` DB 저장 시 반드시 `toSafeMsg(err)` 사용. Docker(Linux) 환경에서는 발생하지 않으나 로컬 직접 실행 시 필요.

## 렌더링 파이프라인

1. S3에서 audio.mp3, subtitle.srt 다운로드
2. DB의 `scriptContent.scenes` 배열 순회
   - 씬 합계가 오디오보다 짧으면 마지막 씬을 오디오 끝까지 연장 (comment_bait 잘림 방지)
   - 각 scene의 `keyword`(영어)로 Pexels **동영상** 우선 시도 (`downloadSceneVideo`)
   - 동영상 실패 시 Pexels **이미지** fallback (`downloadSceneImage`)
   - 이미지도 Pexels 실패 시 `job.topic`으로 재시도
   - `renderSceneFromVideo()`: 동영상 → scale/crop → 1080×1920 MP4 클립
   - `renderSceneClip()`: 이미지 → zoompan 효과 → 1080×1920 MP4 클립
3. scenes가 없는 경우: topic 키워드로 단일 이미지 fallback (50초 zoom-in)
4. `concatClipsWithAudio()`: 클립 concat → **헤더 오버레이** + 오디오 + **ASS 자막** burn-in → output.mp4
   - 출력 길이 = `min(concat_raw.mp4 길이, min(audio 길이, 60초))` — 씬 클립 합계가 오디오보다 짧으면 오디오를 잘라 화면 정지(tpad clone) 방지
5. 썸네일 추출: FFmpeg `-vframes 1` (헤더·푸터 오버레이 적용 첫 프레임, `concatPath` 기준) → `jobs/{jobId}/thumbnail.jpg` S3 업로드 → DB `thumbnailUrl = '/jobs/{jobId}/thumbnail'` 저장 (non-fatal, 실패 시 무시)

## zoompan 효과

| effect | 동작 |
|---|---|
| `zoom-in` | 1.0 → 1.5 확대 (중앙 고정) |
| `zoom-out` | 1.5 → 1.0 축소 (중앙 고정) |
| `pan-left` | 좌→우 패닝 (zoom 1.2 고정) |
| `pan-right` | 우→좌 패닝 (zoom 1.2 고정) |

출력 해상도: 1080×1920 (Shorts 세로 포맷), fps: 30

## 레이아웃 (1080×1920 기준)

| 영역 | y 범위 | 높이 | 비율 |
|---|---|---|---|
| 헤더 (검정 패널 + 제목) | 0 ~ 560 | 560px | 29.2% |
| 바디 (영상 콘텐츠) | 560 ~ 1300 | 740px | 38.5% |
| 푸터 (검정 패널 + 자막박스) | 1300 ~ 1920 | 620px | 32.3% |

## 헤더 오버레이 (상단)

- `HEADER_H = 560` — 불투명 검정 패널 (`color=black@1.0`)
- 항상 2줄 구조 (제목이 6자 이하이거나 공백 없으면 1줄 큰 폰트):
  - **1줄(흰색)** `FONT_SIZE_1=110`, `borderw=11:bordercolor=black`
  - **2줄(노란색)** `FONT_SIZE_2=110`, `borderw=11:bordercolor=black`
  - y 위치: `y1 = max(200, HEADER_H - totalTextH - 60)`, `y2 = y1 + fs1 + 20`
- `SAFE_W=940` (좌우 각 70px 여백), `calcFontSize` 한글 비율: `kor*0.85 + other*0.55`
- 폰트 (`drawtext` 헤더용):
  - `FONTS_DIR` 환경변수 설정 시(Docker): `${FONTS_DIR}/SBAggro-Bold.ttf` 사용
  - Windows fallback: `C\\:/Windows/Fonts/malgunbd.ttf` (Malgun Gothic Bold)
  - Linux fallback: `/usr/share/fonts/truetype/nanum/NanumSquareEB.ttf` (NanumSquare ExtraBold)
- Dockerfile: `COPY scripts/fonts/SBAggro-Bold.ttf ./fonts/SBAggro-Bold.ttf` + `ENV FONTS_DIR=/app/fonts`
- `fontName`: `FONTS_DIR` 있으면 `'SB Aggro Bold'`, 없으면 OS 기본 fallback
- `text=` 파라미터 대신 반드시 `textfile=` 사용 — Linux에서 한국어 인코딩 깨짐 방지

## 자막 방식 (SRT → ASS 변환, BorderStyle=3 불투명 박스)

**`subtitles` 필터 사용 금지** — PlayResY=288 기본값으로 자막이 화면 밖으로 나감.

올바른 방식:
1. `ffmpeg -y -i subtitle.srt subtitle.ass` 로 ASS 파일 생성
2. ASS 파일 내용 직접 수정:
   - `PlayResX: 1080`, `PlayResY: 1920` 으로 교체
   - `Style: Default` 라인 전체 교체 (아래 값 사용)
3. `ass='subtitle.ass'` 필터로 burn-in

```
Style: Default,{FontName},76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,10,0,2,40,40,510,1
```

- FontName: `SB Aggro Bold` (Windows/Linux 공통, `fonts/SBAggro-Bold.ttf`)
- FontSize=76, **BorderStyle=3 (불투명 배경 박스)**, Outline=10(박스 패딩)
- PrimaryColour=**&H00FFFFFF (흰색)**, OutlineColour=&H00000000(검정 박스)
- Alignment=2 (하단 중앙), **MarginV=510** → 푸터 상단(y=1300) 직상단 배치
- affiliate CTA 자막 없음

## S3 출력 파일

```
jobs/{jobId}/output.mp4      — 최종 렌더링 영상
jobs/{jobId}/thumbnail.jpg   — FFmpeg 첫 프레임 캡처 썸네일 (-vframes 1)
```

- `thumbnailUrl = '/jobs/{jobId}/thumbnail'` 형태로 DB 저장
- API `GET /jobs/:id/thumbnail` 엔드포인트가 S3에서 프록시 서빙

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
