import { Mascot } from "./Mascot";
import type { ChatActivity } from "./chat/ChatPanel";

export function AssistantLauncher({open,activity,onToggle}:{open:boolean;activity:ChatActivity;onToggle:()=>void}) {
  const state=activity==="recording"?"Grabando voz":activity==="working"?"Trabajando":open?"Ocultar chat":"Abrir chat";
  const label=`${open?"Ocultar chat":"Abrir chat"} del asistente${activity!=="idle"?` · ${state}`:""}`;
  return <div className="assistant-launchbar">
    <button id="assistant-launcher" className="assistant-launcher" aria-label={label} aria-expanded={open} aria-controls="ugc-assistant" onClick={onToggle} title={label}>
      <span className="assistant-orb"><Mascot/>{activity!=="idle"&&<i className={`assistant-status-dot ${activity}`}/>}</span>
      <span className="assistant-launch-label">Asistente{activity!=="idle"&&<small>{state}</small>}</span>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d={open?"m4 6 4 4 4-4":"m4 10 4-4 4 4"}/></svg>
    </button>
  </div>;
}
