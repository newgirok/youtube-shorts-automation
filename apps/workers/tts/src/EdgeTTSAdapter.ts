import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TTSAdapter } from './TTSAdapter.js';

export class EdgeTTSAdapter implements TTSAdapter {
  constructor(private readonly edgeTtsPath: string) {}

  async synthesize(text: string, outputPath: string): Promise<void> {
    const tmpDir = '/tmp';
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const textFile = join(tmpDir, `tts-input-${Date.now()}.txt`);
    writeFileSync(textFile, text, 'utf-8');

    execSync(
      `"${this.edgeTtsPath}" --voice ko-KR-SunHiNeural --file "${textFile}" --write-media "${outputPath}"`,
      { stdio: 'inherit', timeout: 120_000 }
    );
  }
}
