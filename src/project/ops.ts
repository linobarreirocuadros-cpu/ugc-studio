// Operaciones puras sobre el proyecto. Cada una recibe un Project y devuelve uno nuevo.
// La UI las usa hoy; en la Fase 2 el chat de IA las llamará como "tools".

import {
  getProjectDuration,
  nameTracks,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_TEXT_STYLE,
  type CaptionClip,
  type CaptionStyle,
  type Clip,
  type Project,
  type AudioClip,
  type TextStyle,
  type Track,
  type VideoClip,
  type Word,
} from "./types";

export const newId = () => Math.random().toString(36).slice(2, 10);

const mapTracks = (project: Project, fn: (t: Track) => Track): Project => ({
  ...project,
  tracks: project.tracks.map(fn),
});

const trackEnd = (track: Track) =>
  track.clips.reduce((end, c) => Math.max(end, c.from + c.durationInFrames), 0);

export const findClip = (project: Project, clipId: string) => {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
};

export const linkedIds = (project: Project, ids: string[]): string[] => {
  const result = new Set(ids);
  for (const id of ids) {
    const clip = findClip(project, id)?.clip;
    if (clip && (clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId && findClip(project, clip.linkedClipId)) result.add(clip.linkedClipId);
  }
  return [...result];
};

const alignLinkedChanges = (before: Project, after: Project): Project => {
  const updates = new Map<string, { from: number; durationInFrames: number; trimStart: number }>();
  const seen = new Set<string>();
  for (const clip of after.tracks.flatMap((t) => t.clips)) {
    if ((clip.kind !== "video" && clip.kind !== "audio") || !clip.linkedClipId || seen.has(clip.id)) continue;
    const mate = findClip(after, clip.linkedClipId)?.clip, old = findClip(before, clip.id)?.clip;
    if (!mate || (mate.kind !== "video" && mate.kind !== "audio") || !old || (old.kind !== "video" && old.kind !== "audio")) continue;
    if (clip.from !== old.from || clip.durationInFrames !== old.durationInFrames || clip.trimStart !== old.trimStart) {
      updates.set(mate.id, { from: clip.from, durationInFrames: clip.durationInFrames, trimStart: clip.trimStart });
      seen.add(clip.id); seen.add(mate.id);
    }
  }
  return updates.size ? mapTracks(after, (t) => ({ ...t, clips: t.clips.map((c) => updates.has(c.id) ? { ...c, ...updates.get(c.id)! } : c) })) : after;
};

export const effectiveVolume = (project: Project, clip: VideoClip | AudioClip): number => {
  const linked = clip.kind === "video" && clip.linkedClipId ? findClip(project, clip.linkedClipId)?.clip : null;
  return linked?.kind === "audio" ? linked.volume : clip.volume;
};

export const resolveTrackId = (project: Project, value: string) => {
  const track = project.tracks.find((t) => t.id === value || t.name.toLowerCase() === value.trim().toLowerCase());
  if (!track) throw new Error(`No existe la pista ${value}. Consulta las pistas disponibles.`);
  return track.id;
};

export const addTrack = (project: Project, kind: "video" | "audio"): Project => {
  const prefix = kind === "video" ? "V" : "A";
  const number = Math.max(kind === "video" ? 0 : -1, ...project.tracks.map((t) => new RegExp(`^${prefix}(\\d+)$`).exec(t.id)).filter((m) => m !== null).map((m) => Number(m![1]))) + 1;
  const track: Track = { id: `${prefix}${number}`, kind, name: "", clips: [] };
  const tracks = [...project.tracks];
  const index = kind === "audio" ? 0 : tracks.findIndex((t) => t.kind === "text" || t.kind === "caption");
  tracks.splice(index < 0 ? tracks.length : index, 0, track);
  return nameTracks({ ...project, tracks });
};

/** Hace visible el audio embebido sin recodificar ni cambiar su nivel audible. */
export const exposeEmbeddedAudio = (project: Project, ids: string[]): Project => {
  let next = project;
  for (const id of ids) {
    const video = findClip(next, id)?.clip;
    if (!video || video.kind !== "video" || video.linkedClipId || video.audioMode === "none" || video.audioMode === "separate") continue;
    let target = [...next.tracks].reverse().find((t) => t.kind === "audio" && !t.clips.some((c) => c.from < video.from + video.durationInFrames && c.from + c.durationInFrames > video.from));
    if (!target) { next = addTrack(next, "audio"); target = next.tracks[0]; }
    const audioId = newId();
    const audio: AudioClip = { id: audioId, kind: "audio", src: video.src, name: video.name, from: video.from, durationInFrames: video.durationInFrames, trimStart: video.trimStart, sourceDurationInFrames: video.sourceDurationInFrames, volume: video.volume, fadeIn: 0, fadeOut: 0, linkedClipId: video.id };
    next = mapTracks(next, (t) => ({ ...t, clips: [...t.clips.map((c): Clip => c.id === video.id ? { ...video, volume: 0, audioMode: "separate", linkedClipId: audioId } : c), ...(t.id === target!.id ? [audio] : [])] }));
  }
  return next;
};

/**
 * Agrega video al final de B1 por defecto. `from` elige posición y `videoOnly` omite el sonido.
 * Con metadatos de audio, inserta también su pareja enlazada en una pista libre.
 */
export const addVideoClip = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number; proxySrc?: string; hasAudio?: boolean },
  trackId = "V1",
  from?: number,
  videoOnly = false,
): Project => {
  const track = project.tracks.find((t) => t.id === trackId && t.kind === "video");
  return track ? addSourceRange(project, media, trackId, from ?? trackEnd(track), 0, media.durationInFrames, videoOnly) : project;
};

