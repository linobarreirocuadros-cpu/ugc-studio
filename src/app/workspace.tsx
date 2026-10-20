import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";

type Panel = "bin" | "monitor" | "inspector" | "timeline";
type Slot = "left" | "center" | "right" | "bottom";
type Workspace = { slots: Record<Slot, Panel>; left: number; right: number; bottom: number };
const DEFAULT: Workspace = { slots: { left: "bin", center: "monitor", right: "inspector", bottom: "timeline" }, left: 240, right: 260, bottom: 320 };
const KEY = "ugc-studio:workspace";
const DRAG = "application/x-ugc-panel";
const INSET = 10, GAP = 8, TOPBAR_HEIGHT = 56;
const SLOT_LABEL: Record<Slot, string> = { left: "Izquierda", center: "Centro", right: "Derecha", bottom: "Abajo" };
const PANEL_LABEL: Record<Panel, string> = { bin: "Proyecto", monitor: "Monitores", inspector: "Inspector", timeline: "Timeline" };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function load(): Workspace {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!value || ["left", "center", "right", "bottom"].some((slot) => !Object.hasOwn(PANEL_LABEL, value.slots?.[slot])) || new Set(Object.values(value.slots)).size !== 4 || ![value.left, value.right, value.bottom].every(Number.isFinite)) return DEFAULT;
    return { slots: value.slots, left: clamp(value.left, 180, 600), right: clamp(value.right, 180, 600), bottom: clamp(value.bottom, 220, 800) };
  } catch { return DEFAULT; }
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(load);
  const [dragged, setDragged] = useState<Panel | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const appRef = useRef<HTMLDivElement>(null);
  const [contentTop, setContentTop] = useState(INSET + TOPBAR_HEIGHT + GAP * 2);
  useLayoutEffect(() => {
    const app = appRef.current; if (!app) return;
    const panels = [...app.querySelectorAll<HTMLElement>(".dock-panel")];
    const measure = () => {
      const top = Math.min(...panels.map((panel) => panel.getBoundingClientRect().top)) - app.getBoundingClientRect().top;
      if (Number.isFinite(top)) setContentTop(top);
    };
    const observer = new ResizeObserver(measure);
    panels.forEach((panel) => observer.observe(panel)); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(workspace)); } catch { /* almacenamiento deshabilitado */ } }, [workspace]);
  useEffect(() => { const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, []);
  const room = Math.max(360, dimensions.width - 280 - INSET * 2 - GAP * 2);
  const scale = Math.min(1, room / (workspace.left + workspace.right));
  const left = Math.floor(workspace.left * scale), right = Math.floor(workspace.right * scale);
  const maxBottom = Math.max(220, dimensions.height - 280);
  const maxSide = (edge: "left" | "right") => Math.max(180, room - (edge === "left" ? right : left));
  const bottom = Math.min(workspace.bottom, maxBottom);
  const move = (panel: Panel, target: Slot) => setWorkspace((value) => {
    const from = (Object.keys(value.slots) as Slot[]).find((slot) => value.slots[slot] === panel)!;
    return { ...value, slots: { ...value.slots, [target]: panel, [from]: value.slots[target] } };
  });
  const dropProps = (panel: Panel) => ({
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes(DRAG)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } },
    onDrop: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG)) return;
      event.preventDefault(); event.stopPropagation();
      const source = event.dataTransfer.getData(DRAG) as Panel;
      if (Object.hasOwn(PANEL_LABEL, source)) move(source, (Object.keys(workspace.slots) as Slot[]).find((slot) => workspace.slots[slot] === panel)!);
      setDragged(null);
    },
  });
  const handle = (panel: Panel) => <div className="panel-dock-controls" data-no-marquee>
    <span draggable className="panel-grip" title={`Arrastra ${PANEL_LABEL[panel]} sobre otro panel para intercambiar posiciones`} onDragStart={(event) => { event.dataTransfer.setData(DRAG, panel); event.dataTransfer.effectAllowed = "move"; setDragged(panel); }} onDragEnd={() => setDragged(null)} aria-label={`Mover panel ${PANEL_LABEL[panel]}`}>⠿</span>
    <select aria-label={`Posición de ${PANEL_LABEL[panel]}`} title={`Mover ${PANEL_LABEL[panel]}`} value={(Object.keys(workspace.slots) as Slot[]).find((slot) => workspace.slots[slot] === panel)} onChange={(event) => move(panel, event.target.value as Slot)}>{(Object.keys(SLOT_LABEL) as Slot[]).map((slot) => <option key={slot} value={slot}>{SLOT_LABEL[slot]}</option>)}</select>
  </div>;
  const resize = (edge: "left" | "right" | "bottom", clientX: number, clientY: number) => {
    const start = { left, right, bottom };
    const update = (event: MouseEvent) => {
      const value = edge === "bottom" ? start.bottom - (event.clientY - clientY) : start[edge] + (event.clientX - clientX) * (edge === "left" ? 1 : -1);
      setWorkspace((current) => ({ ...current, [edge]: clamp(value, edge === "bottom" ? 220 : 180, edge === "bottom" ? maxBottom : maxSide(edge)) }));
    };
    const end = () => { window.removeEventListener("mousemove", update); window.removeEventListener("mouseup", end); window.removeEventListener("blur", end); document.body.classList.remove("workspace-resizing"); };
    document.body.classList.add("workspace-resizing");
    window.addEventListener("mousemove", update); window.addEventListener("mouseup", end); window.addEventListener("blur", end);
  };
  const splitters = <>{(["left", "right", "bottom"] as const).map((edge) => <div key={edge} className={`workspace-splitter splitter-${edge}`} role="separator" aria-label={edge === "bottom" ? "Altura de panel inferior" : `Ancho de panel ${edge === "left" ? "izquierdo" : "derecho"}`} aria-orientation={edge === "bottom" ? "horizontal" : "vertical"} aria-valuemin={edge === "bottom" ? 220 : 180} aria-valuemax={edge === "bottom" ? maxBottom : maxSide(edge)} aria-valuenow={Math.round(edge === "bottom" ? bottom : edge === "left" ? left : right)} tabIndex={0}
    style={edge === "bottom" ? { bottom: INSET + bottom + (GAP - 6) / 2 } : { [edge]: INSET + (edge === "left" ? left : right) + (GAP - 6) / 2, top: contentTop, bottom: INSET + bottom + GAP }}
    onMouseDown={(event) => { if (event.button === 0) { event.preventDefault(); resize(edge, event.clientX, event.clientY); } }}
    onKeyDown={(event) => { const direction = edge === "bottom" ? (event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0) : event.key === "ArrowRight" ? (edge === "left" ? 1 : -1) : event.key === "ArrowLeft" ? (edge === "left" ? -1 : 1) : 0; if (direction) { event.preventDefault(); event.stopPropagation(); const current = edge === "bottom" ? bottom : edge === "left" ? left : right; setWorkspace((value) => ({ ...value, [edge]: clamp(current + direction * 20, edge === "bottom" ? 220 : 180, edge === "bottom" ? maxBottom : maxSide(edge)) })); } }} />)}</>;
  const style: CSSProperties = { gridTemplateColumns: `${left}px minmax(240px,1fr) ${right}px`, gridTemplateRows: `${TOPBAR_HEIGHT}px auto minmax(0,1fr) ${bottom}px`, gridTemplateAreas: `"top top top" "status status status" "${workspace.slots.left} ${workspace.slots.center} ${workspace.slots.right}" "${workspace.slots.bottom} ${workspace.slots.bottom} ${workspace.slots.bottom}"` };
  return { appRef, style, handle, dropProps, splitters, dragged, reset: () => setWorkspace(DEFAULT) };
}
