"""Whisper large-v3 local: palabras con tiempo y detección de voz. Pesos/motor MIT."""
import argparse
import json
import os
import wave
import numpy as np
from pathlib import Path
from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--vocabulary", default="")
    args = parser.parse_args()
    directory = os.environ.get("UGC_WHISPER_MODEL_DIR") or snapshot_download("Systran/faster-whisper-large-v3", revision="edaa852ec7e145841d8ffdb056a99866b5f0a478",
        allow_patterns=["model.bin", "config.json", "tokenizer.json", "vocabulary.*"], local_files_only=not args.prepare)
    if args.prepare or args.status:
        if not (Path(directory) / "model.bin").is_file():
            raise FileNotFoundError("Faltan los pesos de Whisper large-v3")
        print(json.dumps({"ready": True, "model": "large-v3"}))
        return
    model = WhisperModel(directory, device="cpu", compute_type="int8", cpu_threads=min(8, os.cpu_count() or 2))
    # La extracción de FFmpeg ya entregó PCM mono a 16 kHz. Evita recodificar con PyAV.
    with wave.open(args.input, "rb") as audio_file:
        if (audio_file.getframerate(), audio_file.getnchannels(), audio_file.getsampwidth()) != (16000, 1, 2):
            raise ValueError("Se esperaba PCM mono de 16 bits a 16000 Hz")
        audio = np.frombuffer(audio_file.readframes(audio_file.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    segments, info = model.transcribe(audio, language=None if args.language == "auto" else args.language,
        task="transcribe", beam_size=5, word_timestamps=True, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350}, condition_on_previous_text=False,
        initial_prompt=args.vocabulary.strip() or None, temperature=0)
    words = []
    for segment in segments:
        for word in segment.words or []:
            if word.word.strip() and word.end > word.start:
                words.append({"text": word.word.strip(), "start": word.start, "end": word.end, "confidence": word.probability})
    Path(args.output).write_text(json.dumps({"model": "large-v3", "engine": "faster-whisper", "language": info.language,
        "languageProbability": info.language_probability, "duration": info.duration, "words": words}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
