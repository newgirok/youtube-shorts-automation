import { execSync } from 'node:child_process';

const IS_WINDOWS = process.platform === 'win32';

function escapeSubtitlePath(p: string): string {
  if (IS_WINDOWS) {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
  }
  return p.replace(/:/g, '\\:');
}

export function renderVideo(
  audioPath: string,
  srtPath: string,
  outputPath: string,
  ffmpegPath: string,
  fontName = 'Malgun Gothic',
  bgImagePath?: string
): void {
  const escapedSrt = escapeSubtitlePath(srtPath);
  const subtitleFilter = `subtitles='${escapedSrt}':force_style='FontName=${fontName},FontSize=18,MarginV=120'`;

  if (bgImagePath) {
    const scaleFilter = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${subtitleFilter}`;
    execSync(
      `"${ffmpegPath}" -y -loop 1 -i "${bgImagePath}" -i "${audioPath}" -vf "${scaleFilter}" -c:v libx264 -crf 23 -c:a aac -shortest "${outputPath}"`,
      { stdio: 'inherit', timeout: 600_000 }
    );
  } else {
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i color=c=black:s=1080x1920:r=30 -i "${audioPath}" -vf "${subtitleFilter}" -c:v libx264 -crf 23 -c:a aac -shortest "${outputPath}"`,
      { stdio: 'inherit', timeout: 600_000 }
    );
  }
}

export function measureDuration(ffprobePath: string, videoPath: string): number {
  const result = execSync(
    `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { encoding: 'utf-8' }
  ).trim();
  return parseFloat(result);
}
