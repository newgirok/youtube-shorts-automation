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
  comment_bait?: string;
}

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });

const toSafeMsg = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/�/g, '?');

// "80만 명" → "80만명" : 숫자+한국어 배수어 뒤 공백+단위를 붙여 edge-tts VTT 분리 방지
function normalizeNumberUnits(text: string): string {
  return text.replace(/(\d+[만억조천백십])\s+([명원개월일년주배곳건채팀회차])/g, '$1$2');
}

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
      const { title, script, comment_bait } = JSON.parse(scriptBuf.toString()) as ScriptContent;

      // comment_bait 앞 구두점을 제거하고 공백으로 연결 → '~하는데 여러분은~' 자연스러운 흐름
      // (\n\n 삽입 방식은 TTS가 마침표 정지처럼 과도하게 끊어 읽는 문제 발생)
      let processedScript = script;
      if (comment_bait) {
        const idx = processedScript.lastIndexOf(comment_bait);
        if (idx > 0) {
          const before = processedScript.slice(0, idx).trimEnd().replace(/[.!?,，。]+$/, '');
          processedScript = `${before} ${processedScript.slice(idx)}`;
        }
      }

      const tts = new EdgeTTSAdapter('');
      const audioPath = `/tmp/${jobId}-audio.mp3`;
      // 문장마다 단락 분리 → edge-tts가 문장별 VTT 엔트리 생성, 타이밍 정확도 향상
      const ttsInput = `${title}.\n\n${normalizeNumberUnits(processedScript).replace(/([.!?])\s+(?=[가-힣A-Z])/g, '$1\n\n')}`;
      await tts.synthesize(ttsInput, audioPath);
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
          failReason: toSafeMsg(err),
        },
      });
      throw err;
    }
  }
};
