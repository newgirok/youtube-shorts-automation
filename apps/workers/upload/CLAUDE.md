# @shorts/upload-worker

SQS upload-queue를 폴링해 YouTube Data API로 영상을 업로드하는 Lambda 워커.

파이프라인: upload-queue → [S3 영상 다운로드] → [YouTube 업로드] → DB 상태 COMPLETED 업데이트

## 처리 흐름

1. SQS 메시지 수신: `{ jobId, channelId, videoS3Key }`
2. DB에서 채널의 암호화된 refreshToken 조회 → AES-256-GCM 복호화
3. Job의 scriptContent(title, description, hashtags) 조회
4. S3에서 영상(`jobs/{jobId}/output.mp4`) 다운로드 → `/tmp/{jobId}-output.mp4` 저장
5. YouTube Data API v3로 영상 업로드
6. DB 업데이트: `youtubeVideoId`, `privacyStatus: 'public'`, `status: 'COMPLETED'`, `completedAt`
7. 실패 시: `status: 'FAILED'`, `failReason` 기록 후 예외 재throw (SQS 재시도)

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

- refreshToken은 DB에서 암호화된 형태로 조회 → `decrypt(token, ENCRYPTION_KEY)`로 복호화
- access_token은 DB에 저장하지 않음. OAuth2Client가 refresh_token으로 런타임에 자동 발급
