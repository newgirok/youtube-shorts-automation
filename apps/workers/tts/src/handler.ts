import type { SQSHandler, SQSEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { readFileSync, existsSync } from 'node:fs';
import {
  prisma,
  downloadFromS3,
  uploadToS3,
  jobKey,
  createLogger,
} from '@shorts/shared';
import { EdgeTTSAdapter } from './EdgeTTSAdapter.js';
import { parseEnv } from './env.js';

interface SQSMessage {
  jobId: string;
  channelId: string;
  scriptS3Key: string;
}

interface ScriptContent {
  title: string;
  script: string;
}

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

export const handler: SQSHandler = async (event: SQSEvent) => {
  const env = parseEnv();

  for (const record of event.Records) {
    const { jobId, channelId, scriptS3Key } = JSON.parse(record.body) as SQSMessage;
    const log = createLogger({ jobId, channelId });

    try {
      log.info('tts-worker 시작');

      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'TTS_PROCESSING' },
      });

      const scriptBuf = await downloadFromS3(scriptS3Key);
      const { title, script } = JSON.parse(scriptBuf.toString()) as ScriptContent;

      const tts = new EdgeTTSAdapter(env.EDGE_TTS_PATH);
      const audioPath = `/tmp/${jobId}-audio.mp3`;
      await tts.synthesize(`${title}. ${script}`, audioPath);
      log.info({ audioPath }, 'TTS 음성 생성 완료');

      const audioBuf = readFileSync(audioPath);
      const audioS3Key = jobKey(jobId, 'audio.mp3');
      await uploadToS3(audioS3Key, audioBuf);

      // VTT (word-level timing) — edge-tts --write-subtitles 생성 파일
      const vttPath = tts.vttPath(audioPath);
      let subtitleVttS3Key: string | undefined;
      if (existsSync(vttPath)) {
        const vttBuf = readFileSync(vttPath);
        subtitleVttS3Key = jobKey(jobId, 'subtitle.vtt');
        await uploadToS3(subtitleVttS3Key, vttBuf);
        log.info({ subtitleVttS3Key }, 'VTT 자막 업로드 완료');
      }

      await prisma.job.update({
        where: { id: jobId },
        data: { audioS3Key },
      });

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: env.SQS_SUBTITLE_QUEUE_URL,
          MessageBody: JSON.stringify({ jobId, channelId, audioS3Key, subtitleVttS3Key }),
        })
      );

      log.info({ audioS3Key }, 'tts-worker 완료, subtitle-queue 발행');
    } catch (err) {
      createLogger({ jobId, channelId }).error({ err }, 'tts-worker 실패');
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
