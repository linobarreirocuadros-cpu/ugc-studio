// Operaciones puras sobre el proyecto. Cada una recibe un Project y devuelve uno nuevo.
// La UI las usa hoy; en la Fase 2 el chat de IA las llamará como "tools".

import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_TEXT_STYLE,
  type CaptionClip,
  type CaptionStyle,
  type Clip,
  type Project,
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

/** Agrega un video al final del track indicado (V1 por defecto). */
export const addVideoClip = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number; proxySrc?: string },
  trackId = "V1",
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== trackId) return track;
    const clip: VideoClip = {
      id: newId(),
      kind: "video",
      src: media.src,
      proxySrc: media.proxySrc,
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
    clips: t.clips.map((c) => (c.kind === "video" && c.src === oldSrc ? { ...c, src: newSrc, proxySrc } : c)),
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

export const setTranscript = (project: Project, src: string, words: Word[]): Project => ({
  ...project,
  transcripts: { ...project.transcripts, [src]: words },
});

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
): Project =>
  mapTracks(project, (track) => {
    if (track.id !== "V1") return track;
    const sorted = [...track.clips].sort((a, b) => a.from - b.from);
    const out: Clip[] = [];
    let shift = 0;
    for (const clip of sorted) {
      const words = clip.kind === "video" ? project.transcripts?.[clip.src] : undefined;
      if (clip.kind !== "video" || !words?.length) {
        out.push({ ...clip, from: clip.from - shift });
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
        out.push({ ...clip, from: clip.from - shift });
        continue;
      }
      let cursor = clip.from - shift;
      ranges.forEach(([a, b], i) => {
        out.push({ ...clip, id: i === 0 ? clip.id : newId(), from: cursor, trimStart: a, durationInFrames: b - a });
        cursor += b - a;
      });
      shift += clip.durationInFrames - (cursor - (clip.from - shift));
    }
    return { ...track, clips: out };
  });