/** Agrega música o un efecto de sonido en la pista indicada, desde el frame `from`. */
export const addAudioClip = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number },
  trackId: string,
  from: number,
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== trackId) return track;
    const clip: AudioClip = {
      id: newId(),
      kind: "audio",
      src: media.src,
      name: media.name,
      from: Math.max(0, Math.round(from)),
      durationInFrames: media.durationInFrames,
      trimStart: 0,
      sourceDurationInFrames: media.durationInFrames,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    return { ...track, clips: [...track.clips, clip] };
  });

/** Inserta un rango marcado en el monitor de origen, como video o solo audio. */
export const addSourceRange = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number; proxySrc?: string; kind?: "video" | "audio"; hasAudio?: boolean },
  trackId: string,
  from: number,
  inFrame = 0,
  outFrame = media.durationInFrames,
  videoOnly = false,
): Project => {
  let addedId: string | undefined;
  const next = mapTracks(project, (track) => {
    if (track.id !== trackId || (track.kind !== "video" && track.kind !== "audio")) return track;
    if (track.kind === "video" && media.kind === "audio") return track;
    const start = Math.max(0, Math.min(media.durationInFrames - 1, Math.round(inFrame)));
    const end = Math.max(start + 1, Math.min(media.durationInFrames, Math.round(outFrame)));
    const common = {
      id: newId(), src: media.src, name: media.name, from: Math.max(0, Math.round(from)),
      trimStart: start, durationInFrames: end - start, sourceDurationInFrames: media.durationInFrames,
    };
    const clip: VideoClip | AudioClip = track.kind === "video"
      ? { ...common, kind: "video", proxySrc: media.proxySrc, volume: videoOnly ? 0 : 1, audioMode: videoOnly || media.hasAudio === false ? "none" : "embedded" }
      : { ...common, kind: "audio", volume: 1, fadeIn: 0, fadeOut: 0 };
    addedId = clip.id;
    return { ...track, clips: [...track.clips, clip] };
  });
  return addedId && media.hasAudio === true && !videoOnly ? exposeEmbeddedAudio(next, [addedId]) : next;
};

export const addTextClip = (
  project: Project,
  opts: { text: string; from: number; durationInFrames: number; style?: Partial<TextStyle>; id?: string },
  trackId = "T1",
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== trackId) return track;
    return {
      ...track,
      clips: [
        ...track.clips,
        {
          id: opts.id ?? newId(),
          kind: "text",
          text: opts.text,
          from: opts.from,
          durationInFrames: opts.durationInFrames,
          style: { ...DEFAULT_TEXT_STYLE, ...opts.style },
        },
      ],
    };
  });

export const updateClip = (project: Project, clipId: string, patch: Partial<Clip>): Project => {
  const clip = findClip(project, clipId)?.clip;
  const volume = "volume" in patch && typeof patch.volume === "number" ? patch.volume : undefined;
  const linkedAudio = clip?.kind === "video" && clip.linkedClipId && volume !== undefined ? clip.linkedClipId : undefined;
  return mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.map((c) => c.id === clipId ? ({ ...c, ...patch, ...(linkedAudio ? { volume: 0 } : {}) } as Clip) : c.id === linkedAudio ? ({ ...c, volume } as Clip) : c),
  }));
};

