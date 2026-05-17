#!/usr/bin/env python3
import sys
import json
import io
from faster_whisper import WhisperModel

# Windows에서 stdout을 UTF-8로 강제 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def transcribe(audio_path: str, model_size: str = "large-v3", language: str = "ko"):
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(audio_path, language=language, word_timestamps=True)

    result = {
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "segments": []
    }

    srt_lines = []
    srt_index = 1

    for segment in segments:
        seg_data = {
            "id": segment.id,
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
            "words": []
        }

        if segment.words:
            for word in segment.words:
                seg_data["words"].append({
                    "word": word.word.strip(),
                    "start": word.start,
                    "end": word.end,
                    "probability": word.probability
                })

        result["segments"].append(seg_data)

        # SRT 형식으로 변환
        start_time = format_timestamp(segment.start)
        end_time = format_timestamp(segment.end)
        srt_lines.append(f"{srt_index}")
        srt_lines.append(f"{start_time} --> {end_time}")
        srt_lines.append(segment.text.strip())
        srt_lines.append("")
        srt_index += 1

    return result, "\n".join(srt_lines)

def format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python transcribe.py <audio_path> <output_srt_path>", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    output_srt_path = sys.argv[2]

    result, srt_content = transcribe(audio_path)

    # SRT 파일 저장
    with open(output_srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)

    # JSON 결과 stdout 출력 (TypeScript에서 파싱)
    print(json.dumps(result, ensure_ascii=False))
