import {useEffect,useRef,useState,type PointerEvent} from "react";
import type {MediaDrag} from "./Timeline";

type Guide={left:number;top:number;width:number;height:number;label:string};
type Options={pxPerFrame:number;session:number;root:()=>HTMLElement|null;onDrop:(payload:MediaDrag,track:string,at:number)=>void;onActivate:(element:HTMLElement)=>void};

/** Arrastre interno con puntero: funciona con mouse/táctil sin depender del drag HTML5. */
export function useMonitorDrag(options:Options){
  const latest=useRef(options);latest.current=options;
  const cleanup=useRef<(()=>void)|null>(null),[guide,setGuide]=useState<Guide|null>(null);
  useEffect(()=>()=>cleanup.current?.(),[]);
  const start=(event:PointerEvent,payload:MediaDrag,onClick?:()=>void)=>{
    if(event.button!==0)return;
    cleanup.current?.();event.preventDefault();event.stopPropagation();
    const node=event.currentTarget as HTMLElement;node.focus({preventScroll:true});node.setPointerCapture(event.pointerId);
    const session=latest.current.session,origin={x:event.clientX,y:event.clientY};let point=origin,moved=false,animation=0;
    const target=()=>{
      const root=latest.current.root(),viewport=root?.querySelector<HTMLElement>(".timeline-scroll"),track=document.elementFromPoint(point.x,point.y)?.closest<HTMLElement>("[data-track-id]");
      if(!viewport||!track||!viewport.contains(track)||track.classList.contains("locked"))return null;
      const kind=track.dataset.trackKind;if(kind!=="video"&&kind!=="audio"||kind==="video"&&(payload.kind==="audio"||payload.mode==="audio")||kind==="audio"&&payload.mode==="video")return null;
      const rect=viewport.getBoundingClientRect();if(point.x<rect.left||point.x>=rect.right||point.y<rect.top||point.y>=rect.bottom)return null;
      return {viewport,track,at:Math.max(0,Math.round((point.x-rect.left+viewport.scrollLeft)/latest.current.pxPerFrame))};
    };
    const update=()=>{
      const hit=target();let next:Guide|null=null;
      if(hit){const viewport=hit.viewport.getBoundingClientRect(),track=hit.track.getBoundingClientRect(),left=viewport.left+hit.at*latest.current.pxPerFrame-hit.viewport.scrollLeft;next={left,top:Math.max(track.top,viewport.top),width:Math.max(2,Math.min((payload.outFrame-payload.inFrame)*latest.current.pxPerFrame,viewport.right-left)),height:Math.min(track.bottom,viewport.bottom)-Math.max(track.top,viewport.top),label:payload.mode==="video"?"Solo video":payload.mode==="audio"?"Solo audio":"Video y audio"};}
      setGuide(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    const stop=()=>{cancelAnimationFrame(animation);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",key,true);if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);document.body.classList.remove("monitor-range-dragging");setGuide(null);cleanup.current=null;};
    const move=(e:globalThis.PointerEvent)=>{point={x:e.clientX,y:e.clientY};if(Math.hypot(point.x-origin.x,point.y-origin.y)>4){moved=true;document.body.classList.add("monitor-range-dragging");update();}};
    const up=(e:globalThis.PointerEvent)=>{point={x:e.clientX,y:e.clientY};const hit=target();stop();if(latest.current.session!==session)return;if(moved){if(hit){latest.current.onActivate(hit.track);latest.current.onDrop(payload,hit.track.dataset.trackId!,hit.at);}}else onClick?.();};
    const cancel=()=>stop();
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();stop();}};
    const scroll=()=>{if(moved){const viewport=latest.current.root()?.querySelector<HTMLElement>(".timeline-scroll");if(viewport){const r=viewport.getBoundingClientRect();if(point.x>=r.left-16&&point.x<=r.right+16&&point.y>=r.top-16&&point.y<=r.bottom+16){const speed=(v:number,low:number,high:number)=>v<low+18?-7:v>high-18?7:0;viewport.scrollLeft+=speed(point.x,r.left,r.right);viewport.scrollTop+=speed(point.y,r.top,r.bottom);update();}}}animation=requestAnimationFrame(scroll);};
    cleanup.current=stop;window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);window.addEventListener("blur",cancel);window.addEventListener("keydown",key,true);animation=requestAnimationFrame(scroll);
  };
  return {start,overlay:guide&&<div className="monitor-range-drop-preview" role="status" style={{left:guide.left,top:guide.top,width:guide.width,height:guide.height}}>{guide.label}</div>};
}
