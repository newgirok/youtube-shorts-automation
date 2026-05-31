import type { SQSHandler, SQSEvent } from 'aws-lambda';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma, downloadFromS3, createLogger } from '@shorts/shared';
import { decrypt } from './crypto.js';
import { uploadToYouTube } from './uploader.js';
import { validateVideo } from './validator.js';
import { parseEnv } from './env.js';

interface SQSMessage {
  jobId: string;
  channelId: string;
  videoS3Key: string;
}

interface ScriptContent {
  title: string;
  description: string;
  hashtags: string[];
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const env = parseEnv();

  for (const record of event.Records) {
    const { jobId, channelId, videoS3Key } = JSON.parse(record.body) as SQSMessage;
    const log = createLogger({ jobId, channelId });

    try {
      log.info('upload-worker 시작');

      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'UPLOAD_PROCESSING' },
      });

      // 채널 정보 조회
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { refreshToken: true },
      });

      // refreshToken 복호화 (access_token은 DB에 저장하지 않음)
      const refreshToken = decrypt(channel.refreshToken, env.ENCRYPTION_KEY);

      // Job 조회 (scriptContent)
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        select: { scriptContent: true },
      });
      const scriptContent = job.scriptContent as unknown as ScriptContent;

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

      await prisma.job.update({
        where: { id: jobId },
        data: {
          youtubeVideoId: videoId,
          privacyStatus: 'public',
          status: 'COMPLETED',
          completedAt: new Date(),
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
      });

      log.info({ videoId }, 'upload-worker 완료');
    } catch (err) {
      createLogger({ jobId, channelId }).error({ err }, 'upload-worker 실패');
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          failReason: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
};
