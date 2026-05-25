import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SQSClient, SendMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { prisma, downloadFromS3, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import { renderSceneClip, renderSceneFromVideo, concatClipsWithAudio, type SceneEffect } from './renderer.js';
import { downloadSceneImage, downloadSceneVideo } from './image-generator.js';
import type { Env } from './env.js';

interface Message {
  jobId: string;
  channelId: string;
  audioS3Key: string;
  subtitleS3Key: string;
}

interface Scene {
  start: number;
  end: number;
  text: string;
  keyword: string;
  effect: SceneEffect;
}

interface ScriptContent {
  title?: string;
  thumbnail_text?: string;
  scenes?: Scene[];
}

export async function processMessage(
  body: string,
  receiptHandle: string,
  sqs: SQSClient,
  env: Env
): Promise<void> {
  const { jobId, channelId, audioS3Key, subtitleS3Key } = JSON.parse(body) as Message;
  const log = createLogger({ jobId, channelId });

  const heartbeat = setInterval(async () => {
    try {
      await sqs.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: env.SQS_RENDER_QUEUE_URL,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 1200,
        })
      );
    } catch { /* 무시 */ }
  }, 30_000);

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

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        topic: true,
        scriptContent: true,
      },
    });

    const scriptContent = job?.scriptContent as ScriptContent | null;
    const scenes: Scene[] = scriptContent?.scenes ?? [];
    const fontName = env.FONTS_DIR
      ? 'SB Aggro Bold'
      : (process.platform === 'win32' ? 'Malgun Gothic Bold' : 'NanumSquare ExtraBold');

    const clipPaths: string[] = [];

    if (scenes.length > 0) {
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
    concatClipsWithAudio(clipPaths, audioPath, srtPath, outputPath, env.FFMPEG_PATH, fontName, tmpDir, scriptContent?.title ?? '', env.FONTS_DIR);

    const videoBuf = readFileSync(outputPath);
    const videoS3Key = jobKey(jobId, 'output.mp4');
    await uploadToS3(videoS3Key, videoBuf);

    await prisma.job.update({
      where: { id: jobId },
      data: { videoS3Key },
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
        failReason: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  } finally {
    clearInterval(heartbeat);
  }
}
