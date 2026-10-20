import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { defaultLayout, dockPanel, GAP, layoutRects, normalizeLayout, PANEL_LABEL, PANELS, setSplitRatio, type Divider, type DockNode, type Edge, type Panel, type Rect } from "./workspaceLayout";

const KEY = "ugc-studio:workspace";
type Target = { panel: Panel | "workspace"; edge: Edge };
const geometry = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });
const EDGE_LABEL = { left: "a la izquierda", right: "a la derecha", top: "arriba", bottom: "abajo", center: "Intercambiar" };
function load() { try { const value = JSON.parse(localStorage.getItem(KEY) ?? "null"); return normalizeLayout(value?.version === 2 ? value.tree : value, window.innerWidth, window.innerHeight); } catch { return defaultLayout(); } }

export function useWorkspace() {
  const [tree, setTree] = useState<DockNode>(load);
  const [maximized, setMaximized] = useState<Panel | null>(null);
  const [dragged, setDragged] = useState<Panel | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [activePanel,setActivePanel]=useState<Panel>("timeline");
  const activatePanel=(target:EventTarget|null)=>{if(!(target instanceof Element))return;const panel=target.closest<HTMLElement>("[data-workspace-panel]")?.dataset.workspacePanel as Panel|undefined;if(panel&&PANELS.includes(panel))setActivePanel(panel);};
  const appRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(el); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ version: 2, tree })); } catch { /* almacenamiento deshabilitado */ } }, [tree]);
  useEffect(() => () => cleanup.current?.(), []);
  const layout = layoutRects(tree, size.width, size.height);
  const toggleMax = (panel: Panel) => setMaximized(value => value === panel ? null : panel);
  const trackPointer = (move: (e: globalThis.PointerEvent) => void, finish: (cancel: boolean) => void) => {
    cleanup.current?.();
    const end = (cancel: boolean) => { stop(); finish(cancel); };
    const up = () => end(false), cancel = () => end(true), key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key, true); document.body.classList.remove("workspace-resizing", "workspace-dragging"); cleanup.current = null; };
    cleanup.current = stop;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", key, true);
  };
  const hitTarget = (x: number, y: number, source: Panel): Target | null => {
    if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
    const edges: [number, Edge][] = [[x, "left"], [size.width - x, "right"], [y, "top"], [size.height - y, "bottom"]];
    const nearest = edges.sort((a, b) => a[0] - b[0])[0];
    if (nearest[0] < 20) return { panel: "workspace", edge: nearest[1] };
    for (const panel of PANELS) {
      const r = layout.panels[panel];
      if (panel === source || x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.height) continue;
      const nx = (x - r.x) / r.width, ny = (y - r.y) / r.height;
      const candidates: [number, Edge][] = [[nx, "left"], [1 - nx, "right"], [ny, "top"], [1 - ny, "bottom"]];
      const side = candidates.sort((a, b) => a[0] - b[0])[0];
      return { panel, edge: side[0] < .27 ? side[1] : "center" };
    }
    return null;
  };
  const startDrag = (panel: Panel, event: PointerEvent) => {
    if (event.button !== 0 || maximized) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = event.clientX, y = event.clientY;
    let active = false, current: Target | null = null;
    trackPointer(e => {
      if (!active && Math.hypot(e.clientX - x, e.clientY - y) < 5) return;
      active = true; setDragged(panel); document.body.classList.add("workspace-dragging");
      const rect = canvasRef.current!.getBoundingClientRect(); current = hitTarget(e.clientX - rect.left, e.clientY - rect.top, panel); setTarget(current);
    }, cancel => { if (!cancel && current) { const destination = current; setTree(t => dockPanel(t, panel, destination.panel, destination.edge)); } setDragged(null); setTarget(null); });
  };
  const startResize = (divider: Divider, event: PointerEvent) => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const coordinate = divider.axis === "x" ? event.clientX : event.clientY;
    const length = (divider.axis === "x" ? divider.area.width : divider.area.height) - GAP;
    if (length <= 0) return;
    const original = tree;
    setResizing(divider.id);
    trackPointer(e => { const delta = (divider.axis === "x" ? e.clientX : e.clientY) - coordinate; setTree(setSplitRatio(original, divider.id, divider.ratio + delta / length)); }, cancel => { if (cancel) setTree(original); setResizing(null); });
    document.body.classList.add("workspace-resizing");
  };
  const panelProps = (panel: Panel) => ({ "data-workspace-panel": panel, "data-active":activePanel===panel?"true":undefined, style: { ...geometry(maximized === panel ? { x: 0, y: 0, ...size } : layout.panels[panel]), display: maximized && maximized !== panel ? "none" : undefined } });
  const handle = (panel: Panel) => <div className="panel-dock-controls" data-no-marquee>
    <button type="button" className="panel-grip" aria-label={`Mover panel ${PANEL_LABEL[panel]}`} title="Arrastra para acoplar; doble clic para ampliar" onPointerDown={e => startDrag(panel, e)} onDoubleClick={() => toggleMax(panel)}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>{[4, 8, 12].flatMap(y => [5, 10].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1"/>))}</svg></button>
    <select aria-label={`Posición de ${PANEL_LABEL[panel]}`} title="Acoplar o intercambiar panel" value="" onChange={e => { const value = e.target.value; if (value === "maximize") toggleMax(panel); else { const [kind, destination] = value.split(":"); setMaximized(null); setTree(t => dockPanel(t, panel, kind === "edge" ? "workspace" : destination as Panel, kind === "edge" ? destination as Edge : "center")); } }}>
      <option value="" disabled>Mover panel…</option>
      {(["left", "right", "top", "bottom"] as const).map(edge => <option key={edge} value={`edge:${edge}`}>Acoplar {EDGE_LABEL[edge]} del área</option>)}
      {PANELS.filter(p => p !== panel).map(p => <option key={p} value={`swap:${p}`}>Intercambiar con {PANEL_LABEL[p]}</option>)}
      <option value="maximize">{maximized === panel ? "Restaurar tamaño" : "Ampliar panel"}</option>
    </select>
    <button type="button" className="panel-maximize" aria-label={`${maximized === panel ? "Restaurar" : "Ampliar"} panel ${PANEL_LABEL[panel]}`} title="Ampliar / restaurar panel" aria-pressed={maximized === panel} onClick={() => toggleMax(panel)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden><rect x="3" y="3" width="10" height="10" rx="1"/>{maximized === panel && <path d="M5 6h5v5"/>}</svg></button>
  </div>;
  const preview = dragged && target ? layoutRects(dockPanel(tree, dragged, target.panel, target.edge), size.width, size.height).panels[dragged] : null;
  const overlays = <>
    {!maximized && layout.dividers.map(d => <div key={d.id} className={`dock-divider ${d.axis} ${resizing === d.id ? "active" : ""}`} style={geometry(d)} role="separator" aria-label={`Redimensionar ${d.first} / ${d.second}`} aria-orientation={d.axis === "x" ? "vertical" : "horizontal"} aria-valuemin={2} aria-valuemax={98} aria-valuenow={Math.round(d.ratio * 100)} tabIndex={0} onPointerDown={e => startResize(d, e)} onKeyDown={e => { const delta = d.axis === "x" ? e.key === "ArrowRight" ? .03 : e.key === "ArrowLeft" ? -.03 : 0 : e.key === "ArrowDown" ? .03 : e.key === "ArrowUp" ? -.03 : 0; if (delta) { e.preventDefault(); e.stopPropagation(); setTree(t => setSplitRatio(t, d.id, d.ratio + delta)); } }}/>) }
    {dragged && <div className="dock-drag-instructions" role="status">Borde: dividir · Centro: intercambiar · Borde exterior: ocupar todo el lado · Esc: cancelar</div>}
    {preview && target && <div className="dock-preview" style={geometry(preview)}><span>{target.edge === "center" ? "Intercambiar" : `Acoplar ${EDGE_LABEL[target.edge]}`} · {PANEL_LABEL[dragged!]}</span></div>}
  </>;
  return { activatePanel, appRef, canvasRef, panelProps, handle, overlays, dragged, toggleMax, showPanel: (panel:Panel) => { if(maximized && maximized!==panel)setMaximized(null); }, style: { gridTemplateColumns: "minmax(0,1fr)", gridTemplateRows: "var(--ui-chrome-height,74px) auto minmax(0,1fr)", gridTemplateAreas: '"top" "status" "workspace"' } as CSSProperties, reset: () => { setTree(defaultLayout()); setMaximized(null); } };
}
