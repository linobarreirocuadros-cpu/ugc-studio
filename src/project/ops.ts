// Operaciones puras sobre el proyecto. Cada una recibe un Project y devuelve uno nuevo.
// La UI las usa hoy; en la Fase 2 el chat de IA las llamará como "tools".

import {
  getProjectDuration,
  destinationTrack,
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
  type TimelineMarker,
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

export const clipsEditable = (project: Project, ids: string[]) =>
  linkedIds(project, ids).every((id) => !findClip(project, id)?.track.locked);

/** Editar una parte sin arrastrar a su pareja. Restaurar el enlace de los IDs que sobreviven. */
export const editSelection = (project: Project, ids: string[], followLinks: boolean, operation: (p: Project) => Project): Project => {
  if (followLinks) return operation(project);
  if (ids.some((id) => findClip(project, id)?.track.locked)) return project;
  const detached = new Set(linkedIds(project, ids));
  const links = new Map<string, string>();
  const isolated = mapTracks(project, (t) => ({ ...t, clips: t.clips.map((c) => {
    if ((c.kind !== "video" && c.kind !== "audio") || !detached.has(c.id) || !c.linkedClipId) return c;
    links.set(c.id, c.linkedClipId); return { ...c, linkedClipId: undefined };
  }) }));
  const edited = operation(isolated);
  if (edited === isolated) return project;
  return mapTracks(edited, (t) => ({ ...t, clips: t.clips.map((c) => {
    if ((c.kind !== "video" && c.kind !== "audio") || !links.has(c.id)) return c;
    const mate = links.get(c.id)!;
    return { ...c, linkedClipId: findClip(edited, mate) ? mate : undefined };
  }) }));
};

export const setMarker = (project: Project, marker: TimelineMarker): Project => {
  if (!Number.isInteger(marker.frame) || marker.frame < 0 || marker.frame >= getProjectDuration(project) || !/^#[0-9a-f]{6}$/i.test(marker.color)) return project;
  const markers = [...(project.markers ?? []).filter((m) => m.id !== marker.id), { ...marker, label: marker.label.trim().slice(0, 160) || "Marcador" }].sort((a, b) => a.frame - b.frame);
  return { ...project, markers };
};

export const deleteMarker = (project: Project, id: string): Project => ({ ...project, markers: (project.markers ?? []).filter((m) => m.id !== id) });

/** Copia editable del montaje seleccionado. Los originales permanecen en la secuencia actual. */
export const createSequence = (project: Project, ids: string[], name: string): Project => {
  const selected = new Set(linkedIds(project, ids));
  const clips = project.tracks.flatMap((t) => t.clips).filter((c) => selected.has(c.id));
  if (!clips.length) return project;
  const start = Math.min(...clips.map((c) => c.from)), end = Math.max(...clips.map((c) => c.from + c.durationInFrames));
  const id = newId();
  const { sequences: _, ...base } = project;
  const sequence = { ...base, id, name: name.trim().slice(0, 100) || "Secuencia", durationInFrames: end - start,
    tracks: project.tracks.map((t) => ({ ...t, locked: false, targeted: false, clips: t.clips.filter((c) => selected.has(c.id)).map((c) => ({ ...c, from: c.from - start })) })),
    markers: (project.markers ?? []).filter((m) => m.frame >= start && m.frame < end).map((m) => ({ ...m, frame: m.frame - start })),
  };
  return { ...project, sequences: { ...project.sequences, [id]: sequence } };
};

export const updateSequence = (project: Project, id: string, contents: Project): Project => {
  if (!project.sequences?.[id]) return project;
  const { sequences, ...sequence } = contents;
  const end = Math.max(1, ...sequence.tracks.flatMap((t) => t.clips.map((c) => c.from + c.durationInFrames)));
  const refresh = (tracks: Track[]) => tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.kind === "video" || c.kind === "audio") && c.sequenceId === id ? { ...c, name: sequence.name, sourceDurationInFrames: end } : c) }));
  const next = { ...sequences, [id]: { ...sequence, id, durationInFrames: end } };
  return { ...project, tracks: refresh(project.tracks), sequences: Object.fromEntries(Object.entries(next).map(([key, value]) => [key, { ...value, tracks: refresh(value.tracks) }])) };
};

