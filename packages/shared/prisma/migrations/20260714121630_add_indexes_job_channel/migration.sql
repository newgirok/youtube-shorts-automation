-- CreateIndex
CREATE INDEX "Channel_isActive_idx" ON "Channel"("isActive");

-- CreateIndex
CREATE INDEX "Job_channelId_idx" ON "Job"("channelId");

-- CreateIndex
CREATE INDEX "Job_channelId_status_idx" ON "Job"("channelId", "status");

-- CreateIndex
CREATE INDEX "Job_youtubeVideoId_idx" ON "Job"("youtubeVideoId");
