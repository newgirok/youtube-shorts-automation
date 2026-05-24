import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'scripts', 'output');
const OUTPUT_FILE = join(OUTPUT_DIR, 'test-audio.mp3');
const TEXT_FILE = join(OUTPUT_DIR, 'sample-script.txt');

const SAMPLE_SCRIPT = `안녕하세요! 오늘은 집에서 쉽게 할 수 있는 다이어트 방법을 알려드릴게요. 첫 번째, 아침에 일어나자마자 물 한 잔을 마셔보세요. 신진대사가 활발해지고 하루를 상쾌하게 시작할 수 있어요. 두 번째, 식사 20분 전에 물을 마시면 포만감이 생겨서 자연스럽게 식사량이 줄어들어요. 세 번째, 엘리베이터 대신 계단을 이용하면 하루에 200칼로리 이상을 소모할 수 있어요. 네 번째, 간식은 견과류나 과일로 대체해보세요. 건강하면서도 포만감을 유지할 수 있답니다. 다섯 번째, 잠자리에 들기 3시간 전에는 음식을 드시지 마세요. 여러분도 오늘부터 시작해보세요! 작은 습관이 큰 변화를 만들어낸다는 것, 꼭 기억해주세요!`;

// Windows 환경에서 절대 경로로 도구 위치 지정
const EDGE_TTS = 'C:\\Users\\tlswl\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\edge-tts.exe';
const FFPROBE = 'C:\\Users\\tlswl\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffprobe.exe';

function ensureOutputDir(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[TTS] 출력 디렉토리 생성: ${OUTPUT_DIR}`);
  }
}

function generateTTS(): void {
  console.log('[TTS] edge-tts로 음성 생성 시작...');
  console.log(`[TTS] 음성: ko-KR-SunHiNeural`);
  console.log(`[TTS] 스크립트 길이: ${SAMPLE_SCRIPT.length}자`);

  // 긴 텍스트는 파일로 전달 (Windows 커맨드라인 길이 제한 회피)
  writeFileSync(TEXT_FILE, SAMPLE_SCRIPT, 'utf-8');

  try {
    execSync(
      `"${EDGE_TTS}" --voice ko-KR-SunHiNeural --file "${TEXT_FILE}" --write-media "${OUTPUT_FILE}"`,
      { stdio: 'inherit' }
    );
    console.log(`[TTS] 음성 파일 생성 완료: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('[TTS] edge-tts 실행 실패. 설치 확인: pip install edge-tts');
    throw err;
  }
}

function measureDuration(): number {
  console.log('[TTS] ffprobe로 오디오 길이 측정...');

  try {
    const result = execSync(
      `"${FFPROBE}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_FILE}"`,
      { encoding: 'utf-8' }
    ).trim();

    const duration = parseFloat(result);
    console.log(`[TTS] 오디오 길이: ${duration.toFixed(2)}초`);
    return duration;
  } catch (err) {
    console.error('[TTS] ffprobe 실행 실패. FFmpeg 설치 확인: https://ffmpeg.org/download.html');
    throw err;
  }
}

function verify(duration: number): void {
  const MIN = 45;
  const MAX = 55;
  const passed = duration >= MIN && duration <= MAX;

  console.log('');
  console.log('=== P0-1 검증 결과 ===');
  console.log(`오디오 길이: ${duration.toFixed(2)}초`);
  console.log(`목표 범위: ${MIN}~${MAX}초`);
  console.log(`결과: ${passed ? ' PASS' : ' FAIL'}`);

  if (!passed) {
    console.warn(`[경고] 오디오 길이가 목표 범위(${MIN}~${MAX}초)를 벗어났습니다.`);
    console.warn('스크립트 길이를 조정하여 다시 시도하세요.');
  }
}

async function main(): Promise<void> {
  ensureOutputDir();
  generateTTS();
  const duration = measureDuration();
  verify(duration);
}

main().catch((err: unknown) => {
  console.error('[TTS] 오류 발생:', err);
  process.exit(1);
});