const containsSequence = (project: Project, id: string, sought: string, visited = new Set<string>()): boolean => {
  if (id === sought) return true;
  if (visited.has(id)) return false; visited.add(id);
  return project.sequences?.[id]?.tracks.some((t) => t.clips.some((c) => (c.kind === "video" || c.kind === "audio") && c.sequenceId && containsSequence(project, c.sequenceId, sought, visited))) ?? false;
};

/** Coloca una secuencia como bloque anidado o como todos sus clips y pistas originales. */
export const placeSequence = (project: Project, sequenceId: string, trackId: string, at: number, nested: boolean, hostId?: string): Project => {
  if (hostId && containsSequence(project, sequenceId, hostId)) return project;
  const sequence = project.sequences?.[sequenceId], target = project.tracks.find((t) => t.id === trackId);
  if (!sequence || !target || target.kind !== "video" || target.locked || sequence.fps !== project.fps || !Number.isFinite(at)) return project;
  const from = Math.max(0, Math.round(at));
  if (nested) {
    const videoId = newId(), audioId = newId(), audioTrack = destinationTrack(project, "audio");
    const hasSound = sequence.tracks.some((t) => t.clips.some((c) => c.kind === "audio" || c.kind === "video" && c.volume > 0));
    if (hasSound && !audioTrack) return project;
    const common = { src: "", sequenceId, name: sequence.name, from, durationInFrames: sequence.durationInFrames, sourceDurationInFrames: sequence.durationInFrames, trimStart: 0 };
    const video: VideoClip = { ...common, id: videoId, kind: "video", volume: 0, audioMode: hasSound ? "separate" : "none", linkedClipId: hasSound ? audioId : undefined };
    const audio: AudioClip = { ...common, id: audioId, kind: "audio", volume: 1, fadeIn: 0, fadeOut: 0, linkedClipId: videoId };
    const placed = mapTracks(project, (t) => ({ ...t, clips: [...t.clips, ...(t.id === trackId ? [video] : []), ...(hasSound && t.id === audioTrack ? [audio] : [])] }));
    return overwritePlaced(project, placed, hasSound ? [videoId, audioId] : [videoId]);
  }
  let next = project;
  const destinations = new Map<string, string>();
  for (const kind of ["video", "audio", "text", "caption"] as const) {
    const sources = sequence.tracks.filter((t) => t.kind === kind && t.clips.length);
    const list = () => { const tracks = next.tracks.filter((t) => t.kind === kind); return kind === "audio" ? tracks.reverse() : tracks; };
    let targets = list();
    const anchor = kind === "video" ? trackId : kind === "audio" ? destinationTrack(next, "audio") : targets[0]?.id;
    const offset = Math.max(0, targets.findIndex((t) => t.id === anchor));
    while (targets.length < offset + sources.length && (kind === "video" || kind === "audio")) { next = addTrack(next, kind); targets = list(); }
    for (const [i, source] of sources.entries()) {
      const destination = targets[offset + i];
      if (!destination || destination.locked) return project;
      destinations.set(source.id, destination.id);
    }
  }
  const identities = new Map(sequence.tracks.flatMap((t) => t.clips.map((c) => [c.id, newId()])));
  const placed = mapTracks(next, (t) => ({ ...t, clips: [...t.clips, ...sequence.tracks.filter((s) => destinations.get(s.id) === t.id).flatMap((s) => s.clips.map((c): Clip => {
    const clip = { ...c, id: identities.get(c.id)!, from: from + c.from };
    if (clip.kind === "video" || clip.kind === "audio") clip.linkedClipId = clip.linkedClipId ? identities.get(clip.linkedClipId) : undefined;
    if (clip.kind === "audio" && clip.derivedFrom) clip.derivedFrom = { ...clip.derivedFrom, clipId: identities.get(clip.derivedFrom.clipId) ?? clip.derivedFrom.clipId };
    return clip;
  }))] }));
  return overwritePlaced(project, placed, [...identities.values()]);
};

