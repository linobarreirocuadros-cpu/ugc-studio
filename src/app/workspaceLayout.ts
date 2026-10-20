export const PANELS = ["bin", "monitor", "inspector", "timeline", "meter"] as const;
export type Panel = typeof PANELS[number];
export type Edge = "left" | "right" | "top" | "bottom" | "center";
export type DockNode = { type: "panel"; panel: Panel } | { type: "split"; id: string; axis: "x" | "y"; ratio: number; first: DockNode; second: DockNode };
export type Rect = { x: number; y: number; width: number; height: number };
export type Divider = Rect & { id: string; axis: "x" | "y"; ratio: number; area: Rect; first: string; second: string };
export const PANEL_LABEL: Record<Panel, string> = { bin: "Proyecto", monitor: "Monitores", inspector: "Inspector", timeline: "Timeline", meter: "Audio · dBFS" };
export const GAP = 8;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const leaf = (panel: Panel): DockNode => ({ type: "panel", panel });
const split = (id: string, axis: "x" | "y", ratio: number, first: DockNode, second: DockNode): DockNode => ({ type: "split", id, axis, ratio, first, second });
export const defaultLayout = (): DockNode => split("rows", "y", .56,
  split("library", "x", .2, leaf("bin"), split("inspector", "x", .72, leaf("monitor"), leaf("inspector"))),
  split("audio", "x", .91, leaf("timeline"), leaf("meter")));
export const panelsIn = (node: DockNode): Panel[] => node.type === "panel" ? [node.panel] : [...panelsIn(node.first), ...panelsIn(node.second)];

