import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SQSClient, SendMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { prisma, downloadFromS3, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import type { Env } from './env.js';

interface Message {
  jobId: string;
  channelId: string;
  audioS3Key: string;
}

interface ScriptContent {
  script: string;
}

function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const ms_part = ms % 1_000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms_part).padStart(3, '0')}`;
}

function highlightNumbers(text: string): string {
  return text.replace(
    /\d+(?:[.,]\d+)?(?:\s*(?:초|분|시간|km\/h|km|m|cm|kg|g|만|억|조|%|위|번|개|명|년|월|일|세|회))?/g,
    '<font color="#FFE135">$&</font>',
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildSrt(sentences: string[], totalMs: number): string {
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  let cursor = 0;
  return (
    sentences
      .map((text, i) => {
        const ratio = text.length / totalChars;
        const duration = Math.round(ratio * totalMs);
        const start = cursor;
        const end = Math.min(cursor + duration, totalMs);
        cursor = end;
        return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${highlightNumbers(text)}`;
      })
      .join('\n\n') + '\n'
  );
}

export async function processMessage(
  body: string,
  receiptHandle: string,
  sqs: SQSClient,
  env: Env
): Promise<void> {
  const { jobId, channelId, audioS3Key } = JSON.parse(body) as Message;
  const log = createLogger({ jobId, channelId });

  const heartbeat = setInterval(async () => {
    try {
      await sqs.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: env.SQS_SUBTITLE_QUEUE_URL,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 600,
        })
      );
    } catch {
      // 무시
    }
  }, 30_000);

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'SUBTITLE_PROCESSING' },
    });

    const tmpDir = '/tmp';
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const audioPath = join(tmpDir, `${jobId}-audio.mp3`);
    const srtPath = join(tmpDir, `${jobId}-subtitle.srt`);

    log.info({ audioS3Key }, 'S3에서 오디오 다운로드');
    const audioBuf = await downloadFromS3(audioS3Key);
    writeFileSync(audioPath, audioBuf);

    // 오디오 길이 측정 (ffprobe)
    const durationStr = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { stdio: 'pipe' }
    )
      .toString()
      .trim();
    const totalMs = Math.round(parseFloat(durationStr) * 1000);
    log.info({ totalMs }, '오디오 길이 측정 완료');

    // script.json에서 스크립트 텍스트 추출
    const scriptS3Key = jobKey(jobId, 'script.json');
    const scriptBuf = await downloadFromS3(scriptS3Key);
    const { script } = JSON.parse(scriptBuf.toString()) as ScriptContent;

    // 문장 분할 → 시간 비례 SRT 생성
    const sentences = splitSentences(script);
    const srtContent = buildSrt(sentences, totalMs);
    writeFileSync(srtPath, srtContent, 'utf-8');
    log.info({ sentences: sentences.length }, 'SRT 자막 생성 완료');

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
