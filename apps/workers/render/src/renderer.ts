import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';

function escapeSubtitlePath(p: string): string {
  if (IS_WINDOWS) {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
  }
  return p.replace(/:/g, '\\:');
}

export type SceneEffect = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

function buildZoompanFilter(effect: SceneEffect, duration: number): string {
  const fps = 30;
  const frames = Math.ceil(duration * fps);

  switch (effect) {
    case 'zoom-in':
      return `zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`;
    case 'zoom-out':
      return `zoompan=z='if(eq(on,1),1.5,max(zoom-0.0015,1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`;
    case 'pan-left':
      return `zoompan=z=1.2:x='on/${frames}*(iw-(iw/zoom))':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`;
    case 'pan-right':
      return `zoompan=z=1.2:x='(1-on/${frames})*(iw-(iw/zoom))':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`;
  }
}

export function renderSceneClip(
  imagePath: string,
  outputPath: string,
  duration: number,
  effect: SceneEffect,
  ffmpegPath: string
): void {
  const zoompan = buildZoompanFilter(effect, duration);
  execSync(
    `"${ffmpegPath}" -y -loop 1 -i "${imagePath}" -vf "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,${zoompan},scale=1080:1920" -r 30 -c:v libx264 -crf 23 -t ${duration} "${outputPath}"`,
    { stdio: 'inherit', timeout: 120_000 }
  );
}

export function renderSceneFromVideo(
  videoPath: string,
  outputPath: string,
  duration: number,
  ffmpegPath: string
): void {
  // -stream_loop -1: 소스 영상이 duration보다 짧을 때 루프
  // -r 30: 모든 클립 fps를 30으로 정규화 (concat 타이밍 불일치 방지)
  execSync(
    `"${ffmpegPath}" -y -stream_loop -1 -i "${videoPath}" -vf "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,scale=1080:1920" -r 30 -c:v libx264 -crf 23 -t ${duration} "${outputPath}"`,
    { stdio: 'inherit', timeout: 180_000 }
  );
}

