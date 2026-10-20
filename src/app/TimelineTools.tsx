import type { ReactNode } from "react";

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

export function TimelineTools({ tool, onTool, snapping, onSnap, onFit, onZoom }: { tool: TimelineTool; onTool: (tool: TimelineTool) => void; snapping: boolean; onSnap: () => void; onFit: () => void; onZoom: (factor: number) => void }) {
  return <nav className="timeline-tools" aria-label="Herramientas básicas">
    {TIMELINE_TOOLS.map((item) => <button key={item.id} aria-label={`${item.label} (${item.key})`} aria-pressed={tool === item.id} title={`${item.label} · ${item.key}`} className={tool === item.id ? "active" : ""} onClick={() => onTool(item.id)}><svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{item.icon}</svg></button>)}
    <span className="tool-divider" />
    <button aria-label="Imán (S)" aria-pressed={snapping} title="Imán · S" className={snapping ? "active" : ""} onClick={onSnap}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 4v10a7 7 0 0 0 14 0V4h-4v10a3 3 0 0 1-6 0V4zM5 8h4m6 0h4"/></svg></button>
    <button aria-label="Alejar timeline" title="Alejar · −" onClick={() => onZoom(0.8)}>−</button><button aria-label="Acercar timeline" title="Acercar · +" onClick={() => onZoom(1.25)}>+</button>
    <button aria-label="Ajustar timeline" title="Ver todo el montaje" onClick={onFit}>↔</button>
  </nav>;
}
