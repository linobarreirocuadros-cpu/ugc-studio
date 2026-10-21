import type { ReactNode } from "react";
import type { Track } from "../project/types";

const icon = (children: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
export function TrackControls({ track, targeted, onChange, onRecord, recording, recordingBusy }: {
  track: Track; targeted: boolean;
  onChange: (patch: Partial<Pick<Track, "locked" | "hidden" | "muted" | "solo" | "targeted" | "syncLock">>) => void;
  onRecord: () => void; recording: boolean; recordingBusy: boolean;
}) {
  const button = (name: string, active: boolean, action: () => void, content: ReactNode, disabled = false) =>
    <button type="button" title={`${name} · ${track.name}`} aria-label={`${name} · ${track.name}`} aria-pressed={active} className={active ? "active" : ""} disabled={disabled} onClick={action}>{content}</button>;
  return <>
    {button("Bloquear pista", Boolean(track.locked), () => onChange({ locked: !track.locked }), icon(<><rect x="5" y="10" width="14" height="11" rx="2"/><path d={track.locked ? "M8 10V6a4 4 0 0 1 8 0v4" : "M8 10V6a4 4 0 0 1 8 0"}/></>))}
    {<button className={`track-name ${targeted ? "active" : ""}`} aria-label={`Pista destino · ${track.name}`} aria-pressed={targeted} title={`Destino para añadir desde Origen/Proyecto · ${track.name}`} onClick={() => onChange({ targeted: true })}>{track.name}</button>}
    {button("Seguir ripple", Boolean(track.syncLock), () => onChange({ syncLock: !track.syncLock }), icon(<><path d="M4 6h12M4 18h12M8 3v18m6-12 5 3-5 3"/></>))}
    {track.kind === "audio" ? <>
      {button("Silenciar pista", Boolean(track.muted), () => onChange({ muted: !track.muted }), "M")}
      {button("Escuchar solo esta pista", Boolean(track.solo), () => onChange({ solo: !track.solo }), "S")}
      {button(recording ? "Detener grabación" : "Grabar voz", recording, onRecord, icon(recording ? <rect x="6" y="6" width="12" height="12"/> : <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v2a6 6 0 0 0 12 0v-2M12 19v3m-3 0h6"/></>), track.locked || recordingBusy && !recording)}
    </> : button("Ocultar pista", Boolean(track.hidden), () => onChange({ hidden: !track.hidden }), icon(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{track.hidden && <path d="m3 3 18 18"/>}</>))}
  </>;
}
