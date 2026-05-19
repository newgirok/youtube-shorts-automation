import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
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
    `"${ffmpegPath}" -y -loop 1 -i "${imagePath}" -vf "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,${zoompan},scale=1080:1920" -c:v libx264 -crf 23 -t ${duration} "${outputPath}"`,
    { stdio: 'inherit', timeout: 120_000 }
  );
}

export function concatClipsWithAudio(
  clipPaths: string[],
  audioPath: string,
  srtPath: string,
  outputPath: string,
  ffmpegPath: string,
  fontName: string,
  tmpDir: string
): void {
  const listPath = join(tmpDir, 'concat_list.txt');
  const listContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  writeFileSync(listPath, listContent, 'utf-8');

  const concatPath = join(tmpDir, 'concat_raw.mp4');
  execSync(
    `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c copy "${concatPath}"`,
    { stdio: 'inherit', timeout: 120_000 }
  );

  const escapedSrt = escapeSubtitlePath(srtPath);
  const subtitleFilter = `subtitles='${escapedSrt}':force_style='FontName=${fontName},FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Bold=1,Outline=4,Shadow=2,MarginV=80'`;
  execSync(
    `"${ffmpegPath}" -y -i "${concatPath}" -i "${audioPath}" -vf "${subtitleFilter}" -c:v libx264 -crf 23 -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`,
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