function escapeDrawtextValue(text: string): string {
  return text.replace(/['\\:]/g, '\\$&');
}

// ASS 센티초 ↔ 정수 변환
function assTimeToCs(t: string): number {
  const [h, m, sc] = t.split(':');
  const [s, cs] = sc.split('.');
  return (parseInt(h) * 360000 + parseInt(m) * 6000 + parseInt(s) * 100 + parseInt(cs));
}
function csToAssTime(cs: number): string {
  const h = Math.floor(cs / 360000); cs %= 360000;
  const m = Math.floor(cs / 6000);   cs %= 6000;
  const s = Math.floor(cs / 100);    cs %= 100;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

// SRT→ASS 변환 시 센티초 반올림으로 생기는 오버랩 제거
// 겹치는 end time을 다음 엔트리 start - 1cs 로 보정
function fixAssOverlaps(content: string): string {
  const DLG = /^(Dialogue: \d+,)(\d:\d{2}:\d{2}\.\d{2}),(\d:\d{2}:\d{2}\.\d{2})(,.*)$/gm;
  const lines: { prefix: string; start: number; end: number; suffix: string; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = DLG.exec(content)) !== null) {
    lines.push({ prefix: m[1], start: assTimeToCs(m[2]), end: assTimeToCs(m[3]), suffix: m[4], raw: m[0] });
  }
  for (let i = 0; i + 1 < lines.length; i++) {
    const curr = lines[i]!;
    const next = lines[i + 1]!;
    if (curr.end > next.start) {
      const fixed = csToAssTime(next.start - 1);
      const newLine = `${curr.prefix}${csToAssTime(curr.start)},${fixed}${curr.suffix}`;
      content = content.replace(curr.raw, newLine);
      curr.end = next.start - 1;
    }
  }
  return content;
}

export function concatClipsWithAudio(
  clipPaths: string[],
  audioPath: string,
  srtPath: string,
  outputPath: string,
  ffmpegPath: string,
  fontName: string,
  tmpDir: string,
  title: string,
  fontsDir?: string
): void {
  const listPath = join(tmpDir, 'concat_list.txt');
  const listContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  writeFileSync(listPath, listContent, 'utf-8');

  const concatPath = join(tmpDir, 'concat_raw.mp4');
  execSync(
    `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c copy "${concatPath}"`,
    { stdio: 'inherit', timeout: 120_000 }
  );

  // fontsDir 지정 시 프로젝트 로컬 SBAggro-Bold.ttf 사용, 미지정 시 시스템 폰트 fallback
  const fontPath = fontsDir
    ? `${fontsDir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:')}/SBAggro-Bold.ttf`
    : (IS_WINDOWS
        ? 'C\\:/Windows/Fonts/malgunbd.ttf'
        : '/usr/share/fonts/truetype/nanum/NanumSquareEB.ttf');

  function writeTitleFile(text: string, index: number): string {
    const filePath = join(tmpDir, `title-${index}.txt`);
    writeFileSync(filePath, text, 'utf-8');
    // 드라이브 콜론 이스케이프: C:/... → C\:/... (FFmpeg drawtext textfile= 파서 요구사항)
    return IS_WINDOWS
      ? filePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:')
      : filePath;
  }

  const HEADER_H = 560;
  const FOOTER_H = 620;
  const FOOTER_Y = 1920 - FOOTER_H; // 1300
  const FONT_SIZE_1 = 110;
  const FONT_SIZE_2 = 110;

  // 폰트 크기 동적 계산: 텍스트가 프레임(1080px 전폭) 밖으로 나가지 않게 축소
  // kor=0.70: 0.82보다 보수적이지 않게 → 더 큰 폰트 유지
  function calcFontSize(text: string, maxW: number, base: number): number {
    const kor = (text.match(/[가-힣]/g) ?? []).length;
    const other = text.length - kor;
    const est = (kor * 0.85 + other * 0.55) * base;
    if (est <= maxW) return base;
    return Math.max(60, Math.floor(base * (maxW / est)));
  }
  const SAFE_W = 940; // 좌우 각 70px 여백 확보

  // 헤더: 불투명 검은 패널 + 제목 텍스트 (항상 2줄, 흰색+노란색 크기 다름)
  let headerTextFilter = '';
  if (title) {
    const half = Math.floor(title.length / 2);
    const leftSpace = title.lastIndexOf(' ', half);
    const rightSpace = title.indexOf(' ', half);
    let splitAt: number;
    if (title.length <= 6 || (leftSpace < 0 && rightSpace < 0)) {
      // 매우 짧거나 공백 없는 경우: 단일 큰 폰트
      const tf = writeTitleFile(title, 1);
      const fs2 = calcFontSize(title, SAFE_W, FONT_SIZE_2);
      const yCenter = HEADER_H - fs2 - 80;
      headerTextFilter = `,drawtext=fontfile='${fontPath}':textfile='${tf}':x=(w-text_w)/2:y=${yCenter}:fontsize=${fs2}:fontcolor=yellow:borderw=11:bordercolor=black`;
    } else {
      if (leftSpace < 0) splitAt = rightSpace;
      else if (rightSpace < 0) splitAt = leftSpace;
      else splitAt = (half - leftSpace) <= (rightSpace - half) ? leftSpace : rightSpace;
      const line1 = title.slice(0, splitAt).trim();
      const line2 = title.slice(splitAt).trim();
      const tf1 = writeTitleFile(line1, 1);
      const tf2 = writeTitleFile(line2, 2);
      const fs1 = calcFontSize(line1, SAFE_W, FONT_SIZE_1);
      const fs2 = calcFontSize(line2, SAFE_W, FONT_SIZE_2);
      // 헤더 하단부 배치: 위 여백을 더 많이, 아래 여백을 적게 (YouTube UI 최소 여백 200px 유지)
      const totalTextH = fs1 + 20 + fs2;
      const y1 = Math.max(200, HEADER_H - totalTextH - 60);
      const y2 = y1 + fs1 + 20;
      headerTextFilter = `,drawtext=fontfile='${fontPath}':textfile='${tf1}':x=(w-text_w)/2:y=${y1}:fontsize=${fs1}:fontcolor=white:borderw=11:bordercolor=black,drawtext=fontfile='${fontPath}':textfile='${tf2}':x=(w-text_w)/2:y=${y2}:fontsize=${fs2}:fontcolor=yellow:borderw=11:bordercolor=black`;
    }
  }
  const headerFilter = `drawbox=x=0:y=0:w=iw:h=${HEADER_H}:color=black@1.0:t=fill${headerTextFilter}`;
  const footerFilter = `drawbox=x=0:y=${FOOTER_Y}:w=iw:h=${FOOTER_H}:color=black@1.0:t=fill`;

  const assPath = join(tmpDir, 'subtitle.ass');
  execSync(`"${ffmpegPath}" -y -i "${srtPath}" "${assPath}"`, { stdio: 'pipe' });

  let assContent = readFileSync(assPath, 'utf-8');
  assContent = assContent
    .replace(/PlayResX:\s*\d+/, 'PlayResX: 1080')
    .replace(/PlayResY:\s*\d+/, 'PlayResY: 1920')
    .replace(
      /^Style: Default,.+$/m,
      // BorderStyle=3: 불투명 검은 박스, FontSize=76, MarginV=510
      `Style: Default,${fontName},76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,10,0,2,40,40,510,1`,
    );

  // SRT→ASS 센티초 반올림으로 인한 오버랩 보정
  // (예: SRT 23,000ms → ASS 23.01 로 +10ms 변환되어 다음 엔트리와 겹침 → libass가 자막을 위로 밀어버림)
  assContent = fixAssOverlaps(assContent);

  writeFileSync(assPath, assContent, 'utf-8');

  const escapedAss = escapeSubtitlePath(assPath);
  const fontsDirArg = fontsDir ? `:fontsdir='${escapeSubtitlePath(fontsDir)}'` : '';
  const subtitleFilter = `ass='${escapedAss}'${fontsDirArg}`;

  // tpad: 클립 합계가 오디오보다 짧을 때 마지막 프레임을 반복해 비디오 스트림 공백 방지
  const vfFilter = `${headerFilter},${footerFilter},${subtitleFilter},tpad=stop_mode=clone:stop_duration=60`;

  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
  const audioDuration = parseFloat(
    execSync(
      `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      { encoding: 'utf-8' }
    ).trim()
  );

  execSync(
    `"${ffmpegPath}" -y -i "${concatPath}" -i "${audioPath}" -vf "${vfFilter}" -c:v libx264 -crf 23 -c:a aac -map 0:v:0 -map 1:a:0 -t ${audioDuration} "${outputPath}"`,
    { stdio: 'inherit', timeout: 600_000 }
  );
}

export function measureDuration(ffprobePath: string, videoPath: string): number {
  const result = execSync(
    `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { encoding: 'utf-8' }
  ).trim();
  return parseFloat(result);
}
