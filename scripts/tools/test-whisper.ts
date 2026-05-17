import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PYTHON = 'C:\\Users\\tlswl\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
const SCRIPTS_DIR = join(process.cwd(), 'scripts');
const OUTPUT_DIR = join(SCRIPTS_DIR, 'output');
const AUDIO_FILE = join(OUTPUT_DIR, 'test-audio.mp3');
const SUBTITLE_FILE = join(OUTPUT_DIR, 'test-subtitle.srt');
const TRANSCRIBE_SCRIPT = join(SCRIPTS_DIR, 'transcribe.py');

const ORIGINAL_SCRIPT = `안녕하세요! 오늘은 집에서 쉽게 할 수 있는 다이어트 방법을 알려드릴게요. 첫 번째, 아침에 일어나자마자 물 한 잔을 마셔보세요. 신진대사가 활발해지고 하루를 상쾌하게 시작할 수 있어요. 두 번째, 식사 20분 전에 물을 마시면 포만감이 생겨서 자연스럽게 식사량이 줄어들어요. 세 번째, 엘리베이터 대신 계단을 이용하면 하루에 200칼로리 이상을 소모할 수 있어요. 네 번째, 간식은 견과류나 과일로 대체해보세요. 건강하면서도 포만감을 유지할 수 있답니다. 다섯 번째, 잠자리에 들기 3시간 전에는 음식을 드시지 마세요. 여러분도 오늘부터 시작해보세요! 작은 습관이 큰 변화를 만들어낸다는 것, 꼭 기억해주세요!`;

function tokenize(text: string): string[] {
  // 한국어 단어 단위 토크나이징 (공백/구두점 기준 분리, 구두점 제거)
  return text
    .replace(/[!?.,'"/]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 0);
}

function calculateRecognitionRate(original: string, recognized: string): number {
  const origWords = tokenize(original);
  const recogWords = tokenize(recognized);

  // 인식된 단어 중 원본에 포함된 비율 계산
  let matchCount = 0;
  const recogSet = new Set(recogWords);

  for (const word of origWords) {
    if (recogSet.has(word)) {
      matchCount++;
    }
  }

  return (matchCount / origWords.length) * 100;
}

interface WhisperResult {
  language: string;
  language_probability: number;
  duration: number;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    words: Array<{
      word: string;
      start: number;
      end: number;
      probability: number;
    }>;
  }>;
}

function runTranscription(): WhisperResult {
  console.log('[Whisper] faster-whisper large-v3 전사 시작...');
  console.log('[Whisper] 모델 로딩 중 (첫 실행 시 다운로드로 시간이 걸릴 수 있습니다)...');

  if (!existsSync(AUDIO_FILE)) {
    throw new Error(`오디오 파일 없음: ${AUDIO_FILE}\nP0-1을 먼저 실행하세요.`);
  }

  const output = execSync(
    `"${PYTHON}" "${TRANSCRIBE_SCRIPT}" "${AUDIO_FILE}" "${SUBTITLE_FILE}"`,
    { encoding: 'utf-8', timeout: 600_000 }
  ).trim();

  console.log('[Whisper] 전사 완료');
  return JSON.parse(output) as WhisperResult;
}

function analyzeResults(result: WhisperResult): void {
  const recognizedText = result.segments.map(s => s.text).join(' ');

  console.log('\n=== Whisper 전사 결과 ===');
  console.log(`감지된 언어: ${result.language} (확률: ${(result.language_probability * 100).toFixed(1)}%)`);
  console.log(`오디오 길이: ${result.duration.toFixed(2)}초`);
  console.log(`세그먼트 수: ${result.segments.length}개`);
  console.log(`\n[인식된 텍스트]:\n${recognizedText}`);

  // 인식률 계산
  const recognitionRate = calculateRecognitionRate(ORIGINAL_SCRIPT, recognizedText);
  console.log(`\n[인식률] ${recognitionRate.toFixed(1)}% (목표: 90% 이상)`);

  // 타임스탬프 정보
  if (result.segments.length > 0) {
    const firstSeg = result.segments[0];
    const lastSeg = result.segments[result.segments.length - 1];
    console.log(`\n[타임스탬프] 첫 세그먼트: ${firstSeg.start.toFixed(3)}s ~ ${firstSeg.end.toFixed(3)}s`);
    console.log(`[타임스탬프] 마지막 세그먼트: ${lastSeg.start.toFixed(3)}s ~ ${lastSeg.end.toFixed(3)}s`);

    // 평균 단어 확률
    const allWords = result.segments.flatMap(s => s.words);
    if (allWords.length > 0) {
      const avgProb = allWords.reduce((sum, w) => sum + w.probability, 0) / allWords.length;
      console.log(`[평균 단어 신뢰도] ${(avgProb * 100).toFixed(1)}%`);
    }
  }

  // SRT 파일 확인
  if (existsSync(SUBTITLE_FILE)) {
    const srtContent = readFileSync(SUBTITLE_FILE, 'utf-8');
    const lineCount = srtContent.split('\n').filter(l => l.trim()).length;
    console.log(`\n[SRT 파일] 생성됨: ${SUBTITLE_FILE}`);
    console.log(`[SRT 라인 수] ${lineCount}줄`);
  }

  // 검증 결과
  const ratePassed = recognitionRate >= 90;

  console.log('\n=== P0-2 검증 결과 ===');
  console.log(`인식률: ${recognitionRate.toFixed(1)}% → ${ratePassed ? '✓ PASS' : '✗ FAIL'} (목표: 90% 이상)`);
  console.log(`SRT 파일: ${existsSync(SUBTITLE_FILE) ? '✓ 생성됨' : '✗ 없음'}`);

  if (!ratePassed) {
    console.warn('\n[경고] 인식률이 목표치(90%)에 미달합니다.');
    console.warn('오디오 품질 또는 모델 설정을 확인하세요.');
  }
}

async function main(): Promise<void> {
  const result = runTranscription();
  analyzeResults(result);
}

main().catch((err: unknown) => {
  console.error('[Whisper] 오류 발생:', err);
  process.exit(1);
});
