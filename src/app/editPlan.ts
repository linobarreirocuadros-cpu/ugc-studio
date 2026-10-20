import type { Project } from "../project/types";
import { getProjectDuration } from "../project/types";
import { keepTimelineRanges } from "../project/ops";

export type EditPlan = { stamp: string; summary: string; targetFrames: number; durationFrames: number; ranges: { start: number; end: number; reason: string }[] };
export const editStamp = (project: Project) => JSON.stringify([project.fps, project.tracks, project.transcripts]);

export function createEditPlan(project: Project, targetSeconds: number, ranges: { start_s: number; end_s: number; reason: string }[], summary: string): EditPlan {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0 || !ranges.length || ranges.length > 50) throw new Error("Indica una duración positiva y entre 1 y 50 rangos.");
  const mapped = ranges.map((r) => ({ start: Math.round(r.start_s * project.fps), end: Math.round(r.end_s * project.fps), reason: String(r.reason || "").slice(0, 500) }));
  const duration = getProjectDuration(project);
  if (mapped.some((r, i) => !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end <= r.start || r.end > duration || (i > 0 && r.start < mapped[i - 1].end))) throw new Error("Los rangos deben estar dentro del montaje, ordenados y sin solaparse.");
  const durationFrames = mapped.reduce((sum, r) => sum + r.end - r.start, 0), targetFrames = Math.round(targetSeconds * project.fps);
  if (Math.abs(durationFrames - targetFrames) > 1) throw new Error(`Tus rangos suman ${(durationFrames / project.fps).toFixed(2)} s; deben sumar ${(targetFrames / project.fps).toFixed(2)} s. Ajusta los límites usando pausas, sin cortar palabras.`);
  // Una edición dirigida por diálogo debe conservar palabras completas. Los límites exteriores
  // de montaje ya existentes se respetan; se comprueban solo los cortes nuevos.
  for (const track of project.tracks.filter((t) => t.id === "V1" || t.id === "A0")) for (const clip of track.clips) {
    if (clip.kind !== "video" && clip.kind !== "audio") continue;
    const words = project.transcripts?.[clip.src] ?? [];
    for (const r of mapped) for (const cut of [r.start, r.end]) {
      if (cut <= clip.from || cut >= clip.from + clip.durationInFrames) continue;
      const sourceCut = cut - clip.from + clip.trimStart;
      if (words.some((word) => sourceCut > word.start + 1 && sourceCut < word.end - 1)) throw new Error(`El corte a ${(cut / project.fps).toFixed(2)} s atraviesa una palabra. Elige un límite entre palabras o en una pausa.`);
    }
  }
  return { stamp: editStamp(project), summary: summary.slice(0, 1500), targetFrames, durationFrames, ranges: mapped };
}

export function applyEditPlan(project: Project, plan: EditPlan): Project {
  if (editStamp(project) !== plan.stamp) throw new Error("El proyecto cambió desde la propuesta. Genera un plan actualizado.");
  return keepTimelineRanges(project, plan.ranges);
}