export const linkClips = (project: Project, ids: string[], linked: boolean): Project => {
  if (!clipsEditable(project, ids)) return project;
  const selected = ids.map((id) => findClip(project, id)?.clip).filter((c) => c?.kind === "video" || c?.kind === "audio");
  if (linked && (selected.length !== 2 || !selected.some((c) => c?.kind === "video") || !selected.some((c) => c?.kind === "audio"))) return project;
  const affected = new Set(linkedIds(project, ids));
  const clean = mapTracks(project, (t) => ({ ...t, clips: t.clips.map((c) => (c.kind === "video" || c.kind === "audio") && affected.has(c.id) ? { ...c, linkedClipId: undefined } : c) }));
  return !linked ? clean : mapTracks(clean, (t) => ({ ...t, clips: t.clips.map((c) => selected.some((s) => s?.id === c.id) && (c.kind === "video" || c.kind === "audio") ? { ...c, linkedClipId: selected.find((s) => s?.id !== c.id)!.id } : c) }));
};

export const setTrackState = (project: Project, id: string, patch: Partial<Pick<Track, "locked" | "hidden" | "muted" | "solo" | "targeted" | "syncLock">>): Project => {
  const track = project.tracks.find((t) => t.id === id);
  if (!track) return project;
  return mapTracks(project, (t) => ({ ...t, ...(patch.targeted && t.kind === track.kind ? { targeted: false } : {}), ...(t.id === id ? patch : {}) }));
};

type Range = { start: number; end: number };
const mergeRanges = (ranges: Range[]): Range[] => {
  const out: Range[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ ...range });
  }
  return out;
};

/** Conserva un fragmento sin perder offset de origen, palabras ni fades de los extremos. */
const clipSlice = (clip: Clip, start: number, end: number, id: string): Clip => {
  const offset = start - clip.from, durationInFrames = end - start;
  const base = { ...clip, id, from: start, durationInFrames };
  if (base.kind === "video" || base.kind === "audio") base.trimStart += offset;
  if (base.kind === "audio") {
    base.fadeIn = offset ? 0 : Math.min(base.fadeIn, durationInFrames);
    base.fadeOut = end === clip.from + clip.durationInFrames ? Math.min(base.fadeOut, durationInFrames) : 0;
  }
  if (base.kind === "caption") base.words = base.words.filter((w) => w.end > offset && w.start < offset + durationInFrames).map((w) => ({ ...w, start: Math.max(0, w.start - offset), end: Math.min(durationInFrames, w.end - offset) }));
  return base;
};

/** Resta huecos de clips concretos y reconstruye sus enlaces por fragmento. */
const cutClipRanges = (project: Project, cuts: Map<string, Range[]>): Project => {
  const pieces = new Map<string, Clip[]>();
  for (const [id, ranges] of cuts) {
    const clip = findClip(project, id)?.clip; if (!clip) continue;
    let cursor = clip.from;
    const fragments: Clip[] = [], end = clip.from + clip.durationInFrames;
    for (const range of mergeRanges(ranges)) {
      if (range.end <= cursor || range.start >= end) continue;
      if (range.start > cursor) fragments.push(clipSlice(clip, cursor, Math.min(end, range.start), fragments.length ? newId() : clip.id));
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < end) fragments.push(clipSlice(clip, cursor, end, fragments.length ? newId() : clip.id));
    pieces.set(id, fragments);
  }
  return mapTracks(project, (t) => ({ ...t, clips: t.clips.flatMap((c) => (pieces.get(c.id) ?? [c]).map((part): Clip => {
    if ((part.kind === "video" || part.kind === "audio") && part.linkedClipId && pieces.has(part.linkedClipId)) {
      const mate = pieces.get(part.linkedClipId)!.find((m) => m.from === part.from && m.durationInFrames === part.durationInFrames);
      return { ...part, linkedClipId: mate?.id };
    }
    return part;
  })) }));
};