export function normalizeLayout(value: unknown, width = 1280, height = 720): DockNode {
  const seen = new Set<string>(), ids = new Set<string>();
  function valid(v: unknown, depth = 0): v is DockNode {
    if (!v || typeof v !== "object" || depth > 12) return false;
    const n = v as Record<string, unknown>;
    if (n.type === "panel" && PANELS.includes(n.panel as Panel) && !seen.has(n.panel as string)) { seen.add(n.panel as string); return true; }
    if (n.type !== "split" || typeof n.id !== "string" || !n.id || ids.has(n.id) || !["x", "y"].includes(n.axis as string) || typeof n.ratio !== "number" || !Number.isFinite(n.ratio) || n.ratio < .02 || n.ratio > .98) return false;
    ids.add(n.id); return valid(n.first, depth + 1) && valid(n.second, depth + 1);
  }
  if (valid(value) && seen.size === PANELS.length) return value;
  // Migrar las cuatro zonas antiguas sin tocar el montaje.
  if (value && typeof value === "object") {
    const old = value as { slots?: Record<string, Panel>; left?: number; right?: number; bottom?: number };
    const slots = ["left", "center", "right", "bottom"].map(k => old.slots?.[k]);
    if (new Set(slots).size === 4 && slots.every(p => p && PANELS.includes(p) && p !== "meter") && [old.left, old.right, old.bottom].every(n => typeof n === "number" && Number.isFinite(n))) {
      const item = (p: Panel): DockNode => p === "timeline" ? split("audio", "x", .87, leaf(p), leaf("meter")) : leaf(p);
      return split("rows", "y", clamp(1 - old.bottom! / Math.max(1, height - 90), .15, .85),
        split("library", "x", clamp(old.left! / Math.max(1, width - 20), .12, .45), item(slots[0]!),
          split("inspector", "x", clamp(1 - old.right! / Math.max(1, width - 20 - old.left!), .25, .85), item(slots[1]!), item(slots[2]!))), item(slots[3]!));
    }
  }
  return defaultLayout();
}
function remove(node: DockNode, panel: Panel): DockNode | null {
  if (node.type === "panel") return node.panel === panel ? null : node;
  const first = remove(node.first, panel), second = remove(node.second, panel);
  return !first ? second : !second ? first : { ...node, first, second };
}
function mapPanel(node: DockNode, panel: Panel, fn: (n: DockNode) => DockNode): DockNode {
  return node.type === "panel" ? node.panel === panel ? fn(node) : node : { ...node, first: mapPanel(node.first, panel, fn), second: mapPanel(node.second, panel, fn) };
}
export function dockPanel(tree: DockNode, source: Panel, target: Panel | "workspace", edge: Edge): DockNode {
  if (!panelsIn(tree).includes(source) || source === target || target === "workspace" && edge === "center" || target !== "workspace" && !panelsIn(tree).includes(target)) return tree;
  if (edge === "center" && target !== "workspace") {
    const swap = (node: DockNode): DockNode => node.type === "panel" ? leaf(node.panel === source ? target : node.panel === target ? source : node.panel) : { ...node, first: swap(node.first), second: swap(node.second) };
    return swap(tree);
  }
  const rest = remove(tree, source); if (!rest) return tree;
  const ids = new Set<string>(); const collect = (n: DockNode) => { if (n.type === "split") { ids.add(n.id); collect(n.first); collect(n.second); } }; collect(rest);
  let i = 0; while (ids.has(`dock-${i}`)) i++;
  const insert = (n: DockNode) => split(`dock-${i}`, edge === "left" || edge === "right" ? "x" : "y", target === "workspace" ? edge === "left" || edge === "top" ? .28 : .72 : .5,
    edge === "left" || edge === "top" ? leaf(source) : n, edge === "left" || edge === "top" ? n : leaf(source));
  return target === "workspace" ? insert(rest) : mapPanel(rest, target, insert);
}
export function setSplitRatio(node: DockNode, id: string, ratio: number): DockNode {
  if (node.type === "panel" || !Number.isFinite(ratio)) return node;
  return node.id === id ? { ...node, ratio: clamp(ratio, .02, .98) } : { ...node, first: setSplitRatio(node.first, id, ratio), second: setSplitRatio(node.second, id, ratio) };
}
function minimum(node: DockNode, axis: "x" | "y"): number {
  if (node.type === "panel") return axis === "x" ? node.panel === "meter" ? 72 : node.panel === "timeline" ? 280 : node.panel === "monitor" ? 240 : 160 : node.panel === "meter" ? 130 : 150;
  return node.axis === axis ? minimum(node.first, axis) + minimum(node.second, axis) + GAP : Math.max(minimum(node.first, axis), minimum(node.second, axis));
}
export function layoutRects(tree: DockNode, width: number, height: number) {
  const panels = {} as Record<Panel, Rect>, dividers: Divider[] = [];
  const visit = (n: DockNode, r: Rect) => {
    if (n.type === "panel") { panels[n.panel] = r; return; }
    const length = n.axis === "x" ? r.width : r.height, gap = Math.min(GAP, length), room = Math.max(0, length - gap);
    const a = minimum(n.first, n.axis), b = minimum(n.second, n.axis);
    const first = a + b <= room ? clamp(room * n.ratio, a, room - b) : room * a / (a + b);
    const second = room - first;
    dividers.push({ id: n.id, axis: n.axis, ratio: room ? first / room : .5, area: r, first: panelsIn(n.first).map(p => PANEL_LABEL[p]).join(", "), second: panelsIn(n.second).map(p => PANEL_LABEL[p]).join(", "),
      x: r.x + (n.axis === "x" ? first : 0), y: r.y + (n.axis === "y" ? first : 0), width: n.axis === "x" ? gap : r.width, height: n.axis === "y" ? gap : r.height });
    visit(n.first, { ...r, width: n.axis === "x" ? first : r.width, height: n.axis === "y" ? first : r.height });
    visit(n.second, { x: r.x + (n.axis === "x" ? first + gap : 0), y: r.y + (n.axis === "y" ? first + gap : 0), width: n.axis === "x" ? second : r.width, height: n.axis === "y" ? second : r.height });
  };
  visit(tree, { x: 0, y: 0, width: Math.max(0, width), height: Math.max(0, height) });
  return { panels, dividers };
}
