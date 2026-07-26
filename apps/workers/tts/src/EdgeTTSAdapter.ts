import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { TTSAdapter } from './TTSAdapter.js';

export class EdgeTTSAdapter implements TTSAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_edgeTtsPath: string) {}

  vttPath(audioPath: string): string {
    return audioPath.replace(/\.mp3$/, '.vtt');
  }

  async synthesize(text: string, outputPath: string): Promise<void> {
    const tmpDir = '/tmp';
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      'ko-KR-SunHiNeural',
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );

    const { audioStream } = await tts.toStream(text, { rate: '+20%' });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }

    writeFileSync(outputPath, Buffer.concat(chunks));
    tts.close();
  }
}
