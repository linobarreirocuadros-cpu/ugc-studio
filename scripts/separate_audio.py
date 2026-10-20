"""Resemble Denoiser ONNX: voz mono y residuo estéreo, conservando duración.

Adaptador STFT basado en skeskinen/resemble-denoise-onnx-inference (MIT).
Ver scripts/licenses/resemble-denoiser.LICENSE y README.md.
"""
import argparse
import hashlib
import os
from pathlib import Path
import numpy as np
import onnxruntime as ort
import soundfile as sf

RATE, HOP, FFT = 44100, 420, 1680
MODEL_SHA = "490640369540d1b0948352b75f880e215863a0de0b95a4b621ef590ee0e04e77"
WINDOW = np.hanning(FFT + 1)[:-1].astype(np.float32)


def spectrum(wav):
    # Un margen FFT completo mantiene el último frame duplicado fuera del audio útil.
    padded = np.pad(wav, (0, FFT))
    padded = np.pad(padded, (FFT // 2, FFT // 2), mode="reflect")
    frames = np.lib.stride_tricks.sliding_window_view(padded, FFT)[::HOP]
    return np.fft.rfft(frames * WINDOW, axis=-1).T[None, :, :-1]


def waveform(spec, length):
    spec = np.pad(spec, ((0, 0), (0, 0), (0, 1)), mode="edge")
    frames = np.fft.irfft(spec[0].T, n=FFT, axis=-1).astype(np.float32)
    total = (len(frames) - 1) * HOP + FFT
    result, weight = np.zeros(total, np.float32), np.zeros(total, np.float32)
    for index, frame in enumerate(frames):
        start = index * HOP
        result[start:start + FFT] += frame * WINDOW
        weight[start:start + FFT] += WINDOW ** 2
    result /= np.maximum(weight, 1e-8)
    return result[FFT // 2:FFT // 2 + length]


def denoise(session, wav):
    peak = max(float(np.max(np.abs(wav))), 1e-7)
    spec = spectrum(wav / peak)
    mag, phase = np.abs(spec), np.angle(spec)
    out_mag, out_cos, out_sin = session.run(None, {
        "mag": mag.astype(np.float32),
        "cos": np.cos(phase).astype(np.float32),
        "sin": np.sin(phase).astype(np.float32),
    })
    return waveform(out_mag * (out_cos + 1j * out_sin), len(wav)) * peak


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("voice")
    parser.add_argument("background")
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    model = Path(args.model)
    if hashlib.sha256(model.read_bytes()).hexdigest() != MODEL_SHA:
        raise ValueError("Modelo de audio desconocido o incompleto; ejecuta Preparar audio local.")
    options = ort.SessionOptions()
    options.intra_op_num_threads = min(8, os.cpu_count() or 2)
    session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
    samples, rate = sf.read(args.input, dtype="float32", always_2d=True)
    if rate != RATE or samples.shape[1] != 2 or not len(samples):
        raise ValueError("La entrada debe ser WAV estéreo no vacío a 44100 Hz")
    mono, voice = samples.mean(axis=1), np.zeros(len(samples), np.float32)
    chunk, context = RATE * 8, RATE // 2
    for start in range(0, len(mono), chunk):
        end = min(start + chunk, len(mono))
        left, right = max(0, start - context), min(len(mono), end + context)
        cleaned = denoise(session, mono[left:right])
        voice[start:end] = cleaned[start - left:end - left]
        print(f"Voz procesada: {end}/{len(mono)} muestras", flush=True)
    stereo_voice = np.repeat(voice[:, None], 2, axis=1)
    sf.write(args.voice, stereo_voice, RATE, subtype="FLOAT")
    sf.write(args.background, samples - stereo_voice, RATE, subtype="FLOAT")
    print(f"Resemble Denoiser ONNX · CPU · {len(samples)} muestras", flush=True)


if __name__ == "__main__":
    main()
