# API 키 및 자격증명 설정 가이드

이 프로젝트에서 필요한 5가지 자격증명을 한 곳에서 설명합니다.  
설정 완료 후 [전체 체크리스트](#전체-설정-완료-체크리스트)를 확인하세요.

---

## 섹션 1: Google Gemini API

script-worker가 YouTube Shorts 스크립트를 생성할 때 사용합니다.

### 발급 단계

**1단계 — Google AI Studio 접속**

URL: [https://aistudio.google.com](https://aistudio.google.com)

1. Google 계정으로 로그인
2. 좌측 사이드바에서 **[Get API key]** 클릭

**2단계 — API 키 생성**

1. **[Create API key]** 버튼 클릭
2. 프로젝트 선택 팝업에서:
   - 기존 Google Cloud 프로젝트가 있으면 선택
   - 없으면 **[Create API key in new project]** 클릭
3. 생성된 API 키 복사

> API 키는 생성 직후에만 전체 노출됩니다. 창을 닫기 전에 반드시 복사하세요.

**3단계 — `.env.local`에 저장**

```bash
GEMINI_API_KEY=AIzaSy...
```

### 무료 티어 한도

이 프로젝트는 `gemini-2.5-flash` 모델을 사용합니다.

| 항목 | 무료 티어 한도 |
|------|--------------|
| 요청 수 | 1,500 req/day |
| 입력 토큰 | 1,000,000 tokens/min |
| 출력 토큰 | 8,192 tokens/req |

쇼츠 스크립트 1건 생성 시 약 1~2 req 소비 → 하루 최대 약 750건 생성 가능.

### 동작 확인

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"안녕하세요"}]}]}'
```

응답 JSON의 `candidates[0].content.parts[0].text`에 값이 있으면 정상입니다.

---

## 섹션 2: YouTube Data API v3 + Analytics API + OAuth2

upload-worker의 YouTube 업로드 및 API 서버의 채널 동기화·Analytics 조회에 사용합니다.

### 필요한 자격증명

| 환경변수명 | 역할 | 계정 변경 시 |
|-----------|------|-------------|
| `YOUTUBE_CLIENT_ID` | 이 **프로그램(앱)** 자체의 신분증 | 변경 불필요 |
| `YOUTUBE_CLIENT_SECRET` | 위 신분증의 비밀번호 | 변경 불필요 |
| `YOUTUBE_REFRESH_TOKEN` | 특정 **사용자 계정**의 접근 허가증 | **반드시 교체** |

`CLIENT_ID`와 `CLIENT_SECRET`은 GCP 프로젝트가 동일하다면 업로드 대상 계정이 달라져도 그대로 유지됩니다.  
`REFRESH_TOKEN`은 "이 계정의 채널에 업로드해도 좋다"는 특정 사용자의 허가증이므로, 업로드 대상 계정이 바뀌면 반드시 새로 발급해야 합니다.

### 1단계: API 활성화

URL: [https://console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)

1. 상단 프로젝트 선택기에서 **[새 프로젝트]** 생성 또는 기존 프로젝트 선택
2. 검색창에 `YouTube Data API v3` 입력 후 클릭 → **[사용(Enable)]** 클릭
3. 검색창에 `YouTube Analytics API` 입력 후 클릭 → **[사용(Enable)]** 클릭

> YouTube Analytics API는 채널 sync 시 일별 views, watchTimeMinutes, estimatedRevenue 조회에 필요합니다.

### 2단계: OAuth 동의 화면 설정

URL: [https://console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience)

**2-1. 기본 설정**

1. User Type: **외부(External)** 선택 후 **[만들기]** 클릭
2. 앱 이름과 사용자 지원 이메일 입력
3. **[저장 후 계속]** 클릭 (스코프 단계는 건너뜁니다)

**2-2. 테스트 사용자 추가**

같은 페이지 하단 **Test users** 섹션:

1. **[+ ADD USERS]** 버튼 클릭
2. 업로드에 사용할 Google 계정 이메일 입력 후 **[저장]**

> 테스트 사용자 등록을 건너뛰면 업로드 시 `403 Access Denied` 오류가 발생합니다.

### 3단계: OAuth 클라이언트 ID 생성

URL: [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

1. **[+ 사용자 인증 정보 만들기]** → **[OAuth 클라이언트 ID]** 클릭
2. 애플리케이션 유형: **웹 애플리케이션** 선택
3. 승인된 리디렉션 URI 추가:
   ```
   https://developers.google.com/oauthplayground
   ```
4. **[만들기]** 클릭
5. 팝업에서 **클라이언트 ID**와 **보안 비밀** 복사 → `.env.local`에 저장:

```bash
YOUTUBE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-...
```

### 4단계: Refresh Token 발급

URL: [https://developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)

1. 우측 상단 톱니바퀴(Settings) 클릭
   - **Use your own OAuth credentials** 체크
   - 3단계에서 복사한 Client ID / Client Secret 입력 → **[Close]**

2. 좌측 Step 1 — 스코프 선택 (3개 모두 필요):
   - `YouTube Data API v3` → `https://www.googleapis.com/auth/youtube.upload` 선택
   - `YouTube Data API v3` → `https://www.googleapis.com/auth/youtube.readonly` 선택
   - `YouTube Analytics API` → `https://www.googleapis.com/auth/yt-analytics.readonly` 선택
   - **[Authorize APIs]** 클릭