/** Las pistas que optan por seguir ripple cierran los mismos huecos que las pistas editadas. */
const rippleFollowers = (before: Project, after: Project, anchors: Set<string>, gaps: Range[]): Project => {
  const ranges = mergeRanges(gaps), ids = new Set<string>();
  for (const track of before.tracks) if (track.syncLock && !track.locked && !anchors.has(track.id)) {
    for (const clip of track.clips) {
      const pair = linkedIds(before, [clip.id]);
      if (clipsEditable(before, pair) && pair.every((id) => !anchors.has(findClip(before, id)!.track.id))) pair.forEach((id) => ids.add(id));
    }
  }
  const cuts = new Map([...ids].map((id) => [id, ranges]));
  const cut = cutClipRanges(after, cuts);
  const followers = new Set([...ids].flatMap((id) => linkedIds(before, [id])));
  const followerTracks = new Set([...followers].map((id) => findClip(before, id)!.track.id));
  // Los fragmentos nuevos pertenecen a las mismas pistas; solo mover los procedentes de seguidores.
  const moved = mapTracks(cut, (t) => !followerTracks.has(t.id) ? t : { ...t, clips: t.clips.map((c) => {
    const source = before.tracks.find((original) => original.id === t.id)?.clips.find((original) => followers.has(original.id) && c.from >= original.from && c.from < original.from + original.durationInFrames);
    return source ? { ...c, from: c.from - ranges.reduce((sum, r) => sum + (r.end <= c.from ? r.end - r.start : 0), 0) } : c;
  }) });
  return preserveLocked(before, moved);
};

const preserveLocked = (before: Project, after: Project): Project => before.tracks.some((t) => t.locked && JSON.stringify(t.clips) !== JSON.stringify(after.tracks.find((n) => n.id === t.id)?.clips)) ? before : after;

/** Sobrescribe únicamente lo ocupado en las pistas destino; no desplaza el resto del montaje. */
const overwritePlaced = (before: Project, placed: Project, ids: string[]): Project => {
  const incoming = new Set(ids), cuts = new Map<string, Range[]>();
  if (!clipsEditable(placed, ids)) return before;
  for (const track of placed.tracks) for (const clip of track.clips.filter((c) => incoming.has(c.id))) {
    for (const victim of track.clips) {
      if (incoming.has(victim.id) || victim.from >= clip.from + clip.durationInFrames || victim.from + victim.durationInFrames <= clip.from) continue;
      const range = { start: clip.from, end: clip.from + clip.durationInFrames };
      if (!clipsEditable(placed, [victim.id])) return before;
      for (const id of linkedIds(placed, [victim.id])) cuts.set(id, [...cuts.get(id) ?? [], range]);
    }
  }
  return cuts.size ? cutClipRanges(placed, cuts) : placed;
};

