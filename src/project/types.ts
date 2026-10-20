// El proyecto completo es un JSON serializable. La línea de tiempo, el chat (Fase 2)
// y el render de Remotion leen y escriben esta misma estructura.

export type VideoClip = {
  id: string;
  kind: "video";
  src: string; // URL servida por el servidor local, ej. /media/abc.mp4 (original, para exportar)
  proxySrc?: string; // copia liviana solo para la vista previa (como los proxies de Premiere)
  name: string;
  from: number; // frame donde empieza en la línea de tiempo
  durationInFrames: number; // duración visible en la línea de tiempo
  trimStart: number; // frames recortados desde el inicio del archivo
  sourceDurationInFrames: number; // duración total del archivo
  volume: number; // 0..1
  linkedClipId?: string;
  audioMode?: "embedded" | "separate" | "none";
};

/** Música, voz en off o efecto de sonido (Foley). */
export type AudioClip = {
  id: string;
  kind: "audio";
  src: string;
  name: string;
  from: number;
  durationInFrames: number;
  trimStart: number;
  sourceDurationInFrames: number;
  volume: number; // 0..1
  fadeIn: number; // frames
  fadeOut: number; // frames
  derivedFrom?: { clipId: string; src: string; originalVolume: number; mode: string };
  linkedClipId?: string;
};

export type TextClip = {
  id: string;
  kind: "text";
  text: string;
  from: number;
  durationInFrames: number;
  style: TextStyle;
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  background: string | null;
  y: number; // posición vertical, 0 = arriba, 1 = abajo
};

/** Palabra transcrita. Tiempos en frames desde el inicio del archivo original. */
export type Word = { text: string; start: number; end: number; confidence?: number };

export type CaptionPreset = "karaoke" | "palabra" | "bloque";

export type CaptionStyle = TextStyle & {
  preset: CaptionPreset;
  highlightColor: string; // color de la palabra que se está diciendo
  uppercase: boolean;
  stroke: boolean; // contorno negro para leer sobre cualquier fondo
};

/** Un bloque de subtítulo (2–4 palabras). Tiempos de las palabras relativos a `from`. */
export type CaptionClip = {
  id: string;
  kind: "caption";
  from: number;
  durationInFrames: number;
  words: Word[];
  style: CaptionStyle;
};

export type Clip = VideoClip | AudioClip | TextClip | CaptionClip;

export type Track = {
  id: string;
  kind: "video" | "audio" | "text" | "caption";
  name: string;
  clips: Clip[];
  locked?: boolean;
  hidden?: boolean;
  muted?: boolean;
  solo?: boolean;
  targeted?: boolean;
  syncLock?: boolean;
};

export type Project = {
  version: 1;
  name: string;
  fps: number;
  width: number;
  height: number;
  tracks: Track[]; // el primer track se dibuja abajo, el último arriba
  transcripts?: Record<string, Word[]>; // por archivo (clave = src)
  transcriptInfo?: Record<string, { engine: string; model: string; language: string; vocabulary?: string }>;
};

/** La salida es la misma para Programa y exportación. Bloquear no cambia la reproducción. */
export const trackOutputEnabled = (project: Project, track: Track): boolean => {
  if (track.kind !== "audio") return !track.hidden;
  return !track.muted && (!project.tracks.some((t) => t.kind === "audio" && t.solo) || Boolean(track.solo));
};

export const destinationTrack = (project: Project, kind: "video" | "audio"): string | undefined => {
  const targeted = project.tracks.find((t) => t.kind === kind && t.targeted);
  if (targeted) return targeted.locked ? undefined : targeted.id;
  const tracks = kind === "audio" ? [...project.tracks].reverse() : project.tracks;
  return tracks.find((t) => t.kind === kind && !t.locked)?.id;
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Inter",
  fontSize: 64,
  color: "#ffffff",
  background: "rgba(0,0,0,0.55)",
  y: 0.75,
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "Montserrat",
  fontSize: 78,
  color: "#ffffff",
  background: null,
  y: 0.7,
  preset: "karaoke",
  highlightColor: "#ffe500",
  uppercase: true,
  stroke: true,
};

const DEFAULT_TRACKS: Omit<Track, "clips">[] = [
  { id: "A2", kind: "audio", name: "Audio 3" },
  { id: "A1", kind: "audio", name: "Audio 2" },
  { id: "A0", kind: "audio", name: "Audio 1" },
  { id: "V1", kind: "video", name: "B1" },
  { id: "V2", kind: "video", name: "B2" },
  { id: "T1", kind: "text", name: "T1" },
  { id: "S1", kind: "caption", name: "SUB" },
];

export const createEmptyProject = (): Project => ({
  version: 1,
  name: "Proyecto sin título",
  fps: 30,
  width: 1080,
  height: 1920, // vertical 9:16, formato UGC
  tracks: DEFAULT_TRACKS.map((t) => ({ ...t, clips: [] })),
  transcripts: {},
});

/** Agrega las pistas que falten a proyectos guardados con versiones anteriores del editor. */
export const normalizeProject = (project: Project): Project => {
  const missing = DEFAULT_TRACKS.filter((d) => !project.tracks.some((t) => t.id === d.id));
  const tracks = [...project.tracks];
  for (const track of missing) {
    const later = DEFAULT_TRACKS.slice(DEFAULT_TRACKS.indexOf(track) + 1).map((t) => t.id);
    const index = tracks.findIndex((t) => later.includes(t.id));
    tracks.splice(index < 0 ? tracks.length : index, 0, { ...track, clips: [] });
  }
  return nameTracks(missing.length ? { ...project, tracks } : project);
};

/** IDs antiguos se conservan; los nombres visibles son genéricos y consecutivos. */
export function nameTracks(project: Project): Project {
  let video = 0, audio = project.tracks.filter((t) => t.kind === "audio").length, changed = false;
  const tracks = project.tracks.map((t) => {
    const name = t.kind === "video" ? `B${++video}` : t.kind === "audio" ? `Audio ${audio--}` : t.name;
    if (name === t.name) return t;
    changed = true; return { ...t, name };
  });
  return changed ? { ...project, tracks } : project;
}

/** Duración del video: la marcan video, textos y subtítulos. El audio (ej. una canción más larga)
 *  no alarga el video, salvo que el proyecto tenga solo audio. */
export const getProjectDuration = (project: Project): number => {
  const endOf = (audio: boolean) =>
    project.tracks
      .filter((t) => (t.kind === "audio") === audio)
      .flatMap((t) => t.clips)
      .reduce((end, c) => Math.max(end, c.from + c.durationInFrames), 0);
  const end = endOf(false) || endOf(true);
  return Math.max(end, project.fps); // Remotion necesita al menos 1 frame; usamos 1 s
};

export const clipLabel = (clip: Clip): string =>
  clip.kind === "video" || clip.kind === "audio"
    ? clip.name
    : clip.kind === "text"
      ? clip.text
      : clip.words.map((w) => w.text).join(" ");
