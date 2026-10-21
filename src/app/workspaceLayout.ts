export const PANELS = ["bin", "monitor", "inspector", "timeline", "meter", "properties", "effectControls", "essentialSound", "search", "text", "effects", "mixer"] as const;
export type Panel = typeof PANELS[number];
export type Edge = "left" | "right" | "top" | "bottom" | "center";
export type DockTarget = Panel | "workspace" | { group: string };
export type DockNode = { type: "panel"; panel: Panel } | {type:"tabs";panels:Panel[];active:Panel} | { type: "split"; id: string; axis: "x" | "y"; ratio: number; first: DockNode; second: DockNode };
export type Rect = { x: number; y: number; width: number; height: number };
export type Divider = Rect & { id: string; axis: "x" | "y"; ratio: number; area: Rect; first: string; second: string };
export const PANEL_LABEL: Record<Panel, string> = { bin: "Proyecto", monitor: "Monitores", inspector: "Inspector", timeline: "Timeline", meter: "Audio · dBFS", properties:"Propiedades",effectControls:"Controles de efectos",essentialSound:"Sonido esencial",search:"Buscar",text:"Texto",effects:"Efectos",mixer:"Mezclador de pistas" };
export const GAP = 8;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const leaf = (panel: Panel): DockNode => ({ type: "panel", panel });
const split = (id: string, axis: "x" | "y", ratio: number, first: DockNode, second: DockNode): DockNode => ({ type: "split", id, axis, ratio, first, second });
const tabs=(panels:Panel[],active=panels[0]):DockNode=>({type:"tabs",panels,active});
export const defaultLayout = (): DockNode => split("rows", "y", .56,
  split("library", "x", .23, tabs(["bin","effects","mixer"]), split("inspector", "x", .46, tabs(["inspector","properties","effectControls","essentialSound","search","text"]), leaf("monitor"))),
  split("audio", "x", .91, leaf("timeline"), leaf("meter")));
export const panelsIn = (node: DockNode): Panel[] => node.type === "panel" ? [node.panel] : node.type==="tabs"?[...node.panels]:[...panelsIn(node.first), ...panelsIn(node.second)];
export const tabGroups=(node:DockNode):Extract<DockNode,{type:"tabs"}>[]=>node.type==="tabs"?[node]:node.type==="split"?[...tabGroups(node.first),...tabGroups(node.second)]:[];
export const activateTab=(node:DockNode,panel:Panel):DockNode=>node.type==="tabs"?node.panels.includes(panel)?{...node,active:panel}:node:node.type==="split"?{...node,first:activateTab(node.first,panel),second:activateTab(node.second,panel)}:node;

