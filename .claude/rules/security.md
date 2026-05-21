# 보안 규칙

## 토큰 관리 (절대 원칙)
- `access_token` DB 저장 **절대 금지** — 런타임에서 `refresh_token`으로 재발급
- `refresh_token`은 AES-256-GCM 암호화 후 저장
- 암호화 형식: `${iv.hex}:${authTag.hex}:${encrypted.hex}`
- `ENCRYPTION_KEY`는 AWS Secrets Manager에서 주입 (`.env.local` 직접 작성은 로컬 개발 전용)

```typescript
// ✅ 올바른 패턴 — refresh_token으로 access_token 재발급
const oauth2Client = new google.auth.OAuth2(...);
oauth2Client.setCredentials({ refresh_token: decryptedToken });
const { token } = await oauth2Client.getAccessToken(); // 런타임 발급
```

## 환경변수 보안
- `.env.local` 파일 Git 커밋 **절대 금지** (`.gitignore` 확인)
- `.env.example`에는 키 이름만 작성, 실제 값 작성 금지
- 실제 시크릿은 AWS Secrets Manager에 저장

## OAuth 스코프 (최소 권한)
```
youtube.upload        — 영상 업로드
youtube.readonly      — 채널 정보 조회
yt-analytics.readonly — Analytics API
```
추가 스코프 요청 시 반드시 사용 목적 명시.

## YouTube 업로드 필수 메타데이터
```typescript
{
  categoryId: '25',              // 뉴스·정치 (변경 금지)
  containsSyntheticMedia: true,  // AI 생성 공시 (법적 의무)
  // description에 AI 공시 문구 포함 필수
}
```

## 금지 사항
- SQL 직접 쿼리 (Prisma 미사용 시 injection 위험)
- 사용자 입력을 쉘 명령어에 직접 사용
- API 키를 로그에 출력 (`logger.info({ apiKey })` 형태 금지)
- Docker 이미지에 `.env` 파일 포함
