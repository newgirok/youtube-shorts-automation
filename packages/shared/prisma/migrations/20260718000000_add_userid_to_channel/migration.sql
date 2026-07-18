-- AlterTable: userId를 nullable로 추가 후 backfill, non-null로 변경
ALTER TABLE "Channel" ADD COLUMN "userId" TEXT;

-- 기존 채널을 단일 User에 할당 (싱글 오너 시스템 backfill)
UPDATE "Channel" SET "userId" = (SELECT "id" FROM "User" LIMIT 1) WHERE "userId" IS NULL;

-- NOT NULL 제약 적용
ALTER TABLE "Channel" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Channel_userId_idx" ON "Channel"("userId");
