import { parseBuffer } from 'music-metadata';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { prisma, downloadFromS3, uploadToS3, jobKey, createLogger } from '@shorts/shared';
import type { Env } from './env.js';

interface Message {
  jobId: string;
  channelId: string;
  audioS3Key: string;
  subtitleVttS3Key?: string;
}

interface ScriptContent {
  title: string;
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
      // edge-tts가 --file 옵션 사용 시 SSML 원문을 VTT 텍스트로 출력하는 경우 감지 → 무효 처리
      // (speak>, <prosody, <break 등 SSML 마크업 포함 시 해당 엔트리 전체 스킵)
      if (/speak>|<prosody|<break/.test(raw)) {
        i++;
        continue;
      }
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

// TTS 입력은 "${title}.\n\n${script}" 구조 — title에 해당하는 앞부분 VTT 엔트리를 건너뜀
function skipTitleEntries(entries: VttEntry[], title: string): VttEntry[] {
  const strip = (s: string) => s.replace(/[\s'''""".,?!]/g, '').toLowerCase();
  const titleLen = strip(title).length;
  let accumulated = 0;
  for (let i = 0; i < entries.length; i++) {
    accumulated += strip(entries[i]!.text).length;
    if (accumulated >= titleLen) return entries.slice(i + 1);
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

function buildSrtFromVtt(entries: VttEntry[], totalMs: number): string {
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
      // 비마지막 문장은 entry.end를 초과하지 않도록 cap — 초과하면 이후 sentCursor가 역전되어 SRT 순서 깨짐
      const sentRawEnd = isLastSentence
        ? entry.end
        : Math.min(proportionalEnd, speechRateEnd, entry.end);

      const sentDisplayEnd = sentRawEnd;

      // gap도 entry.end를 초과하지 않도록 cap
      const remainingAfterSent = Math.max(0, entry.end - sentRawEnd);
      const nextGap = (!isLastSentence && isTerminator)
        ? Math.min(TERMINATOR_GAP_MS, remainingAfterSent)
        : 0;

      // start >= end인 zero-duration 청크는 건너뜀
      if (sentCursor >= sentDisplayEnd) {
        sentCursor = sentRawEnd + nextGap;
        continue;
      }

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

  // VTT 마지막 엔트리 이후 후행 무음 구간에도 마지막 자막이 유지되도록 연장
  if (chunks.length > 0 && totalMs > chunks[chunks.length - 1]!.end) {
    chunks[chunks.length - 1]!.end = totalMs;
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

// startOffsetMs: 제목 발화 + 브레이크 구간 (자막 표시 시작 전 무음 구간)
// effectiveMs: 브레이크를 제외한 순수 스크립트 발화 시간
// tts-worker가 문장 사이에 삽입하는 1초 브레이크를 자막에도 반영:
//   문장 분리 → 각 문장에 effectiveMs 비례 배분 → 문장 사이에 BREAK_MS 갭 삽입
function buildSrt(script: string, effectiveMs: number, startOffsetMs = 0): string {
  const BREAK_MS = 1000;

  // tts-worker와 동일한 문장 분리 패턴: [.!?] 뒤 공백 + 한국어/대문자 시작
  const sentences = script
    .split(/(?<=[.!?])\s+(?=[가-힣A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return '';

  // 문장별 공백제거 글자 수 (비례 계산용)
  const sentenceChars = sentences.map((s) => cleanLen(s));
  const totalChars = sentenceChars.reduce((a, b) => a + b, 0);
  if (totalChars === 0) return '';

  const allChunks: { start: number; end: number; text: string }[] = [];
  let effectiveCursor = 0;   // effectiveMs 내 커서 (브레이크 제외)
  let absoluteCursor = startOffsetMs; // 실제 타임스탬프 커서

  for (let si = 0; si < sentences.length; si++) {
    const isLastSentence = si === sentences.length - 1;

    // 이 문장의 발화 시간 (글자 비례, effectiveMs 범위 내)
    const ratio = sentenceChars[si]! / totalChars;
    const sentMs = isLastSentence
      ? effectiveMs - effectiveCursor
      : Math.round(ratio * effectiveMs);
    effectiveCursor += sentMs;

    // 문장 내 청크 분리 + 타임스탬프 배분
    const chunks = splitIntoDisplayChunks(cleanSubtitleText(sentences[si]!));
    if (chunks.length === 0) {
      absoluteCursor += sentMs;
      if (!isLastSentence) absoluteCursor += BREAK_MS;
      continue;
    }

    const chunkTotalChars = chunks.reduce((s, c) => s + cleanLen(c), 0);
    let chunkCursor = absoluteCursor;

    for (let ci = 0; ci < chunks.length; ci++) {
      const isLastChunk = ci === chunks.length - 1;
      const chunkRatio = chunkTotalChars > 0 ? cleanLen(chunks[ci]!) / chunkTotalChars : 1 / chunks.length;
      const chunkEnd = isLastChunk
        ? absoluteCursor + sentMs
        : chunkCursor + Math.round(chunkRatio * sentMs);
      allChunks.push({ start: chunkCursor, end: chunkEnd, text: chunks[ci]! });
      chunkCursor = chunkEnd;
    }

    absoluteCursor += sentMs;

    // 문장 사이 브레이크 갭 (tts-worker가 삽입하는 \n\n 구간, 마지막 문장 제외)
    if (!isLastSentence) absoluteCursor += BREAK_MS;
  }

  return (
    allChunks
      .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}`)
      .join('\n\n') + '\n'
  );
}

export async function processMessage(
  body: string,
  sqs: SQSClient,
  env: Env
): Promise<void> {
  const { jobId, channelId, audioS3Key, subtitleVttS3Key } = JSON.parse(body) as Message;
  const log = createLogger({ jobId, channelId });

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'SUBTITLE_PROCESSING' },
    });

    log.info({ audioS3Key }, 'S3에서 오디오 다운로드');
    const audioBuf = await downloadFromS3(audioS3Key);

    let srtContent: string;

    // 오디오 전체 길이 — music-metadata로 측정 (ffprobe 불필요)
    const audioMeta = await parseBuffer(new Uint8Array(audioBuf), { mimeType: 'audio/mpeg' });
    const totalMs = Math.round((audioMeta.format.duration ?? 0) * 1000);

    // script.json은 양쪽 경로에서 모두 필요 (title 추출 + fallback script)
    const scriptBuf = await downloadFromS3(jobKey(jobId, 'script.json'));
    const { title, script } = JSON.parse(scriptBuf.toString()) as ScriptContent;

    // TTS 입력 구조: "${title}.\n\n${script_paragraphs}"
    // → 제목 발화 후 edge-tts가 1s 브레이크 삽입, 스크립트 각 문장 끝에도 1s 브레이크
    // fallback buildSrt는 이 오프셋을 반영해 제목+브레이크 이후부터 자막 표시
    const TTS_CHARS_PER_SEC = 7.2; // ko-KR-SunHiNeural +20% 기준 (한국어 글자/초)
    const titleSpeechMs = Math.round(title.replace(/\s/g, '').length / TTS_CHARS_PER_SEC * 1000);
    const titleOffsetMs = titleSpeechMs + 1000; // 제목 발화 + \n\n 브레이크 1s

    // tts-worker와 동일한 \n\n 삽입 로직으로 스크립트 내 브레이크 수 계산
    const scriptBreakCount = (script.replace(/([.!?])\s+(?=[가-힣A-Z])/g, '$1\n\n').match(/\n\n/g) ?? []).length;
    const scriptBreaksMs = scriptBreakCount * 1000;

    // 실제 스크립트 발화 구간 = 전체 오디오 − 제목 구간 − 스크립트 내 브레이크
    const effectiveScriptMs = Math.max(0, totalMs - titleOffsetMs - scriptBreaksMs);

    if (subtitleVttS3Key) {
      // VTT 기반: edge-tts word-level timing → 정확한 싱크
      log.info({ subtitleVttS3Key }, 'VTT 기반 SRT 생성');
      const vttBuf = await downloadFromS3(subtitleVttS3Key);
      const allEntries = parseVttEntries(vttBuf.toString('utf-8'));
      // TTS 입력 첫 단락이 제목 → 해당 VTT 엔트리 건너뜀 (음성으로만 재생)
      const entries = skipTitleEntries(allEntries, title);
      const vttSrt = buildSrtFromVtt(entries, totalMs);
      if (vttSrt.trim()) {
        srtContent = vttSrt;
        log.info({ total: allEntries.length, skipped: allEntries.length - entries.length }, 'VTT → SRT 변환 완료 (제목 제외)');
      } else {
        // edge-tts가 SSML 원문을 VTT로 출력하는 경우 → 타이밍 오프셋 보정 후 문자 비례 fallback
        log.warn({ total: allEntries.length, titleOffsetMs, effectiveScriptMs }, 'VTT 파싱 결과 비어있음 — 타이밍 보정 fallback');
        srtContent = buildSrt(script, effectiveScriptMs, titleOffsetMs);
      }
    } else {
      // fallback: 문자 수 비례 타이밍 (타이밍 오프셋 보정)
      log.info({ titleOffsetMs, effectiveScriptMs }, 'VTT 없음, 타이밍 보정 문자 비례 타이밍 사용');
      srtContent = buildSrt(script, effectiveScriptMs, titleOffsetMs);
    }

    const subtitleS3Key = jobKey(jobId, 'subtitle.srt');
    await uploadToS3(subtitleS3Key, Buffer.from(srtContent, 'utf-8'));

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
  }
}
