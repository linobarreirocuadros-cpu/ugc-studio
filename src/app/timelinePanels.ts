export const TIMELINE_PANEL_WIDTHS = {
  tools: { initial: 30, min: 28, max: 104, fraction: .3 },
  headers: { initial: 170, min: 92, max: 300, fraction: .45 },
};
export type TimelinePanel = keyof typeof TIMELINE_PANEL_WIDTHS;
export function normalizePanelWidth(panel: TimelinePanel, value: unknown): number {
  const limits = TIMELINE_PANEL_WIDTHS[panel];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(limits.min, Math.min(limits.max, Math.round(value))) : limits.initial;
}
export function toolGrid(width: number, height: number) {
  const columns = Math.max(1, Math.min(3, Math.floor((width - 6 + 1) / 21)));
  const rows = Math.ceil(8 / columns) + Math.ceil(3 / columns);
  const fullCell = Math.floor((height - 6 - (rows - 1) - 7) / rows);
  if (fullCell >= 16) return { columns, cell: Math.min(20, fullCell), visible: 11, overflow: false };
  const cell = Math.min(16, Math.max(12, height - 6));
  const capacity = Math.max(1, Math.floor((height - 6 + 1) / (cell + 1))) * columns;
  return { columns, cell, visible: Math.max(0, Math.min(10, capacity - 1)), overflow: true };
}
