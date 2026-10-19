// Transcripción con Whisper corriendo dentro del navegador (WASM): gratis y sin claves de API.
// El modelo se descarga una sola vez y queda guardado en el navegador.
import {
  canUseWhisperWeb,
  downloadWhisperModel,
  resampleTo16Khz,
  toCaptions,
  transcribe,
  type WhisperWebLanguage,
  type WhisperWebModel,
} from "@remotion/whisper-web";
import type { Word } from "../project/types";

export type TranscribeStep = "modelo" | "audio" | "transcribiendo";

export const WHISPER_MODELS: { id: WhisperWebModel; label: string }[] = [
  { id: "tiny", label: "Rápido (75 MB)" },
  { id: "base", label: "Equilibrado (145 MB)" },
  { id: "small", label: "Preciso (480 MB)" },
];

export const WHISPER_LANGUAGES: { id: WhisperWebLanguage; label: string }[] = [
  { id: "en", label: "Inglés" },
  { id: "es", label: "Español" },
  { id: "auto", label: "Detectar" },
];

export async function transcribeMedia(opts: {
  src: string;
  fps: number;
  model: WhisperWebModel;
  language: WhisperWebLanguage;
  onProgress: (step: TranscribeStep, progress: number) => void;
}): Promise<Word[]> {
  const support = await canUseWhisperWeb(opts.model);
  if (!support.supported) {
    throw new Error(`Este navegador no puede transcribir (${support.detailedReason ?? support.reason}). Usa Chrome.`);
  }

  await downloadWhisperModel({ model: opts.model, onProgress: (p) => opts.onProgress("modelo", p.progress) });

  const file = await (await fetch(opts.src)).blob();
  const channelWaveform = await resampleTo16Khz({ file, onProgress: (p) => opts.onProgress("audio", p) });

  const result = await transcribe({
    channelWaveform,
    model: opts.model,
    language: opts.language,
    onProgress: (p) => opts.onProgress("transcribiendo", p),
  });

  const { captions } = toCaptions({ whisperWebOutput: result });
  const msToFrame = (ms: number) => Math.round((ms / 1000) * opts.fps);
  return captions
    .map((c) => ({ text: c.text.trim(), start: msToFrame(c.startMs), end: msToFrame(c.endMs) }))
    .filter((w) => w.text.length > 0 && !/^\[.*\]$/.test(w.text)); // quita marcas tipo [MUSIC]
}