/** Dos cortes en un clip, en una sola operación de historial. No mueve otras pistas. */
export const splitClipRange = (project: Project, clipId: string, start: number, end: number): Project => {
  const clip = findClip(project, clipId)?.clip;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return project;
  const a = Math.max(clip.from, Math.round(start)), b = Math.min(clip.from + clip.durationInFrames, Math.round(end));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return project;
  return splitAt(splitAt(project, b, clipId), a, clipId);
};

export type ProcessedStem = { role: "voice" | "background"; src: string; name: string };

/** Los resultados corresponden solo al rango visible del clip: trimStart del WAV = 0. */
export const applyProcessedAudio = (project: Project, clipId: string, stems: ProcessedStem[], mode: string): Project => {
  const clip = findClip(project, clipId)?.clip;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio") || !stems.length) return project;
  const prior = project.tracks.flatMap((t) => t.clips).find((c): c is AudioClip => c.kind === "audio" && c.derivedFrom?.clipId === clipId);
  const originalVolume = prior?.derivedFrom?.originalVolume ?? effectiveVolume(project, clip);
  const clean = restoreOriginalAudio(project, clipId);
  const silenced = updateClip(clean, clipId, { volume: 0 });
  const tracks = silenced.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
  for (const stem of stems) {
    const trackId = `A_LOCAL_${stem.role}_${clipId}`;
    const audio: AudioClip = {
      id: newId(), kind: "audio", src: stem.src, name: stem.name, from: clip.from,
      durationInFrames: clip.durationInFrames, sourceDurationInFrames: clip.durationInFrames,
      trimStart: 0, volume: stem.role === "background" && mode === "separate-clean" ? 0 : originalVolume,
      fadeIn: clip.kind === "audio" ? clip.fadeIn : 0, fadeOut: clip.kind === "audio" ? clip.fadeOut : 0,
      derivedFrom: { clipId, src: clip.src, originalVolume, mode },
    };
    const existing = tracks.find((t) => t.id === trackId);
    if (existing) existing.clips.push(audio);
    else tracks.unshift({ id: trackId, kind: "audio", name: stem.name, clips: [audio] });
  }
  return nameTracks({ ...clean, tracks });
};

export const restoreOriginalAudio = (project: Project, clipId: string): Project => {
  const prior = project.tracks.flatMap((t) => t.clips).find((c): c is AudioClip => c.kind === "audio" && c.derivedFrom?.clipId === clipId);
  if (!prior?.derivedFrom) return project;
  const volume = prior.derivedFrom.originalVolume;
  const cleaned = { ...project, tracks: project.tracks.map((t) => ({ ...t, clips: t.clips
    .filter((c) => !(c.kind === "audio" && c.derivedFrom?.clipId === clipId))
    }))
    .filter((t) => t.clips.length || ![ `A_LOCAL_voice_${clipId}`, `A_LOCAL_background_${clipId}` ].includes(t.id)) };
  return nameTracks(updateClip(cleaned, clipId, { volume }));
};

/** Mueve un clip en el tiempo y, opcionalmente, a otra pista del mismo tipo (ej. A1 → A2). */
export const moveClip = (project: Project, clipId: string, from: number, toTrackId?: string): Project => {
  const found = findClip(project, clipId);
  if (!found) return project;
  if ((found.clip.kind === "video" || found.clip.kind === "audio") && found.clip.linkedClipId) {
    const target = project.tracks.findIndex((t) => t.id === toTrackId && t.kind === found.track.kind);
    return moveClips(project, [clipId], from - found.clip.from, target < 0 ? 0 : target - project.tracks.indexOf(found.track));
  }
  const moved = { ...found.clip, from: Math.max(0, Math.round(from)) } as Clip;
  const target = project.tracks.find((t) => t.id === toTrackId);
  if (!target || target.id === found.track.id || target.kind !== found.track.kind) {
    return updateClip(project, clipId, { from: moved.from });
  }
  return mapTracks(project, (t) =>
    t.id === found.track.id
      ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
      : t.id === target.id
        ? { ...t, clips: [...t.clips, moved] }
        : t,
  );
};

