import { useEffect, useRef, useState } from "react";
import type { Project } from "../project/types";
import * as ops from "../project/ops";
import { processAudio, searchVisual, sourceClip, splitVisualMatch, type AssistantContext, type VisualResult } from "./localAssistant";
import { formatTimecode } from "./Timeline";

export function LocalAssistantPanel({ mode, ctx, project, result }: { mode: "vision" | "audio"; ctx: () => AssistantContext; project: Project; result: VisualResult | null }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<{ cleaner?: boolean; separator?: boolean; model?: string; installed?: boolean; missing?: string[] } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(mode === "vision" ? "/api/vision/status" : "/api/audio/status").then((r) => r.json()).then((r) => { if (alive) setTools(r); }).catch(() => { if (alive) setTools(null); });
    return () => { alive = false; };
  }, [mode, refresh]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!controller.current) { setStatus(""); setError(""); } }, [project]);
  let selected = "Selecciona un clip en la línea de tiempo";
  let derived = false, processed = false;
  try {
    const clip = sourceClip(ctx(), undefined, mode === "vision");
    selected = clip.name;
    derived = clip.kind === "audio" && Boolean(clip.derivedFrom);
    const rootId = clip.kind === "audio" ? clip.derivedFrom?.clipId ?? clip.id : clip.id;
    processed = project.tracks.some((t) => t.clips.some((c) => c.kind === "audio" && c.derivedFrom?.clipId === rootId));
  } catch { /* display hint */ }
  const run = async (job: (signal: AbortSignal) => Promise<unknown>) => {
    setBusy(true); setError(""); setStatus("Preparando…");
    controller.current = new AbortController();
    try { await job(controller.current.signal); setStatus(mode === "vision" ? "Búsqueda completada." : "Audio aplicado en pistas nuevas. Puedes deshacer o restaurar el original."); }
    catch (e) { if (controller.current.signal.aborted) setStatus("Cancelado. El proyecto no cambió."); else { setError(e instanceof Error ? e.message : String(e)); setStatus(""); } }
    finally { controller.current = null; setBusy(false); }
  };
  const restore = () => {
    try { const clip = sourceClip(ctx()); const id = clip.kind === "audio" ? clip.derivedFrom?.clipId ?? clip.id : clip.id; ctx().commit(ops.restoreOriginalAudio(ctx().getProject(), id)); setStatus("Sonido original restaurado."); setError(""); }
    catch (e) { setError(String(e)); }
  };
  return <section className="local-assistant">
    <p className="hint">{selected}</p>
    {mode === "vision" ? <>
      <p>Encuentra acciones u objetos por lo que aparece en imagen. Funciona también sin diálogo.</p>
      <p className="hint">{tools ? (tools.installed ? `Visión local · ${tools.model}` : `Falta ${tools.missing?.join(", ") || tools.model}. Ejecuta «Preparar vision local (Windows).bat» y comprueba de nuevo.`) : "Comprobando el modelo de visión…"} <button onClick={() => setRefresh((n) => n + 1)} disabled={busy}>Comprobar</button></p>
      <form onSubmit={(e) => { e.preventDefault(); void run((signal) => searchVisual(ctx(), query, undefined, setStatus, signal)); }}>
        <label>Qué quieres encontrar<textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="El plano donde enseña el teléfono" maxLength={500} disabled={busy} /></label>
        <button className="primary" disabled={busy || !query.trim()}>Buscar en el clip</button>
      </form>
      <p className="hint">Hasta 60 s. Muestreo cada segundo: los rangos son aproximados; revísalos antes de ajustar el corte.</p>
      {result && <div className="visual-results">
        <p>{result.matches.length ? `Resultados: ${result.matches.length}` : "No encontré evidencia visual clara de esa petición."} · {result.sampleCount} imágenes</p>
        {result.matches.map((match, i) => <article key={`${result.clipStamp}-${i}`}>
          <img src={match.image} alt={match.description} />
          <b>{formatTimecode(match.from, project.fps)} → {formatTimecode(match.end, project.fps)}</b>
          <p>{match.description}</p>
          <button disabled={busy} onClick={() => ctx().onSeek?.(match.from)}>Ver en Programa</button>{" "}
          <button disabled={busy} onClick={() => { try { splitVisualMatch(ctx(), result, match); setError(""); setStatus("Cortes creados en los bordes. Un paso de deshacer."); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Cortar en bordes</button>
        </article>)}
      </div>}
    </> : <>
      <p>Procesa el sonido del rango visible. El video conserva su imagen y su sincronía.</p>
      <p className="hint">Audio actual: {processed ? "pistas procesadas" : "original"}. {derived && "Selecciona el clip original para volver a procesar; puedes ajustar esta pista en Propiedades."}</p>
      {!tools && <p className="hint">Comprobando herramientas locales…</p>}
      <div className="audio-local-actions">
        <button disabled={busy || derived || !tools?.cleaner} onClick={() => void run((signal) => processAudio(ctx(), "clean", undefined, setStatus, signal))}>Reducir ruido y nivelar</button>
        <button disabled={busy || derived || !tools?.separator} onClick={() => void run((signal) => processAudio(ctx(), "separate", undefined, setStatus, signal))}>Separar voz / fondo y música</button>
        <button className="primary" disabled={busy || derived || !tools?.separator || !tools?.cleaner} onClick={() => void run((signal) => processAudio(ctx(), "separate-clean", undefined, setStatus, signal))}>Separar y limpiar la voz</button>
        <button disabled={busy} onClick={restore}>Restaurar sonido original</button>
      </div>
      <p className="hint">Resemble Denoiser extrae la voz. El fondo es el residuo: música y ambiente juntos, posiblemente con restos de voz. Compara el resultado con el original.</p>
      <p className="hint">Al separar y limpiar, Fondo y música se crea silenciado para escuchar la voz aislada. Puedes subir su volumen en Propiedades.</p>
      <p className="hint">La limpieza reduce ruido y nivela; una voz saturada o con información perdida puede no recuperarse.</p>
      <p className="hint">Las pistas nuevas son independientes. Si después mueves o recortas el video, ajusta también esos audios.</p>
      {tools && (!tools.separator || !tools.cleaner) && <p className="hint">{!tools.separator && "Prepara el audio con «Preparar audio local (Windows).bat». "}{!tools.cleaner && "La limpieza requiere FFmpeg completo. "}<button onClick={() => setRefresh((n) => n + 1)}>Comprobar herramientas</button></p>}
    </>}
    {busy && <button onClick={() => controller.current?.abort()}>Cancelar tarea</button>}
    {status && <p className="local-progress" role="status">{status}</p>}
    {error && <p className="local-error" role="alert">{error}</p>}
  </section>;
}
