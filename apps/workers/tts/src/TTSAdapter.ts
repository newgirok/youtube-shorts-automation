export interface TTSAdapter {
  synthesize(text: string, outputPath: string): Promise<void>;
}
