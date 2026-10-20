export type MonitorRange = { start: number | null; end: number | null };

/** Salida exclusiva: marcar el fotograma 29 incluye los frames 0..29. */
export function updateMonitorRange(range: MonitorRange, command: string, frame: number, duration: number): MonitorRange {
  const at = Math.max(0, Math.min(duration - 1, Math.round(frame)));
  if (command === "markIn") return { start: at, end: range.end !== null && range.end <= at ? null : range.end };
  if (command === "markOut") return { start: range.start !== null && range.start > at ? null : range.start, end: at + 1 };
  if (command === "clearIn") return { ...range, start: null };
  if (command === "clearOut") return { ...range, end: null };
  if (command === "clearMarks") return { start: null, end: null };
  return range;
}

export function sourceRange(range: MonitorRange, duration: number) {
  const inFrame = Math.max(0, Math.min(duration - 1, range.start ?? 0));
  return { inFrame, outFrame: Math.max(inFrame + 1, Math.min(duration, range.end ?? duration)) };
}