const alignLinkedChanges = (before: Project, after: Project): Project => {
  const updates = new Map<string, { from: number; durationInFrames: number; trimStart: number }>();
  const seen = new Set<string>();
  for (const clip of after.tracks.flatMap((t) => t.clips)) {
    if ((clip.kind !== "video" && clip.kind !== "audio") || !clip.linkedClipId || seen.has(clip.id)) continue;
    const mate = findClip(after, clip.linkedClipId)?.clip, old = findClip(before, clip.id)?.clip;
    if (!mate || (mate.kind !== "video" && mate.kind !== "audio") || !old || (old.kind !== "video" && old.kind !== "audio")) continue;
    if (clip.from !== old.from || clip.durationInFrames !== old.durationInFrames || clip.trimStart !== old.trimStart) {
      const oldMate = findClip(before, mate.id)?.clip;
      if (oldMate && (oldMate.kind === "audio" || oldMate.kind === "video") && mate.from === oldMate.from && mate.durationInFrames === oldMate.durationInFrames && mate.trimStart === oldMate.trimStart) updates.set(mate.id, { from: mate.from + clip.from - old.from, durationInFrames: mate.durationInFrames + clip.durationInFrames - old.durationInFrames, trimStart: mate.trimStart + clip.trimStart - old.trimStart });
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
export const exposeEmbeddedAudio = (project: Project, ids: string[], preferredTrackId?: string): Project => {
  let next = project;
  for (const id of ids) {
    const video = findClip(next, id)?.clip;
    if (!video || video.kind !== "video" || video.sequenceId || video.linkedClipId || video.audioMode === "none" || video.audioMode === "separate" || !clipsEditable(next, [id])) continue;
    let target = preferredTrackId ? next.tracks.find((t) => t.id === preferredTrackId && t.kind === "audio" && !t.locked) : [...next.tracks].reverse().find((t) => t.kind === "audio" && !t.locked && !t.clips.some((c) => c.from < video.from + video.durationInFrames && c.from + c.durationInFrames > video.from));
    if (preferredTrackId && !target) continue;
    if (!target) { next = addTrack(next, "audio"); target = next.tracks[0]; }
    const audioId = newId();
    const audio: AudioClip = { id: audioId, kind: "audio", src: video.src, name: video.name, from: video.from, durationInFrames: video.durationInFrames, trimStart: video.trimStart, sourceDurationInFrames: video.sourceDurationInFrames, volume: video.volume, fadeIn: 0, fadeOut: 0, linkedClipId: video.id };
    const placed = mapTracks(next, (t) => ({ ...t, clips: [...t.clips.map((c): Clip => c.id === video.id ? { ...video, volume: 0, audioMode: "separate", linkedClipId: audioId } : c), ...(t.id === target!.id ? [audio] : [])] }));
    next = preferredTrackId ? overwritePlaced(next, placed, [video.id, audioId]) : placed;
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
): Project => addSourceRange(project, { ...media, kind: "audio" }, trackId, from);

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
    if (track.id !== trackId || track.locked || (track.kind !== "video" && track.kind !== "audio")) return track;
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
  const overwritten = addedId ? overwritePlaced(project, next, [addedId]) : project;
  if (addedId && media.hasAudio === true && !videoOnly && findClip(overwritten, addedId)?.clip.kind === "video") {
    const target = destinationTrack(project, "audio");
    if (!target) return project;
    const withAudio = exposeEmbeddedAudio(overwritten, [addedId], target);
    const added = findClip(withAudio, addedId)?.clip;
    return added?.kind === "video" && added.linkedClipId ? withAudio : project;
  }
  return overwritten;
};

/** Portapapeles interno inmutable. No escribe archivos ni usa el portapapeles del SO. */
export const copyClips = (project: Project, ids: string[], linked = true): Project => {
  const selected = new Set(linked ? linkedIds(project, ids) : ids);
  return structuredClone({ ...project, tracks: project.tracks.map(t => ({ ...t, clips: t.clips.filter(c => selected.has(c.id)) })) });
};

/** Alt+arrastrar: copia con IDs/enlaces nuevos y la misma sobrescritura que una colocación. */
export const duplicateClipsWithSelection = (project: Project, ids: string[], deltaFrames: number, trackOffset = 0, followLinks = true): {project:Project;ids:string[]} => {
  const unchanged={project,ids:[] as string[]};
  const selected = new Set(followLinks ? linkedIds(project, ids) : ids), vertical = new Set(ids);
  const clips = project.tracks.flatMap(t => t.clips).filter(c => selected.has(c.id));
  if (!clips.length || !Number.isFinite(deltaFrames) || !Number.isInteger(trackOffset)) return unchanged;
  if (project.tracks.some(t => t.locked && t.clips.some(c => selected.has(c.id)))) return unchanged;
  const offset = project.tracks.every((t,i) => !t.clips.some(c => vertical.has(c.id)) || project.tracks[i+trackOffset]?.kind === t.kind) ? trackOffset : 0;
  if (project.tracks.some((t,i) => t.clips.some(c => vertical.has(c.id)) && project.tracks[i+offset]?.locked)) return unchanged;
  const start = Math.min(...clips.map(c => c.from)), delta = Math.max(-start,Math.round(deltaFrames));
  if (!delta && !offset) return unchanged;
  const identities=new Map(clips.map(c=>[c.id,newId()]));
  const placed=mapTracks(project,(t)=>({...t,clips:[...t.clips,...project.tracks.flatMap((source,index)=>source.clips.filter(c=>selected.has(c.id)&&project.tracks[vertical.has(c.id)?index+offset:index]?.id===t.id).map(c=>{
    const copy=structuredClone({...c,id:identities.get(c.id)!,from:c.from+delta});
    if(copy.kind==="audio"||copy.kind==="video")copy.linkedClipId=copy.linkedClipId?identities.get(copy.linkedClipId):undefined;
    if(copy.kind==="audio"&&copy.derivedFrom){const parent=identities.get(copy.derivedFrom.clipId);copy.derivedFrom=parent?{...copy.derivedFrom,clipId:parent}:undefined;}
    return copy;
  }))]}));
  const next=overwritePlaced(project,placed,[...identities.values()]);
  return {project:next,ids:[...identities.values()].filter(id=>findClip(next,id))};
};
export const duplicateClips = (project:Project,ids:string[],deltaFrames:number,trackOffset=0,followLinks=true):Project => duplicateClipsWithSelection(project,ids,deltaFrames,trackOffset,followLinks).project;

/** Pega en las mismas pistas, manteniendo offsets y remapeando las relaciones de los clips. */
export const pasteClips = (project: Project, clipboard: Project, at: number, hostId?: string): Project => {
  const clips = clipboard.tracks.flatMap(t => t.clips);
  if (!clips.length || clipboard.fps !== project.fps || !Number.isFinite(at)) return project;
  // No crear referencias perdidas o recursivas entre secuencias al pegar entre montajes.
  if (clips.some(c => (c.kind === "audio" || c.kind === "video") && c.sequenceId && (!project.sequences?.[c.sequenceId] || hostId && containsSequence(project, c.sequenceId, hostId)))) return project;
  let next = project;
  const destinations = new Map<string,string>();
  for (const source of clipboard.tracks.filter(t => t.clips.length)) {
    let target = next.tracks.find(t => t.id === source.id && t.kind === source.kind);
    if (!target && (source.kind === "audio" || source.kind === "video")) { next = addTrack(next, source.kind); target = next.tracks.find(t => !project.tracks.some(old => old.id === t.id) && ![...destinations.values()].includes(t.id)); }
    target ??= next.tracks.find(t => t.kind === source.kind && ![...destinations.values()].includes(t.id));
    if (!target || target.locked) return project;
    destinations.set(source.id,target.id);
  }
  const start = Math.min(...clips.map(c => c.from)), delta = Math.max(0,Math.round(at)) - start;
  const identities = new Map(clips.map(c => [c.id,newId()]));
  const placed = mapTracks(next,t => ({ ...t, clips: [...t.clips, ...clipboard.tracks.filter(s => destinations.get(s.id) === t.id).flatMap(s => s.clips.map(c => {
    const clip = structuredClone({ ...c, id: identities.get(c.id)!, from: c.from + delta });
    if (clip.kind === "audio" || clip.kind === "video") clip.linkedClipId = clip.linkedClipId ? identities.get(clip.linkedClipId) : undefined;
    if (clip.kind === "audio" && clip.derivedFrom) { const parent = identities.get(clip.derivedFrom.clipId); clip.derivedFrom = parent ? { ...clip.derivedFrom, clipId: parent } : undefined; }
    return clip;
  }))] }));
  return overwritePlaced(project,placed,[...identities.values()]);
};

/** Abre espacio para Origen en las pistas destino y las que siguen ripple. Transacción atómica. */
export const insertSourceRange = (project: Project, media: Parameters<typeof addSourceRange>[1], trackId: string, from: number, inFrame = 0, outFrame = media.durationInFrames, videoOnly = false): Project => {
  if (![from,inFrame,outFrame,media.durationInFrames].every(Number.isFinite) || outFrame <= inFrame) return project;
  const target = project.tracks.find(t => t.id === trackId);
  if (!target || target.locked || !(target.kind === "video" || target.kind === "audio")) return project;
  const start = Math.max(0,Math.min(media.durationInFrames-1,Math.round(inFrame))), end = Math.max(start+1,Math.min(media.durationInFrames,Math.round(outFrame)));
  const at = Math.max(0,Math.round(from)), length = end-start;
  const audio = target.kind === "video" && !videoOnly && media.hasAudio === true ? destinationTrack(project,"audio") : undefined;
  if (target.kind === "video" && !videoOnly && media.hasAudio === true && !audio) return project;
  const affected = new Set(project.tracks.filter(t => t.id === trackId || t.id === audio || t.syncLock && !t.locked).map(t => t.id));
  // Incluir parejas aunque su pista no tenga syncLock, sin eludir candados.
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of project.tracks) if (affected.has(t.id)) for (const c of t.clips.filter(c => c.from+c.durationInFrames>at)) for (const id of linkedIds(project,[c.id])) {
      const mate = findClip(project,id)!; if (mate.track.locked) return project;
      if (!affected.has(mate.track.id)) { affected.add(mate.track.id); changed = true; }
    }
  }
  let next = project;
  for (const t of project.tracks.filter(t => affected.has(t.id))) for (const c of t.clips.filter(c => c.from < at && c.from+c.durationInFrames > at)) next = splitAt(next,at,c.id);
  next = mapTracks(next,t => !affected.has(t.id) ? t : ({...t,clips:t.clips.map(c => c.from>=at ? {...c,from:c.from+length}:c)}));
  const placed = addSourceRange(next,media,trackId,at,start,end,videoOnly);
  if (placed === next) return project;
  const withMarkers = { ...placed, markers: (project.markers??[]).map(m=>m.frame>=at?{...m,frame:m.frame+length}:m) };
  return preserveLocked(project,withMarkers);
};

export const addTextClip = (
  project: Project,
  opts: { text: string; from: number; durationInFrames: number; style?: Partial<TextStyle>; id?: string },
  trackId = "T1",
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== trackId || track.locked) return track;
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
  if (!clipsEditable(project, [clipId])) return project;
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
  if (!clipsEditable(project, [clipId])) return project;
  if (project.tracks.some((t) => t.locked && t.clips.some((c) => c.kind === "audio" && c.derivedFrom?.clipId === clipId))) return project;
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
  if (!clipsEditable(project, [clipId]) || project.tracks.some((t) => t.locked && t.clips.some((c) => c.kind === "audio" && c.derivedFrom?.clipId === clipId))) return project;
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
  const target = project.tracks.findIndex((t) => t.id === toTrackId && t.kind === found.track.kind);
  return moveClips(project, [clipId], from - found.clip.from, target < 0 ? 0 : target - project.tracks.indexOf(found.track));
};

