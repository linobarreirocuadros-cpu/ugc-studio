import type { AudioClip, Project, VideoClip } from "../project/types";
import * as ops from "../project/ops";

export type VisualMatch = { from: number; end: number; sourceStart: number; sourceEnd: number; description: string; image: string };
export type VisualResult = { clipId: string; clipStamp: string; query: string; model: string; sampleCount: number; matches: VisualMatch[] };
export type AssistantContext = {
  getProject: () => Project;
  commit: (next: Project) => void;
  selectedClipId?: string | null;
  selectedClipIds?: string[];
  currentFrame?: number;
  currentSequenceId?: string | null;
  nestSequences?: boolean;
  onSeek?: (frame: number) => void;
  showVisualResult?: (result: VisualResult) => void;
  registerMedia?: (items: { src: string; name: string; durationInFrames: number; kind: "audio" }[]) => void;
};
type SourceClip = VideoClip | AudioClip;
export const clipStamp = (clip: SourceClip, fps: number) => JSON.stringify([clip.id, clip.src, clip.from, clip.trimStart, clip.durationInFrames, fps]);

export function sourceClip(ctx: AssistantContext, id?: string, videoOnly = false): SourceClip {
  if (!id && (ctx.selectedClipIds?.length ?? 0) > 1) throw new Error("Hay varios clips seleccionados. Selecciona uno para esta acción o indica su identificador en el chat.");
  const project = ctx.getProject();
  const requested = id || ctx.selectedClipId;
  const selected = requested ? ops.findClip(project, requested)?.clip : null;
  if (selected && (selected.kind === "video" || selected.kind === "audio") && selected.sequenceId) throw new Error("Abre la secuencia para analizar sus clips, o colócala como clips individuales.");
  if (selected && (selected.kind === "video" || (!videoOnly && selected.kind === "audio"))) return selected;
  if (requested) throw new Error(videoOnly ? "Selecciona un clip de video en la línea de tiempo." : "Selecciona un clip de video o audio en la línea de tiempo.");
  const candidates = project.tracks.flatMap((t) => t.clips).filter((c): c is SourceClip => (c.kind === "video" || (!videoOnly && c.kind === "audio" && !c.derivedFrom)) && !c.sequenceId);
  if (candidates.length !== 1) throw new Error("Selecciona el clip que quieres procesar en la línea de tiempo.");
  return candidates[0];
}

async function json(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
  return body;
}
export async function runLocalTask<T>(url: string, input: unknown, onStatus: (text: string) => void, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const { id } = await json(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const cancel = () => { fetch(`/api/local-tasks/${id}/cancel`, { method: "POST" }).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) { cancel(); signal.throwIfAborted(); }
    for (;;) {
      signal?.throwIfAborted();
      const task = await json(`/api/local-tasks/${id}`, { signal });
      onStatus(`${task.message} ${Math.round(task.progress)}%`);
      if (task.status === "done") return task.result as T;
      if (task.status === "error") throw new Error(task.error);
      if (task.status === "cancelled") throw new Error("Tarea cancelada.");
      await new Promise<void>((resolve) => setTimeout(resolve, 700));
    }
  } finally { signal?.removeEventListener("abort", cancel); }
}

export async function searchVisual(ctx: AssistantContext, query: string, id: string | undefined, status: (text: string) => void, signal?: AbortSignal) {
  const project = ctx.getProject(), clip = sourceClip(ctx, id, true);
  const stamp = clipStamp(clip, project.fps);
  const result = await runLocalTask<{ model: string; sampleCount: number; ranges: { start: number; end: number; description: string; image: string }[] }>("/api/vision/search", {
    src: clip.src, start: clip.trimStart / project.fps, duration: clip.durationInFrames / project.fps, query,
  }, status, signal);
  signal?.throwIfAborted();
  const visual: VisualResult = { clipId: clip.id, clipStamp: stamp, query, model: result.model, sampleCount: result.sampleCount, matches: result.ranges.map((r) => ({
    from: Math.max(clip.from, clip.from + Math.round(r.start * project.fps) - clip.trimStart),
    end: Math.min(clip.from + clip.durationInFrames, clip.from + Math.round(r.end * project.fps) - clip.trimStart),
    sourceStart: r.start, sourceEnd: r.end, description: r.description, image: r.image,
  })).filter((r) => r.end > r.from) };
  ctx.showVisualResult?.(visual);
  return visual;
}

export function splitVisualMatch(ctx: AssistantContext, result: VisualResult, match: VisualMatch) {
  const current = ctx.getProject(), clip = ops.findClip(current, result.clipId)?.clip;
  if (!clip || clip.kind !== "video" || clipStamp(clip, current.fps) !== result.clipStamp) throw new Error("El clip cambió desde la búsqueda. Busca de nuevo para actualizar los tiempos.");
  ctx.commit(ops.splitClipRange(current, clip.id, match.from, match.end));
  ctx.onSeek?.(match.from);
}

export async function processAudio(ctx: AssistantContext, mode: "clean" | "separate" | "separate-clean", id: string | undefined, status: (text: string) => void, signal?: AbortSignal) {
  const project = ctx.getProject(), clip = sourceClip(ctx, id);
  if (!ops.clipsEditable(project, [clip.id])) throw new Error("La pista o su pareja está bloqueada. Desbloquéala antes de procesar el audio.");
  if (clip.kind === "audio" && clip.derivedFrom) throw new Error("Selecciona el clip original para volver a procesar su voz; esta pista ya es un resultado derivado.");
  const stamp = clipStamp(clip, project.fps), volume = ops.effectiveVolume(project, clip);
  const result = await runLocalTask<{ duration: number; engine: string; stems: ops.ProcessedStem[] }>("/api/audio/process", {
    src: clip.src, start: clip.trimStart / project.fps, duration: clip.durationInFrames / project.fps, mode,
  }, status, signal);
  signal?.throwIfAborted();
  const current = ctx.getProject(), now = ops.findClip(current, clip.id)?.clip;
  if (!ops.clipsEditable(current, [clip.id])) throw new Error("La pista se bloqueó durante el proceso. El resultado está guardado; desbloquéala para aplicarlo.");
  if (!now || (now.kind !== "video" && now.kind !== "audio") || clipStamp(now, current.fps) !== stamp || ops.effectiveVolume(current, now) !== volume) throw new Error("El clip cambió durante el proceso. El resultado quedó guardado; vuelve a ejecutar para aplicarlo al rango actual.");
  if (Math.abs(result.duration * project.fps - clip.durationInFrames) > 2) throw new Error("La duración del audio no coincide con el clip; no se aplicó para evitar desincronía.");
  ctx.commit(ops.applyProcessedAudio(current, clip.id, result.stems, mode));
  ctx.registerMedia?.(result.stems.map((stem) => ({ src: stem.src, name: stem.name, durationInFrames: clip.durationInFrames, kind: "audio" })));
  return result;
}
