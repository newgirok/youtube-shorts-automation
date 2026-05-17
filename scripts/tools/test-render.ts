import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FFMPEG =
  'C:\\Users\\tlswl\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';
const FFPROBE =
  'C:\\Users\\tlswl\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffprobe.exe';

const SCRIPTS_DIR = join(process.cwd(), 'scripts');
const OUTPUT_DIR = join(SCRIPTS_DIR, 'output');
const AUDIO_FILE = join(OUTPUT_DIR, 'test-audio.mp3');
const SUBTITLE_FILE = join(OUTPUT_DIR, 'test-subtitle.srt');
const OUTPUT_FILE = join(OUTPUT_DIR, 'test-output.mp4');

// Windows에서 FFmpeg subtitle 필터용 경로 이스케이프
// C:\path\to\file.srt -> C\:/path/to/file.srt
function escapeSubtitlePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
}

function pickFont(): string {
  const nanumPath = 'C:\\Windows\\Fonts\\NanumGothic.ttf';
  const malgunPath = 'C:\\Windows\\Fonts\\malgun.ttf';

  if (existsSync(nanumPath)) {
    console.log('[Render] 폰트: NanumGothic');
    return 'NanumGothic';
  }
  if (existsSync(malgunPath)) {
    console.log('[Render] 폰트: Malgun Gothic (NanumGothic 대체)');
    return 'Malgun Gothic';
  }
  console.warn('[Render] 경고: 한국어 폰트를 찾을 수 없습니다. Arial 사용.');
  return 'Arial';
}

function renderVideo(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('[Render] FFmpeg 렌더링 시작...');
  console.log('[Render] 해상도: 1080×1920 (유튜브 쇼츠)');

  const fontName = pickFont();
  const subtitleEscaped = escapeSubtitlePath(SUBTITLE_FILE);
  const forceStyle = `FontName=${fontName},FontSize=18,MarginV=120,PrimaryColour=&Hffffff&,Outline=2,Shadow=1`;

  const cmd = [
    `"${FFMPEG}"`,
    `-f lavfi -i color=c=black:s=1080x1920:r=30`,
    `-i "${AUDIO_FILE}"`,
    `-vf "subtitles='${subtitleEscaped}':force_style='${forceStyle}'"`,
    `-c:v libx264 -crf 23`,
    `-c:a aac`,
    `-shortest`,
    `-y`,
    `"${OUTPUT_FILE}"`,
  ].join(' ');

  console.log('[Render] 명령:', cmd);
  execSync(cmd, { stdio: 'inherit' });
  console.log('[Render] 렌더링 완료:', OUTPUT_FILE);
}

interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  codec: string;
}

function probeVideo(): VideoInfo {
  console.log('\n[Render] ffprobe로 출력 파일 검증...');

  const raw = execSync(
    `"${FFPROBE}" -v quiet -print_format json -show_streams -show_format "${OUTPUT_FILE}"`,
    { encoding: 'utf-8' },
  );

  const info = JSON.parse(raw);
  const videoStream = info.streams.find(
    (s: { codec_type: string }) => s.codec_type === 'video',
  );
  const audioStream = info.streams.find(
    (s: { codec_type: string }) => s.codec_type === 'audio',
  );

  const duration = parseFloat(info.format.duration);

  console.log(`[Render] 해상도: ${videoStream.width}×${videoStream.height}`);
  console.log(`[Render] 길이: ${duration.toFixed(2)}초`);
  console.log(`[Render] 비디오 코덱: ${videoStream.codec_name}`);
  console.log(`[Render] 오디오 스트림: ${audioStream ? '있음' : '없음'}`);

  return {
    width: videoStream.width,
    height: videoStream.height,
    duration,
    hasAudio: !!audioStream,
    codec: videoStream.codec_name,
  };
}

function verify(info: VideoInfo): void {
  const widthOk = info.width === 1080;
  const heightOk = info.height === 1920;
  const audioOk = info.hasAudio;
  const durationOk = info.duration >= 45 && info.duration <= 60;

  console.log('\n=== P0-3 검증 결과 ===');
  console.log(
    `해상도: ${info.width}×${info.height} → ${widthOk && heightOk ? '✓ PASS' : '✗ FAIL'}`,
  );
  console.log(`오디오: ${info.hasAudio ? '있음' : '없음'} → ${audioOk ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`길이: ${info.duration.toFixed(2)}초 → ${durationOk ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`코덱: ${info.codec}`);

  const allPass = widthOk && heightOk && audioOk && durationOk;
  console.log(`\n전체 결과: ${allPass ? '✓ ALL PASS' : '✗ SOME FAILED'}`);
}

renderVideo();
const videoInfo = probeVideo();
verify(videoInfo);
