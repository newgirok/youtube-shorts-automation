/**
 * 로컬 파이프라인 통합 진단
 * Gemini 스크립트 생성 → TTS(+VTT) → SRT 변환 → Pexels 이미지 다운로드 → FFmpeg 렌더링 → 로컬 MP4 저장
 *
 * 실행: npx tsx scripts/run-pipeline.ts [주제]
 * 예시: npx tsx scripts/run-pipeline.ts "삼성전자 노조 파업"
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { downloadSceneImage, downloadSceneVideo } from '../../apps/workers/render/src/image-generator.js';
import { renderSceneClip, renderSceneFromVideo, concatClipsWithAudio } from '../../apps/workers/render/src/renderer.js';
import { generateScript } from '../../apps/workers/script/src/script-generator.js';

// ─── 경로 / 상수 ──────────────────────────────────────────────────────────────
const FFMPEG =
  'C:\\Users\\tlswl\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';
const FFPROBE = FFMPEG.replace('ffmpeg.exe', 'ffprobe.exe');
const EDGE_TTS =
  'C:\\Users\\tlswl\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\edge-tts.exe';

const OUTPUT_DIR = resolve(process.cwd(), 'scripts', 'output');
const FONTS_DIR  = resolve(process.cwd(), 'scripts', 'fonts');
const AUDIO_PATH = join(OUTPUT_DIR, 'pipeline-audio.mp3');
const VTT_PATH   = join(OUTPUT_DIR, 'pipeline-audio.vtt');
const SRT_PATH   = join(OUTPUT_DIR, 'pipeline-subtitle.srt');
const OUTPUT_PATH = join(OUTPUT_DIR, 'pipeline-output.mp4');

// .env.local 에서 키 읽기
function readEnvKey(key: string): string {
  const envFile = resolve(process.cwd(), '.env.local');
  if (!existsSync(envFile)) throw new Error('.env.local 파일이 없습니다');
  const line = readFileSync(envFile, 'utf-8')
    .split('\n')
    .find(l => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key}가 .env.local에 없습니다`);
  return line.split('=').slice(1).join('=').trim();
}

// ─── VTT 파싱 + SRT 빌드 ─────────────────────────────────────────────────────
interface VttEntry { start: number; end: number; text: string }

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
      const text = raw
        .replace(/<[^>]*>/g, '')
        .replace(/\bbreak\s[^>]*\/>/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text) entries.push({ start: parseVttTime(startStr), end: parseVttTime(endStr), text });
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

const CHARS_PER_SEC = 6;
const TERMINATOR_GAP_MS = 800;

function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const ms_part = ms % 1_000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms_part).padStart(3,'0')}`;
}

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

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const PEXELS_API_KEY = readEnvKey('PEXELS_API_KEY');
  process.env.GEMINI_API_KEY = readEnvKey('GEMINI_API_KEY');

  const topic = process.argv[2] ?? '민주당 내부 갈등';

  // 1. Gemini 스크립트 생성
  console.log(`\n[1/6] Gemini 스크립트 생성... (주제: ${topic})`);
  let script = await generateScript(topic, 'local-test').catch((err: unknown) => {
    console.warn(`   Gemini 호출 실패 (${err instanceof Error ? err.message.slice(0, 60) : err}), 샘플 스크립트 사용`);
    return null;
  });

  if (!script) {
    script = {
      title: '드디어 폭발해버린 민주당 내부 갈등',
      hook: '지금 민주당, 대체 어디까지 가는 겁니까?',
      script:
        '지금 민주당, 대체 어디까지 가는 겁니까? ' +
        '지난 5월 30일 김용 전 부원장이 대장동 재판 1심 유죄를 받으며 ' +
        '이재명 대표 사법리스크가 다시 터진 상황이라고. ' +
        '여기에 친명계가 당헌당규를 바꿔 연임 후 대선 출마까지 가능하게 하려 하자 ' +
        '보다못한 비명계가 정면으로 맞짱 뜨고 있다고 함. ' +
        '원내대표까지 친명 박찬대 의원이 가져가면서 ' +
        '사실상 이재명 일극 체제가 굳어졌다는 분석이라고. ' +
        '그야말로 아수라장이 된 민주당 내부, ' +
        '이쯤 되면 막장 드라마가 따로 없는 상황이라고. ' +
        '여러분은 지금 민주당, 누가 문제라고 봅니까?',
      description: '',
      scenes: [
        { start: 0,  end: 9,  text: '', keyword: 'politics parliament',  effect: 'zoom-in'   },
        { start: 9,  end: 18, text: '', keyword: 'court judge',          effect: 'pan-left'  },
        { start: 18, end: 27, text: '', keyword: 'protest crowd',        effect: 'zoom-out'  },
        { start: 27, end: 36, text: '', keyword: 'election vote',        effect: 'pan-right' },
        { start: 36, end: 46, text: '', keyword: 'news broadcast media', effect: 'zoom-in'   },
      ],
      hashtags: [],
      thumbnail_text: '민심폭발',
      comment_bait: '여러분은 누가 문제라고 봅니까?',
    };
  }
  console.log(`   제목: ${script.title}`);
  console.log(`   스크립트 (${script.script.length}자):\n   ${script.script}`);

  // 2. TTS + VTT 생성
  console.log('\n[2/6] edge-tts 음성 + VTT 생성...');
  const textFile = join(OUTPUT_DIR, 'tts-input.txt');
  const ttsInput = `${script.title}.\n\n${script.script.replace(/([.!?])\s+(?=[가-힣A-Z])/g, '$1\n\n')}`;
  writeFileSync(textFile, ttsInput, 'utf-8');
  execSync(
    `"${EDGE_TTS}" --voice ko-KR-SunHiNeural --file "${textFile}" --write-media "${AUDIO_PATH}" --write-subtitles "${VTT_PATH}"`,
    { stdio: 'inherit', timeout: 120_000 },
  );

  // 3. VTT → SRT
  console.log('\n[3/6] VTT → SRT 변환...');
  const entries = parseVttEntries(readFileSync(VTT_PATH, 'utf-8'));
  writeFileSync(SRT_PATH, buildSrtFromVtt(entries), 'utf-8');
  console.log(`   VTT ${entries.length}개 → SRT ${buildSrtFromVtt(entries).split('\n\n').filter(Boolean).length}개 블록`);

  // 오디오 길이 측정
  const audioDuration = parseFloat(
    execSync(
      `"${FFPROBE}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${AUDIO_PATH}"`,
      { encoding: 'utf-8' },
    ).trim(),
  );
  console.log(`   오디오 길이: ${audioDuration.toFixed(2)}초`);

  // 씬 타이밍을 실제 오디오 길이에 맞게 비례 스케일링
  const scenesTotal = script.scenes.reduce((s, sc) => s + (sc.end - sc.start), 0);
  if (scenesTotal > 0 && Math.abs(scenesTotal - audioDuration) > 1) {
    const scale = audioDuration / scenesTotal;
    let t = 0;
    for (const scene of script.scenes) {
      const dur = (scene.end - scene.start) * scale;
      scene.start = t;
      scene.end = t + dur;
      t = scene.end;
    }
    script.scenes[script.scenes.length - 1]!.end = audioDuration;
    console.log(`   씬 타이밍 재조정: ${scenesTotal.toFixed(1)}초 → ${audioDuration.toFixed(2)}초`);
  }

  // 4. Pexels 이미지 다운로드 + 장면 클립 생성
  console.log('\n[4/6] Pexels 이미지 다운로드 + 장면 클립 생성...');
  const clipPaths: string[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]!;
    const duration = scene.end - scene.start;
    const imgPath  = join(OUTPUT_DIR, `scene-${i}.jpg`);
    const rawVideo = join(OUTPUT_DIR, `scene-${i}-raw.mp4`);
    const clipPath = join(OUTPUT_DIR, `scene-${i}-clip.mp4`);

    let usedVideo = false;
    try {
      await downloadSceneVideo(scene.keyword, rawVideo, PEXELS_API_KEY);
      renderSceneFromVideo(rawVideo, clipPath, duration, FFMPEG);
      usedVideo = true;
      console.log(`   [${i + 1}/${script.scenes.length}] 동영상 클립: ${scene.keyword}`);
    } catch {
      await downloadSceneImage(scene.keyword, imgPath, PEXELS_API_KEY);
      renderSceneClip(imgPath, clipPath, duration, scene.effect, FFMPEG);
      console.log(`   [${i + 1}/${script.scenes.length}] 이미지 클립: ${scene.keyword}`);
    }
    void usedVideo;
    clipPaths.push(clipPath);
  }

  // 5. 최종 합성
  console.log('\n[5/6] FFmpeg 최종 합성 (헤더 + 자막 burn-in)...');
  const fontName = 'SB Aggro Bold';
  concatClipsWithAudio(clipPaths, AUDIO_PATH, SRT_PATH, OUTPUT_PATH, FFMPEG, fontName, OUTPUT_DIR, script.title, FONTS_DIR);

  console.log('\n[6/6] 렌더링 완료!');
  console.log('─'.repeat(60));
  console.log(`출력 파일: ${OUTPUT_PATH}`);
  console.log('─'.repeat(60));
}

main().catch((err: unknown) => {
  console.error('\n[오류]', err);
  process.exit(1);
});
