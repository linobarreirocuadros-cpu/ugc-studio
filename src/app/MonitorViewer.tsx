import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type DragEvent, type PointerEvent } from "react";
import { formatTimecode } from "./Timeline";
import type { PreviewQuality } from "./usePreviewQuality";
import type { MonitorDragMode } from "./monitorRange";

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const zooms=[.1,.25,.5,.75,1,1.5,2,4,8,16];
export type MonitorAction={id:string;label:string;icon:ReactNode;active?:boolean};
export const monitorIcon=(path:ReactNode)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>{path}</svg>;
export const transportActions:MonitorAction[]=[
  {id:"goIn",label:"Ir a entrada",icon:monitorIcon(<path d="M6 4v16m12-15-9 7 9 7"/>)},
  {id:"stepLeft1",label:"Retroceder un frame",icon:monitorIcon(<path d="M6 4v16m12-15-9 7 9 7z"/>)},
  {id:"play",label:"Reproducir / pausar",icon:monitorIcon(<path d="m7 4 13 8-13 8z"/>)},
  {id:"stepRight1",label:"Avanzar un frame",icon:monitorIcon(<path d="M18 4v16M6 5l9 7-9 7z"/>)},
  {id:"goOut",label:"Ir a salida",icon:monitorIcon(<path d="M18 4v16M6 5l9 7-9 7"/>)},
  {id:"markIn",label:"Marcar entrada",icon:"{"},{id:"markOut",label:"Marcar salida",icon:"}"},
  {id:"clearMarks",label:"Limpiar entrada y salida",icon:"×"},
];