export const deleteClip = (project: Project, clipId: string): Project =>
  deleteClips(project, [clipId]);

/** Un único desplazamiento para conservar las distancias del grupo, también al llegar a cero. */
export const moveClips = (project: Project, ids: string[], deltaFrames: number, trackOffset = 0): Project => {
  const selected = new Set(linkedIds(project, ids)), vertical = new Set(ids);
  const clips = project.tracks.flatMap((t) => t.clips).filter((c) => selected.has(c.id));
  if (!clips.length || !Number.isFinite(deltaFrames) || !Number.isInteger(trackOffset)) return project;
  const delta = Math.max(-Math.min(...clips.map((c) => c.from)), Math.round(deltaFrames));
  const validOffset = project.tracks.every((track, index) => !track.clips.some((c) => vertical.has(c.id)) || project.tracks[index + trackOffset]?.kind === track.kind) ? trackOffset : 0;
  if (!delta && !validOffset) return project;
  return { ...project, tracks: project.tracks.map((track, index) => ({ ...track, clips: !validOffset ? track.clips.map((c) => selected.has(c.id) ? { ...c, from: c.from + delta } : c) : [
    ...track.clips.filter((c) => !vertical.has(c.id)).map((c) => selected.has(c.id) ? { ...c, from: c.from + delta } : c),
    ...(project.tracks[index - validOffset]?.clips ?? []).filter((c) => vertical.has(c.id)).map((c) => ({ ...c, from: c.from + delta })),
  ] })) };
};

/** Borrado de selección en una transacción; ripple cierra la unión de sus huecos por pista. */
export const deleteClips = (project: Project, ids: string[], ripple = false): Project => {
  const selected = new Set(linkedIds(project, ids));
  const next = mapTracks(project, (track) => {
    const ranges: { start: number; end: number }[] = [];
    if (ripple) for (const clip of track.clips.filter((c) => selected.has(c.id)).sort((a, b) => a.from - b.from)) {
      const last = ranges.at(-1), end = clip.from + clip.durationInFrames;
      if (last && clip.from <= last.end) last.end = Math.max(last.end, end);
      else ranges.push({ start: clip.from, end });
    }
    return { ...track, clips: track.clips.filter((c) => !selected.has(c.id)).map((c) => ({ ...c, from: c.from - ranges.reduce((sum, r) => sum + (r.end <= c.from ? r.end - r.start : 0), 0) })) };
  });
  return ripple ? alignLinkedChanges(project, next) : next;
};

/** Borra el clip y corre hacia la izquierda los clips que venían después (como "Ripple Delete"). */
export const rippleDeleteClip = (project: Project, clipId: string): Project => {
  const found = findClip(project, clipId);
  if (!found) return project;
  if ((found.clip.kind === "video" || found.clip.kind === "audio") && found.clip.linkedClipId) return deleteClips(project, [clipId], true);
  const { clip, track } = found;
  const gapEnd = clip.from + clip.durationInFrames;
  return mapTracks(project, (t) => {
    if (t.id !== track.id) return t;
    return {
      ...t,
      clips: t.clips
        .filter((c) => c.id !== clipId)
        .map((c) => (c.from >= gapEnd ? { ...c, from: c.from - clip.durationInFrames } : c)),
    };
  });
};

/** Corta cualquier clip que pase por el frame indicado (como la herramienta Razor / Cmd+K). */
export const splitAt = (project: Project, frame: number, onlyClipId?: string): Project => {
  const targets = onlyClipId ? new Set(linkedIds(project, [onlyClipId])) : null;
  const rightIds = new Map(project.tracks.flatMap((t) => t.clips).filter((c) => (!targets || targets.has(c.id)) && frame > c.from && frame < c.from + c.durationInFrames).map((c) => [c.id, newId()]));
  return mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.flatMap((c): Clip[] => {
      if (targets && !targets.has(c.id)) return [c];
      const offset = frame - c.from;
      if (offset <= 0 || offset >= c.durationInFrames) return [c];
      const left = { ...c, durationInFrames: offset };
      const right = { ...c, id: rightIds.get(c.id)!, from: frame, durationInFrames: c.durationInFrames - offset };
      if ((right.kind === "video" || right.kind === "audio") && right.linkedClipId) right.linkedClipId = rightIds.get(right.linkedClipId);
      if (right.kind === "audio" && right.derivedFrom && rightIds.has(right.derivedFrom.clipId)) right.derivedFrom = { ...right.derivedFrom, clipId: rightIds.get(right.derivedFrom.clipId)! };
      if (right.kind === "video" || right.kind === "audio") right.trimStart = (c as VideoClip | AudioClip).trimStart + offset;
      if (left.kind === "caption" && right.kind === "caption" && c.kind === "caption") {
        left.words = c.words.filter((w) => w.start < offset).map((w) => ({ ...w, end: Math.min(w.end, offset) }));
        right.words = c.words.filter((w) => w.end > offset).map((w) => ({ ...w, start: Math.max(0, w.start - offset), end: w.end - offset }));
      }
      if (left.kind === "audio") left.fadeOut = 0; // el fade queda solo al final real del clip
      if (right.kind === "audio") right.fadeIn = 0;
      return [left, right as Clip];
    }),
  }));
};

