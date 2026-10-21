import {useUiDocument} from "./UiDocument";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toolGrid } from "./timelinePanels";
import { useTimelinePanelWidth } from "./useTimelinePanelWidth";

export type TimelineTool = "select" | "track" | "razor" | "ripple" | "slip" | "hand" | "zoom" | "text";
export const TIMELINE_TOOLS: { id: TimelineTool; label: string; key: string; icon: ReactNode }[] = [
  { id: "select", label: "Selección", key: "V", icon: <path d="m5 3 14 10-7 1-4 7z" /> },
  { id: "track", label: "Seleccionar hacia delante", key: "A", icon: <><path d="M3 5h12M3 19h12M3 5v14" strokeDasharray="2 2"/><path d="M8 12h13m-5-5 5 5-5 5"/></> },
  { id: "razor", label: "Cuchilla", key: "C", icon: <><path d="m4 9 5-5 11 11-5 5zM8 8l8 8m-7-5 2-2m2 6 2-2"/></> },
  { id: "ripple", label: "Recorte ripple en esta pista", key: "B", icon: <><path d="M12 3v18M3 12h6l-3-3m3 3-3 3m15-3h-6l3-3m-3 3 3 3"/></> },
  { id: "slip", label: "Deslizar contenido", key: "Y", icon: <><path d="M4 5v14M20 5v14M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3"/></> },
  { id: "hand", label: "Mano", key: "H", icon: <path d="M7 12V6a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-7a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v8c0 4-3 6-6 6-2 0-4-1-5-3l-4-6c-1-2 1-3 2-2l3 3" /> },
  { id: "zoom", label: "Zoom", key: "Z", icon: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></> },
  { id: "text", label: "Texto", key: "T", icon: <path d="M4 5h16M12 5v15m-4 0h8M4 5v3m16-3v3"/> },
];

export function TimelineTools({ tool, onTool, onFit, onZoom, hint }: { tool: TimelineTool; onTool: (tool: TimelineTool) => void; onFit: () => void; onZoom: (factor: number) => void; hint:(id:string)=>string }) {
  const uiDoc=useUiDocument(),uiWindow=uiDoc.defaultView??window;
  const pane = useTimelinePanelWidth<HTMLElement>("tools", "Ancho de herramientas del timeline");
  const grid = toolGrid(pane.size.width, pane.size.height);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 300 });
  const more = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const items = [
    ...TIMELINE_TOOLS.map(item => ({ id: item.id, label: `${item.label} (${hint(`tool.${item.id}`)})`, active: tool === item.id, icon: <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{item.icon}</svg>, action: () => onTool(item.id) })),
    { id: "out", label: "Alejar timeline", active: false, icon: "−", action: () => onZoom(.8) },
    { id: "in", label: "Acercar timeline", active: false, icon: "+", action: () => onZoom(1.25) },
    { id: "fit", label: "Ajustar timeline", active: false, icon: "↔", action: onFit },
  ];
  useLayoutEffect(() => {
    if (!open || !more.current) return;
    const r = more.current.getBoundingClientRect();
    if (!r.width || !r.height) { setOpen(false); return; }
    const height = Math.min(300, Math.max(80, uiWindow.innerHeight - 24));
    const next = { left: Math.max(12, Math.min(r.right + 6, uiWindow.innerWidth - 232)), top: Math.max(12, Math.min(r.top, uiWindow.innerHeight - height - 12)), maxHeight: height };
    setPosition(old => old.left === next.left && old.top === next.top && old.maxHeight === next.maxHeight ? old : next);
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !more.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); more.current?.focus(); } };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => { if (!grid.overflow) setOpen(false); }, [grid.overflow]);
  const hiddenActive = items.slice(grid.visible).some(item => item.active);
  return <>
    <nav ref={pane.ref} className="timeline-tools" aria-label="Herramientas básicas" data-columns={grid.columns} style={{ ...pane.style, "--tool-columns": grid.columns, "--tool-cell": `${grid.cell}px` } as CSSProperties}>
      {items.slice(0, grid.visible).map((item, i) => <Fragment key={item.id}>
        {!grid.overflow && i === 8 && <span className="tool-divider" />}
        <button aria-label={item.label} aria-pressed={i < 8 ? item.active : undefined} title={item.label} className={item.active ? "active" : ""} onClick={item.action}>{item.icon}</button>
      </Fragment>)}
      {grid.overflow && <button ref={more} className={hiddenActive ? "active" : ""} aria-label="Más herramientas del timeline" aria-expanded={open} aria-haspopup="menu" title="Más herramientas" onClick={() => setOpen(value => !value)}>•••</button>}
    </nav>
    {pane.separator}
    {open && createPortal(<div ref={menu} className="timeline-tool-menu" style={position} role="menu" aria-label="Más herramientas del timeline" onKeyDown={e => { const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")], i = buttons.indexOf(uiDoc.activeElement as HTMLButtonElement); const index = e.key === "ArrowDown" ? (i + 1) % buttons.length : e.key === "ArrowUp" ? (i - 1 + buttons.length) % buttons.length : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -1; if (index >= 0) { e.preventDefault(); e.stopPropagation(); buttons[index]?.focus(); } }}>{items.slice(grid.visible).map(item => <button role="menuitem" key={item.id} className={item.active ? "active" : ""} onClick={() => { item.action(); setOpen(false); more.current?.focus(); }}>{item.icon}<span>{item.label}</span></button>)}</div>, uiDoc.body)}
  </>;
}
