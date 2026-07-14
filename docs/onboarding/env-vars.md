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
| `NODE_ENV` |  | `development` | 실행 환경 (`development` \| `test` \| `production`) |
| `DATABASE_URL` |  | - | PostgreSQL 연결 문자열 — Transaction Pooler (포트 6543), 런타임 전용 |
| `DIRECT_URL` |  | - | PostgreSQL 직접 연결 — Session Pooler (포트 5432), 마이그레이션 전용 |
| `AWS_REGION` |  | `ap-northeast-2` | AWS 리전 |
| `S3_BUCKET_NAME` |  | - | S3 버킷명 |
| `LOG_LEVEL` | - | `info` | Pino 로그 레벨 (`trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal`) |
| `AWS_ACCESS_KEY_ID` | - | - | AWS 액세스 키 (LocalStack: `test`) |
| `AWS_SECRET_ACCESS_KEY` | - | - | AWS 시크릿 키 (LocalStack: `test`) |
| `AWS_ENDPOINT_URL` | - | - | LocalStack 엔드포인트 (로컬: `http://localhost:4566`) |

### apps/api

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_SCRIPT_QUEUE_URL` |  | script-worker SQS 큐 URL |
| `YOUTUBE_CLIENT_ID` |  | Google Cloud OAuth2 클라이언트 ID |
| `YOUTUBE_CLIENT_SECRET` |  | Google Cloud OAuth2 클라이언트 시크릿 |
| `YOUTUBE_REDIRECT_URI` |  | OAuth2 리다이렉트 URI |
| `ENCRYPTION_KEY` |  | AES-256-GCM 암호화 키 (64자리 hex = 32 bytes) |
| `WEB_ORIGIN` | - | CORS 허용 오리진 |
| `API_INTERNAL_SECRET` | - | Web → API 내부 통신 인증 키 (openssl rand -hex 32 로 생성) |
| `API_BASE_URL` | - | 썸네일 URL 절대 경로 생성용 (기본값: `http://localhost:3000`) |

### apps/workers/script

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `GEMINI_API_KEY` |  | Google Gemini API 인증 키 |
| `SQS_TTS_QUEUE_URL` |  | tts-worker SQS 큐 URL |

### apps/workers/tts

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_SUBTITLE_QUEUE_URL` |  | subtitle-worker SQS 큐 URL |
| `EDGE_TTS_PATH` | - | edge-tts 실행 경로 (Docker: `edge-tts`, Windows: 절대 경로) |

### apps/workers/subtitle

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_SUBTITLE_QUEUE_URL` |  | 수신 큐 URL |
| `SQS_RENDER_QUEUE_URL` |  | render-worker SQS 큐 URL |
| `PYTHON_PATH` | - | Python 실행 경로 (기본값: `python`, 현재 미사용 — 향후 확장 대비) |

### apps/workers/render

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SQS_RENDER_QUEUE_URL` |  | 수신 큐 URL |
| `SQS_UPLOAD_QUEUE_URL` |  | upload-worker SQS 큐 URL |
| `PEXELS_API_KEY` |  | Pexels 이미지/동영상 검색 API 키 (pexels.com/api에서 발급, 배경 소스용) |
| `FFMPEG_PATH` | - | FFmpeg 실행 경로 (Docker: `ffmpeg`, Windows: 절대 경로) |
| `FFPROBE_PATH` | - | ffprobe 실행 경로 (Docker: `ffprobe`, Windows: 절대 경로) |
| `FONTS_DIR` | - | 폰트 디렉토리 경로 (Docker: `/app/fonts`, 미설정 시 OS 기본 폰트 fallback) |

### apps/workers/upload

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `YOUTUBE_CLIENT_ID` |  | Google Cloud OAuth2 클라이언트 ID |
| `YOUTUBE_CLIENT_SECRET` |  | Google Cloud OAuth2 클라이언트 시크릿 |
| `ENCRYPTION_KEY` |  | AES-256-GCM 암호화 키 (64자리 hex = 32 bytes) |
| `FFPROBE_PATH` | - | ffprobe 실행 경로 (Docker: `ffprobe`, Windows: 절대 경로). 업로드 전 영상 품질 검증용 |

### apps/web/.env.local

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `AUTH_SECRET` |  | NextAuth v5 JWT 서명 시크릿 (`openssl rand -base64 32`) |
| `NEXTAUTH_SECRET` |  | NextAuth v4 호환용 (`AUTH_SECRET`과 동일 값) |
| `AUTH_URL` |  | NextAuth v5 앱 URL (`http://localhost:3001`) |
| `NEXTAUTH_URL` |  | NextAuth v4 호환용 (`AUTH_URL`과 동일 값) |
| `GOOGLE_CLIENT_ID` |  | NextAuth Google 로그인용 OAuth2 Client ID (루트 `YOUTUBE_CLIENT_ID`와 동일 클라이언트 재사용 가능) |
| `GOOGLE_CLIENT_SECRET` |  | NextAuth Google 로그인용 OAuth2 Client Secret (루트 `YOUTUBE_CLIENT_SECRET`와 동일) |
| `NEXT_PUBLIC_API_URL` |  | NestJS API 서버 주소 (`http://localhost:3000`) — 브라우저에서 직접 호출 시 사용 |
| `API_INTERNAL_URL` | - | 서버 컴포넌트 전용 API 주소 (Docker 내부 호스트명 등). 미설정 시 `NEXT_PUBLIC_API_URL` 사용 |
| `NEXT_PUBLIC_API_SECRET` | - | Web → API 내부 통신 인증 키 (`openssl rand -hex 32`). 루트 `API_INTERNAL_SECRET`과 동일 값 설정 |

---

## AWS SSM Parameter Store (프로덕션)

Lambda는 `.env` 파일 없이 SSM Parameter Store에서 값을 가져온다.

| SSM 파라미터 이름 | 타입 | 값 설명 |
|---|---|---|
| `shorts.prod.DATABASE_URL` | SecureString | Supabase Transaction Pooler URL (port 6543) |
| `shorts.prod.GEMINI_API_KEY` | SecureString | Google Gemini API 키 |
| `shorts.prod.YOUTUBE_CLIENT_ID` | String | OAuth2 클라이언트 ID |
| `shorts.prod.YOUTUBE_CLIENT_SECRET` | SecureString | OAuth2 클라이언트 시크릿 |
| `shorts.prod.ENCRYPTION_KEY` | SecureString | AES-256-GCM 키 (64자리 hex) |
| `shorts.prod.PEXELS_API_KEY` | SecureString | Pexels API 키 (render-worker) |
| `shorts.prod.API_INTERNAL_SECRET` | SecureString | Web → API 내부 인증 키 |
| `shorts.prod.SQS_SCRIPT_QUEUE_URL` | String | prod-script-queue URL |
| `shorts.prod.YOUTUBE_REDIRECT_URI` | String | OAuth callback URL (`{api-gw-url}/auth/youtube/callback`) |
| `shorts.prod.WEB_ORIGIN` | String | CORS 허용 오리진 (프로덕션 web URL) |

> **점 구분자 주의**: 파라미터 이름에 슬래시(`/`) 없이 점(`.`)을 사용합니다. SSM 경로 패턴이 아닌 일반 이름 형식입니다.

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
