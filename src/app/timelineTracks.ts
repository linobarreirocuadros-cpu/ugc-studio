import type { Track } from "../project/types";
import type { TimelinePreferences } from "./timelinePreferences";

export type TrackZone = "captions" | "video" | "audio";
// Se fija la pista completa, incluso si contiene otros elementos. No duplicar clips
// ni convertir la pista genérica en una pista exclusiva de subtítulos.
export const trackZone = (track: Track): TrackZone =>
  track.kind === "audio"
    ? "audio"
    : track.clips.some((c) => c.kind === "caption")
      ? "captions"
      : "video";
export const trackHeight = (
  prefs: TimelinePreferences,
  context: string,
  id: string,
) => prefs.trackHeights[`${context}:${id}`] ?? prefs.trackHeight;
export function trackAtY<T extends { id: string }>(
  tracks: T[],
  heights: (t: T) => number,
  y: number,
) {
  let top = 0;
  for (const track of tracks) {
    const bottom = top + heights(track);
    if (y >= top && y < bottom) return track;
    top = bottom;
  }
  return undefined;
}
