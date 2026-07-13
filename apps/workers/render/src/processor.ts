import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { prisma, downloadFromS3, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import type { ScriptContent, ScriptScene } from '@shorts/shared';
import { renderSceneClip, renderSceneFromVideo, concatClipsWithAudio, measureDuration } from './renderer.js';
import { downloadSceneImage, downloadSceneVideo } from './image-generator.js';
import type { Env } from './env.js';

const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, "?");

interface Message {
  jobId: string;
  channelId: string;
  audioS3Key: string;
  subtitleS3Key: string;
}

export async function processMessage(
  body: string,
  sqs: SQSClient,
  env: Env
): Promise<void> {
  const { jobId, channelId, audioS3Key, subtitleS3Key } = JSON.parse(body) as Message;
  const log = createLogger({ jobId, channelId });

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RENDER_PROCESSING' },
    });

    const tmpDir = '/tmp';
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const audioPath = join(tmpDir, `${jobId}-audio.mp3`);
    const srtPath = join(tmpDir, `${jobId}-subtitle.srt`);
    const outputPath = join(tmpDir, `${jobId}-output.mp4`);

    log.info('S3에서 파일 다운로드 시작');
    const [audioBuf, srtBuf] = await Promise.all([
      downloadFromS3(audioS3Key),
      downloadFromS3(subtitleS3Key),
    ]);
    writeFileSync(audioPath, audioBuf);

    const ffprobePath = env.FFMPEG_PATH.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
    const audioDuration = measureDuration(ffprobePath, audioPath);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        topic: true,
        scriptContent: true,
      },
    });

    const scriptContent = job?.scriptContent as ScriptContent | null;
    const scenes: ScriptScene[] = scriptContent?.scenes ?? [];
    const fontName = 'SB Aggro Bold';

    const clipPaths: string[] = [];

    if (scenes.length > 0) {
      // 씬 합계가 오디오보다 짧으면 마지막 씬을 오디오 끝까지 연장 (comment_bait 잘림 방지)
      const totalSceneDuration = scenes.reduce((sum, s) => sum + (s.end - s.start), 0);
      if (audioDuration > totalSceneDuration) {
        const lastScene = scenes[scenes.length - 1]!;
        lastScene.end += audioDuration - totalSceneDuration;
      }

      log.info({ count: scenes.length }, '장면별 렌더링 시작');

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i]!;
        const duration = scene.end - scene.start;
        const imgPath = join(tmpDir, `${jobId}-scene-${i}.jpg`);
        const clipPath = join(tmpDir, `${jobId}-clip-${i}.mp4`);

        let usedVideo = false;
        try {
          const rawVideoPath = join(tmpDir, `${jobId}-raw-${i}.mp4`);
          await downloadSceneVideo(scene.keyword, rawVideoPath, env.PEXELS_API_KEY);
          renderSceneFromVideo(rawVideoPath, clipPath, duration, env.FFMPEG_PATH);
          usedVideo = true;
        } catch { /* 동영상 실패 → 이미지 fallback */ }

        if (!usedVideo) {
          try {
            await downloadSceneImage(scene.keyword, imgPath, env.PEXELS_API_KEY);
          } catch (err) {
            log.warn({ err, keyword: scene.keyword }, 'Pexels 검색 실패, topic으로 재시도');
            await downloadSceneImage(job?.topic ?? 'nature', imgPath, env.PEXELS_API_KEY);
          }
          renderSceneClip(imgPath, clipPath, duration, scene.effect, env.FFMPEG_PATH);
        }

        clipPaths.push(clipPath);
        log.info({ scene: i + 1, total: scenes.length, usedVideo }, '장면 클립 생성 완료');
      }
    } else {
      log.warn('scenes 없음, topic 키워드로 단일 이미지 fallback');
      const imgPath = join(tmpDir, `${jobId}-scene-0.jpg`);
      const clipPath = join(tmpDir, `${jobId}-clip-0.mp4`);
      await downloadSceneImage(job?.topic ?? 'nature', imgPath, env.PEXELS_API_KEY);
      renderSceneClip(imgPath, clipPath, 50, 'zoom-in', env.FFMPEG_PATH);
      clipPaths.push(clipPath);
    }

    const finalSrt = srtBuf.toString('utf-8');
    writeFileSync(srtPath, finalSrt, 'utf-8');

    log.info('FFmpeg 최종 합성 시작');
    const thumbnailPath = join(tmpDir, `${jobId}-thumbnail.jpg`);
    concatClipsWithAudio(clipPaths, audioPath, srtPath, outputPath, env.FFMPEG_PATH, fontName, tmpDir, scriptContent?.title ?? '', env.FONTS_DIR, thumbnailPath);

    const videoBuf = readFileSync(outputPath);
    const videoS3Key = jobKey(jobId, 'output.mp4');
    await uploadToS3(videoS3Key, videoBuf);

    let thumbnailUrl: string | undefined;
    try {
      await uploadToS3(jobKey(jobId, 'thumbnail.jpg'), readFileSync(thumbnailPath));
      thumbnailUrl = `/jobs/${jobId}/thumbnail`;
      log.info('썸네일 생성 완료');
    } catch (thumbErr) {
      log.warn({ thumbErr }, '썸네일 업로드 실패 (무시)');
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { videoS3Key, ...(thumbnailUrl ? { thumbnailUrl } : {}) },
    });

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: env.SQS_UPLOAD_QUEUE_URL,
        MessageBody: JSON.stringify({ jobId, channelId, videoS3Key }),
      })
    );

    log.info({ videoS3Key }, 'render-worker 완료, upload-queue 발행');
  } catch (err) {
    log.error({ err }, 'render-worker 실패');
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        failReason: toSafeMsg(err),
      },
    });
    throw err;
  }
}