export function normalizeLayout(value: unknown, width = 1280, height = 720): DockNode {
  const seen = new Set<string>(), ids = new Set<string>();
  function valid(v: unknown, depth = 0): v is DockNode {
    if (!v || typeof v !== "object" || depth > 12) return false;
    const n = v as Record<string, unknown>;
    if (n.type === "panel" && PANELS.includes(n.panel as Panel) && !seen.has(n.panel as string)) { seen.add(n.panel as string); return true; }
    if(n.type==="tabs"&&Array.isArray(n.panels)&&n.panels.length>=2&&n.panels.includes(n.active)&&n.panels.every(p=>PANELS.includes(p)&&!seen.has(p))&&new Set(n.panels).size===n.panels.length){n.panels.forEach(p=>seen.add(p));return true;}
    if (n.type !== "split" || typeof n.id !== "string" || !n.id || ids.has(n.id) || !["x", "y"].includes(n.axis as string) || typeof n.ratio !== "number" || !Number.isFinite(n.ratio) || n.ratio < .02 || n.ratio > .98) return false;
    ids.add(n.id); return valid(n.first, depth + 1) && valid(n.second, depth + 1);
  }
  if (valid(value)) {
    if(seen.size===PANELS.length)return value;
    if(["bin","monitor","inspector","timeline","meter"].every(p=>seen.has(p))){let upgraded=value;for(const [target,add]of [["bin",["effects","mixer"]],["inspector",["properties","effectControls","essentialSound","search","text"]]] as [Panel,Panel[]][]){const missing=add.filter(p=>!seen.has(p));if(missing.length)upgraded=mapTarget(upgraded,target,n=>tabs([...panelsIn(n),...missing],n.type==="tabs"?n.active:target));}return upgraded;}
  }
  // Migrar las cuatro zonas antiguas sin tocar el montaje.
  if (value && typeof value === "object") {
    const old = value as { slots?: Record<string, Panel>; left?: number; right?: number; bottom?: number };
    const slots = ["left", "center", "right", "bottom"].map(k => old.slots?.[k]);
    if (new Set(slots).size === 4 && slots.every(p => p && PANELS.includes(p) && p !== "meter") && [old.left, old.right, old.bottom].every(n => typeof n === "number" && Number.isFinite(n))) {
      const item = (p: Panel): DockNode => p === "timeline" ? split("audio", "x", .87, leaf(p), leaf("meter")) : leaf(p);
      return normalizeLayout(split("rows", "y", clamp(1 - old.bottom! / Math.max(1, height - 90), .15, .85),
        split("library", "x", clamp(old.left! / Math.max(1, width - 20), .12, .45), item(slots[0]!),
          split("inspector", "x", clamp(1 - old.right! / Math.max(1, width - 20 - old.left!), .25, .85), item(slots[1]!), item(slots[2]!))), item(slots[3]!)));
    }
  }
  return defaultLayout();
}
export function removePanel(node: DockNode, panel: Panel): DockNode | null {
  if (node.type === "panel") return node.panel === panel ? null : node;
  if(node.type==="tabs"){const panels=node.panels.filter(p=>p!==panel);return panels.length===1?leaf(panels[0]):panels.length?{...node,panels,active:panels.includes(node.active)?node.active:panels[0]}:null;}
  const first = removePanel(node.first, panel), second = removePanel(node.second, panel);
  return !first ? second : !second ? first : { ...node, first, second };
}
function mapTarget(node: DockNode, target: DockTarget, fn: (n: DockNode) => DockNode): DockNode {
  if (typeof target === "object" ? node.type === "split" && node.id === target.group : node.type !== "split" && panelsIn(node).includes(target as Panel)) return fn(node);
  return node.type !== "split" ? node : { ...node, first: mapTarget(node.first, target, fn), second: mapTarget(node.second, target, fn) };
}
export function groupPanel(tree:DockNode,source:Panel,target:Panel):DockNode{
  if(source===target||!panelsIn(tree).includes(source)||!panelsIn(tree).includes(target))return tree;
  if(tabGroups(tree).some(g=>g.panels.includes(source)&&g.panels.includes(target)))return activateTab(tree,source);
  const rest=removePanel(tree,source);return rest?mapTarget(rest,target,n=>({type:"tabs",panels:[...panelsIn(n),source],active:source})):tree;
}
/** Destinos calculados después de retirar el origen: una región conserva sus vecinos. */
export function dockTargets(tree: DockNode, source: Panel): { target: DockTarget; panels: Panel[]; label: string }[] {
  const rest=removePanel(tree,source);if(!rest)return [];
  const result:ReturnType<typeof dockTargets>=[];
  const visit=(node:DockNode,root=false)=>{
    if(node.type!=="split")result.push({target:node.type==="panel"?node.panel:node.active,panels:panelsIn(node),label:panelsIn(node).map(p=>PANEL_LABEL[p]).join(" + ")});
    else {visit(node.first);visit(node.second);if(!root){const panels=panelsIn(node);result.push({target:{group:node.id},panels,label:panels.map(p=>PANEL_LABEL[p]).join(" + ")});}}
  };
  visit(rest,true);result.push({target:"workspace",panels:panelsIn(rest),label:"Todo el espacio"});return result;
}
export const dockScopes=(tree:DockNode,source:Panel,over:Panel)=>dockTargets(tree,source).filter(t=>t.panels.includes(over)).sort((a,b)=>a.panels.length-b.panels.length);
export function dockPanel(tree: DockNode, source: Panel, target: DockTarget, edge: Edge): DockNode {
  if (!panelsIn(tree).includes(source) || source === target || typeof target !== "string" && edge === "center" || target === "workspace" && edge === "center" || typeof target === "string" && target !== "workspace" && !panelsIn(tree).includes(target)) return tree;
  if (edge === "center" && typeof target === "string" && target !== "workspace") {
    const change=(p:Panel)=>p===source?target:p===target?source:p;
    const swap = (node: DockNode): DockNode => node.type === "panel" ? leaf(change(node.panel)) : node.type==="tabs"?{...node,panels:node.panels.map(change),active:change(node.active)}:{ ...node, first: swap(node.first), second: swap(node.second) };
    return swap(tree);
  }
  const rest = removePanel(tree, source); if (!rest) return tree;
  if(typeof target==="object"&&!dockTargets(tree,source).some(t=>typeof t.target==="object"&&t.target.group===target.group))return tree;
  const ids = new Set<string>(); const collect = (n: DockNode) => { if (n.type === "split") { ids.add(n.id); collect(n.first); collect(n.second); } }; collect(rest);
  let i = 0; while (ids.has(`dock-${i}`)) i++;
  const insert = (n: DockNode) => split(`dock-${i}`, edge === "left" || edge === "right" ? "x" : "y", target === "workspace" ? edge === "left" || edge === "top" ? .28 : .72 : .5,
    edge === "left" || edge === "top" ? leaf(source) : n, edge === "left" || edge === "top" ? n : leaf(source));
  return target === "workspace" ? insert(rest) : mapTarget(rest, target, insert);
}
export function setSplitRatio(node: DockNode, id: string, ratio: number): DockNode {
  if (node.type !== "split" || !Number.isFinite(ratio)) return node;
  return node.id === id ? { ...node, ratio: clamp(ratio, .02, .98) } : { ...node, first: setSplitRatio(node.first, id, ratio), second: setSplitRatio(node.second, id, ratio) };
}
function minimum(node: DockNode, axis: "x" | "y"): number {
  if(node.type==="tabs")return Math.max(...node.panels.map(panel=>minimum(leaf(panel),axis)))+(axis==="y"?24:0);
  if (node.type === "panel") return axis === "x" ? node.panel === "meter" ? 72 : node.panel === "timeline" ? 280 : node.panel === "monitor" ? 240 : 160 : node.panel === "meter" ? 130 : 150;
  return node.axis === axis ? minimum(node.first, axis) + minimum(node.second, axis) + GAP : Math.max(minimum(node.first, axis), minimum(node.second, axis));
}
export function layoutRects(tree: DockNode, width: number, height: number) {
  const panels = {} as Record<Panel, Rect>, dividers: Divider[] = [];
  const visit = (n: DockNode, r: Rect) => {
    if (n.type !== "split") { for(const panel of panelsIn(n))panels[panel]=r;return; }
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

export type FloatingPanels=Partial<Record<Panel,Rect>>;
export function constrainFloating(r:Rect,width:number,height:number):Rect{
  const w=Math.max(0,width),h=Math.max(0,height),fw=clamp(r.width,Math.min(180,w),w),fh=clamp(r.height,Math.min(140,h),h);
  return{x:clamp(r.x,0,w-fw),y:clamp(r.y,0,h-fh),width:fw,height:fh};
}
export function normalizeFloating(value:unknown):FloatingPanels{
  if(!value||typeof value!=="object")return{};const out:FloatingPanels={};
  for(const panel of PANELS){const r=(value as FloatingPanels)[panel];if(r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0)out[panel]={x:r.x,y:r.y,width:r.width,height:r.height};}return out;
}
