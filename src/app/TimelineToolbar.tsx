import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Project, TimelineMarker } from "../project/types";
import { getProjectDuration } from "../project/types";
import { formatTimecode } from "./Timeline";
import { DEFAULT_TIMELINE_PREFERENCES, type TimelinePreferences } from "./timelinePreferences";

const svg = (children: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
export function TimelineToolbar({ project, frame, preferences, onPreferences, onSeek, onMarker, onDeleteMarker, onLink, canLink, canUnlink, onCreateSequence, hasSelection }: {
  project: Project; frame: number; preferences: TimelinePreferences;
  onPreferences: (patch: Partial<TimelinePreferences>) => void; onSeek: (frame: number) => void;
  onMarker: (marker: TimelineMarker) => void; onDeleteMarker: (id: string) => void;
  onLink: (linked: boolean) => void; canLink: boolean; canUnlink: boolean;
  onCreateSequence: (name: string) => void; hasSelection: boolean;
}) {
  const [settings, setSettings] = useState(false);
  const [markersOpen, setMarkersOpen] = useState(false);
  const [draft, setDraft] = useState<TimelineMarker | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [timeError, setTimeError] = useState("");
  const [sequenceName, setSequenceName] = useState("Secuencia 1");
  const toolbar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 300 });
  useLayoutEffect(() => {
    if ((!settings && !markersOpen) || !toolbar.current) return;
    const rect = toolbar.current.getBoundingClientRect();
    if (!rect.width || !rect.height) { setSettings(false); setMarkersOpen(false); return; }
    const below = window.innerHeight - rect.bottom - 12;
    const height = Math.max(100, Math.min(400, below >= 240 ? below : rect.top - 12));
    const next = { left: Math.max(12, Math.min(rect.left + 132, window.innerWidth - Math.min(420, window.innerWidth - 24) - 12)), top: below >= 240 ? rect.bottom : Math.max(12, rect.top - height), maxHeight: height };
    setPosition((current) => current.left === next.left && current.top === next.top && current.maxHeight === next.maxHeight ? current : next);
  });
  const markers = project.markers ?? [];
  const add = () => { const existing = markers.find((m) => m.frame === frame); setDraft(existing ?? { id: crypto.randomUUID(), frame, label: "Marcador", color: "#5ab0ff" }); setMarkersOpen(true); setSettings(false); };
  const jump = () => {
    if (time === null) return;
    const parts = time.trim().split(":").map(Number);
    const [h, m, s, f] = parts;
    if (!/^\d+:\d{2}:\d{2}:\d{2}$/.test(time.trim()) || parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0) || m >= 60 || s >= 60 || f >= project.fps) { setTimeError("Usa HH:MM:SS:FF, con frames válidos."); return; }
    const at = ((h * 60 + m) * 60 + s) * project.fps + f;
    if (at >= getProjectDuration(project)) { setTimeError("Ese tiempo está fuera del montaje."); return; }
    onSeek(at); setTime(null); setTimeError("");
  };
  const toggle = (key: keyof TimelinePreferences, label: string, content: ReactNode) => <button type="button" title={label} aria-label={label} aria-pressed={Boolean(preferences[key])} className={preferences[key] ? "active" : ""} onClick={() => onPreferences({ [key]: !preferences[key] })}>{content}</button>;
  return <div ref={toolbar} className="timeline-toolbar" aria-label="Controles del timeline" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setSettings(false); setMarkersOpen(false); } }}>
    <div className="timeline-time-input"><input aria-label="Ir a tiempo del timeline" title="HH:MM:SS:FF · Enter para ir" value={time ?? formatTimecode(frame, project.fps)} onFocus={() => setTime(formatTimecode(frame, project.fps))} onChange={(e) => setTime(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") jump(); if (e.key === "Escape") { setTime(null); setTimeError(""); e.currentTarget.blur(); } }} onBlur={() => { setTime(null); setTimeError(""); }}/>{timeError && <span role="alert">{timeError}</span>}</div>
    {toggle("nestSequences", "Colocar secuencias anidadas o clips individuales", svg(<><path d="M11 2v20M3 5h5m6 0h7M3 12h5m6 0h7M3 19h5m6 0h7"/><rect x="8" y="4" width="6" height="16"/></>))}
    {toggle("snapping", "Imán (S)", svg(<path d="M5 4v10a7 7 0 0 0 14 0V4h-4v10a3 3 0 0 1-6 0V4zM5 8h4m6 0h4"/>))}
    {toggle("linkedSelection", "Selección enlazada (Shift+L)", svg(<><rect x="3" y="4" width="12" height="6" rx="1"/><rect x="9" y="14" width="12" height="6" rx="1"/><path d="m8 15 8-8m-5 0h5v5"/></>))}
    {toggle("selectionFollowsPlayhead", "Seleccionar bajo el cabezal", svg(<><path d="M12 2v20M3 6h6m6 0h6M3 18h6m6 0h6"/><rect x="8" y="9" width="8" height="6"/></>))}
    <button title="Añadir marcador (M)" aria-label="Añadir marcador (M)" onClick={add}>{svg(<path d="M7 3h10v12l-5 6-5-6z"/>)}</button>
    <button title="Lista de marcadores" aria-label="Lista de marcadores" aria-expanded={markersOpen} onClick={() => { setMarkersOpen(!markersOpen); setDraft(null); setSettings(false); }}>▾</button>
    <button title="Ajustes del timeline" aria-label="Ajustes del timeline" aria-expanded={settings} onClick={() => { setSettings(!settings); setMarkersOpen(false); }}>{svg(<path d="m14 4 3 3 4-1a6 6 0 0 1-7 7L6 21a2 2 0 0 1-3-3l8-8a6 6 0 0 1 7-7l-1 4"/>)}</button>
    <span className="timeline-edit-mode">Sobrescribir</span>
    {settings && createPortal(<section className="timeline-popover" style={position} aria-label="Ajustes del timeline">
      <strong>Visualización</strong>
      {([ ["showNames", "Nombres de clips"], ["showWaveforms", "Ondas de audio"], ["showMarkers", "Marcadores"] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={preferences[key]} onChange={(e) => onPreferences({ [key]: e.target.checked })}/>{label}</label>)}
      <label>Altura de pistas <input aria-label="Altura de pistas" type="range" min="36" max="120" step="4" value={preferences.trackHeight} onChange={(e) => onPreferences({ trackHeight: Number(e.target.value) })}/>{preferences.trackHeight}px</label>
      <button disabled={!canLink} onClick={() => onLink(true)}>Vincular imagen y audio seleccionados</button>
      <button disabled={!canUnlink} onClick={() => onLink(false)}>Desvincular selección</button>
      <label>Nombre de secuencia <input aria-label="Nombre de secuencia" value={sequenceName} maxLength={100} onChange={(e) => setSequenceName(e.target.value)}/></label>
      <button disabled={!hasSelection} onClick={() => { onCreateSequence(sequenceName); setSettings(false); }}>Crear secuencia de la selección</button>
      <button onClick={() => onPreferences(DEFAULT_TIMELINE_PREFERENCES)}>Restablecer ajustes del timeline</button>
      <button onClick={() => setSettings(false)}>Cerrar ajustes</button>
    </section>, document.body)}
    {markersOpen && createPortal(<section className="timeline-popover" style={position} aria-label="Marcadores del timeline">
      {draft ? <form onSubmit={(e) => { e.preventDefault(); onMarker(draft); setDraft(null); }}>
        <label>Nombre del marcador <input aria-label="Nombre del marcador" maxLength={160} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}/></label>
        <label>Color del marcador <input aria-label="Color del marcador" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}/></label>
        <span>{formatTimecode(draft.frame, project.fps)}</span><button type="submit">Guardar marcador</button><button type="button" onClick={() => setDraft(null)}>Cancelar</button>
      </form> : <>
        <strong>Marcadores</strong>
        {!markers.length && <span>Añade uno con M en el cabezal.</span>}
        {markers.map((m) => <div className="marker-row" key={m.id}><button style={{ borderLeft: `3px solid ${m.color}` }} onClick={() => onSeek(m.frame)}>{formatTimecode(m.frame, project.fps)} · {m.label}</button><button aria-label={`Editar marcador ${m.label}`} onClick={() => setDraft(m)}>Editar</button><button aria-label={`Eliminar marcador ${m.label}`} onClick={() => onDeleteMarker(m.id)}>×</button></div>)}
      </>}
      <button onClick={() => setMarkersOpen(false)}>Cerrar marcadores</button>
    </section>, document.body)}
  </div>;
}
