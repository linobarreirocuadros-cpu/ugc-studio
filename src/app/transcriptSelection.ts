import { transcriptSource } from "../project/transcript";
import type { Project } from "../project/types";
import { copyTimelineRange, linkedIds } from "../project/ops";
import type { MediaDrag } from "./Timeline";

export type TranscriptWord = {
  text: string;
  frame: number;
  end: number;
  src: string;
  index: number;
  clipId: string;
};
export type TranscriptGroup = {
  clipId: string;
  name: string;
  start: number;
  end: number;
  words: TranscriptWord[];
};
export function transcriptGroups(
  project: Project,
  trackId: string,
): TranscriptGroup[] {
  const out: TranscriptGroup[] = [];
  for (const c of project.tracks.find((t) => t.id === trackId)?.clips ?? []) {
    if (
      (c.kind !== "video" && c.kind !== "audio") ||
      c.sequenceId ||
      (c.kind === "video" && c.freezeFrame !== undefined)
    )
      continue;
    const src = transcriptSource(c),
      rate = c.playbackRate ?? 1,
      sourceEnd = c.trimStart + c.durationInFrames * rate;
    let current: TranscriptGroup | null = null;
    (project.transcripts?.[src] ?? []).forEach((w, index) => {
      if (w.end <= c.trimStart || w.start >= sourceEnd) return;
      const frame = Math.max(
          c.from,
          c.from + Math.round((w.start - c.trimStart) / rate),
        ),
        end = Math.min(
          c.from + c.durationInFrames,
          Math.max(
            frame + 1,
            c.from + Math.round((w.end - c.trimStart) / rate),
          ),
        );
      if (frame >= end) return;
      if (
        !current ||
        current.words.length >= 18 ||
        frame - current.end > project.fps
      ) {
        current = { clipId: c.id, name: c.name, start: frame, end, words: [] };
        out.push(current);
      }
      current.words.push({
        text: w.text,
        frame,
        end,
        src,
        index,
        clipId: c.id,
      });
      current.end = Math.max(current.end, end);
    });
  }
  return out.sort((a, b) => a.start - b.start);
}
/** Copia solo los medios hablados y sus parejas; no arrastra overlays ajenos. */
export function transcriptDrag(
  project: Project,
  words: TranscriptWord[],
  epoch: number,
): MediaDrag | null {
  if (!words.length) return null;
  const start = Math.min(...words.map((w) => w.frame)),
    end = Math.max(...words.map((w) => w.end)),
    ids = new Set(linkedIds(project, [...new Set(words.map((w) => w.clipId))]));
  const selected = {
    ...project,
    tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => ids.has(c.id)),
    })),
  };
  const range = copyTimelineRange(selected, start, end, "auto"),
    video = range.tracks.some((t) => t.clips.some((c) => c.kind !== "audio"));
  if (!range.tracks.some((t) => t.clips.length)) return null;
  return {
    src: "",
    kind: video ? "video" : "audio",
    mode: "auto",
    frameBase: project.fps,
    inFrame: 0,
    outFrame: end - start,
    documentEpoch: epoch,
    timelineRange: { project: range, documentEpoch: epoch },
  };
}