export const deleteClip = (project: Project, clipId: string): Project =>
  deleteClips(project, [clipId]);

/** Un único desplazamiento para conservar las distancias del grupo, también al llegar a cero. */
export const moveClips = (project: Project, ids: string[], deltaFrames: number, trackOffset = 0): Project => {
  const selected = new Set(linkedIds(project, ids)), vertical = new Set(ids);
  const clips = project.tracks.flatMap((t) => t.clips).filter((c) => selected.has(c.id));
  if (!clips.length || !clipsEditable(project, ids) || !Number.isFinite(deltaFrames) || !Number.isInteger(trackOffset)) return project;
  const delta = Math.max(-Math.min(...clips.map((c) => c.from)), Math.round(deltaFrames));
  const validOffset = project.tracks.every((track, index) => !track.clips.some((c) => vertical.has(c.id)) || project.tracks[index + trackOffset]?.kind === track.kind) ? trackOffset : 0;
  if (project.tracks.some((t, i) => t.clips.some((c) => vertical.has(c.id)) && project.tracks[i + validOffset]?.locked)) return project;
  if (!delta && !validOffset) return project;
  const placed = { ...project, tracks: project.tracks.map((track, index) => ({ ...track, clips: !validOffset ? track.clips.map((c) => selected.has(c.id) ? { ...c, from: c.from + delta } : c) : [
    ...track.clips.filter((c) => !vertical.has(c.id)).map((c) => selected.has(c.id) ? { ...c, from: c.from + delta } : c),
    ...(project.tracks[index - validOffset]?.clips ?? []).filter((c) => vertical.has(c.id)).map((c) => ({ ...c, from: c.from + delta })),
  ] })) };
  return overwritePlaced(project, placed, [...selected]);
};

