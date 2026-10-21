import {useEffect,useRef,useState,type PointerEvent} from "react";
import type {Project} from "../project/types";
import type {MediaDrag} from "./Timeline";
import {snapTimeline,type SnapHit} from "./timelineSnap";
import {bypassSnap,type GesturePreferences} from "./gesturePreferences";
import {dropDuration} from "./mediaPlacement";

export type MediaHover={payload:MediaDrag;trackId:string;at:number;snap:SnapHit};
type Options={gestures:GesturePreferences;project:Project;snapping:boolean;playhead:number;pxPerFrame:number;session:number;root:()=>HTMLElement|null;onDrop:(payload:MediaDrag,track:string,at:number)=>void;onActivate:(element:HTMLElement)=>void};
/** Proyecto y monitores comparten hover/colocación. El proyecto solo cambia al soltar. */
export function useMonitorDrag(options:Options){
  const latest=useRef(options);latest.current=options;
  const wheelHandler=useRef<((event:WheelEvent,x:number)=>void)|null>(null);
  const cleanup=useRef<(()=>void)|null>(null),hoverRef=useRef<MediaHover|null>(null);
  const [active,setActive]=useState<MediaDrag|null>(null),[hover,setHover]=useState<MediaHover|null>(null);
  const clearHover=()=>{hoverRef.current=null;setHover(null);};
  const cancel=()=>{cleanup.current?.();setActive(null);clearHover();};
  useEffect(()=>cancel(),[options.session]);
  useEffect(()=>()=>cleanup.current?.(),[]);
  const resolve=(payload:MediaDrag,trackId:string,raw:number,bypass=false)=>{const o=latest.current;return snapTimeline(o.project,raw,o.pxPerFrame,o.snapping&&!bypass,{duration:dropDuration(payload),playhead:o.playhead,previous:hoverRef.current?.trackId===trackId?hoverRef.current.snap:null});};
  const update=(payload:MediaDrag,trackId:string,raw:number,bypass=false)=>{const snap=resolve(payload,trackId,raw,bypass),next={payload,trackId,at:snap.frame,snap};const old=hoverRef.current;hoverRef.current=next;if(!old||old.payload!==payload||old.trackId!==trackId||old.at!==next.at||old.snap.point!==snap.point)setHover(next);return next;};
  const beginNative=(payload:MediaDrag)=>{cleanup.current?.();clearHover();setActive(payload);};
  const dropNative=(payload:MediaDrag,track:string,raw:number,bypass=false)=>{const hit=resolve(payload,track,raw,bypass);cancel();const target=[...latest.current.root()?.querySelectorAll<HTMLElement>("[data-track-id]")??[]].find(e=>e.dataset.trackId===track);if(target)latest.current.onActivate(target);latest.current.onDrop(payload,track,hit.frame);};
  const start=(event:PointerEvent,payload:MediaDrag,onClick?:(()=>void),onOutsideDrop?:((x:number,y:number)=>void),onMoved?:()=>void)=>{
    if(event.button!==0)return;
    cleanup.current?.();event.preventDefault();event.stopPropagation();setActive(payload);
    const node=event.currentTarget as HTMLElement,doc=node.ownerDocument,win=doc.defaultView??window;
    node.focus({preventScroll:true});node.setPointerCapture(event.pointerId);
    const session=latest.current.session,origin={x:event.clientX,y:event.clientY};let point=origin,moved=false,animation=0,bypass=bypassSnap(event,latest.current.gestures);
    const target=()=>{
      const viewport=latest.current.root()?.querySelector<HTMLElement>(".timeline-scroll");if(!viewport||viewport.ownerDocument!==doc)return null;
      const r=viewport.getBoundingClientRect();if(point.x<r.left||point.x>=r.right||point.y<r.top||point.y>=r.bottom)return null;
      // Capturar el puntero cambia event.target; la geometría real de pistas sigue siendo válida.
      const track=[...viewport.querySelectorAll<HTMLElement>("[data-track-id]")].find(t=>{const b=t.getBoundingClientRect();return point.y>=b.top&&point.y<b.bottom;});
      if(!track||track.classList.contains("locked"))return null;
      return{viewport,track,raw:Math.max(0,(point.x-r.left+viewport.scrollLeft)/latest.current.pxPerFrame)};
    };
    const preview=()=>{const hit=target();if(hit)update(payload,hit.track.dataset.trackId!,hit.raw,bypass);else clearHover();};
    const stop=()=>{win.cancelAnimationFrame(animation);win.removeEventListener("pointermove",move,true);win.removeEventListener("pointerup",up,true);win.removeEventListener("pointercancel",abort,true);win.removeEventListener("blur",abort);win.removeEventListener("keydown",key,true);win.removeEventListener("wheel",wheel,true);if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);doc.body.classList.remove("monitor-range-dragging");setActive(null);clearHover();cleanup.current=null;};
    const move=(e:globalThis.PointerEvent)=>{point={x:e.clientX,y:e.clientY};bypass=bypassSnap(e,latest.current.gestures);if(Math.hypot(point.x-origin.x,point.y-origin.y)>4){moved=true;doc.body.classList.add("monitor-range-dragging");preview();}};
    const up=(e:globalThis.PointerEvent)=>{point={x:e.clientX,y:e.clientY};const hit=target(),snap=hit?resolve(payload,hit.track.dataset.trackId!,hit.raw,bypassSnap(e,latest.current.gestures)):null;stop();if(latest.current.session!==session)return;if(moved){onMoved?.();if(hit&&snap){latest.current.onActivate(hit.track);latest.current.onDrop(payload,hit.track.dataset.trackId!,snap.frame);}else onOutsideDrop?.(point.x,point.y);}else onClick?.();};
    const abort=()=>stop();
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();stop();}};
    const wheel=(e:WheelEvent)=>{if(!moved||!target())return;e.preventDefault();e.stopPropagation();wheelHandler.current?.(e,point.x);};
    const scroll=()=>{if(moved){const hit=target();if(hit){const r=hit.viewport.getBoundingClientRect(),speed=(v:number,a:number,b:number)=>v<a+20?-8:v>b-20?8:0;hit.viewport.scrollLeft+=speed(point.x,r.left,r.right);hit.viewport.scrollTop+=speed(point.y,r.top,r.bottom);preview();}}animation=win.requestAnimationFrame(scroll);};
    cleanup.current=stop;win.addEventListener("pointermove",move,true);win.addEventListener("pointerup",up,true);win.addEventListener("pointercancel",abort,true);win.addEventListener("blur",abort);win.addEventListener("keydown",key,true);win.addEventListener("wheel",wheel,{capture:true,passive:false});animation=win.requestAnimationFrame(scroll);
  };
  return{wheelHandler,start,active,hover,update,clearHover,beginNative,dropNative,cancel};
}
