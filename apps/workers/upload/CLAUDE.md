# @shorts/upload-worker

SQS upload-queue를 폴링해 YouTube Data API로 영상을 업로드하는 Lambda 워커.

파이프라인: upload-queue → [S3 영상 다운로드] → [영상 품질 검증] → [YouTube 업로드] → DB 상태 COMPLETED 업데이트

## 주요 모듈

- `handler.ts` — Lambda SQS 이벤트 핸들러 (upload-queue 수신)
- `uploader.ts` — YouTube Data API v3 업로드 (`uploadToYouTube`)
- `validator.ts` — ffprobe 기반 영상 품질 검증 (`validateVideo`)
- `crypto.ts` — AES-256-GCM refreshToken 복호화 (`decrypt`)
- `local-runner.ts` — Docker Compose 환경용 SQS Long Polling 루프
- `env.ts` — 환경변수 파싱 (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `ENCRYPTION_KEY`)

## 에러 메시지 인코딩 처리

Windows 로컬 환경에서 `failReason`에 깨진 문자(`�`) 저장 방지:

```typescript
const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, '?');
```

`failReason` DB 저장 시 `toSafeMsg(err)` 사용.

## 처리 흐름

1. SQS 메시지 수신: `{ jobId, channelId, videoS3Key }`
2. DB에서 채널의 암호화된 refreshToken 조회 → AES-256-GCM 복호화
3. Job의 scriptContent(title, description, hashtags) 조회
4. S3에서 영상(`jobs/{jobId}/output.mp4`) 다운로드 → `/tmp/{jobId}-output.mp4` 저장
5. ffprobe로 업로드 전 영상 품질 검증 (`validateVideo()`) — 실패 시 즉시 FAILED
   - 비디오/오디오 스트림 존재 여부
   - 해상도: 1080×1920 필수
   - 길이: 5초 이상, 60초 이하
   - 영상/오디오 길이 차이 2초 이내 (화면 정지 의심 감지)
6. YouTube Data API v3로 영상 업로드
7. DB 업데이트: `youtubeVideoId`, `privacyStatus: 'public'`, `status: 'COMPLETED'`, `completedAt`
   - `thumbnailUrl: https://i.ytimg.com/vi/{videoId}/hqdefault.jpg` 를 직접 DB에 저장 (`setYouTubeThumbnail()` 제거됨)
8. 실패 시: `status: 'FAILED'`, `failReason` 기록 후 예외 재throw (SQS 재시도)

## YouTube 업로드 메타데이터

```
title:       "{scriptContent.title} #Shorts"  (이미 포함된 경우 중복 추가 안 함)
description: "{scriptContent.description}\n\n{hashtags.join(' ')}"
categoryId:  "25"  (뉴스·정치)
privacyStatus:           "public"
selfDeclaredMadeForKids: false
containsSyntheticMedia:  true
```

## 보안

- refreshToken은 DB에서 암호화된 형태로 조회 → `crypto.ts`의 `decrypt(token, ENCRYPTION_KEY)`로 복호화 (AES-256-GCM, 형식: `${iv.hex}:${authTag.hex}:${encrypted.hex}`)
- access_token은 DB에 저장하지 않음. OAuth2Client가 refresh_token으로 런타임에 자동 발급
