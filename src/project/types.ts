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
export type Word = { text: string; start: number; end: number };

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

export type Clip = VideoClip | TextClip | CaptionClip;

export type Track = {
  id: string;
  kind: "video" | "text" | "caption";
  name: string;
  clips: Clip[];
};

export type Project = {
  version: 1;
  name: string;
  fps: number;
  width: number;
  height: number;
  tracks: Track[]; // el primer track se dibuja abajo, el último arriba
  transcripts?: Record<string, Word[]>; // por archivo (clave = src)
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Inter, Helvetica, Arial, sans-serif",
  fontSize: 64,
  color: "#ffffff",
  background: "rgba(0,0,0,0.55)",
  y: 0.75,
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "Montserrat, Inter, Helvetica, Arial, sans-serif",
  fontSize: 78,
  color: "#ffffff",
  background: null,
  y: 0.7,
  preset: "karaoke",
  highlightColor: "#ffe500",
  uppercase: true,
  stroke: true,
};

export const createEmptyProject = (): Project => ({
  version: 1,
  name: "Proyecto sin título",
  fps: 30,
  width: 1080,
  height: 1920, // vertical 9:16, formato UGC
  tracks: [
    { id: "V1", kind: "video", name: "V1", clips: [] },
    { id: "T1", kind: "text", name: "T1", clips: [] },
    { id: "S1", kind: "caption", name: "SUB", clips: [] },
  ],
  transcripts: {},
});

export const getProjectDuration = (project: Project): number => {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.from + clip.durationInFrames);
    }
  }
  return Math.max(end, project.fps); // Remotion necesita al menos 1 frame; usamos 1 s
};

export const clipLabel = (clip: Clip): string =>
  clip.kind === "video" ? clip.name : clip.kind === "text" ? clip.text : clip.words.map((w) => w.text).join(" ");
