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
  subtitleVttS3Key?: string;
}

interface ScriptContent {
  script: string;
}

interface VttEntry {
  start: number; // ms
  end: number;   // ms
  text: string;
}

function parseVttTime(s: string): number {
  const parts = s.trim().split(':');
  const [h, m, sec] = parts.length === 3 ? parts : ['0', parts[0], parts[1]];
  // SRT는 쉼표(,) VTT는 점(.) — 둘 다 처리해 ms 정밀도 보존
  return Math.round((parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat((sec ?? '0').replace(',', '.'))) * 1000);
}

function parseVttEntries(vtt: string): VttEntry[] {
  const entries: VttEntry[] = [];
  const lines = vtt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      const [startStr, endStr] = lines[i].split('-->');
      const raw = lines[i + 1]?.trim() ?? '';
      // edge-tts가 <break> 태그를 VTT 텍스트에 남길 수 있으므로 제거
      const text = raw
        .replace(/<[^>]*>/g, '')
        .replace(/\bbreak\s[^>]*\/>/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text) {
        entries.push({ start: parseVttTime(startStr), end: parseVttTime(endStr), text });
      }
      i++;
    }
  }
  return entries;
}

const MAX_DISPLAY_CHARS = 20;
const cleanLen = (s: string) => s.replace(/\s/g, '').length;

