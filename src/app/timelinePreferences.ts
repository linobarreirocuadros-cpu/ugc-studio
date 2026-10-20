export type TimelinePreferences = {
  snapping: boolean; linkedSelection: boolean; selectionFollowsPlayhead: boolean;
  showNames: boolean; showWaveforms: boolean; showMarkers: boolean; trackHeight: number;
  nestSequences: boolean;
};
export const DEFAULT_TIMELINE_PREFERENCES: TimelinePreferences = {
  snapping: true, linkedSelection: true, selectionFollowsPlayhead: false,
  showNames: true, showWaveforms: true, showMarkers: true, trackHeight: 56,
  nestSequences: true,
};
export function normalizeTimelinePreferences(value: unknown): TimelinePreferences {
  const prefs = { ...DEFAULT_TIMELINE_PREFERENCES };
  if (!value || typeof value !== "object") return prefs;
  for (const key of ["snapping", "linkedSelection", "selectionFollowsPlayhead", "showNames", "showWaveforms", "showMarkers", "nestSequences"] as const) {
    if (key in value && typeof value[key as keyof typeof value] === "boolean") prefs[key] = value[key as keyof typeof value];
  }
  const height = (value as Partial<TimelinePreferences>).trackHeight;
  if (typeof height === "number" && Number.isFinite(height)) prefs.trackHeight = Math.max(36, Math.min(120, Math.round(height)));
  return prefs;
}