> 세 스코프 모두 선택해야 합니다. 누락 시 채널 sync(`POST /channels/:id/sync`) 호출 시 403 오류가 발생합니다.

3. Google 계정 로그인 및 권한 **[허용]**
   - 경고창이 뜨면 **고급 → 이동** 클릭

4. Step 2 — **[Exchange authorization code for tokens]** 클릭

5. 응답 JSON에서 `refresh_token` 값 복사 → `.env.local`에 저장:

```bash
YOUTUBE_REFRESH_TOKEN=1//04...
```

### 업로드 대상 계정 전환 절차

다른 YouTube 채널로 업로드 대상을 변경할 때:

1. Google Cloud 콘솔 → OAuth 동의 화면 → Test users에 새 계정 이메일 등록
2. OAuth 2.0 Playground에서 **[Authorize APIs]** 클릭 후 **새 계정으로 로그인**
3. 스코프 3개(`youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`) 모두 선택
4. Step 2에서 새로 발급된 `refresh_token` 복사
5. `.env.local`의 `YOUTUBE_REFRESH_TOKEN` 값만 교체

> `YOUTUBE_CLIENT_ID`와 `YOUTUBE_CLIENT_SECRET`은 변경하지 않습니다.

> 웹 대시보드에서 채널을 연결할 경우(`GET /auth/youtube` → OAuth 플로우) refresh_token은 DB에 암호화 저장됩니다. 이 경우 `.env.local`의 `YOUTUBE_REFRESH_TOKEN`은 테스트 스크립트(`scripts/tools/test-upload.ts`) 전용으로만 사용됩니다.

### 일일 할당량

| 항목 | 수량 |
|------|------|
| 일일 할당량 | 10,000 units |
| 영상 업로드 1건 | 약 1,600 units 소비 |
| 하루 최대 업로드 | 약 6건 |

---

## 섹션 3: NextAuth Google OAuth

대시보드 로그인(Google 소셜 로그인)에 사용합니다.  
섹션 2에서 만든 OAuth 클라이언트를 그대로 재사용합니다. 새 클라이언트 생성은 불필요합니다.

### 리디렉션 URI 추가

