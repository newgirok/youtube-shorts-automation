export interface ScriptOutput {
  title: string;
  hook: string;
  script: string;
  description: string;
  hashtags: string[];
  thumbnail_text: string;
  comment_bait: string;
}

export interface ScriptContent {
  title?: string;
  description?: string;
  hashtags?: string[];
  thumbnail_text?: string;
}

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
