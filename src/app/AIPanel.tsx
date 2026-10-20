import { useState } from "react";
import type { WhisperWebLanguage, WhisperWebModel } from "@remotion/whisper-web";
import * as ops from "../project/ops";
import type { CaptionPreset, Project, VideoClip } from "../project/types";
import { WHISPER_LANGUAGES, WHISPER_MODELS, loadPref, pendingTranscripts, savePref, transcribeMissing, whisperPrefs } from "./transcribe";

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
  const [model, setModel] = useState<WhisperWebModel>(() => whisperPrefs().model);
  const [language, setLanguage] = useState<WhisperWebLanguage>(() => whisperPrefs().language);
  const [engine, setEngine] = useState<"local" | "browser">(() => whisperPrefs().engine);
  const [vocabulary, setVocabulary] = useState(() => whisperPrefs().vocabulary);
  const [preset, setPreset] = useState<CaptionPreset>("karaoke");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const videoClips = (project.tracks.find((t) => t.id === "V1")?.clips ?? []).filter(
    (c): c is VideoClip => c.kind === "video" && !c.sequenceId,
  );
  const sources = [...new Map(videoClips.map((c) => [c.src, c.name])).entries()];
  const done = sources.length - pendingTranscripts(project).length;

  const transcribePending = (force = false) =>
    transcribeMissing(project, (src, words, info) => apply((p) => ops.setTranscript(p, src, words, info)), setStatus, force);

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
        <label>Motor de transcripción<select value={engine} disabled={busy} onChange={(e) => { const value = e.target.value as "local" | "browser"; setEngine(value); savePref("transcription-engine", value); }}>
          <option value="local">Local preciso · Whisper large-v3</option><option value="browser">Navegador · modelo ligero</option>
        </select></label>
        <p className="hint">La transcripción tiene su propio motor, independiente del modelo del chat. Large-v3 funciona gratis en este equipo.</p>
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
        {engine === "browser" && <label>
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
        </label>}
        <label>Marcas y nombres que aparecen en el audio<input value={vocabulary} maxLength={500} disabled={busy} placeholder="Vocabulario de referencia, sin inventar frases" onChange={(e) => { setVocabulary(e.target.value); savePref("transcription-vocabulary", e.target.value); }} /></label>
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
        <button disabled={busy || sources.length === 0} onClick={() => void run("Volviendo a transcribir…", () => transcribePending(true))} title="Actualiza el texto; después pulsa Generar subtítulos para reemplazar los anteriores">Volver a transcribir</button>
        {sources.some(([src]) => project.transcripts?.[src]?.length) && <details className="transcript-preview"><summary>Leer transcripción</summary>{sources.map(([src, name]) => <div key={src}><b>{name}</b><p>{project.transcripts?.[src]?.map((w) => w.text).join(" ")}</p></div>)}</details>}
        <button disabled={busy || sources.length === 0} onClick={cutSilences} title="Corta las pausas sin voz de los clips en B1">
          Quitar silencios
        </button>
        <div className="hint">
          {sources.length === 0
            ? "Pon un video en B1 para empezar."
            : `Transcritos: ${done}/${sources.length} archivos. Consejo: quita silencios antes de generar subtítulos.`}
        </div>
        {status && <div className={status.startsWith("Error") ? "status error" : "status"}>{status}</div>}
      </div>
    </div>
  );
}