/** Ajusta el inicio o el final de un clip sin salirse del archivo original. */
const trimSingle = (
  project: Project,
  clipId: string,
  edge: "start" | "end",
  deltaFrames: number,
): Project => {
  const found = findClip(project, clipId);
  if (!found) return project;
  const c = found.clip;
  const d = Math.round(deltaFrames);
  if (edge === "end") {
    let duration = Math.max(1, c.durationInFrames + d);
    if (c.kind === "video" || c.kind === "audio") duration = Math.min(duration, c.sourceDurationInFrames - c.trimStart);
    return updateClip(project, clipId, { durationInFrames: duration });
  }
  // start: positivo recorta, negativo extiende hacia atrás
  let delta = Math.min(d, c.durationInFrames - 1);
  delta = Math.max(delta, -c.from);
  if (c.kind === "video" || c.kind === "audio") delta = Math.max(delta, -c.trimStart);
  const patch: Partial<Clip> = { from: c.from + delta, durationInFrames: c.durationInFrames - delta };
  if (c.kind === "video" || c.kind === "audio") (patch as Partial<VideoClip>).trimStart = c.trimStart + delta;
  return updateClip(project, clipId, patch);
};

export const trimClip = (project: Project, id: string, edge: "start" | "end", deltaFrames: number): Project => {
  if (!findClip(project, id) || !Number.isFinite(deltaFrames)) return project;
  const ids = linkedIds(project, [id]);
  let delta = Math.round(deltaFrames);
  for (const clipId of ids) {
    const before = findClip(project, clipId)!.clip, after = findClip(trimSingle(project, clipId, edge, delta), clipId)!.clip;
    delta = edge === "start" ? after.from - before.from : after.durationInFrames - before.durationInFrames;
  }
  return ids.reduce((p, clipId) => trimSingle(p, clipId, edge, delta), project);
};

/** Cambia el contenido visible sin mover los bordes del clip. */
export const slipClip = (project: Project, clipId: string, deltaFrames: number): Project => {
  const clip = findClip(project, clipId)?.clip;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio") || !Number.isFinite(deltaFrames)) return project;
  const trimStart = Math.max(0, Math.min(clip.sourceDurationInFrames - clip.durationInFrames, clip.trimStart + Math.round(deltaFrames)));
  let delta = trimStart - clip.trimStart;
  const ids = linkedIds(project, [clipId]);
  for (const id of ids) { const other = findClip(project, id)!.clip; if (other.kind === "video" || other.kind === "audio") delta = Math.max(-other.trimStart, Math.min(delta, other.sourceDurationInFrames - other.durationInFrames - other.trimStart)); }
  return !delta ? project : ids.reduce((p, id) => { const c = findClip(p, id)!.clip; return c.kind === "video" || c.kind === "audio" ? updateClip(p, id, { trimStart: c.trimStart + delta }) : p; }, project);
};

