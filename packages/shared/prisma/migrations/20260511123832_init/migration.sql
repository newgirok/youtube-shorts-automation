-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'SCRIPT_PROCESSING', 'TTS_PROCESSING', 'SUBTITLE_PROCESSING', 'RENDER_PROCESSING', 'UPLOAD_PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "uploadSchedule" TEXT NOT NULL DEFAULT '0 9 * * *',
    "affiliateUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "totalViews" BIGINT NOT NULL DEFAULT 0,
    "isYPPQualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failReason" TEXT,
    "scriptContent" JSONB,
    "audioS3Key" TEXT,
    "subtitleS3Key" TEXT,
    "videoS3Key" TEXT,
    "youtubeVideoId" TEXT,
    "viewCount" BIGINT NOT NULL DEFAULT 0,
    "likeCount" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelAnalytics" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "estimatedRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ChannelAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_youtubeId_key" ON "Channel"("youtubeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAnalytics_channelId_date_key" ON "ChannelAnalytics"("channelId", "date");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAnalytics" ADD CONSTRAINT "ChannelAnalytics_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