URL: [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

1. **사용자 인증 정보** 페이지에서 섹션 2에서 만든 클라이언트 클릭
2. **승인된 리디렉션 URI** 섹션에서 **[URI 추가]**:
   ```
   http://localhost:3001/api/auth/callback/google
   ```
3. **[저장]** 클릭

이게 전부입니다. 기존 클라이언트에 URI 하나만 추가하면 됩니다.

### AUTH_SECRET 생성

```bash
# Node.js (권장)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# OpenSSL
openssl rand -base64 32
```

### `apps/web/.env.local` 설정

```bash
AUTH_SECRET=생성한_무작위_값
NEXTAUTH_SECRET=AUTH_SECRET과_동일한_값

AUTH_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3001

# 섹션 2에서 발급한 클라이언트와 동일한 값
GOOGLE_CLIENT_ID=YOUTUBE_CLIENT_ID와_동일한_값
GOOGLE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET와_동일한_값
```

> `NEXTAUTH_SECRET`과 `AUTH_SECRET`은 항상 동일한 값으로 설정합니다 (NextAuth v4/v5 호환).  
> `NEXTAUTH_URL`과 `AUTH_URL`도 동일하게 설정합니다.

---

## 섹션 4: Pexels API

render-worker가 씬별 배경 이미지를 검색·다운로드할 때 사용합니다.

### 발급 단계

URL: [https://www.pexels.com/api](https://www.pexels.com/api)

1. Pexels 계정으로 로그인
2. **[Your API Key]** 또는 **[Get Started]** 클릭
3. 발급된 API 키 복사 → `.env.local`에 저장:

```bash
PEXELS_API_KEY=563492ad6f91700001000001...
```

### 무료 티어 한도

| 항목 | 한도 |
|------|------|
| 월 요청 수 | 200,000 req |
| 시간당 요청 수 | 20,000 req |

쇼츠 1건 렌더링 시 씬 수(4~6개)만큼 소비 → 하루 수백 건 생성 시에도 무료 한도 내 충분.

---

## 섹션 5: ENCRYPTION_KEY

DB에 저장되는 `Channel.refreshToken`을 AES-256-GCM으로 암호화·복호화하는 데 사용합니다.

### 키 생성 방법

세 가지 방법 중 하나를 사용합니다. 모두 64자리 hex 문자열(32 bytes)을 생성합니다.

**방법 1 — Node.js (권장)**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**방법 2 — OpenSSL**

```bash
openssl rand -hex 32
```

**방법 3 — PowerShell (Windows)**

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

출력 예시:
```
a3f1c2d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

> 반드시 64자리 hex 문자열이어야 합니다 (32 bytes = 256 bit). 짧거나 길면 `Invalid key length` 오류가 발생합니다.

### `.env.local`에 저장

```bash
ENCRYPTION_KEY=a3f1c2d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### 프로덕션: AWS Secrets Manager 저장

```bash
aws secretsmanager create-secret \
  --name "youtube-shorts/encryption-key" \
  --secret-string "a3f1c2d4..."
```

URL: [https://console.aws.amazon.com/secretsmanager/](https://console.aws.amazon.com/secretsmanager/)

> 이 키를 분실하면 DB의 모든 `refreshToken`을 복호화할 수 없습니다. 채널을 전부 재연결해야 하므로 반드시 안전하게 보관하세요.

---

## 전체 설정 완료 체크리스트

루트 `.env.local`:

- [ ] `GEMINI_API_KEY` — Google AI Studio에서 발급
- [ ] `DATABASE_URL` — Docker Compose 로컬: `postgresql://postgres:postgres@localhost:5432/shorts`
- [ ] `AWS_REGION` — 기본값: `ap-northeast-2`
- [ ] `S3_BUCKET_NAME` — LocalStack 자동 생성 버킷명 확인
- [ ] `AWS_ACCESS_KEY_ID` — LocalStack: `test`
- [ ] `AWS_SECRET_ACCESS_KEY` — LocalStack: `test`
- [ ] `AWS_ENDPOINT_URL` — LocalStack: `http://localhost:4566`
- [ ] `YOUTUBE_CLIENT_ID` — Google Cloud Console에서 발급
- [ ] `YOUTUBE_CLIENT_SECRET` — Google Cloud Console에서 발급
- [ ] `YOUTUBE_REFRESH_TOKEN` — OAuth 2.0 Playground에서 발급
- [ ] `YOUTUBE_REDIRECT_URI` — `https://developers.google.com/oauthplayground`
- [ ] `PEXELS_API_KEY` — Pexels 대시보드에서 발급
- [ ] `ENCRYPTION_KEY` — 64자리 hex 직접 생성
- [ ] SQS 큐 URL 변수들 (`SQS_SCRIPT_QUEUE_URL`, `SQS_TTS_QUEUE_URL`, `SQS_SUBTITLE_QUEUE_URL`, `SQS_RENDER_QUEUE_URL`, `SQS_UPLOAD_QUEUE_URL`)

`apps/web/.env.local`:

- [ ] `AUTH_SECRET` / `NEXTAUTH_SECRET` — 동일한 무작위 값
- [ ] `AUTH_URL` / `NEXTAUTH_URL` — `http://localhost:3001`
- [ ] `GOOGLE_CLIENT_ID` — `YOUTUBE_CLIENT_ID`와 동일한 값
- [ ] `GOOGLE_CLIENT_SECRET` — `YOUTUBE_CLIENT_SECRET`와 동일한 값
- [ ] `NEXT_PUBLIC_API_URL` — `http://localhost:3000`

Google Cloud Console 설정:

- [ ] YouTube Data API v3 활성화
- [ ] YouTube Analytics API 활성화
- [ ] OAuth 동의 화면 생성 (외부 사용자)
- [ ] 테스트 사용자에 업로드 계정 이메일 등록
- [ ] OAuth 클라이언트에 리디렉션 URI 2개 등록:
  - `https://developers.google.com/oauthplayground`
  - `http://localhost:3001/api/auth/callback/google`

---

## 관련 문서

- [`env-vars.md`](./env-vars.md) — 전체 환경변수 레퍼런스
- [`local-setup.md`](./local-setup.md) — 로컬 환경 세팅 가이드
- [`../backend/security/encryption.md`](../backend/security/encryption.md) — 암호화 구현 상세