/** Recorte ripple en la pista del clip: conserva su inicio y desplaza los clips posteriores. */
const rippleTrimSingle = (project: Project, clipId: string, edge: "start" | "end", deltaFrames: number): Project => {
  const found = findClip(project, clipId);
  if (!found || !Number.isFinite(deltaFrames)) return project;
  const { clip, track } = found, oldEnd = clip.from + clip.durationInFrames;
  if (clip.kind !== "video" && clip.kind !== "audio") return project;
  // Un solapamiento requiere una decisión sobre las capas: no se cierra a ciegas.
  if (track.clips.some((other) => other.id !== clip.id && other.from < oldEnd && other.from + other.durationInFrames > clip.from)) return project;
  let delta = Math.round(deltaFrames);
  if (edge === "start") {
    delta = Math.min(delta, clip.durationInFrames - 1);
    delta = Math.max(delta, -clip.trimStart);
  } else {
    delta = Math.max(delta, 1 - clip.durationInFrames);
    if (clip.kind === "video" || clip.kind === "audio") delta = Math.min(delta, clip.sourceDurationInFrames - clip.trimStart - clip.durationInFrames);
  }
  if (!delta) return project;
  const durationDelta = edge === "start" ? -delta : delta;
  return mapTracks(project, (t) => t.id !== track.id ? t : { ...t, clips: t.clips.map((c): Clip => {
    if (c.id === clip.id) return { ...c, durationInFrames: c.durationInFrames + durationDelta, ...((c.kind === "audio" || c.kind === "video") && edge === "start" ? { trimStart: c.trimStart + delta } : {}) };
    return c.from >= oldEnd ? { ...c, from: c.from + durationDelta } : c;
  }) });
};

export const rippleTrimClip = (project: Project, clipId: string, edge: "start" | "end", deltaFrames: number): Project => {
  const ids = linkedIds(project, [clipId]); let delta = deltaFrames;
  for (const id of ids) {
    const before = findClip(project, id)?.clip, after = findClip(rippleTrimSingle(project, id, edge, delta), id)?.clip;
    if (!before || !after) return project;
    delta = (after.durationInFrames - before.durationInFrames) * (edge === "start" ? -1 : 1);
    if (!delta) return project;
  }
  return alignLinkedChanges(project, ids.reduce((p, id) => rippleTrimSingle(p, id, edge, delta), project));
};

/** Asigna el proxy de vista previa a todos los clips de un archivo. */
export const setProxy = (project: Project, src: string, proxySrc: string): Project =>
  mapTracks(project, (t) => ({
    ...t,
    clips: t.clips.map((c) => (c.kind === "video" && c.src === src ? { ...c, proxySrc } : c)),
  }));

/** Reconecta los clips de un archivo perdido a uno nuevo (como "Link Media" en Premiere). */
export const relinkMedia = (project: Project, oldSrc: string, newSrc: string, proxySrc?: string): Project => {
  const relinked = mapTracks(project, (t) => ({
    ...t,
    clips: t.clips.map((c) => ((c.kind === "video" || c.kind === "audio") && c.src === oldSrc ? { ...c, src: newSrc, ...(c.kind === "video" ? { proxySrc } : {}) } : c)),
  }));
  const transcript = project.transcripts?.[oldSrc];
  if (!transcript) return relinked;
  const { [oldSrc]: _, ...rest } = project.transcripts!;
  return { ...relinked, transcripts: { ...rest, [newSrc]: transcript } };
};

// --- Transcripción y subtítulos -------------------------------------------------

/** Proyectos guardados antes de la Fase 1 no tienen pista de subtítulos. */
const ensureCaptionTrack = (project: Project): Project =>
  project.tracks.some((t) => t.id === "S1")
    ? project
    : { ...project, tracks: [...project.tracks, { id: "S1", kind: "caption", name: "SUB", clips: [] }] };

export const setTranscript = (project: Project, src: string, words: Word[], info?: NonNullable<Project["transcriptInfo"]>[string]): Project => ({
  ...project,
  transcripts: { ...project.transcripts, [src]: words },
  ...(info ? { transcriptInfo: { ...project.transcriptInfo, [src]: info } } : {}),
});

