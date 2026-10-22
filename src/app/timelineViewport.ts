/** Espacio de trabajo, separado de la duración que se reproduce/exporta. */
export const timelineExtent = (fps: number, end: number, incoming = end) =>
  Math.max(fps * 15 * 60, Math.max(end, incoming) + fps * 10);
export const timelineScale = (
  scale: number,
  factor: number,
  viewport: number,
  extent: number,
) =>
  Math.max(
    Math.max(1, viewport) / Math.max(1, extent),
    Math.min(20, scale * factor),
  );

/** Solo se dibujan etiquetas cercanas al área visible, incluso en montajes largos. */
export function timelineTicks(
  fps: number,
  scale: number,
  width: number,
  left: number,
  viewport: number,
) {
  const second = fps * scale,
    step =
      [
        1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800,
        21600,
      ].find((n) => n * second >= 55) ?? Math.ceil(55 / second),
    first = Math.max(0, Math.floor(left / (second * step)) - 1) * step,
    last = Math.min(
      Math.ceil(width / second),
      Math.ceil((left + viewport) / (second * step)) * step + step,
    );
  return Array.from(
    { length: Math.max(0, Math.ceil((last - first) / step)) },
    (_, i) => ({ second: first + i * step, x: (first + i * step) * second }),
  );
}

/** Escala NDF por frames: subdivisiones enteras, limitadas al viewport. */
export function timelineRulerTicks(
  fps: number,
  scale: number,
  width: number,
  left: number,
  viewport: number,
) {
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    return [];
  const nominal = Math.round(fps),
    steps = [
      1,
      2,
      5,
      10,
      15,
      20,
      ...[
        1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600,
      ].map((s) => s * nominal),
    ].sort((a, b) => a - b);
  const major = steps.find((n) => n * scale >= 64) ?? Math.ceil(64 / scale),
    division =
      [10, 8, 6, 5, 4, 3, 2].find(
        (n) => major % n === 0 && (major / n) * scale >= 7,
      ) ?? 1,
    minor = major / division;
  const first = Math.max(0, Math.floor(left / scale / minor) - 1) * minor,
    last = Math.min(
      Math.ceil(width / scale),
      Math.ceil((left + viewport) / scale / minor) * minor + minor,
    );
  return Array.from(
    { length: Math.min(4000, Math.max(0, Math.ceil((last - first) / minor))) },
    (_, i) => {
      const frame = first + i * minor;
      return { frame, x: frame * scale, major: frame % major === 0 };
    },
  );
}
