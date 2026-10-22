import {
  getProjectDuration,
  trackOutputEnabled,
  type Project,
  type Clip,
  type ExportRange,
} from "./types";
import { retimeProject } from "./sequenceSettings";
export type DeliveryVariant = {
  id: string;
  name: string;
  captions: boolean;
  overlays: boolean;
  graphics: boolean;
  footage: boolean;
  audio: boolean;
  effects: boolean;
  transparent: boolean;
};
export type DeliveryFormat = {
  id: string;
  name: string;
  width: number;
  height: number;
  fit: "cover" | "contain";
  smart: boolean;
  focusX: number;
  focusY: number;
  focusByClip?: Record<string, { x: number; y: number }>;
};
export type ExportSettings = {
  codec: "h264" | "h265" | "vp9" | "prores" | "wav";
  fps: number;
  rateControl: "quality" | "vbr" | "cbr";
  crf: number;
  bitrateMbps: number;
  maxBitrateMbps: number;
  profile: "auto" | "baseline" | "main" | "high";
  proresProfile: "proxy" | "lt" | "standard" | "hq" | "4444" | "4444-xq";
  pixelFormat: "yuv420p" | "yuv420p10le" | "yuv444p10le";
  audio: boolean;
  audioBitrate: number;
  sampleRate: 44100 | 48000 | 96000;
  channels: 1 | 2;
  audioDepth: 16 | 24;
  colorSpace: "default" | "bt709";
  imageQuality: number;
  keyframeInterval: number;
  mutedTracks: boolean;
  metadata: { title: string; author: string; comment: string };
  saveProject: boolean;
  saveSrt: boolean;
  log: "errors" | "settings" | "frames";
};
export type ExportRequest = {
  project: Project;
  name: string;
  directory: string;
  ranges: ExportRange[];
  variants: DeliveryVariant[];
  formats: DeliveryFormat[];
  settings: ExportSettings;
};
export const DEFAULT_VARIANTS: DeliveryVariant[] = [
  {
    id: "full",
    name: "Completa",
    captions: true,
    overlays: true,
    graphics: true,
    footage: true,
    audio: true,
    effects: true,
    transparent: false,
  },
  {
    id: "raw",
    name: "RAW",
    captions: false,
    overlays: false,
    graphics: false,
    footage: true,
    audio: true,
    effects: true,
    transparent: false,
  },
  {
    id: "overlays",
    name: "Overlays",
    captions: false,
    overlays: true,
    graphics: true,
    footage: true,
    audio: true,
    effects: true,
    transparent: false,
  },
];
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  codec: "h264",
  fps: 30,
  rateControl: "quality",
  crf: 18,
  bitrateMbps: 16,
  maxBitrateMbps: 24,
  profile: "auto",
  proresProfile: "hq",
  pixelFormat: "yuv420p",
  audio: true,
  audioBitrate: 320,
  sampleRate: 48000,
  channels: 2,
  audioDepth: 16,
  colorSpace: "bt709",
  imageQuality: 90,
  keyframeInterval: 60,
  mutedTracks: true,
  metadata: { title: "", author: "", comment: "" },
  saveProject: false,
  saveSrt: false,
  log: "settings",
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const wholeRange = (p: Project): ExportRange => ({
  id: "entire",
  name: p.name,
  start: 0,
  end: getProjectDuration(p),
});
export const slug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "Entrega";
export function exportExtension(s: ExportSettings, v: DeliveryVariant) {
  return s.codec === "wav"
    ? "wav"
    : v.transparent || s.codec === "prores"
      ? "mov"
      : s.codec === "vp9"
        ? "webm"
        : "mp4";
}
export function deliveryJobs(r: ExportRequest) {
  return r.ranges.flatMap((range) =>
    r.variants.flatMap((variant) =>
      r.formats.map((format) => ({
        range,
        variant,
        format,
        name: `${slug(r.name).slice(0, 40)}_${slug(range.name).slice(0, 32)}_${slug(variant.name).slice(0, 24)}_${slug(format.name).slice(0, 16)}.${exportExtension(r.settings, variant)}`,
      })),
    ),
  );
}
export function validateExportRequest(r: ExportRequest) {
  const s = r.settings,
    finite = (n: number, a: number, b: number) =>
      Number.isFinite(n) && n >= a && n <= b;
  if (
    !r.project ||
    !r.name?.trim() ||
    typeof r.directory !== "string" ||
    !Array.isArray(r.ranges) ||
    !r.ranges.length ||
    r.ranges.length > 500 ||
    !Array.isArray(r.variants) ||
    !r.variants.length ||
    r.variants.length > 20 ||
    !Array.isArray(r.formats) ||
    !r.formats.length ||
    r.formats.length > 20 ||
    r.ranges.length * r.variants.length * r.formats.length > 500
  )
    throw new Error(
      "Elige rangos, versiones y formatos (máximo 500 archivos por lote)",
    );
  for (const range of r.ranges)
    if (
      !range.name?.trim() ||
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > getProjectDuration(r.project)
    )
      throw new Error("Hay un rango fuera de la duración del montaje");
  for (const f of r.formats)
    if (
      f.focusByClip &&
      (typeof f.focusByClip !== "object" ||
        Object.keys(f.focusByClip).length > 10000 ||
        Object.values(f.focusByClip).some(
          (v) => !v || !finite(v.x, 0, 1) || !finite(v.y, 0, 1),
        ))
    )
      throw new Error("Focos de encuadre inválidos");
  for (const v of r.variants)
    if (
      !v.name?.trim() ||
      [
        "captions",
        "overlays",
        "graphics",
        "footage",
        "audio",
        "effects",
        "transparent",
      ].some((k) => typeof v[k as keyof DeliveryVariant] !== "boolean")
    )
      throw new Error("Versión inválida");
  for (const f of r.formats)
    if (
      !f.name?.trim() ||
      !Number.isInteger(f.width) ||
      !Number.isInteger(f.height) ||
      f.width % 2 !== 0 ||
      f.height % 2 !== 0 ||
      !finite(f.width, 16, 8192) ||
      !finite(f.height, 16, 8192) ||
      !["cover", "contain"].includes(f.fit) ||
      typeof f.smart !== "boolean" ||
      !finite(f.focusX, 0, 1) ||
      !finite(f.focusY, 0, 1)
    )
      throw new Error(
        "Formato inválido: usa dimensiones pares de 16 a 8192 píxeles",
      );
  if (
    !s ||
    !["h264", "h265", "vp9", "prores", "wav"].includes(s.codec) ||
    !finite(s.fps, 1, 120) ||
    !["quality", "vbr", "cbr"].includes(s.rateControl) ||
    !finite(s.crf, 0, 51) ||
    !finite(s.bitrateMbps, 0.1, 500) ||
    !finite(s.maxBitrateMbps, s.bitrateMbps, 1000) ||
    !["auto", "baseline", "main", "high"].includes(s.profile) ||
    !["proxy", "lt", "standard", "hq", "4444", "4444-xq"].includes(
      s.proresProfile,
    ) ||
    !["yuv420p", "yuv420p10le", "yuv444p10le"].includes(s.pixelFormat) ||
    ![44100, 48000, 96000].includes(s.sampleRate) ||
    ![1, 2].includes(s.channels) ||
    ![16, 24].includes(s.audioDepth) ||
    !finite(s.audioBitrate, 32, 512) ||
    !finite(s.imageQuality, 1, 100) ||
    !Number.isInteger(s.keyframeInterval) ||
    !finite(s.keyframeInterval, 1, 10000) ||
    !["default", "bt709"].includes(s.colorSpace) ||
    !["errors", "settings", "frames"].includes(s.log) ||
    ["audio", "mutedTracks", "saveProject", "saveSrt"].some(
      (k) => typeof s[k as keyof ExportSettings] !== "boolean",
    ) ||
    !s.metadata ||
    Object.values(s.metadata).some(
      (x) => typeof x !== "string" || x.length > 1000,
    )
  )
    throw new Error("Parámetros de codificación inválidos");
  if ((s.codec === "h264" || s.codec === "h265") && s.pixelFormat !== "yuv420p")
    throw new Error(
      "H.264 / HEVC de este FFmpeg usan YUV 4:2:0 de 8 bits; elige ProRes/VP9 para otra profundidad de codificación",
    );
  if (s.audioDepth !== 16)
    throw new Error(
      "El mezclador actual entrega PCM de 16 bits; 24 bits reales está pendiente",
    );
  if (s.codec === "wav" && r.variants.some((v) => !v.audio))
    throw new Error(
      "Activa el audio en todas las versiones seleccionadas para exportar WAV",
    );
  if (s.codec === "wav" && !s.audio)
    throw new Error("Activa audio para exportar WAV");
  if (s.codec === "vp9" && s.audioBitrate > s.channels * 256)
    throw new Error(
      "Opus admite hasta 256 kbps por canal; reduce el bitrate de audio",
    );
  if (s.codec === "vp9" && s.sampleRate !== 48000)
    throw new Error("WebM / Opus utiliza 48000 Hz");
  const names = deliveryJobs(r).map((j) => j.name);
  if (new Set(names).size !== names.length)
    throw new Error(
      "Dos salidas tienen el mismo nombre; renombra los rangos/versiones/formatos",
    );
}
/** Copia de entrega; nunca cambia el proyecto ni su historial. Recompone a proporciones
 * de pantalla y limita textos al área segura. El encuadre admite foco sugerido o manual. */
