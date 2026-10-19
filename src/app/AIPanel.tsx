import { useState } from "react";
import type { WhisperWebLanguage, WhisperWebModel } from "@remotion/whisper-web";
import * as ops from "../project/ops";
import type { CaptionPreset, Project, VideoClip } from "../project/types";
import { WHISPER_LANGUAGES, WHISPER_MODELS, loadPref, pendingTranscripts, savePref, transcribeMissing } from "./transcribe";

export const CAPTION_PRESETS: { id: CaptionPreset; label: string }[] = [
  { id: "karaoke", label: "Karaoke (resalta la palabra)" },
  { id: "palabra", label: "Palabra por palabra" },
  { id: "bloque", label: "Bloque con fondo" },
];

type Props = {
  project: Project;
  apply: (fn: (p: Project) => Project) => void;
};

export function AIPanel({ project, apply }: Props) {
  const [model, setModel] = useState<WhisperWebModel>(() => loadPref("whisper-model", "base"));
  const [language, setLanguage] = useState<WhisperWebLanguage>(() => loadPref("whisper-lang", "en"));
  const [preset, setPreset] = useState<CaptionPreset>("karaoke");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const videoClips = (project.tracks.find((t) => t.id === "V1")?.clips ?? []).filter(
    (c): c is VideoClip => c.kind === "video",
  );
  const sources = [...new Map(videoClips.map((c) => [c.src, c.name])).entries()];
  const done = sources.length - pendingTranscripts(project).length;

  const transcribePending = () =>
    transcribeMissing(project, (src, words) => apply((p) => ops.setTranscript(p, src, words)), setStatus);

  const run = async (label: string, task: () => Promise<void> | void) => {
    setBusy(true);
    setStatus(label);
    try {
      await task();
      setStatus("✓ Listo");
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    run("Preparando…", async () => {
      await transcribePending();
      apply((p) => ops.generateCaptions(p, { ...ops.DEFAULT_CAPTION_OPTIONS, style: { preset } }));
    });

  const cutSilences = () =>
    run("Preparando…", async () => {
      await transcribePending();
      apply((p) => ops.removeSilences(p));
    });

  return (
    <div className="ai-panel">
      <div className="panel-title">Herramientas IA</div>
      <div className="fields">
        <label>
          Idioma del video
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as WhisperWebLanguage);
              savePref("whisper-lang", e.target.value);
            }}
          >
            {WHISPER_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
        <label>
          Modelo de transcripción
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value as WhisperWebModel);
              savePref("whisper-model", e.target.value);
            }}
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <label>
          Estilo de subtítulos
          <select value={preset} onChange={(e) => setPreset(e.target.value as CaptionPreset)}>
            {CAPTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || sources.length === 0} onClick={generate}>
          Generar subtítulos
        </button>
        <button disabled={busy || sources.length === 0} onClick={cutSilences} title="Corta las pausas sin voz de los clips en V1">
          Quitar silencios
        </button>
        <div className="hint">
          {sources.length === 0
            ? "Pon un video en V1 para empezar."
            : `Transcritos: ${done}/${sources.length} archivos. Consejo: quita silencios antes de generar subtítulos.`}
        </div>
        {status && <div className={status.startsWith("Error") ? "status error" : "status"}>{status}</div>}
      </div>
    </div>
  );
}
