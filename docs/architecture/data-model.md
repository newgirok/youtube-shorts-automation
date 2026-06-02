# 데이터 모델

이 문서는 플랫폼의 Prisma 스키마 전체와 각 필드의 설명을 제공합니다. 파이프라인 흐름과의 연관성은 [파이프라인 흐름](./pipeline-flow.md)을 참고하세요.

---

## Prisma 스키마 전체

```prisma
// packages/shared/prisma/schema.prisma

enum JobStatus {
  PENDING
  SCRIPT_PROCESSING
  TTS_PROCESSING
  SUBTITLE_PROCESSING
  RENDER_PROCESSING
  UPLOAD_PROCESSING
  COMPLETED
  FAILED
}

model Channel {
  id                String    @id @default(cuid())
  youtubeId         String    @unique
  name              String
  niche             String
  refreshToken      String    // AES-256-GCM 암호화
  uploadSchedule    String?
  schedulerEnabled  Boolean   @default(false)
  schedulerCategory String    @default("top")
  affiliateUrl      String?
  isActive          Boolean   @default(true)
  subscriberCount   Int       @default(0)
  totalViews        BigInt    @default(0)
  isYPPQualified    Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  jobs              Job[]
  analytics         ChannelAnalytics[]
}

model Job {
  id               String    @id @default(cuid())
  channelId        String
  topic            String
  status           JobStatus @default(PENDING)
  retryCount       Int       @default(0)
  failReason       String?
  scriptContent    Json?
  audioS3Key       String?
  subtitleS3Key    String?
  videoS3Key       String?
  youtubeVideoId   String?
  thumbnailUrl     String?
  privacyStatus    String    @default("public")
  viewCount        BigInt    @default(0)
  likeCount        BigInt    @default(0)
  startedAt        DateTime?
  completedAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  channel          Channel   @relation(fields: [channelId], references: [id])
}

model ChannelAnalytics {
  id                String   @id @default(cuid())
  channelId         String
  date              DateTime @db.Date
  views             BigInt   @default(0)
  subscribers       Int      @default(0)
  estimatedRevenue  Float    @default(0)
  watchTimeMinutes  BigInt   @default(0)
  channel           Channel  @relation(fields: [channelId], references: [id])
  @@unique([channelId, date])
}
```

---

## 마이그레이션 이력

| 마이그레이션 | 변경 내용 |
|---|---|
| `20260511123832_init` | 초기 스키마 (Channel, Job, ChannelAnalytics, JobStatus) |
| `20260519000000_add_watch_time_minutes` | `ChannelAnalytics.watchTimeMinutes BigInt @default(0)` 추가 |
| `20260520000000_add_privacy_status` | `Job.privacyStatus String @default("public")` 추가 |
| `20260525152454_add_scheduler_fields` | `Channel.schedulerEnabled`, `schedulerCategory`, `uploadSchedule String?` 변경 |
| `20260525180000_add_job_thumbnail_url` | `Job.thumbnailUrl String?` 추가 |
| `20260525190000_drop_channel_analytics` | ChannelAnalytics 삭제 |
| `20260525200000_restore_channel_analytics` | ChannelAnalytics 복원 |

---

## ER 다이어그램

```
┌──────────────────────────────────────┐
│              Channel                  │
│──────────────────────────────────────│
│ id              String (PK, cuid)    │
│ youtubeId       String (UNIQUE)      │
│ name            String               │
│ niche           String               │
│ refreshToken      String (암호화)     │
│ uploadSchedule    String?            │
│ schedulerEnabled  Boolean            │
│ schedulerCategory String             │
│ affiliateUrl      String?            │
│ isActive        Boolean              │
│ subscriberCount Int                  │
│ totalViews      BigInt               │
│ isYPPQualified  Boolean              │
│ createdAt       DateTime             │
│ updatedAt       DateTime             │
└──────────────┬───────────────────────┘
               │ 1
               │
               │ N
┌──────────────▼───────────────────────┐
│                Job                    │
│──────────────────────────────────────│
│ id             String (PK, cuid)     │
│ channelId      String (FK → Channel) │
│ topic          String                │
│ status         JobStatus             │
│ retryCount     Int                   │
│ failReason     String?               │
│ scriptContent  Json?                 │
│ audioS3Key     String?               │
│ subtitleS3Key  String?               │
│ videoS3Key     String?               │
│ youtubeVideoId String?               │
│ thumbnailUrl   String?               │
│ privacyStatus  String                │
│ viewCount      BigInt                │
│ likeCount      BigInt                │
│ startedAt      DateTime?             │
│ completedAt    DateTime?             │
│ createdAt      DateTime              │
│ updatedAt      DateTime              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│          ChannelAnalytics             │
│──────────────────────────────────────│
│ id               String (PK, cuid)  │
│ channelId        String (FK → Channel)│
│ date             DateTime (Date)     │
│ views            BigInt              │
│ subscribers      Int                 │
│ estimatedRevenue Float               │
│ watchTimeMinutes BigInt              │
│ ──────────────────────────────────── │
│ UNIQUE (channelId, date)             │
└──────────────────────────────────────┘
```

