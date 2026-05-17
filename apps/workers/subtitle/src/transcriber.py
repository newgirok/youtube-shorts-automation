import sys
import io
import json
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from faster_whisper import WhisperModel

def format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def transcribe(audio_path: str, output_path: str):
    model = WhisperModel("large-v3", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        audio_path,
        language="ko",
        word_timestamps=True,
        beam_size=5,
    )

    with open(output_path, "w", encoding="utf-8") as f:
        idx = 1
        for segment in segments:
            start = format_time(segment.start)
            end = format_time(segment.end)
            text = segment.text.strip()
            f.write(f"{idx}\n{start} --> {end}\n{text}\n\n")
            idx += 1

    print(json.dumps({"status": "ok", "output": output_path}))

if __name__ == "__main__":
    transcribe(sys.argv[1], sys.argv[2])
