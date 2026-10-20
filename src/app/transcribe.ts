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
import type { Project, VideoClip, Word } from "../project/types";
import { runLocalTask } from "./localAssistant";
import { wordsFromWhisperTokens } from "../project/transcript";
export type TranscriptInfo = NonNullable<Project["transcriptInfo"]>[string];

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

// Preferencias de transcripción (idioma y modelo) recordadas en el navegador.
export const loadPref = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem("ugc-studio:" + key) as T) ?? fallback;
  } catch {
    return fallback;
  }
};
export const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem("ugc-studio:" + key, value);
  } catch {
    /* sin almacenamiento */
  }
};
export const whisperPrefs = () => ({
  model: loadPref<WhisperWebModel>("whisper-model", "small"),
  language: loadPref<WhisperWebLanguage>("whisper-lang", "auto"),
  engine: loadPref<"local" | "browser">("transcription-engine", "local"),
  vocabulary: loadPref<string>("transcription-vocabulary", ""),
});

const STEP_LABEL: Record<TranscribeStep, string> = {
  modelo: "Descargando modelo",
  audio: "Leyendo audio",
  transcribiendo: "Transcribiendo",
};

/** Archivos de V1 que todavía no tienen transcripción: [src, nombre]. */
export const pendingTranscripts = (project: Project): [string, string][] => {
  const clips = (project.tracks.find((t) => t.id === "V1")?.clips ?? []).filter(
    (c): c is VideoClip => c.kind === "video",
  );
  const preferences = whisperPrefs();
  return [...new Map(clips.map((c) => [c.src, c.name])).entries()].filter(([src]) => {
    const info = project.transcriptInfo?.[src];
    return !project.transcripts?.[src] || !info || info.engine !== preferences.engine || info.model !== (preferences.engine === "local" ? "large-v3" : preferences.model) || info.language !== preferences.language || (info.vocabulary ?? "") !== preferences.vocabulary;
  });
};

/** Transcribe todos los videos de V1 que falten. `onDone` recibe cada resultado para guardarlo. */
export async function transcribeMissing(
  project: Project,
  onDone: (src: string, words: Word[], info: TranscriptInfo) => void,
  onStatus: (text: string) => void,
  force = false,
) {
  const pending = force ? pendingTranscripts({ ...project, transcripts: {} }) : pendingTranscripts(project);
  const { model, language, engine, vocabulary } = whisperPrefs();
  for (const [i, [src, name]] of pending.entries()) {
    const words = engine === "local" ? await transcribeLocal(src, project.fps, language, vocabulary, (text) => onStatus(`${name} · ${text}`), force) : await transcribeMedia({
      src,
      fps: project.fps,
      model,
      language,
      onProgress: (step, p) => onStatus(`${name} (${i + 1}/${pending.length}) · ${STEP_LABEL[step]} ${Math.round(p * 100)}%`),
    });
    onDone(src, words, { engine, model: engine === "local" ? "large-v3" : model, language, vocabulary });
  }
}

async function transcribeLocal(src: string, fps: number, language: string, vocabulary: string, onStatus: (text: string) => void, force: boolean): Promise<Word[]> {
  const status = await fetch("/api/transcription/status").then((r) => r.json());
  if (!status.ready) throw new Error(status.error || "Prepara la transcripción local antes de continuar.");
  const result = await runLocalTask<{ words: { text: string; start: number; end: number; confidence: number }[] }>("/api/transcription", { src, language, vocabulary, force }, onStatus);
  return result.words.map((word) => ({ ...word, start: Math.round(word.start * fps), end: Math.max(Math.round(word.start * fps) + 1, Math.round(word.end * fps)) }));
}

/** Transcribe una grabación de voz (comandos por micrófono). Devuelve el texto. */
export async function transcribeVoice(file: Blob): Promise<string> {
  const { model } = whisperPrefs();
  const language = loadPref<WhisperWebLanguage>("voice-lang", "es"); // tú hablas en español aunque el video sea en inglés
  await downloadWhisperModel({ model, onProgress: () => {} });
  const channelWaveform = await resampleTo16Khz({ file });
  const result = await transcribe({ channelWaveform, model, language });
  const { captions } = toCaptions({ whisperWebOutput: result });
  return captions.map((c) => c.text).join("").replace(/\[.*?\]/g, "").trim();
}

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
  return wordsFromWhisperTokens(captions, opts.fps);
}