---

## Channel 모델 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `String` | CUID 기반 Primary Key |
| `youtubeId` | `String` | YouTube 채널 고유 ID (예: `UCxxxxxx`), UNIQUE 제약 |
| `name` | `String` | 채널 표시 이름 |
| `niche` | `String` | 채널 콘텐츠 주제 카테고리 (예: `"재테크"`, `"IT 뉴스"`) |
| `refreshToken` | `String` | YouTube OAuth2 refresh_token (AES-256-GCM 암호화) |
| `uploadSchedule` | `String?` | cron 표현식 — 일일 업로드 시간 (null이면 스케줄 미설정) |
| `schedulerEnabled` | `Boolean` | 자동 업로드 스케줄러 활성화 여부 |
| `schedulerCategory` | `String` | 뉴스 자동 수집 카테고리 (`top` \| `politics` \| `business` \| `nation`) |
| `affiliateUrl` | `String?` | 쿠팡 파트너스 링크 (null이면 CTA 자막 미삽입) |
| `isActive` | `Boolean` | 비활성화 시 EventBridge 스케줄에서 제외 |
| `subscriberCount` | `Int` | YouTube Analytics에서 주기적으로 동기화 |
| `totalViews` | `BigInt` | 채널 전체 누적 조회수 (BigInt 이유: 수억 이상 가능) |
| `isYPPQualified` | `Boolean` | YPP 달성 여부 (2단계 기준: 비즈니스 규칙 참고) |
| `createdAt` | `DateTime` | 채널 최초 연결 시각 |
| `updatedAt` | `DateTime` | 마지막 정보 갱신 시각 |

### refreshToken AES-256-GCM 암호화

`refreshToken` 필드에는 YouTube OAuth2 `refresh_token`을 **AES-256-GCM**으로 암호화하여 저장합니다. `access_token`은 DB에 저장하지 않으며, 런타임에 `refresh_token`으로 재발급합니다.