/** Borrado de selección en una transacción; ripple cierra la unión de sus huecos por pista. */
export const deleteClips = (project: Project, ids: string[], ripple = false): Project => {
  if (!clipsEditable(project, ids)) return project;
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
  const anchors = new Set(project.tracks.filter((t) => t.clips.some((c) => selected.has(c.id))).map((t) => t.id));
  const gaps = project.tracks.flatMap((t) => t.clips.filter((c) => selected.has(c.id)).map((c) => ({ start: c.from, end: c.from + c.durationInFrames })));
  return ripple ? preserveLocked(project, alignLinkedChanges(project, rippleFollowers(project, next, anchors, gaps))) : next;
};

/** Borra el clip y corre hacia la izquierda los clips que venían después (como "Ripple Delete"). */
export const rippleDeleteClip = (project: Project, clipId: string): Project => {
  return deleteClips(project, [clipId], true);
};

/** Corta cualquier clip que pase por el frame indicado (como la herramienta Razor / Cmd+K). */
export const splitAt = (project: Project, frame: number, onlyClipId?: string): Project => {
  const targets = new Set(onlyClipId ? clipsEditable(project, [onlyClipId]) ? linkedIds(project, [onlyClipId]) : [] : project.tracks.flatMap((t) => t.clips.filter((c) => clipsEditable(project, [c.id])).map((c) => c.id)));
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
  if (!findClip(project, id) || !clipsEditable(project, [id]) || !Number.isFinite(deltaFrames)) return project;
  const ids = linkedIds(project, [id]);
  let delta = Math.round(deltaFrames);
  for (const clipId of ids) {
    const before = findClip(project, clipId)!.clip, after = findClip(trimSingle(project, clipId, edge, delta), clipId)!.clip;
    delta = edge === "start" ? after.from - before.from : after.durationInFrames - before.durationInFrames;
  }
  return overwritePlaced(project, ids.reduce((p, clipId) => trimSingle(p, clipId, edge, delta), project), ids);
};