/** Conserva rangos del montaje completo y cierra los huecos en todas las pistas a la vez. */
export const keepTimelineRanges = (project: Project, ranges: { start: number; end: number }[]): Project => {
  const duration = getProjectDuration(project);
  if (!ranges.length || ranges.some((r, i) => !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start || r.end > duration || (i > 0 && r.start < ranges[i - 1].end))) throw new Error("Los rangos deben estar ordenados, dentro del montaje y sin solaparse.");
  const identities = new Map<string, string>(), seen = new Set<string>();
  for (const [index, range] of ranges.entries()) for (const track of project.tracks) for (const clip of track.clips) {
    if (clip.from < range.end && clip.from + clip.durationInFrames > range.start) {
      identities.set(`${index}:${clip.id}`, seen.has(clip.id) ? newId() : clip.id); seen.add(clip.id);
    }
  }
  return { ...project, tracks: project.tracks.map((track) => {
    let cursor = 0;
    const clips: Clip[] = [];
    ranges.forEach((range, index) => {
      for (const clip of track.clips) {
        const a = Math.max(clip.from, range.start), b = Math.min(clip.from + clip.durationInFrames, range.end);
        if (b <= a) continue;
        const offset = a - clip.from, length = b - a;
        const base = { ...clip, id: identities.get(`${index}:${clip.id}`)!, from: cursor + a - range.start, durationInFrames: length };
        if (base.kind === "video" || base.kind === "audio") {
          base.trimStart += offset;
          if (base.linkedClipId) base.linkedClipId = identities.get(`${index}:${base.linkedClipId}`);
          if (base.kind === "audio") {
            base.fadeIn = offset === 0 ? Math.min(base.fadeIn, length) : 0;
            base.fadeOut = b === clip.from + clip.durationInFrames ? Math.min(base.fadeOut, length) : 0;
            if (base.derivedFrom) base.derivedFrom = { ...base.derivedFrom, clipId: identities.get(`${index}:${base.derivedFrom.clipId}`) ?? base.derivedFrom.clipId };
          }
        } else if (base.kind === "caption") {
          base.words = base.words.filter((w) => w.end > offset && w.start < offset + length).map((w) => ({ ...w, start: Math.max(0, w.start - offset), end: Math.min(length, w.end - offset) }));
          if (!base.words.length) continue;
        }
        clips.push(base);
      }
      cursor += range.end - range.start;
    });
    return { ...track, clips };
  }) };
};

/** Palabras de un clip de video, ya convertidas a frames de la línea de tiempo. */
export const wordsOnTimeline = (project: Project, clip: VideoClip): Word[] => {
  const words = project.transcripts?.[clip.src] ?? [];
  const inEnd = clip.trimStart + clip.durationInFrames;
  const offset = clip.from - clip.trimStart;
  return words
    .filter((w) => w.start >= clip.trimStart && w.start < inEnd)
    .map((w) => ({ text: w.text, start: w.start + offset, end: Math.min(w.end, inEnd) + offset }));
};

export type CaptionOptions = {
  maxWords: number; // palabras máximas por bloque
  maxChars: number; // caracteres máximos por bloque
  breakOnPauseFrames: number; // pausa que obliga a empezar un bloque nuevo
  style?: Partial<CaptionStyle>;
};

export const DEFAULT_CAPTION_OPTIONS: CaptionOptions = { maxWords: 3, maxChars: 18, breakOnPauseFrames: 12 };

/** Reemplaza la pista de subtítulos con bloques generados desde las transcripciones de V1. */
export const generateCaptions = (project: Project, opts: CaptionOptions = DEFAULT_CAPTION_OPTIONS): Project => {
  const p = ensureCaptionTrack(project);
  const video = p.tracks.find((t) => t.id === "V1");
  if (!video) return p;
  const words = video.clips
    .filter((c): c is VideoClip => c.kind === "video")
    .flatMap((c) => wordsOnTimeline(p, c))
    .sort((a, b) => a.start - b.start);

  const pages: Word[][] = [];
  for (const w of words) {
    const page = pages[pages.length - 1];
    const prev = page?.[page.length - 1];
    const chars = page ? page.map((x) => x.text).join(" ").length + 1 + w.text.length : 0;
    const startNew =
      !page ||
      page.length >= opts.maxWords ||
      chars > opts.maxChars ||
      w.start - prev!.end > opts.breakOnPauseFrames ||
      /[.!?]$/.test(prev!.text);
    if (startNew) pages.push([w]);
    else page.push(w);
  }

  const style = { ...DEFAULT_CAPTION_STYLE, ...opts.style };
  const clips: CaptionClip[] = pages.map((page, i) => {
    const from = page[0].start;
    const next = pages[i + 1]?.[0].start ?? Infinity;
    // El bloque se queda en pantalla hasta el siguiente, salvo que haya una pausa larga.
    const end = Math.min(next, page[page.length - 1].end + opts.breakOnPauseFrames);
    return {
      id: newId(),
      kind: "caption",
      from,
      durationInFrames: Math.max(1, end - from),
      words: page.map((w) => ({ text: w.text, start: w.start - from, end: w.end - from })),
      style,
    };
  });
  return mapTracks(p, (t) => (t.id === "S1" ? { ...t, clips } : t));
};