암호화 키 설정 방법은 [암호화 키 설정 가이드](../runbook/encryption-key-setup.md)를 참고하세요. 보안 규칙 전체는 [비즈니스 규칙 — 보안](../product/business-rules.md#보안-규칙)을 참고하세요.

### uploadSchedule cron 형식

EventBridge Scheduler는 **Unix cron** 형식을 사용합니다:

```
"0 9 * * *"   → 매일 오전 9시 (UTC 기준)
"0 18 * * *"  → 매일 오후 6시 (UTC 기준, KST 기준 익일 03시)
"30 0 * * *"  → 매일 오전 00:30 (UTC)
```

| 필드 | 의미 | 예시 |
|---|---|---|
| 분 (0~59) | 업로드 분 | `0` = 정각 |
| 시 (0~23) | 업로드 시 (UTC) | `9` = 오전 9시 UTC |
| 일 (1~31) | `*` = 매일 | |
| 월 (1~12) | `*` = 매월 | |
| 요일 (0~6) | `*` = 매일 | |

---

## Job 모델 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `String` | CUID 기반 Primary Key |
| `channelId` | `String` | 연결된 Channel의 FK |
| `topic` | `String` | 영상 생성 주제 (예: `"2025년 ETF 투자 전략"`) |
| `status` | `JobStatus` | 현재 파이프라인 단계 ([상태 전이 참고](./pipeline-flow.md#job-상태-전이-다이어그램)) |
| `retryCount` | `Int` | SQS 재시도 횟수 (DLQ `maxReceiveCount=3` 기준) |
| `failReason` | `String?` | 마지막 실패 원인 메시지 (null이면 성공) |
| `scriptContent` | `Json?` | Gemini가 생성한 스크립트 JSON 전체 (DB 캐시) |
| `audioS3Key` | `String?` | S3 경로: `jobs/{jobId}/audio.mp3` |
| `subtitleS3Key` | `String?` | S3 경로: `jobs/{jobId}/subtitle.srt` |
| `videoS3Key` | `String?` | S3 경로: `jobs/{jobId}/output.mp4` |
| `youtubeVideoId` | `String?` | 업로드 완료 후 YouTube 영상 ID |
| `thumbnailUrl` | `String?` | 썸네일 URL. render 완료 시 `/jobs/{jobId}/thumbnail` (API 프록시 경로); upload 완료 시 `https://i.ytimg.com/vi/{videoId}/hqdefault.jpg` |
| `privacyStatus` | `String` | YouTube 영상 공개 상태 (기본값: `"public"`). sync 시 YouTube API에서 실시간 갱신. |
| `viewCount` | `BigInt` | YouTube Analytics에서 동기화한 조회수 |
| `likeCount` | `BigInt` | YouTube Analytics에서 동기화한 좋아요 수 |
| `startedAt` | `DateTime?` | 첫 번째 Worker 시작 시각 |
| `completedAt` | `DateTime?` | `COMPLETED` 전환 시각 |
| `createdAt` | `DateTime` | Job 생성 시각 |
| `updatedAt` | `DateTime` | 마지막 상태 변경 시각 |

### privacyStatus 값

upload-worker가 YouTube 업로드 완료 시 `"public"`으로 저장합니다. 이후 `POST /channels/:id/sync` 호출 시 `videos.list(part: status)` 응답의 실제 값으로 덮어씁니다. YouTube에서 영상이 삭제된 경우 해당 Job의 `status`는 `FAILED`, `failReason`은 `'유튜브에서 영상이 삭제되었습니다.'`로 업데이트됩니다.

### viewCount / likeCount 가 BigInt인 이유

YouTube 조회수는 수억 단위를 초과할 수 있습니다. JavaScript의 `Number` 타입은 2^53-1(약 9,007조)까지 안전하게 표현되지만, PostgreSQL의 `INT` (32비트)는 약 21억까지만 가능합니다. 안전한 조회수 저장을 위해 `BigInt` (64비트)를 사용합니다.

마찬가지로 `Channel.totalViews`도 `BigInt`로 선언되어 있습니다.

---

## ChannelAnalytics 모델 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `String` | CUID 기반 Primary Key |
| `channelId` | `String` | 연결된 Channel의 FK |
| `date` | `DateTime` (`@db.Date`) | 집계 날짜 (날짜만, 시각 없음) |
| `views` | `BigInt` | 해당 날짜 조회수 |
| `subscribers` | `Int` | 해당 날짜 구독자 수 스냅샷 |
| `estimatedRevenue` | `Float` | 예상 수익 (USD, YPP 달성 이후) |
| `watchTimeMinutes` | `BigInt` | 해당 날짜 총 시청 시간 (분 단위). YouTube Analytics `estimatedMinutesWatched` 지표. |

`@@unique([channelId, date])` 제약으로 채널당 날짜별 중복 집계를 방지합니다. Upsert 패턴으로 매일 덮어씁니다.

### watchTimeMinutes 수집 방식

`POST /channels/:id/sync` 호출 시 YouTube Analytics API(`youtubeAnalytics.reports.query`)로 최근 30일치 일별 `estimatedMinutesWatched` 지표를 수집해 upsert합니다. YPP(YouTube Partner Program) 자격 판단(연간 4,000시간)에 활용됩니다.

---

## JobStatus enum 설명

| 값 | 설명 |
|---|---|
| `PENDING` | Job 생성 직후 초기 상태 |
| `SCRIPT_PROCESSING` | script-worker가 Gemini API 호출 중 |
| `TTS_PROCESSING` | tts-worker가 음성 합성 중 |
| `SUBTITLE_PROCESSING` | subtitle-worker가 자막 생성 중 |
| `RENDER_PROCESSING` | render-worker가 FFmpeg 영상 합성 중 |
| `UPLOAD_PROCESSING` | upload-worker가 YouTube API 업로드 중 |
| `COMPLETED` | 파이프라인 전 단계 완료, YouTube 업로드 성공 |
| `FAILED` | 어느 단계에서든 예외 발생, `failReason` 참고 |
