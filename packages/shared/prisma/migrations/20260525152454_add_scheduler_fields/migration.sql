-- AlterTable
ALTER TABLE "Channel" ALTER COLUMN "uploadSchedule" DROP NOT NULL,
ALTER COLUMN "uploadSchedule" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "schedulerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "schedulerCategory" TEXT NOT NULL DEFAULT 'top';