/** Cambia el estilo de todos los subtítulos a la vez. */
export const styleAllCaptions = (project: Project, patch: Partial<CaptionStyle>): Project =>
  mapTracks(project, (t) => ({
    ...t,
    clips: t.clips.map((c) => (c.kind === "caption" ? { ...c, style: { ...c.style, ...patch } } : c)),
  }));

/** Edita el texto de un bloque. Si cambia la cantidad de palabras, reparte el tiempo en partes iguales. */
export const setCaptionText = (project: Project, clipId: string, text: string): Project => {
  const found = findClip(project, clipId);
  if (!found || found.clip.kind !== "caption") return project;
  const c = found.clip;
  const tokens = text.split(/\s+/).filter(Boolean);
  let words: Word[];
  if (tokens.length === c.words.length) {
    words = c.words.map((w, i) => ({ ...w, text: tokens[i] }));
  } else {
    const step = c.durationInFrames / Math.max(1, tokens.length);
    words = tokens.map((t, i) => ({ text: t, start: Math.round(i * step), end: Math.round((i + 1) * step) }));
  }
  return updateClip(project, clipId, { words } as Partial<CaptionClip>);
};

/**
 * Corta los silencios de los clips de V1 usando la transcripción ("jump cuts").
 * Deja `padFrames` antes y después de cada frase y cierra los huecos.
 */
export const removeSilences = (
  project: Project,
  opts: { minSilenceFrames: number; padFrames: number } = { minSilenceFrames: 15, padFrames: 4 },
): Project => {
  const audioPieces = new Map<string, AudioClip[]>();
  const next = mapTracks(project, (track) => {
    if (track.id !== "V1") return track;
    const sorted = [...track.clips].sort((a, b) => a.from - b.from);
    const out: Clip[] = [];
    let shift = 0;
    for (const clip of sorted) {
      const push = (part: Clip) => {
        const mate = clip.kind === "video" && clip.linkedClipId ? findClip(project, clip.linkedClipId)?.clip : null;
        if (mate?.kind === "audio" && part.kind === "video" && clip.kind === "video") {
          const id = part.id === clip.id ? mate.id : newId();
          part = { ...part, linkedClipId: id };
          const fragment: AudioClip = { ...mate, id, linkedClipId: part.id, from: part.from, durationInFrames: part.durationInFrames, trimStart: mate.trimStart + part.trimStart - clip.trimStart, fadeIn: part.trimStart === clip.trimStart ? mate.fadeIn : 0, fadeOut: part.trimStart + part.durationInFrames === clip.trimStart + clip.durationInFrames ? mate.fadeOut : 0 };
          audioPieces.set(mate.id, [...audioPieces.get(mate.id) ?? [], fragment]);
        }
        out.push(part);
      };
      const words = clip.kind === "video" ? project.transcripts?.[clip.src] : undefined;
      if (clip.kind !== "video" || !words?.length) {
        push({ ...clip, from: clip.from - shift });
        continue;
      }
      const inStart = clip.trimStart;
      const inEnd = clip.trimStart + clip.durationInFrames;
      // Rangos con voz (en frames del archivo), unidos si la pausa es corta.
      const ranges: [number, number][] = [];
      for (const w of words) {
        if (w.end <= inStart || w.start >= inEnd) continue;
        const a = Math.max(inStart, w.start - opts.padFrames);
        const b = Math.min(inEnd, w.end + opts.padFrames);
        const last = ranges[ranges.length - 1];
        if (last && a - last[1] < opts.minSilenceFrames) last[1] = Math.max(last[1], b);
        else ranges.push([a, b]);
      }
      if (ranges.length === 0) {
        push({ ...clip, from: clip.from - shift });
        continue;
      }
      let cursor = clip.from - shift;
      ranges.forEach(([a, b], i) => {
        push({ ...clip, id: i === 0 ? clip.id : newId(), from: cursor, trimStart: a, durationInFrames: b - a });
        cursor += b - a;
      });
      shift += clip.durationInFrames - (cursor - (clip.from - shift));
    }
    return { ...track, clips: out };
  });
  return mapTracks(next, (t) => ({ ...t, clips: t.clips.flatMap((c) => audioPieces.get(c.id) ?? [c]) }));
};
