import { execSync } from 'node:child_process';

interface FfprobeStream {
  codec_type: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeFormat {
  duration: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateVideo(videoPath: string, ffprobePath = 'ffprobe'): ValidationResult {
  let probe: FfprobeOutput;
  try {
    const out = execSync(
      `"${ffprobePath}" -v quiet -print_format json -show_streams -show_format "${videoPath}"`,
      { encoding: 'utf-8', timeout: 30_000 },
    );
    probe = JSON.parse(out) as FfprobeOutput;
  } catch (err) {
    return { valid: false, reason: `ffprobe 실행 실패: ${String(err)}` };
  }

  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');

  if (!video) return { valid: false, reason: '비디오 스트림 없음' };
  if (!audio) return { valid: false, reason: '오디오 스트림 없음' };

  if (video.width !== 1080 || video.height !== 1920) {
    return { valid: false, reason: `해상도 불일치: ${video.width}×${video.height} (기대: 1080×1920)` };
  }

  const duration = parseFloat(probe.format.duration);
  if (isNaN(duration) || duration < 5) {
    return { valid: false, reason: `영상 길이 너무 짧음: ${duration.toFixed(1)}초` };
  }
  if (duration > 65) {
    return { valid: false, reason: `영상 길이 너무 김: ${duration.toFixed(1)}초 (Shorts 최대 60초)` };
  }

  return { valid: true };
}
