import type { Clip, Project } from "./types";
export type SequenceSettings = Pick<Project, "width" | "height" | "fps"> & {
  name?: string;
  audioSampleRate?: number;
};
export const FRAME_RATES = [
  24000 / 1001,
  24,
  25,
  30000 / 1001,
  30,
  50,
  60000 / 1001,
  60,
  120,
];
export const CANVAS_PRESETS = [
  { name: "Vertical · 9:16 · 1080p", width: 1080, height: 1920 },
  { name: "Social · 4:5", width: 1080, height: 1350 },
  { name: "Cuadrado · 1:1 / 1K", width: 1080, height: 1080 },
  { name: "HD · 720p", width: 1280, height: 720 },
  { name: "Full HD · 1080p", width: 1920, height: 1080 },
  { name: "2K · QHD", width: 2560, height: 1440 },
  { name: "4K · UHD", width: 3840, height: 2160 },
  { name: "4K · DCI", width: 4096, height: 2160 },
];
export function validSequenceSettings(s: SequenceSettings) {
  return (
    Number.isInteger(s.width) &&
    s.width >= 16 &&
    s.width <= 8192 &&
    Number.isInteger(s.height) &&
    s.height >= 16 &&
    s.height <= 8192 &&
    Number.isFinite(s.fps) &&
    s.fps >= 1 &&
    s.fps <= 120 &&
    (s.audioSampleRate === undefined ||
      [44100, 48000, 96000].includes(s.audioSampleRate))
  );
}
/** Cambia la base temporal conservando segundos. No toca la biblioteca global ni originales. */
export function retimeProject<T extends Project>(p: T, fps: number): T {
  if (p.fps === fps) return p;
  const ratio = fps / p.fps,
    f = (n: number) => Math.max(0, Math.round(n * ratio)),
    d = (n: number) => Math.max(1, f(n));
  const clip = (c: Clip): Clip => {
    const next = {
      ...c,
      from: f(c.from),
      durationInFrames: d(c.durationInFrames),
      ...(c.kind === "video" || c.kind === "audio"
        ? {
            trimStart: f(c.trimStart),
            sourceDurationInFrames: d(c.sourceDurationInFrames),
            ...(c.kind === "video" && c.freezeFrame !== undefined
              ? { freezeFrame: f(c.freezeFrame) }
              : {}),
            ...(c.kind === "audio"
              ? { fadeIn: f(c.fadeIn), fadeOut: f(c.fadeOut) }
              : {}),
          }
        : {}),
      ...(c.kind === "caption"
        ? {
            words: c.words.map((w) => ({
              ...w,
              start: f(w.start),
              end: Math.max(f(w.start) + 1, f(w.end)),
            })),
          }
        : {}),
      ...(c.motion
        ? {
            motion: {
              ...c.motion,
              inFrames: d(c.motion.inFrames),
              outFrames: d(c.motion.outFrames),
              ...(c.motion.offset === undefined
                ? {}
                : { offset: Math.round(c.motion.offset * ratio) }),
              ...(c.motion.sourceDuration === undefined
                ? {}
                : { sourceDuration: d(c.motion.sourceDuration) }),
              keys: c.motion.keys
                .map((k) => ({ ...k, frame: f(k.frame) }))
                .filter(
                  (k, i, all) =>
                    i === all.length - 1 || k.frame !== all[i + 1].frame,
                ),
            },
          }
        : {}),
      ...(c.transitionIn
        ? {
            transitionIn: {
              ...c.transitionIn,
              frames: Math.min(Math.floor(fps * 10), d(c.transitionIn.frames)),
            },
          }
        : {}),
      ...(c.transitionOut
        ? {
            transitionOut: {
              ...c.transitionOut,
              frames: Math.min(Math.floor(fps * 10), d(c.transitionOut.frames)),
            },
          }
        : {}),
      ...(c.kind === "audio" && c.crossfadeIn
        ? {
            crossfadeIn: {
              ...c.crossfadeIn,
              frames: Math.min(Math.floor(fps * 10), d(c.crossfadeIn.frames)),
            },
          }
        : {}),
    } as Clip;
    if (next.kind === "video" || next.kind === "audio") {
      next.sourceDurationInFrames = Math.max(
        1,
        Math.ceil((c as typeof next).sourceDurationInFrames * ratio),
      );
      next.trimStart = Math.min(
        next.sourceDurationInFrames - 1,
        next.trimStart,
      );
      if (next.kind === "video" && next.freezeFrame !== undefined)
        next.freezeFrame = Math.min(
          next.sourceDurationInFrames - 1,
          next.freezeFrame,
        );
      else
        next.durationInFrames = Math.min(
          next.durationInFrames,
          Math.max(
            1,
            Math.ceil(
              (next.sourceDurationInFrames - next.trimStart) /
                (next.playbackRate ?? 1),
            ),
          ),
        );
    }
    return next;
  };
  return {
    ...p,
    fps,
    ...("durationInFrames" in p
      ? { durationInFrames: d(p.durationInFrames as number) }
      : {}),
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map(clip) })),
    markers: p.markers?.map((m) => ({ ...m, frame: f(m.frame) })),
    exportRanges: p.exportRanges?.map((r) => ({
      ...r,
      start: f(r.start),
      end: d(r.end),
    })),
    transcripts:
      p.transcripts &&
      Object.fromEntries(
        Object.entries(p.transcripts).map(([src, words]) => [
          src,
          words.map((w) => ({
            ...w,
            start: f(w.start),
            end: Math.max(f(w.start) + 1, f(w.end)),
          })),
        ]),
      ),
  };
}

/** Las plantillas globales conservan segundos y reloj de animación al cambiar de secuencia. */
export function retimeStandaloneClip<T extends Clip>(
  clip: T,
  fromFps: number,
  toFps: number,
): T {
  return retimeProject(
    {
      version: 1,
      name: "Plantilla",
      fps: fromFps,
      width: 16,
      height: 16,
      tracks: [
        { id: "template", name: "Plantilla", kind: clip.kind, clips: [clip] },
      ],
    },
    toFps,
  ).tracks[0].clips[0] as T;
}
