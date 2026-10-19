// Operaciones puras sobre el proyecto. Cada una recibe un Project y devuelve uno nuevo.
// La UI las usa hoy; en la Fase 2 el chat de IA las llamará como "tools".

import {
  DEFAULT_TEXT_STYLE,
  type Clip,
  type Project,
  type TextStyle,
  type Track,
  type VideoClip,
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

/** Agrega un video al final del track indicado (V1 por defecto). */
export const addVideoClip = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number },
  trackId = "V1",
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== trackId) return track;
    const clip: VideoClip = {
      id: newId(),
      kind: "video",
      src: media.src,
      name: media.name,
      from: trackEnd(track),
      durationInFrames: media.durationInFrames,
      trimStart: 0,
      sourceDurationInFrames: media.durationInFrames,
      volume: 1,
    };
    return { ...track, clips: [...track.clips, clip] };
  });

export const addTextClip = (
  project: Project,
  opts: { text: string; from: number; durationInFrames: number; style?: Partial<TextStyle> },
  trackId = "T1",
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== trackId) return track;
    return {
      ...track,
      clips: [
        ...track.clips,
        {
          id: newId(),
          kind: "text",
          text: opts.text,
          from: opts.from,
          durationInFrames: opts.durationInFrames,
          style: { ...DEFAULT_TEXT_STYLE, ...opts.style },
        },
      ],
    };
  });

export const updateClip = (project: Project, clipId: string, patch: Partial<Clip>): Project =>
  mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
  }));

export const moveClip = (project: Project, clipId: string, from: number): Project =>
  updateClip(project, clipId, { from: Math.max(0, Math.round(from)) });

export const deleteClip = (project: Project, clipId: string): Project =>
  mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.filter((c) => c.id !== clipId),
  }));

/** Borra el clip y corre hacia la izquierda los clips que venían después (como "Ripple Delete"). */
export const rippleDeleteClip = (project: Project, clipId: string): Project => {
  const found = findClip(project, clipId);
  if (!found) return project;
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
export const splitAt = (project: Project, frame: number, onlyClipId?: string): Project =>
  mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.flatMap((c): Clip[] => {
      if (onlyClipId && c.id !== onlyClipId) return [c];
      const offset = frame - c.from;
      if (offset <= 0 || offset >= c.durationInFrames) return [c];
      const left = { ...c, durationInFrames: offset };
      const right = { ...c, id: newId(), from: frame, durationInFrames: c.durationInFrames - offset };
      if (right.kind === "video") right.trimStart = (c as VideoClip).trimStart + offset;
      return [left, right as Clip];
    }),
  }));

/** Ajusta el inicio o el final de un clip sin salirse del archivo original. */
export const trimClip = (
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
    if (c.kind === "video") duration = Math.min(duration, c.sourceDurationInFrames - c.trimStart);
    return updateClip(project, clipId, { durationInFrames: duration });
  }
  // start: positivo recorta, negativo extiende hacia atrás
  let delta = Math.min(d, c.durationInFrames - 1);
  delta = Math.max(delta, -c.from);
  if (c.kind === "video") delta = Math.max(delta, -c.trimStart);
  const patch: Partial<Clip> = { from: c.from + delta, durationInFrames: c.durationInFrames - delta };
  if (c.kind === "video") (patch as Partial<VideoClip>).trimStart = c.trimStart + delta;
  return updateClip(project, clipId, patch);
};
