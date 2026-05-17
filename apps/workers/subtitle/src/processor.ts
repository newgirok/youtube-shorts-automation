import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SQSClient, SendMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { prisma, downloadFromS3, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import type { Env } from './env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Message {
  jobId: string;
  channelId: string;
  audioS3Key: string;
}

export async function processMessage(
  body: string,
  receiptHandle: string,
  sqs: SQSClient,
  env: Env
): Promise<void> {
  const { jobId, channelId, audioS3Key } = JSON.parse(body) as Message;
  const log = createLogger({ jobId, channelId });

  // heartbeat: 처리 중 30초마다 VisibilityTimeout 연장
  const heartbeat = setInterval(async () => {
    try {
      await sqs.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: env.SQS_SUBTITLE_QUEUE_URL,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 600,
        })
      );
      log.info('subtitle-worker: visibility timeout 연장');
    } catch {
      // 무시
    }
  }, 30_000);

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'SUBTITLE_PROCESSING' },
    });

    // S3에서 오디오 다운로드
    const tmpDir = '/tmp';
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const audioPath = join(tmpDir, `${jobId}-audio.mp3`);
    const srtPath = join(tmpDir, `${jobId}-subtitle.srt`);

    log.info({ audioS3Key }, 'S3에서 오디오 다운로드 시작');
    const audioBuf = await downloadFromS3(audioS3Key);
    writeFileSync(audioPath, audioBuf);

    // faster-whisper 실행
    log.info('faster-whisper 트랜스크립션 시작');
    const scriptPath = join(__dirname, 'transcriber.py');
    execSync(
      `"${env.PYTHON_PATH}" "${scriptPath}" "${audioPath}" "${srtPath}"`,
      { stdio: 'pipe', timeout: 600_000 }
    );

    // SRT를 S3에 업로드
    const srtBuf = readFileSync(srtPath);
    const subtitleS3Key = jobKey(jobId, 'subtitle.srt');
    await uploadToS3(subtitleS3Key, srtBuf);

    await prisma.job.update({
      where: { id: jobId },
      data: { subtitleS3Key },
    });

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: env.SQS_RENDER_QUEUE_URL,
        MessageBody: JSON.stringify({ jobId, channelId, audioS3Key, subtitleS3Key }),
      })
    );

    log.info({ subtitleS3Key }, 'subtitle-worker 완료, render-queue 발행');
  } catch (err) {
    log.error({ err }, 'subtitle-worker 실패');
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
