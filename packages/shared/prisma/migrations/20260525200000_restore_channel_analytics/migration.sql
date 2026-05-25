CREATE TABLE IF NOT EXISTS "ChannelAnalytics" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "estimatedRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "watchTimeMinutes" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "ChannelAnalytics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannelAnalytics_channelId_date_key" ON "ChannelAnalytics"("channelId", "date");

ALTER TABLE "ChannelAnalytics" ADD CONSTRAINT "ChannelAnalytics_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
