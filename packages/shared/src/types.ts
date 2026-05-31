export interface ScriptScene {
  start: number;
  end: number;
  text: string;
  keyword: string;
  effect: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
}

export interface ScriptOutput {
  title: string;
  hook: string;
  script: string;
  description: string;
  scenes: ScriptScene[];
  hashtags: string[];
  thumbnail_text: string;
  comment_bait: string;
}

export type ScriptContent = Partial<ScriptOutput>;

export interface BaseSQSMessage {
  jobId: string;
  channelId: string;
}

export interface ScriptMessage extends BaseSQSMessage {
  topic: string;
}

export interface TTSMessage extends BaseSQSMessage {
  scriptS3Key: string;
}

export interface SubtitleMessage extends BaseSQSMessage {
  audioS3Key: string;
}

export interface RenderMessage extends BaseSQSMessage {
  audioS3Key: string;
  subtitleS3Key: string;
}

export interface UploadMessage extends BaseSQSMessage {
  videoS3Key: string;
}
