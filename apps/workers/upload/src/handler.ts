import type { SQSHandler, SQSEvent } from 'aws-lambda';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma, downloadFromS3, createLogger, initSentry, Sentry } from '@shorts/shared';
initSentry();
import { z } from 'zod';
import { decrypt } from './crypto.js';
import { uploadToYouTube } from './uploader.js';
import { validateVideo } from './validator.js';
import { parseEnv } from './env.js';

const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, "?");

const SQSMessageSchema = z.object({
  jobId: z.string().min(1),
  channelId: z.string().min(1),
  videoS3Key: z.string().min(1),
});

interface ScriptContent {
  title: string;
  description: string;
  hashtags: string[];
}

const _handler: SQSHandler = async (event: SQSEvent) => {
  const env = parseEnv();

  for (const record of event.Records) {
    const { jobId, channelId, videoS3Key } = SQSMessageSchema.parse(JSON.parse(record.body));
    const log = createLogger({ jobId, channelId });

    try {
      log.info('upload-worker 시작');

      // Job 조회: youtubeVideoId 체크(멱등성) + scriptContent 통합
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { youtubeVideoId: true, scriptContent: true },
      });

      if (!job) {
        log.warn('Job 레코드 없음 — 스킵');
        continue;
      }

      if (job.youtubeVideoId) {
        log.info({ youtubeVideoId: job.youtubeVideoId }, '이미 업로드됨 — 재처리 스킵');
        continue;
      }

      await prisma.job.updateMany({
        where: { id: jobId },
        data: { status: 'UPLOAD_PROCESSING' },
      });

      const scriptContent = job.scriptContent as unknown as ScriptContent;

      // 채널 정보 조회
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { refreshToken: true },
      });

      // refreshToken 복호화 (access_token은 DB에 저장하지 않음)
      const refreshToken = decrypt(channel.refreshToken, env.ENCRYPTION_KEY);

      // S3에서 영상 다운로드
      const videoPath = join('/tmp', `${jobId}-output.mp4`);
      const videoBuf = await downloadFromS3(videoS3Key);
      writeFileSync(videoPath, videoBuf);
      log.info({ videoS3Key }, 'S3에서 영상 다운로드 완료');

      // 업로드 전 영상 품질 검증
      const ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe';
      const validation = validateVideo(videoPath, ffprobePath);
      if (!validation.valid) {
        throw new Error(`영상 품질 검증 실패: ${validation.reason}`);
      }
      log.info('영상 품질 검증 통과');

      // YouTube 업로드
      const videoId = await uploadToYouTube(
        videoPath,
        scriptContent,
        env.YOUTUBE_CLIENT_ID,
        env.YOUTUBE_CLIENT_SECRET,
        refreshToken
      );

      await prisma.job.updateMany({
        where: { id: jobId },
        data: {
          youtubeVideoId: videoId,
          privacyStatus: 'public',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      log.info({ videoId }, 'upload-worker 완료');
    } catch (err) {
      createLogger({ jobId, channelId }).error({ err }, 'upload-worker 실패');
      await prisma.job.updateMany({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          failReason: toSafeMsg(err),
        },
      });
      throw err;
    }
  }
};

export const handler = Sentry.wrapHandler(_handler);
