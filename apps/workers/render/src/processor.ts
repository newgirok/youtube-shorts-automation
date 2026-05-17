import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SQSClient, SendMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { prisma, downloadFromS3, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import { renderVideo } from './renderer.js';
import { generateBackgroundImage } from './image-generator.js';
import type { Env } from './env.js';

interface Message {
  jobId: string;
  channelId: string;
  audioS3Key: string;
  subtitleS3Key: string;
}

interface ScriptContent {
  title?: string;
  thumbnail_text?: string;
  affiliate_cta?: string;
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
    const bgImagePath = join(tmpDir, `${jobId}-bg.jpg`);
    const outputPath = join(tmpDir, `${jobId}-output.mp4`);

    log.info('S3에서 파일 다운로드 시작');
    const [audioBuf, srtBuf] = await Promise.all([
      downloadFromS3(audioS3Key),
      downloadFromS3(subtitleS3Key),
    ]);
    writeFileSync(audioPath, audioBuf);

    // Channel.affiliateUrl 확인 후 CTA 세그먼트 추가
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        topic: true,
        scriptContent: true,
        channel: { select: { affiliateUrl: true } },
      },
    });

    // AI 배경 이미지 생성
    let generatedBgPath: string | undefined;
    try {
      const imagePrompt = (job?.scriptContent as ScriptContent | null)?.thumbnail_text ?? job?.topic ?? jobId;
      await generateBackgroundImage(imagePrompt, bgImagePath, env.PEXELS_API_KEY);
      generatedBgPath = bgImagePath;
      log.info('AI 배경 이미지 생성 완료');
    } catch (err) {
      log.warn({ err }, 'AI 배경 이미지 생성 실패, 검정 배경으로 대체');
    }

    let finalSrt = srtBuf.toString('utf-8');
    if (job?.channel?.affiliateUrl && job.scriptContent) {
      const scriptContent = job.scriptContent as ScriptContent;
      const ctaText = scriptContent.affiliate_cta;
      if (ctaText) {
        // 마지막 세그먼트 종료 시간 파악 후 CTA 추가
        const lastTimeMatch = finalSrt.match(/(\d{2}:\d{2}:\d{2},\d{3}) -->/g);
        if (lastTimeMatch) {
          // SRT에서 마지막 end time 찾기
          const allTimes = finalSrt.match(/\d{2}:\d{2}:\d{2},\d{3}/g) ?? [];
          const lastEndTime = allTimes[allTimes.length - 1];
          if (lastEndTime) {
            const [h, m, s] = lastEndTime.replace(',', '.').split(':').map(Number);
            const totalSec = (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
            const ctaStart = Math.max(0, totalSec - 8);
            const formatTime = (sec: number) => {
              const hh = Math.floor(sec / 3600);
              const mm = Math.floor((sec % 3600) / 60);
              const ss = Math.floor(sec % 60);
              const ms = Math.round((sec % 1) * 1000);
              return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
            };
            const segCount = (finalSrt.match(/^\d+$/gm) ?? []).length + 1;
            finalSrt += `\n${segCount}\n${formatTime(ctaStart)} --> ${lastEndTime}\n${ctaText}\n\n`;
          }
        }
      }
    }
    writeFileSync(srtPath, finalSrt, 'utf-8');

    log.info('FFmpeg 렌더링 시작');
    const fontName = process.platform === 'win32' ? 'Malgun Gothic' : 'NanumGothic';
    renderVideo(audioPath, srtPath, outputPath, env.FFMPEG_PATH, fontName, generatedBgPath);

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
