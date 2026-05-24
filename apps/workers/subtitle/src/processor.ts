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
  return Math.round((parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(sec)) * 1000);
}

function parseVttEntries(vtt: string): VttEntry[] {
  const entries: VttEntry[] = [];
  const lines = vtt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      const [startStr, endStr] = lines[i].split('-->');
      const text = lines[i + 1]?.trim() ?? '';
      if (text) {
        entries.push({ start: parseVttTime(startStr), end: parseVttTime(endStr), text });
      }
      i++;
    }
  }
  return entries;
}

// VTT 항목을 문장 부호(. ? !)로 1차 분할 → 각 문장에 비례 타이밍 배분
function splitEntry(entry: VttEntry): { start: number; end: number; text: string }[] {
  // 소수점(2.8%)은 스킵: 마침표 뒤가 숫자면 분할하지 않음 → [^0-9]\. 패턴
  const sentences = entry.text
    .split(/(?<=[^0-9])\.\s+|[?!]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 마지막 문장에 부호가 남아있으면 그대로 유지 (단일 문장일 때)
  if (sentences.length === 1) return [entry];

  const cleanLen = (s: string) => s.replace(/\s/g, '').length;
  const totalChars = sentences.reduce((s, c) => s + cleanLen(c), 0);
  const duration = entry.end - entry.start;
  const result: { start: number; end: number; text: string }[] = [];
  let cursor = entry.start;
  for (let i = 0; i < sentences.length; i++) {
    const ratio = cleanLen(sentences[i]!) / totalChars;
    const end = i === sentences.length - 1 ? entry.end : cursor + Math.round(ratio * duration);
    result.push({ start: cursor, end, text: sentences[i]! });
    cursor = end;
  }
  return result;
}

function buildSrtFromVtt(entries: VttEntry[]): string {
  const chunks: { start: number; end: number; text: string }[] = [];
  for (const entry of entries) {
    chunks.push(...splitEntry(entry));
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

function splitSentences(text: string): string[] {
  const MAX_CHARS = 20;
  // 문장 부호로 1차 분할
  const raw = text
    .split(/(?<=[.!?。！？])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // MAX_CHARS 초과 문장만 공백 기준으로 추가 분할
  const result: string[] = [];
  for (const sentence of raw) {
    if (sentence.length <= MAX_CHARS) {
      result.push(sentence);
    } else {
      let remaining = sentence;
      while (remaining.length > MAX_CHARS) {
        const splitAt = remaining.lastIndexOf(' ', MAX_CHARS);
        const cut = splitAt > 0 ? splitAt : MAX_CHARS;
        result.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
      }
      if (remaining.length > 0) result.push(remaining);
    }
  }
  return result;
}

function buildSrt(sentences: string[], totalMs: number): string {
  // 각 문장을 독립 자막 블록으로 — 강제 개행 없이 완성된 문장 표시
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
      const sentences = splitSentences(script);
      srtContent = buildSrt(sentences, totalMs);
      log.info({ sentences: sentences.length }, '문자 비례 SRT 생성 완료');
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