function cleanSubtitleText(text: string): string {
  return text
    .replace(/['''"""]/g, '')
    .replace(/(?<!\d)\.(?!\d)|[,?!]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function wordSplit(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  // 뒤에서 앞으로 채워 한국어 술어 꼬리("있다고 함", "배제해 버리면서" 등)가 함께 묶이게
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = cur ? `${words[i]} ${cur}` : words[i]!;
    if (cleanLen(candidate) <= MAX_DISPLAY_CHARS || !cur) cur = candidate;
    else { chunks.unshift(cur); cur = words[i]!; }
  }
  if (cur) chunks.unshift(cur);
  return chunks;
}

// 구어체 종결 패턴 우선 분할 → 여전히 길면 단어 경계로 fallback
function splitIntoDisplayChunks(text: string): string[] {
  if (cleanLen(text) <= MAX_DISPLAY_CHARS) return [text];

  const parts = text
    .split(/(?<=라고 함|상황이라고 함|분석이라고 함|있다고 함|이라고 함|\s하는데|\s하면서|\s하며|\s했다고|\s한다고|\s겠다며|\s한다며|\s있으며|\s있고)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = parts.flatMap((part) =>
    cleanLen(part) <= MAX_DISPLAY_CHARS ? [part] : wordSplit(part)
  );

  // 7자 이하 꼬리 토막 → 앞 청크에 병합 ("상황이라고 함"·"분석이라고 함" 등)
  const merged: string[] = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && cleanLen(chunk) <= 7) {
      merged[merged.length - 1] += ' ' + chunk;
    } else {
      merged.push(chunk);
    }
  }
  // 3자 이하 선두 토막 → 다음 청크 앞에 병합 ("실제로"·"결국" 등 짧은 부사어)
  if (merged.length >= 2 && cleanLen(merged[0]!) <= 3) {
    merged[1] = merged[0]! + ' ' + merged[1]!;
    merged.shift();
  }
  return merged;
}

// 한국어 TTS 발화 속도 상한 (글자/초) — 비례 타이밍이 이보다 느리면 cap
const CHARS_PER_SEC = 6;

const TERMINATOR_GAP_MS = 800;

function buildSrtFromVtt(entries: VttEntry[]): string {
  const chunks: { start: number; end: number; text: string }[] = [];

  for (let ei = 0; ei < entries.length; ei++) {
    const entry = entries[ei]!;

    const rawSentences = entry.text
      .split(/(?<=[^0-9])\.\s+|[?!]\s+|—+\s*|(?<=라고 함|상황이라고 함|분석이라고 함|있다고 함|이라고 함|\s하는데|\s하면서|\s하며|\s했다고|\s한다고|\s겠다며|\s한다며|\s있으며|\s있고)[,.]?\s+/)
      .map((s) => cleanSubtitleText(s))
      .filter(Boolean);
    if (rawSentences.length === 0) continue;

    const totalEntryChars = rawSentences.reduce((s, c) => s + cleanLen(c), 0);
    let sentCursor = entry.start;

    for (let si = 0; si < rawSentences.length; si++) {
      const isLastSentence = si === rawSentences.length - 1;
      const isTerminator = /함$/.test(rawSentences[si]!);
      const ratio = cleanLen(rawSentences[si]!) / totalEntryChars;
      const proportionalEnd = sentCursor + Math.round(ratio * (entry.end - entry.start));
      const speechRateEnd = sentCursor + Math.round((cleanLen(rawSentences[si]!) / CHARS_PER_SEC) * 1000);
      const sentRawEnd = isLastSentence
        ? entry.end
        : Math.min(proportionalEnd, speechRateEnd);

      const sentDisplayEnd = sentRawEnd;

      const nextGap = (!isLastSentence && isTerminator) ? TERMINATOR_GAP_MS : 0;

      const displayChunks = splitIntoDisplayChunks(rawSentences[si]!);
      if (displayChunks.length === 0) { sentCursor = sentRawEnd; continue; }

      if (displayChunks.length === 1) {
        chunks.push({ start: sentCursor, end: sentDisplayEnd, text: displayChunks[0]! });
      } else {
        const totalChunkChars = displayChunks.reduce((s, c) => s + cleanLen(c), 0);
        const sentDuration = sentDisplayEnd - sentCursor;
        let chunkCursor = sentCursor;
        for (let ci = 0; ci < displayChunks.length; ci++) {
          const chunkRatio = cleanLen(displayChunks[ci]!) / totalChunkChars;
          const chunkEnd = ci === displayChunks.length - 1
            ? sentDisplayEnd
            : chunkCursor + Math.round(chunkRatio * sentDuration);
          chunks.push({ start: chunkCursor, end: chunkEnd, text: displayChunks[ci]! });
          chunkCursor = chunkEnd;
        }
      }

      sentCursor = sentRawEnd + nextGap;
    }
  }

  return (
    chunks
      .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}`)
      .join('\n\n') + '\n'
  );
}

function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const ms_part = ms % 1_000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms_part).padStart(3, '0')}`;
}

function buildSrt(script: string, totalMs: number): string {
  const chunks = script
    .split(/(?<=[^0-9])\.\s+|[?!]\s+|—+\s*/)
    .map((s) => cleanSubtitleText(s))
    .filter(Boolean)
    .flatMap((s) => splitIntoDisplayChunks(s));

  const totalChars = chunks.reduce((sum, s) => sum + cleanLen(s), 0);
  let cursor = 0;
  return (
    chunks
      .map((text, i) => {
        const ratio = cleanLen(text) / totalChars;
        const duration = Math.round(ratio * totalMs);
        const start = cursor;
        const end = Math.min(cursor + duration, totalMs);
        cursor = end;
        return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}`;
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
  const { jobId, channelId, audioS3Key, subtitleVttS3Key } = JSON.parse(body) as Message;
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

    let srtContent: string;

    if (subtitleVttS3Key) {
      // VTT 기반: edge-tts word-level timing → 정확한 싱크
      log.info({ subtitleVttS3Key }, 'VTT 기반 SRT 생성');
      const vttBuf = await downloadFromS3(subtitleVttS3Key);
      const entries = parseVttEntries(vttBuf.toString('utf-8'));
      srtContent = buildSrtFromVtt(entries);
      log.info({ entries: entries.length }, 'VTT → SRT 변환 완료');
    } else {
      // fallback: 오디오 길이 측정 후 문자 수 비례 타이밍
      log.info('VTT 없음, 문자 수 비례 타이밍 사용');
      const durationStr = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
        { stdio: 'pipe' }
      )
        .toString()
        .trim();
      const totalMs = Math.round(parseFloat(durationStr) * 1000);
      const scriptS3Key = jobKey(jobId, 'script.json');
      const scriptBuf = await downloadFromS3(scriptS3Key);
      const { script } = JSON.parse(scriptBuf.toString()) as ScriptContent;
      srtContent = buildSrt(script, totalMs);
      log.info('문자 비례 SRT 생성 완료');
    }

    writeFileSync(srtPath, srtContent, 'utf-8');

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