/** Visor y transporte independientes del tamaño/resolución del montaje. */
export function MonitorViewer({name,width,height,frame,duration,fps,playing,quality,onQuality,pending,error,onSeek,onCommand,actions=transportActions,hint,marks,markers=[],onRangeDrag,onRangePlace,onRangePointerDown,rangeKinds={video:true,audio:true},children}: {
  name:string;width:number;height:number;frame:number;duration:number;fps:number;playing:boolean;
  quality:PreviewQuality;onQuality:(q:PreviewQuality)=>void;pending?:boolean;error?:string;
  onSeek:(f:number)=>void;onCommand:(id:string)=>void;actions?:MonitorAction[];hint:(id:string)=>string;
  marks?:{start:number|null;end:number|null};markers?:{id:string;frame:number;label:string;color:string}[];
  onRangeDrag?:(e:DragEvent,mode:MonitorDragMode)=>void;onRangePlace?:(mode:MonitorDragMode)=>void;rangeKinds?:{video:boolean;audio:boolean};
  onRangePointerDown?:(e:PointerEvent,mode:MonitorDragMode,clickToPlace?:boolean)=>void;
  children:(style:CSSProperties)=>ReactNode;
}) {
  const root=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({w:1,h:1}),[zoom,setZoom]=useState<number|"fit">("fit"),[pan,setPan]=useState({x:0,y:0}),[hand,setHand]=useState(false);
  const [time,setTime]=useState<string|null>(null),[timeError,setTimeError]=useState("");
  const [safe,setSafe]=useState(false),[fullscreen,setFullscreen]=useState(false),[viewError,setViewError]=useState("");
  useEffect(()=>{const changed=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener("fullscreenchange",changed);return()=>document.removeEventListener("fullscreenchange",changed);},[]);
  const toggleFullscreen=async()=>{try{setViewError("");if(document.fullscreenElement===root.current)await document.exitFullscreen();else await root.current?.requestFullscreen();}catch{setViewError("El navegador no permitió la pantalla completa.");}};
  const [windowRange,setWindowRange]=useState({start:0,end:1});
  const fit=Math.min(size.w/width,size.h/height),scale=zoom==="fit"?fit:zoom;
  const bound=(p:{x:number;y:number},s=scale)=>({x:clamp(p.x,-Math.max(0,(width*s-size.w)/2),Math.max(0,(width*s-size.w)/2)),y:clamp(p.y,-Math.max(0,(height*s-size.h)/2),Math.max(0,(height*s-size.h)/2))});
  const latest=useRef({scale,pan,size,fit});latest.current={scale,pan,size,fit};
  useLayoutEffect(()=>{const node=stage.current;if(!node)return;const ro=new ResizeObserver(()=>setSize({w:Math.max(1,node.clientWidth),h:Math.max(1,node.clientHeight)}));ro.observe(node);return()=>ro.disconnect();},[]);
  useEffect(()=>{setPan(p=>bound(p));},[size.w,size.h,width,height,zoom]);
  useEffect(()=>{
    const node=stage.current;if(!node)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const l=latest.current,r=node.getBoundingClientRect(),factor=Math.exp(-clamp(e.deltaY*(e.deltaMode===1?16:1),-150,150)*(e.shiftKey ? .012 : .004)),next=clamp(l.scale*factor,.01,16),ratio=next/l.scale;
      const x=e.clientX-r.left-l.size.w/2,y=e.clientY-r.top-l.size.h/2;
      const maxX=Math.max(0,(width*next-l.size.w)/2),maxY=Math.max(0,(height*next-l.size.h)/2);
      setZoom(next);setPan({x:clamp(x-(x-l.pan.x)*ratio,-maxX,maxX),y:clamp(y-(y-l.pan.y)*ratio,-maxY,maxY)});
    };node.addEventListener("wheel",wheel,{passive:false});return()=>node.removeEventListener("wheel",wheel);
  },[width,height]);
  const [lo,hi]=[Math.floor(windowRange.start*(duration-1)),Math.max(1,Math.ceil(windowRange.end*(duration-1)))];
  const range=Math.max(1,hi-lo),pct=(f:number)=>(f-lo)/range*100;
  const setAt=(clientX:number,node:HTMLElement)=>{const r=node.getBoundingClientRect();onSeek(Math.round(lo+clamp((clientX-r.left)/r.width,0,1)*range));};
  const jump=()=>{if(time===null)return false;const parts=time.split(":").map(Number);if(!/^\d+:\d{2}:\d{2}:\d{2}$/.test(time)||parts[1]>59||parts[2]>59||parts[3]>=fps){setTimeError("Usa HH:MM:SS:FF.");return false;}const at=((parts[0]*60+parts[1])*60+parts[2])*fps+parts[3];if(at>=duration){setTimeError("Ese tiempo está fuera del video.");return false;}onSeek(at);setTime(null);setTimeError("");return true;};
  return <div className="monitor-viewer" ref={root}>
    <div className={`monitor-stage ${hand?"pan-tool":""} ${onRangeDrag&&!hand?"range-draggable":""}`} ref={stage} aria-label={`Imagen de ${name}`} title="Arrastrar: colocar rango en timeline · Rueda: zoom · Botón central o Mano: desplazar · Doble clic: ajustar" draggable={Boolean(onRangeDrag&&!onRangePointerDown&&!hand)} onDragStart={e=>{if(onRangeDrag&&!hand)onRangeDrag(e,rangeKinds.video?"auto":"audio");else e.preventDefault();}}
      onDoubleClick={()=>{setZoom("fit");setPan({x:0,y:0});}}
      onPointerDown={e=>{if(e.button!==1&&!(hand&&e.button===0)){if(e.button===0)onRangePointerDown?.(e,rangeKinds.video?"auto":"audio");return;}e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.panX=String(e.clientX-pan.x);e.currentTarget.dataset.panY=String(e.clientY-pan.y);}}
      onPointerMove={e=>{if((e.buttons===4||hand)&&e.currentTarget.hasPointerCapture(e.pointerId))setPan(bound({x:e.clientX-Number(e.currentTarget.dataset.panX),y:e.clientY-Number(e.currentTarget.dataset.panY)}));}}
      onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>
      <div className="monitor-image" style={{position:"absolute",left:"50%",top:"50%",width:width*scale,height:height*scale,transform:`translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px))`,pointerEvents:"none"}}>{children({width:"100%",height:"100%",maxWidth:"none",maxHeight:"none"})}</div>
      {safe&&<div className="monitor-safe-guides" aria-hidden style={{width:width*scale,height:height*scale,transform:`translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px))`}}><i/><i/></div>}
    </div>
    <div className="monitor-controls">
      <div className="monitor-readouts">
        <input aria-label={`Ir a tiempo de ${name}`} title="HH:MM:SS:FF · Enter para ir" value={time??formatTimecode(frame,fps)} onFocus={()=>setTime(formatTimecode(frame,fps))} onChange={e=>setTime(e.target.value)} onBlur={()=>{setTime(null);setTimeError("");}} onKeyDown={e=>{if(e.key==="Enter"&&jump())e.currentTarget.blur();if(e.key==="Escape")e.currentTarget.blur();}}/>
        <select aria-label={`Zoom de ${name}`} value={zoom} onChange={e=>{setZoom(e.target.value==="fit"?"fit":Number(e.target.value));setPan({x:0,y:0});}}>
          <option value="fit">Ajustar</option>{zoom!=="fit"&&!zooms.includes(zoom)&&<option value={zoom}>{Math.round(zoom*100)}%</option>}{zooms.map(z=><option key={z} value={z}>{z*100}%</option>)}
        </select>
        {onRangeDrag&&<div className="monitor-range-drags" role="group" aria-label={`Colocar rango de ${name}`}>
          {(["video","audio","auto"] as const).map(mode=>{const label=mode==="auto"?"video y audio":mode==="video"?"solo video":"solo audio";return <button key={mode} type="button" draggable={!onRangePointerDown} onPointerDown={e=>onRangePointerDown?.(e,mode,true)} disabled={mode==="video"?!rangeKinds.video:mode==="audio"?!rangeKinds.audio:!rangeKinds.video||!rangeKinds.audio} aria-label={`Arrastrar ${label} de ${name}`} title={`Arrastra ${label} del rango marcado al timeline · Clic: colocar en el cabezal`} onDragStart={e=>onRangeDrag(e,mode)} onClick={e=>{if(!onRangePointerDown||e.detail===0)onRangePlace?.(mode);}}>{mode==="video"?monitorIcon(<><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 4v16M17 4v16M3 8h4m-4 8h4m10-8h4m-4 8h4"/></>):mode==="audio"?monitorIcon(<path d="M3 12h2m3-5v10m4-14v18m4-15v12m3-6h2"/>):monitorIcon(<><rect x="2" y="3" width="14" height="10" rx="1"/><path d="M6 3v10M2 7h4m-4 3h4m3 8h2m3-4v8m4-6v4m3-3v2"/></>)}</button>;})}
        </div>}
        <select aria-label={`Resolución de ${name}`} title="Resolución de vista previa. No cambia la exportación." value={quality} onChange={e=>onQuality(Number(e.target.value) as PreviewQuality)}>{[1,2,4,8,16].map(q=><option key={q} value={q}>{q===1?"Full":`1/${q}`}</option>)}</select>
        <span className="monitor-duration" title="Duración total">{formatTimecode(duration,fps)}</span>
      </div>
      {(pending||error||timeError||viewError)&&<div className="monitor-status" role="status">{timeError||viewError||error&&`No se pudo preparar esa calidad: ${error}. Se usa Full.`||"Preparando vista local… Full mientras termina."}</div>}
      {marks&&(marks.start!==null||marks.end!==null)&&<div className="monitor-range-info" role="status" aria-label={`Rango de ${name}`}><span>Entrada {marks.start===null?"—":formatTimecode(marks.start,fps)}</span><span>Salida {marks.end===null?"—":formatTimecode(marks.end-1,fps)}</span></div>}
      <div className="monitor-ruler" role="slider" tabIndex={0} aria-label={`Cabezal de ${name}`} aria-valuemin={0} aria-valuemax={duration-1} aria-valuenow={frame} aria-valuetext={formatTimecode(frame,fps)}
        onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();onSeek(frame+(e.key==="ArrowLeft"?-1:1));}}}
        onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);setAt(e.clientX,e.currentTarget);}}
        onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))setAt(e.clientX,e.currentTarget);}}
        onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>
        {marks&&(marks.start!==null||marks.end!==null)&&<div className={`monitor-range ${onRangeDrag?"range-draggable":""}`} aria-label={`Arrastrar rango marcado de ${name}`} title="Arrastra el rango marcado al timeline" draggable={Boolean(onRangeDrag&&!onRangePointerDown)} onPointerDown={e=>{e.stopPropagation();onRangePointerDown?.(e,rangeKinds.video?"auto":"audio");}} onMouseDown={e=>e.stopPropagation()} onDragStart={e=>{e.stopPropagation();onRangeDrag?.(e,rangeKinds.video?"auto":"audio");}} style={{left:`${clamp(pct(marks.start??0),0,100)}%`,right:`${100-clamp(pct((marks.end??duration)-1),0,100)}%`}}/>}
        {[0,.25,.5,.75,1].map(v=><span key={v} className="monitor-tick" style={{left:`${v*100}%`}}>{formatTimecode(Math.round(lo+range*v),fps)}</span>)}
        {markers.filter(m=>m.frame>=lo&&m.frame<=hi).map(m=><button key={m.id} aria-label={`Ir a marcador ${m.label}`} title={m.label} className="monitor-marker" style={{left:`${pct(m.frame)}%`,color:m.color}} onPointerDown={e=>e.stopPropagation()} onClick={()=>onSeek(m.frame)}>◆</button>)}
        {frame>=lo&&frame<=hi&&<i className="monitor-playhead" style={{left:`${pct(frame)}%`}}/>}
      </div>
      <div className="monitor-navigator" title="Acota la zona de tiempo visible en el monitor">
        <span className="monitor-navigation-track"><span style={{left:`${windowRange.start*100}%`,right:`${(1-windowRange.end)*100}%`}}/></span>
        <input type="range" aria-label={`Inicio de regla de ${name}`} min={0} max={1000} value={windowRange.start*1000} onChange={e=>setWindowRange(r=>({...r,start:Math.min(Number(e.target.value)/1000,r.end-.01)}))}/>
        <input type="range" aria-label={`Final de regla de ${name}`} min={0} max={1000} value={windowRange.end*1000} onChange={e=>setWindowRange(r=>({...r,end:Math.max(Number(e.target.value)/1000,r.start+.01)}))}/>
        <button title="Ver toda la duración en la regla" aria-label={`Restablecer regla de ${name}`} onClick={()=>setWindowRange({start:0,end:1})}>↔</button>
      </div>
      <div className="monitor-transport">
        {actions.map(a=>{const active=a.id==="play"?playing:a.id==="markIn"?marks?.start!==null&&marks?.start!==undefined:a.id==="markOut"?marks?.end!==null&&marks?.end!==undefined:a.active;return <button key={a.id} aria-label={`${a.label} en ${name}`} aria-pressed={active} disabled={a.id==="clearMarks"&&marks?.start===null&&marks.end===null} title={`${a.label}${hint(a.id)?` · ${hint(a.id)}`:""}${active?" · Activo":""}`} onClick={()=>onCommand(a.id)}>{a.id==="play"&&playing?monitorIcon(<path d="M8 4v16m8-16v16"/>):a.icon}</button>;})}
        <button aria-label={`Márgenes seguros de ${name}`} title="Márgenes de acción (90%) y títulos (80%). Solo vista previa." aria-pressed={safe} onClick={()=>setSafe(v=>!v)}>{monitorIcon(<><rect x="3" y="4" width="18" height="16"/><rect x="7" y="7" width="10" height="10"/></>)}</button>
        <button aria-label={`Mano en ${name}`} title="Desplazar imagen ampliada" aria-pressed={hand} onClick={()=>setHand(v=>!v)}>{monitorIcon(<path d="M7 12V6l3-1v7-9h3v9-8h3v9-5h3v9l-4 4H9l-6-8 2-2 4 4"/>)}</button>
        <button aria-label={`Pantalla completa de ${name}`} title="Pantalla completa" aria-pressed={fullscreen} onClick={()=>void toggleFullscreen()}>{monitorIcon(<path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6"/>)}</button>
      </div>
    </div>
  </div>;
}
