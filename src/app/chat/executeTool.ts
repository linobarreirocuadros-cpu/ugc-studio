// Ejecuta en el navegador las herramientas que pide el chat de IA. Cada herramienta usa las
// mismas operaciones puras de `ops.ts` que la línea de tiempo, así todo se puede deshacer.
import * as ops from "../../project/ops";
import {
  getProjectDuration,
  destinationTrack,
  type CaptionStyle,
  type Clip,
  type Project,
  type TextClip,
  type TextStyle,
  type VideoClip,
} from "../../project/types";
import { FONT_FAMILIES } from "../../remotion/fonts";
import { transcribeMissing } from "../transcribe";
import { processAudio, searchVisual, sourceClip, type AssistantContext } from "../localAssistant";
import { applyEditPlan, createEditPlan, type EditPlan } from "../editPlan";

export type MediaItem = { src: string; name: string; durationInFrames: number; proxySrc?: string; kind?: "video" | "audio"; hasAudio?: boolean };
type FoleyFolder = { folder: string; files: { name: string; src: string }[] };

export type ToolContext = AssistantContext & {
  getEditPlan?: () => EditPlan | null;
  setEditPlan?: (plan: EditPlan | null) => void;
  undo: () => void;
  media: MediaItem[];
  fetchFoley: () => Promise<FoleyFolder[]>;
  readDuration: (src: string) => Promise<number>;
  onStatus: (text: string) => void;
};

type Input = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const round = (x: number) => Math.round(x * 100) / 100;

const POSITIONS: Record<string, number> = { arriba: 0.18, centro: 0.5, abajo: 0.72 };

const pickFont = (v: unknown) => {
  const f = str(v);
  if (!f) return undefined;
  return FONT_FAMILIES.find((x) => x.toLowerCase() === f.toLowerCase()) ?? FONT_FAMILIES.find((x) => x.toLowerCase().includes(f.toLowerCase()));
};

/** Convierte las opciones de estilo que manda la IA a un parche de estilo del proyecto. */
const stylePatch = (input: Input): Partial<CaptionStyle> => {
  const patch: Partial<CaptionStyle> = {};
  const style = str(input.style);
  if (style === "karaoke" || style === "palabra" || style === "bloque") patch.preset = style;
  if (str(input.highlight_color)) patch.highlightColor = str(input.highlight_color);
  if (str(input.color)) patch.color = str(input.color);
  const font = pickFont(input.font);
  if (font) patch.fontFamily = font;
  if (num(input.font_size)) patch.fontSize = num(input.font_size);
  if (bool(input.uppercase) !== undefined) patch.uppercase = bool(input.uppercase);
  if (bool(input.stroke) !== undefined) patch.stroke = bool(input.stroke);
  const pos = str(input.position);
  if (pos && POSITIONS[pos] !== undefined) patch.y = pos === "abajo" ? 0.7 : POSITIONS[pos];
  return patch;
};

const textStylePatch = (input: Input, current?: TextStyle): Partial<TextStyle> => {
  const patch: Partial<TextStyle> = {};
  const font = pickFont(input.font);
  if (font) patch.fontFamily = font;
  if (num(input.font_size)) patch.fontSize = num(input.font_size);
  if (str(input.color)) patch.color = str(input.color);
  const bg = bool(input.background);
  if (bg !== undefined) patch.background = bg ? current?.background ?? "rgba(0,0,0,0.55)" : null;
  const pos = str(input.position);
  if (pos && POSITIONS[pos] !== undefined) patch.y = POSITIONS[pos];
  return patch;
};

const requireClip = (project: Project, id: unknown) => {
  const found = ops.findClip(project, String(id ?? ""));
  if (!found) throw new Error(`No existe un clip con id "${id}". Usa get_project_state para ver los ids.`);
  if (!ops.clipsEditable(project, [found.clip.id])) throw new Error("La pista del clip o de su pareja está bloqueada. Desbloquéala antes de editar.");
  return found;
};

const clipSummary = (c: Clip, fps: number) => {
  const base = { id: c.id, inicio_s: round(c.from / fps), fin_s: round((c.from + c.durationInFrames) / fps) };
  if (c.kind === "video" || c.kind === "audio") return { ...base, tipo: c.kind, nombre: c.name, volumen: Math.round(c.volume * 100), ...(c.sequenceId ? { secuencia_id: c.sequenceId } : {}) };
  if (c.kind === "text") return { ...base, tipo: "texto", texto: c.text };
  if(c.kind === "graphic") return {...base,tipo:c.shape,nombre:c.name};
  return { ...base, tipo: "subtitulo", texto: c.words.map((w) => w.text).join(" ") };
};