export function deliveryProject(
  source: Project,
  variant: DeliveryVariant,
  format: DeliveryFormat,
  settings: ExportSettings,
): Project {
  const adapt = (p: Project): Project => {
    const timed = retimeProject(p, settings.fps),
      sx = format.width / p.width,
      sy = format.height / p.height;
    const keep = (c: Clip) =>
      c.kind === "caption"
        ? variant.captions
        : c.kind === "text"
          ? variant.overlays
          : c.kind === "graphic"
            ? c.shape === "adjustment"
              ? variant.effects
              : variant.graphics
            : c.kind === "audio"
              ? variant.audio && settings.audio
              : variant.footage || Boolean(c.sequenceId);
    const clip = (c: Clip): Clip => {
      let next: Clip = {
        ...c,
        ...(!variant.effects ? { effects: undefined } : {}),
        ...(c.motion
          ? {
              motion: {
                ...c.motion,
                distance: c.motion.distance * sy,
                keys: c.motion.keys.map((k) => ({
                  ...k,
                  ...(k.x === undefined ? {} : { x: k.x * sx }),
                  ...(k.y === undefined ? {} : { y: k.y * sy }),
                })),
              },
            }
          : {}),
      };
      if (next.kind === "video" && (!variant.audio || !settings.audio))
        next = { ...next, volume: 0, audioMode: "none" };
      if (next.kind === "video" && !next.sequenceId)
        next = {
          ...next,
          effects: { ...next.effects, fit: format.fit },
          reframeFocus: format.focusByClip?.[c.id] ??
            next.reframeFocus ?? { x: format.focusX, y: format.focusY },
        };
      if (next.kind === "text" || next.kind === "caption") {
        const words =
            next.kind === "text"
              ? next.text.split(/\s+/)
              : next.words.map((w) => w.text),
          longest = Math.max(1, ...words.map((w) => w.length)),
          limit = (format.width * 0.82) / (longest * 0.65);
        next = {
          ...next,
          style: {
            ...next.style,
            fontSize: format.smart
              ? Math.min(next.style.fontSize * sx, limit)
              : next.style.fontSize * sx,
            y: format.smart
              ? clamp(next.style.y, 0.1, next.kind === "caption" ? 0.8 : 0.88)
              : next.style.y,
          },
        } as Clip;
      }
      if (
        next.kind === "graphic" &&
        format.smart &&
        next.shape === "rectangle"
      ) {
        const height = (next.height * sx) / sy,
          shrink = Math.min(
            1,
            0.88 / Math.max(0.001, next.width),
            0.82 / Math.max(0.001, height),
          ),
          width = next.width * shrink,
          safeHeight = height * shrink;
        next = {
          ...next,
          width,
          height: safeHeight,
          x: clamp(next.x, 0.06 + width / 2, 0.94 - width / 2),
          y: clamp(next.y, 0.06 + safeHeight / 2, 0.88 - safeHeight / 2),
        };
      }
      return next;
    };
    let tracks = timed.tracks.map((t) => ({
      ...t,
      ...(!settings.mutedTracks
        ? { muted: false, hidden: false, solo: false }
        : {}),
      clips: t.clips.filter(keep).map(clip),
    }));
    if (format.smart) {
      const captions = tracks
        .flatMap((t) => t.clips)
        .filter((c) => c.kind === "caption");
      tracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.kind !== "text" && c.kind !== "caption") return c;
          const text =
              c.kind === "text" ? c.text : c.words.map((w) => w.text).join(" "),
            lines = Math.max(
              1,
              Math.ceil(
                (text.length * c.style.fontSize * 0.6) / (format.width * 0.82),
              ),
            ),
            half = Math.min(
              0.32,
              (lines * c.style.fontSize * 1.15) / format.height / 2,
            );
          let y = clamp(c.style.y, 0.08 + half, 0.9 - half);
          if (c.kind === "text")
            for (const caption of captions) {
              if (
                c.from >= caption.from + caption.durationInFrames ||
                caption.from >= c.from + c.durationInFrames
              )
                continue;
              const capHalf = (caption.style.fontSize * 1.3) / format.height,
                capY = Math.min(0.8, caption.style.y);
              if (Math.abs(y - capY) < half + capHalf + 0.03)
                y = clamp(
                  capY - capHalf - half - 0.04,
                  0.08 + half,
                  0.9 - half,
                );
            }
          return { ...c, style: { ...c.style, y } } as Clip;
        }),
      }));
    }
    return {
      ...timed,
      width: format.width,
      height: format.height,
      audioSampleRate: settings.sampleRate,
      tracks,
    };
  };
  const project = adapt(source);
  return {
    ...project,
    sequences:
      source.sequences &&
      (Object.fromEntries(
        Object.entries(source.sequences).map(([id, s]) => [
          id,
          {
            ...adapt(s),
            id,
            durationInFrames: Math.max(
              1,
              Math.round((s.durationInFrames * settings.fps) / s.fps),
            ),
          },
        ]),
      ) as Project["sequences"]),
  };
}
/** SRT de la entrega, incluyendo captions anidados y solo palabras del rango. */
export function deliverySrt(
  project: Project,
  start: number,
  end: number,
): string {
  const blocks: { start: number; end: number; text: string }[] = [],
    stamp = (f: number) => {
      const ms = Math.max(0, Math.round((f / project.fps) * 1000));
      return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
    };
  const walk = (
    p: Project,
    offset: number,
    low: number,
    high: number,
    stack: string[],
  ) => {
    for (const t of p.tracks.filter((t) => trackOutputEnabled(p, t)))
      for (const c of t.clips) {
        const a = Math.max(low, c.from + offset),
          b = Math.min(high, c.from + offset + c.durationInFrames);
        if (a >= b) continue;
        if (c.kind === "caption") {
          const words = c.words.filter(
            (w) => c.from + offset + w.start < b && c.from + offset + w.end > a,
          );
          if (words.length)
            blocks.push({
              start: a - start,
              end: b - start,
              text: words.map((w) => w.text).join(" "),
            });
        }
        if (
          c.kind === "video" &&
          c.sequenceId &&
          !stack.includes(c.sequenceId)
        ) {
          const s = project.sequences?.[c.sequenceId];
          if (s)
            walk(
              retimeProject(s, project.fps),
              offset + c.from - c.trimStart,
              a,
              b,
              [...stack, c.sequenceId],
            );
        }
      }
  };
  walk(project, 0, start, end, []);
  return blocks
    .sort((a, b) => a.start - b.start)
    .map(
      (b, i) => `${i + 1}\n${stamp(b.start)} --> ${stamp(b.end)}\n${b.text}\n`,
    )
    .join("\n");
}