/** Cambia el contenido visible sin mover los bordes del clip. */
export const slipClip = (project: Project, clipId: string, deltaFrames: number): Project => {
  if (!clipsEditable(project, [clipId])) return project;
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
  if (!clipsEditable(project, [clipId])) return project;
  const ids = linkedIds(project, [clipId]); let delta = deltaFrames;
  for (const id of ids) {
    const before = findClip(project, id)?.clip, after = findClip(rippleTrimSingle(project, id, edge, delta), id)?.clip;
    if (!before || !after) return project;
    delta = (after.durationInFrames - before.durationInFrames) * (edge === "start" ? -1 : 1);
    if (!delta) return project;
  }
  let next = ids.reduce((p, id) => rippleTrimSingle(p, id, edge, delta), project);
  const clip = findClip(project, clipId)!.clip, anchors = new Set(ids.map((id) => findClip(project, id)!.track.id));
  const lengthDelta = delta * (edge === "start" ? -1 : 1), end = clip.from + clip.durationInFrames;
  if (lengthDelta < 0) next = rippleFollowers(project, next, anchors, [{ start: end + lengthDelta, end }]);
  else {
    const followers = project.tracks.filter((t) => t.syncLock && !t.locked && !anchors.has(t.id)).flatMap((t) => t.clips.filter((c) => c.from >= end && clipsEditable(project, [c.id]) && linkedIds(project, [c.id]).every((id) => !anchors.has(findClip(project, id)!.track.id))).flatMap((c) => linkedIds(project, [c.id])));
    const following = new Set(followers);
    next = mapTracks(next, (t) => ({ ...t, clips: t.clips.map((c) => following.has(c.id) ? { ...c, from: c.from + lengthDelta } : c) }));
  }
  return preserveLocked(project, alignLinkedChanges(project, next));
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
  if (project.tracks.some((t) => t.locked && t.clips.length)) throw new Error("Desbloquea las pistas antes de aplicar un resumen a todo el montaje.");
  const duration = getProjectDuration(project);
  if (!ranges.length || ranges.some((r, i) => !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start || r.end > duration || (i > 0 && r.start < ranges[i - 1].end))) throw new Error("Los rangos deben estar ordenados, dentro del montaje y sin solaparse.");
  const identities = new Map<string, string>(), seen = new Set<string>();
  for (const [index, range] of ranges.entries()) for (const track of project.tracks) for (const clip of track.clips) {
    if (clip.from < range.end && clip.from + clip.durationInFrames > range.start) {
      identities.set(`${index}:${clip.id}`, seen.has(clip.id) ? newId() : clip.id); seen.add(clip.id);
    }
  }
  let markerCursor = 0;
  const markers = ranges.flatMap((range) => { const mapped = (project.markers ?? []).filter((m) => m.frame >= range.start && m.frame < range.end).map((m) => ({ ...m, frame: markerCursor + m.frame - range.start })); markerCursor += range.end - range.start; return mapped; });
  return { ...project, markers, tracks: project.tracks.map((track) => {
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
  if (project.tracks.find((t) => t.id === "S1")?.locked) return project;
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
  mapTracks(project, (t) => t.locked ? t : ({
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
  if (!clipsEditable(project, project.tracks.find((t) => t.id === "V1")?.clips.map((c) => c.id) ?? [])) return project;
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