/** Transcripción en tiempo de la línea de tiempo, en frases cortas con su segundo de inicio. */
const transcriptLines = (project: Project) => {
  const v1 = (project.tracks.find((t) => t.id === "V1")?.clips ?? []).filter((c): c is VideoClip => c.kind === "video");
  const words = v1.flatMap((c) => ops.wordsOnTimeline(project, c)).sort((a, b) => a.start - b.start);
  const lines: string[] = [];
  let line: string[] = [];
  let lineStart = 0;
  words.forEach((w, i) => {
    if (line.length === 0) lineStart = w.start;
    line.push(w.text);
    const pause = words[i + 1] ? words[i + 1].start - w.end > project.fps * 0.4 : true;
    if (line.length >= 12 || /[.!?]$/.test(w.text) || pause) {
      lines.push(`[${round(lineStart / project.fps)}s] ${line.join(" ")}`);
      line = [];
    }
  });
  const text = lines.join("\n");
  return text.length > 8000 ? text.slice(0, 8000) + "\n…" : text;
};

export async function executeTool(name: string, input: Input, ctx: ToolContext): Promise<string> {
  const project = ctx.getProject();
  const fps = project.fps;
  const f = (seconds: unknown) => Math.max(0, Math.round((num(seconds) ?? 0) * fps));
  const commit = (next: Project) => ctx.commit(next);

  const transcribeIfNeeded = () =>
    transcribeMissing(
      ctx.getProject(),
      (src, words, info) => commit(ops.setTranscript(ctx.getProject(), src, words, info)),
      ctx.onStatus,
    );

  switch (name) {
    case "add_marker": {
      const next = ops.setMarker(project, { id: ops.newId(), frame: f(input.time_s), label: str(input.label) ?? "Marcador", color: str(input.color) ?? "#5ab0ff" });
      if (next === project) throw new Error("Tiempo o color de marcador inválido.");
      commit(next); return "Marcador añadido.";
    }
    case "delete_marker": commit(ops.deleteMarker(project, str(input.marker_id) ?? "")); return "Marcador eliminado.";
    case "create_sequence": {
      const ids = Array.isArray(input.clip_ids) ? input.clip_ids.map(String) : ctx.selectedClipIds ?? [];
      const next = ops.createSequence(project, ids, str(input.name) ?? "Secuencia");
      if (next === project) throw new Error("Selecciona los clips que deben formar la secuencia.");
      commit(next); return JSON.stringify(Object.values(next.sequences ?? {}).filter((s) => !project.sequences?.[s.id]).map((s) => ({ id: s.id, nombre: s.name })));
    }
    case "place_sequence": {
      const track = str(input.track) ? ops.resolveTrackId(project, str(input.track)!) : destinationTrack(project, "video");
      const next = track ? ops.placeSequence(project, str(input.sequence_id) ?? "", track, f(input.start_s), bool(input.nested) ?? ctx.nestSequences ?? true, ctx.currentSequenceId ?? undefined) : project;
      if (next === project) throw new Error("No se pudo colocar la secuencia: revisa destino, candados y referencias circulares.");
      commit(next); return "Secuencia colocada.";
    }
    case "set_track_state": {
      const id = ops.resolveTrackId(project, str(input.track) ?? "");
      const patch: Parameters<typeof ops.setTrackState>[2] = {};
      for (const key of ["locked", "hidden", "muted", "solo", "targeted"] as const) if (bool(input[key]) !== undefined) patch[key] = bool(input[key]);
      if (bool(input.sync_lock) !== undefined) patch.syncLock = bool(input.sync_lock);
      commit(ops.setTrackState(project, id, patch)); return "Controles de pista actualizados.";
    }
    case "add_track": {
      if (input.kind !== "video" && input.kind !== "audio") throw new Error("Indica video o audio.");
      const next = ops.addTrack(project, input.kind), track = next.tracks.find((t) => !project.tracks.some((prior) => prior.id === t.id))!;
      commit(next); return JSON.stringify({ id: track.id, nombre: track.name });
    }
    case "read_transcript": {
      await transcribeMissing(ctx.getProject(), (src, words, info) => commit(ops.setTranscript(ctx.getProject(), src, words, info)), ctx.onStatus, bool(input.force) ?? false);
      const current = ctx.getProject();
      const clips = current.tracks.find((t) => t.id === "V1")?.clips ?? [];
      const words = clips.filter((c): c is VideoClip => c.kind === "video").flatMap((c) => ops.wordsOnTimeline(current, c)).sort((a, b) => a.start - b.start);
      return JSON.stringify({ transcripcion: transcriptLines(current), palabras: words.map((w) => ({ texto: w.text, inicio_s: w.start / fps, fin_s: w.end / fps })), aviso: "Transcripción automática: puede contener errores. Conserva palabras completas al planificar cortes; usa visión si necesitas saber qué se ve." });
    }
    case "create_edit_plan": {
      if (!Array.isArray(input.ranges) || num(input.target_duration_s) === undefined || !str(input.summary)) throw new Error("Indica rangos, duración objetivo y explicación editorial.");
      const plan = createEditPlan(ctx.getProject(), Number(input.target_duration_s), input.ranges as { start_s: number; end_s: number; reason: string }[], String(input.summary));
      if (!ctx.setEditPlan) throw new Error("El chat no admite propuestas de montaje en esta vista.");
      ctx.setEditPlan(plan);
      return JSON.stringify({ duracion_s: plan.durationFrames / fps, rangos: plan.ranges.map((r) => ({ inicio_s: r.start / fps, fin_s: r.end / fps, motivo: r.reason })), mensaje: "Propuesta validada y visible en el chat. Todavía no se modificó el timeline; usa apply_edit_plan si el usuario pidió ejecutar el resumen." });
    }
    case "apply_edit_plan": {
      const plan = ctx.getEditPlan?.();
      if (!plan) throw new Error("Crea primero una propuesta con create_edit_plan.");
      commit(applyEditPlan(ctx.getProject(), plan)); ctx.setEditPlan?.(null); ctx.onSeek?.(0);
      return `Resumen aplicado: ${plan.durationFrames / fps} s. Cortes visibles en todas las pistas, con sonido, textos y subtítulos ajustados al mismo montaje. Un paso de Deshacer recupera la versión anterior.`;
    }
    case "get_project_state": {
      const foley = await ctx.fetchFoley().catch(() => []);
      return JSON.stringify({
        duracion_s: round(getProjectDuration(project) / fps),
        clip_seleccionado: ctx.selectedClipId ?? null,
        clips_seleccionados: ctx.selectedClipIds ?? (ctx.selectedClipId ? [ctx.selectedClipId] : []),
        cabezal_s: round((ctx.currentFrame ?? 0) / fps),
        secuencia_abierta: ctx.currentSequenceId ?? null,
        secuencias: Object.values(project.sequences ?? {}).map((s) => ({ id: s.id, nombre: s.name, duracion_s: round(s.durationInFrames / fps) })),
        marcadores: (project.markers ?? []).map((m) => ({ id: m.id, tiempo_s: round(m.frame / fps), nombre: m.label, color: m.color })),
        pistas: [...project.tracks].reverse().map((t) => ({ pista: t.id, nombre: t.name, tipo: t.kind, bloqueada: Boolean(t.locked), oculta: Boolean(t.hidden), silencio: Boolean(t.muted), solo: Boolean(t.solo), destino: Boolean(t.targeted), seguir_ripple: Boolean(t.syncLock), clips: t.clips.map((c) => ({ ...clipSummary(c, fps), ...((c.kind === "audio" || c.kind === "video") ? { enlace: c.linkedClipId ?? null, volumen: Math.round(ops.effectiveVolume(project, c) * 100) } : {}) })) })),
        transcripcion: transcriptLines(project) || "(sin transcribir: usa read_transcript antes de resumir el diálogo)",
        archivos_importados: ctx.media.map((m) => ({ nombre: m.name, tipo: m.kind ?? "video", duracion_s: round(m.durationInFrames / fps) })),
        foley: foley.flatMap((d) => d.files.map((x) => `${d.folder}/${x.name}`)).slice(0, 150),
      });
    }

    case "search_visual": {
      const query = str(input.query);
      if (!query) throw new Error("Describe la acción u objeto que quieres encontrar.");
      const result = await searchVisual(ctx, query, str(input.clip_id), ctx.onStatus);
      return JSON.stringify({ clip_id: result.clipId, modelo: result.model, imagenes_analizadas: result.sampleCount,
        rangos_aproximados: result.matches.map((m) => ({ inicio_s: m.from / fps, fin_s: m.end / fps, evidencia: m.description })),
        aviso: "Análisis visual sin transcribir. Los rangos tienen resolución aproximada de 1 s. Las miniaturas están en la pestaña Visión. No se modificó el proyecto." });
    }

    case "split_clip_range": {
      const clip = sourceClip(ctx, str(input.clip_id));
      const a = f(input.start_s), b = f(input.end_s);
      if (num(input.start_s) === undefined || num(input.end_s) === undefined || a < clip.from || b > clip.from + clip.durationInFrames || b <= a) throw new Error("El rango debe estar dentro del clip y tener inicio y fin válidos.");
      const next = ops.splitClipRange(project, clip.id, a, b);
      commit(next);
      const targetTrack = ops.findClip(project, clip.id)!.track.id;
      const inside = next.tracks.find((t) => t.id === targetTrack)?.clips.find((c) => c.from === a && c.durationInFrames === b - a && (c.kind === "video" || c.kind === "audio") && c.src === clip.src);
      ctx.onSeek?.(a);
      return JSON.stringify({ mensaje: "Cortes creados en los bordes; un solo paso de deshacer.", clip_del_rango: inside?.id, inicio_s: a / fps, fin_s: b / fps });
    }

    case "process_audio": {
      const mode = str(input.mode);
      if (mode !== "clean" && mode !== "separate" && mode !== "separate-clean") throw new Error("Modo de audio no válido.");
      const result = await processAudio(ctx, mode, str(input.clip_id), ctx.onStatus);
      return `${result.engine}: ${result.stems.map((s) => s.name).join(" y ")} creados en pistas nuevas. Sonido original silenciado, recuperable con Deshacer o restore_original_audio. Música y ambiente quedan juntos en Fondo y música.${mode === "separate-clean" ? " El fondo se creó silenciado para escuchar la voz aislada; su volumen es editable." : ""}`;
    }

    case "restore_original_audio": {
      const clip = sourceClip(ctx, str(input.clip_id));
      const id = clip.kind === "audio" ? clip.derivedFrom?.clipId ?? clip.id : clip.id;
      commit(ops.restoreOriginalAudio(project, id));
      return "Sonido original restaurado; pistas derivadas de ese proceso retiradas del timeline.";
    }

    case "remove_silences": {
      await transcribeIfNeeded();
      const before = getProjectDuration(ctx.getProject());
      const minSilenceFrames = Math.max(3, f(input.min_silence_s ?? 0.5));
      commit(ops.removeSilences(ctx.getProject(), { minSilenceFrames, padFrames: 4 }));
      const after = getProjectDuration(ctx.getProject());
      return `Silencios cortados. Duración: ${round(before / fps)}s → ${round(after / fps)}s.`;
    }

    case "generate_captions": {
      await transcribeIfNeeded();
      const maxWords = Math.min(5, Math.max(1, Math.round(num(input.words_per_caption) ?? 3)));
      commit(
        ops.generateCaptions(ctx.getProject(), {
          ...ops.DEFAULT_CAPTION_OPTIONS,
          maxWords,
          maxChars: maxWords * 7,
          style: stylePatch(input),
        }),
      );
      const n = ctx.getProject().tracks.find((t) => t.id === "S1")?.clips.length ?? 0;
      return n > 0 ? `${n} bloques de subtítulos creados.` : "No se encontró voz para subtitular.";
    }

    case "style_captions": {
      const patch = stylePatch(input);
      if (Object.keys(patch).length === 0) throw new Error("No se indicó ningún cambio de estilo.");
      commit(ops.styleAllCaptions(project, patch));
      return "Estilo de subtítulos actualizado.";
    }

    case "add_text": {
      const text = str(input.text);
      if (!text) throw new Error("Falta el texto.");
      const id = ops.newId();
      commit(
        ops.addTextClip(project, {
          id,
          text,
          from: f(input.start_s),
          durationInFrames: Math.max(1, f(input.duration_s ?? 3)),
          style: textStylePatch(input),
        }),
      );
      return `Texto agregado (id ${id}).`;
    }

    case "update_text": {
      const { clip } = requireClip(project, input.clip_id);
      if (clip.kind !== "text") throw new Error("Ese clip no es un texto.");
      const patch: Partial<TextClip> = { style: { ...clip.style, ...textStylePatch(input, clip.style) } };
      if (str(input.text)) patch.text = str(input.text);
      commit(ops.updateClip(project, clip.id, patch));
      return "Texto actualizado.";
    }

    case "split_at": {
      commit(ops.splitAt(project, f(input.time_s)));
      return `Corte hecho en ${num(input.time_s)}s.`;
    }

    case "delete_clip": {
      const { clip } = requireClip(project, input.clip_id);
      commit(bool(input.ripple) ? ops.rippleDeleteClip(project, clip.id) : ops.deleteClip(project, clip.id));
      return "Clip borrado.";
    }

    case "move_clip": {
      const { clip } = requireClip(project, input.clip_id);
      commit(ops.moveClip(project, clip.id, f(input.start_s), str(input.track) ? ops.resolveTrackId(project, str(input.track)!) : undefined));
      return "Clip movido.";
    }

    case "trim_clip": {
      let { clip } = requireClip(project, input.clip_id);
      let next = project;
      if (num(input.start_s) !== undefined) {
        next = ops.trimClip(next, clip.id, "start", f(input.start_s) - clip.from);
        clip = ops.findClip(next, clip.id)!.clip;
      }
      if (num(input.end_s) !== undefined) {
        next = ops.trimClip(next, clip.id, "end", f(input.end_s) - (clip.from + clip.durationInFrames));
      }
      commit(next);
      return "Clip recortado.";
    }

    case "set_volume": {
      const { clip } = requireClip(project, input.clip_id);
      if (clip.kind !== "video" && clip.kind !== "audio") throw new Error("Ese clip no tiene sonido.");
      const patch: Record<string, number> = {};
      if (num(input.volume_percent) !== undefined) patch.volume = Math.min(1, Math.max(0, num(input.volume_percent)! / 100));
      if (clip.kind === "audio" && num(input.fade_in_s) !== undefined) patch.fadeIn = f(input.fade_in_s);
      if (clip.kind === "audio" && num(input.fade_out_s) !== undefined) patch.fadeOut = f(input.fade_out_s);
      commit(ops.updateClip(project, clip.id, patch as Partial<Clip>));
      return "Volumen actualizado.";
    }

    case "add_media": {
      const query = (str(input.name) ?? "").toLowerCase();
      const item = ctx.media.find((m) => m.name.toLowerCase().includes(query));
      if (!item) throw new Error(`No hay ningún archivo importado que se llame "${input.name}".`);
      const track = ops.resolveTrackId(project, str(input.track) ?? "V1");
      const target = project.tracks.find((t) => t.id === track)!;
      if (target.locked) throw new Error("La pista destino está bloqueada.");
      let next: Project;
      if (target.kind === "audio") next = ops.addSourceRange(project, item, track, f(input.start_s));
      else if (target.kind === "video" && item.kind !== "audio") next = ops.addVideoClip(project, item, track, num(input.start_s) !== undefined ? f(input.start_s) : undefined);
      else throw new Error("El tipo de archivo no es compatible con la pista elegida.");
      if (next === project) throw new Error("No se pudo colocar: una pista o pareja afectada está bloqueada.");
      if (num(input.volume_percent) !== undefined) {
        const added = next.tracks.find((t) => t.id === track)?.clips.at(-1);
        if (added) next = ops.updateClip(next, added.id, { volume: num(input.volume_percent)! / 100 } as Partial<Clip>);
      }
      commit(next);
      return `"${item.name}" agregado en ${target.name}.`;
    }

    case "add_sound_effect": {
      const query = (str(input.query) ?? "").toLowerCase();
      const folders = await ctx.fetchFoley();
      const all = folders.flatMap((d) => d.files.map((x) => ({ ...x, folder: d.folder })));
      const hit =
        all.find((x) => x.name.toLowerCase().includes(query)) ?? all.find((x) => x.folder.toLowerCase().includes(query));
      if (!hit) {
        throw new Error(
          all.length === 0
            ? "La biblioteca de Foley está vacía: el usuario debe copiar sonidos a UGC Studio/Foley."
            : `No hay un sonido que coincida con "${input.query}".`,
        );
      }
      const durationInFrames = await ctx.readDuration(hit.src).catch(() => fps);
      let next = ops.addAudioClip(project, { src: hit.src, name: hit.name, durationInFrames }, "A2", f(input.time_s));
      const added = next.tracks.find((t) => t.id === "A2")?.clips.at(-1);
      if (added && num(input.volume_percent) !== undefined) {
        next = ops.updateClip(next, added.id, { volume: num(input.volume_percent)! / 100 } as Partial<Clip>);
      }
      commit(next);
      return `Sonido "${hit.name}" agregado en ${num(input.time_s)}s.`;
    }

    case "undo": {
      const steps = Math.min(20, Math.max(1, Math.round(num(input.steps) ?? 1)));
      for (let i = 0; i < steps; i++) ctx.undo();
      return `Deshechos ${steps} cambio(s).`;
    }

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
