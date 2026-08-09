# 보안 규칙

## 토큰 관리 (절대 원칙)
- `access_token` DB 저장 **절대 금지** — 런타임에서 `refresh_token`으로 재발급
- `refresh_token`은 AES-256-GCM 암호화 후 저장
- 암호화 형식: `${iv.hex}:${authTag.hex}:${encrypted.hex}`
- `ENCRYPTION_KEY`는 AWS Secrets Manager에서 주입 (`.env.local` 직접 작성은 로컬 개발 전용)

```typescript
//  올바른 패턴 — refresh_token으로 access_token 재발급
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

## SQS 메시지 검증 (Worker 공통)
Worker handler.ts에서 `JSON.parse(record.body) as T` 타입 단언 사용 금지 — 반드시 Zod 스키마로 런타임 검증:

```typescript
import { z } from 'zod';

const SQSMessageSchema = z.object({
  jobId: z.string().min(1),
  channelId: z.string().min(1),
  // ...워커별 추가 필드
});

// try 블록 바깥에서 파싱 — 필드 누락 시 ZodError가 SQS DLQ로 직행
const { jobId, channelId } = SQSMessageSchema.parse(JSON.parse(record.body));
```

`try` 블록 안에 넣으면 `jobId`가 없어 catch 블록에서 DB 업데이트 불가 — 반드시 `try` 외부에서 파싱.

## 업로드 멱등성 (upload-worker 필수)
SQS 재처리 시 YouTube 중복 업로드 방지 — `UPLOAD_PROCESSING` 상태 업데이트 **전에** `youtubeVideoId` 존재 여부 확인:

```typescript
const job = await prisma.job.findUnique({
  where: { id: jobId },
  select: { youtubeVideoId: true, scriptContent: true },
});

if (!job) { log.warn('Job 없음 — 스킵'); continue; }
if (job.youtubeVideoId) {
  log.info({ youtubeVideoId: job.youtubeVideoId }, '이미 업로드됨 — 재처리 스킵');
  continue;
}
// 이후 status 업데이트 → 업로드 진행
```

## IAM 최소 권한 패턴 (Terraform)
Lambda Worker IAM 정책에서 `Resource = "*"` 사용 금지 — 프로젝트 네임스페이스로 범위 제한:

```hcl
# SQS: 환경별 큐만 허용
Resource = "arn:aws:sqs:ap-northeast-2:${var.account_id}:${var.env}-*"

# SSM: 프로젝트 파라미터만 허용
Resource = "arn:aws:ssm:ap-northeast-2:${var.account_id}:parameter/shorts.${var.env}.*"

# EventBridge: API가 채널별 규칙을 동적 생성하므로 rule/* 허용 (account_id는 고정)
Resource = "arn:aws:events:ap-northeast-2:${var.account_id}:rule/*"
```

IAM 모듈에 `account_id` 변수를 추가하고 `data.aws_caller_identity.current.account_id`로 주입.

## S3 서버사이드 암호화
S3 버킷에 SSE-AES256 필수 — S3 관리 키 사용, 추가 비용 없음:

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "bucket" {
  bucket = aws_s3_bucket.bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

## 금지 사항
- SQL 직접 쿼리 (Prisma 미사용 시 injection 위험)
- 사용자 입력을 쉘 명령어에 직접 사용
- API 키를 로그에 출력 (`logger.info({ apiKey })` 형태 금지)
- Docker 이미지에 `.env` 파일 포함
