# 환경변수 가이드

## 파일 구조

```
youtube-shorts-automation/
├── .env.local              ← API, workers 공통 (Git 제외, localhost 기준)
├── .env.example            ← 루트 환경변수 가이드라인 (Git 추적)
└── apps/
    └── web/
        ├── .env.local      ← Next.js 전용 변수 (Git 제외)
        └── .env.example    ← web 환경변수 가이드라인 (Git 추적)
```

### 파일을 분리하는 이유

**Next.js는 자신의 project root(`apps/web/`)에서만 `.env` 파일을 읽습니다.**  
루트 `.env.local`은 Next.js dev server에서 로드되지 않습니다.

| 파일 | 읽는 주체 | 저장 내용 |
|------|-----------|-----------|
| 루트 `.env.local` | NestJS API, workers | DB, SQS, S3, YouTube API, Gemini 키 |
| `apps/web/.env.local` | Next.js dev server | NextAuth 시크릿, Google OAuth, API URL |

### localhost vs Docker 호스트명

루트 `.env.local`은 **로컬 직접 실행** 기준으로 `localhost` 주소를 사용합니다.  
Docker Compose로 실행할 때는 `docker-compose.yml`의 `x-docker-env` 앵커가 컨테이너 내부 호스트명(`postgres:5432`, `localstack:4566`)으로 자동 오버라이드하므로, 개발자가 별도로 수정할 필요가 없습니다.

---

## 초기 설정

```bash
# 루트 환경변수 파일 생성
cp .env.example .env.local

# Next.js 전용 환경변수 파일 생성
cp apps/web/.env.example apps/web/.env.local
```

각 변수의 실제 값 발급 방법은 [`api-keys.md`](./api-keys.md)를 참고하세요.

> 환경변수를 새로 추가할 경우 해당 패키지의 `src/env.ts` Zod 스키마에도 함께 추가해야 합니다.

---

## 전체 변수 레퍼런스

### 공통 (`@shorts/shared` BaseEnvSchema)

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `NODE_ENV` | ✅ | `development` | 실행 환경 (`development` \| `test` \| `production`) |
| `DATABASE_URL` | ✅ | - | PostgreSQL 연결 문자열 (로컬: `localhost:5432`) |
| `AWS_REGION` | ✅ | `ap-northeast-2` | AWS 리전 |
| `S3_BUCKET_NAME` | ✅ | - | S3 버킷명 |
| `AWS_ACCESS_KEY_ID` | - | - | AWS 액세스 키 (LocalStack: `test`) |
| `AWS_SECRET_ACCESS_KEY` | - | - | AWS 시크릿 키 (LocalStack: `test`) |
| `AWS_ENDPOINT_URL` | - | - | LocalStack 엔드포인트 (로컬: `http://localhost:4566`) |

### apps/api

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_SCRIPT_QUEUE_URL` | ✅ | script-worker SQS 큐 URL |
| `YOUTUBE_CLIENT_ID` | ✅ | Google Cloud OAuth2 클라이언트 ID |
| `YOUTUBE_CLIENT_SECRET` | ✅ | Google Cloud OAuth2 클라이언트 시크릿 |
| `YOUTUBE_REDIRECT_URI` | ✅ | OAuth2 리다이렉트 URI |
| `ENCRYPTION_KEY` | ✅ | AES-256-GCM 암호화 키 (64자리 hex = 32 bytes) |
| `WEB_ORIGIN` | - | CORS 허용 오리진 |
| `API_INTERNAL_SECRET` | - | Web → API 내부 통신 인증 키 (openssl rand -hex 32 로 생성) |

### apps/workers/script

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API 인증 키 |
| `SQS_TTS_QUEUE_URL` | ✅ | tts-worker SQS 큐 URL |

### apps/workers/tts

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_SUBTITLE_QUEUE_URL` | ✅ | subtitle-worker SQS 큐 URL |
| `EDGE_TTS_PATH` | - | edge-tts 실행 경로 (Docker: `edge-tts`, Windows: 절대 경로) |

### apps/workers/subtitle

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_SUBTITLE_QUEUE_URL` | ✅ | 수신 큐 URL |
| `SQS_RENDER_QUEUE_URL` | ✅ | render-worker SQS 큐 URL |
| `PYTHON_PATH` | - | Python 실행 경로 (Docker: `python`, Windows: 절대 경로) |

### apps/workers/render

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_RENDER_QUEUE_URL` | ✅ | 수신 큐 URL |
| `SQS_UPLOAD_QUEUE_URL` | ✅ | upload-worker SQS 큐 URL |
| `PEXELS_API_KEY` | ✅ | Pexels 이미지 검색 API 키 (pexels.com/api에서 발급, 배경 이미지 생성용) |
| `FFMPEG_PATH` | - | FFmpeg 실행 경로 (Docker: `ffmpeg`, Windows: 절대 경로) |
| `FFPROBE_PATH` | - | ffprobe 실행 경로 (Docker: `ffprobe`, Windows: 절대 경로) |

### apps/workers/upload

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `YOUTUBE_CLIENT_ID` | ✅ | Google Cloud OAuth2 클라이언트 ID |
| `YOUTUBE_CLIENT_SECRET` | ✅ | Google Cloud OAuth2 클라이언트 시크릿 |
| `YOUTUBE_REFRESH_TOKEN` | ✅ | YouTube 채널 OAuth2 refresh token |
| `ENCRYPTION_KEY` | ✅ | AES-256-GCM 암호화 키 |

### apps/web/.env.local

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `AUTH_SECRET` | ✅ | NextAuth v5 JWT 서명 시크릿 |
| `NEXTAUTH_SECRET` | ✅ | NextAuth v4 호환용 (`AUTH_SECRET`과 동일 값) |
| `AUTH_URL` | ✅ | NextAuth v5 앱 URL (`http://localhost:3001`) |
| `NEXTAUTH_URL` | ✅ | NextAuth v4 호환용 (`AUTH_URL`과 동일 값) |
| `GOOGLE_CLIENT_ID` | ✅ | NextAuth Google 로그인용 OAuth2 Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | NextAuth Google 로그인용 OAuth2 Client Secret |
| `NEXT_PUBLIC_API_URL` | ✅ | NestJS API 서버 주소 (`http://localhost:3000`) |

---

## 보안 규칙

- **`access_token` 저장 금지**: 어떤 변수명으로도 `.env.local`에 저장하지 않습니다. 런타임에서 `refresh_token`으로 자동 재발급됩니다.
- **`ENCRYPTION_KEY` 프로덕션 제한**: 프로덕션 환경에서는 환경 파일 직접 작성 금지. AWS Secrets Manager에 저장 후 환경변수로 주입합니다.
- **`.env.local` Git 제외**: `.gitignore`에 의해 Git 추적에서 제외됩니다. 절대 커밋하지 마세요.
- **`.env.example`에 시크릿 금지**: `.env.example`에는 키 이름과 설명만 기재합니다. 실제 값은 넣지 않습니다.

---

## 관련 문서

- [`api-keys.md`](./api-keys.md) — API 키 발급 상세 절차
- [`../backend/security/encryption.md`](../backend/security/encryption.md) — AES-256-GCM 암호화 구현 상세
