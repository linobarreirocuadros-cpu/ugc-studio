import type {RefObject, PointerEvent as ReactPointerEvent} from "react";
import type {Project} from "../project/types";
import {snapTimeline, type SnapHit} from "./timelineSnap";

/** Dos bordes temporales (salida exclusiva), incluso al dibujar hacia la izquierda. */
export function addRangeBounds(anchor:number, edge:number){
  const start=Math.max(0,Math.round(Math.min(anchor,edge)));
  return {start,end:Math.max(start+1,Math.round(Math.max(anchor,edge)))};
}

export type AddRange={trackId:string;start:number;end:number;snap:number|null};
export type AddRangeOptions={
  project:Project;scale:number;snapping:boolean;bypass:(e:MouseEvent)=>boolean;
  viewport:RefObject<HTMLDivElement|null>;
  onAdd:(start:number,duration:number,trackId:string)=>void;
  onMenu:(x:number,y:number,at:number,trackId:string)=>void;
};
export type AddRangePointer=Pick<ReactPointerEvent<HTMLDivElement>,"button"|"target"|"currentTarget"|"clientX"|"clientY"|"pointerId"|"nativeEvent">;
/** Controlador de gesto; solo comunica geometría hasta elegir en Añadir. */
export function createAddRangeGesture(read:()=>AddRangeOptions,setRange:(range:AddRange|null)=>void){
  const cleanup:{current:(()=>void)|null}={current:null},suppress={current:false};
  const latest={get current(){return read();}};
  const onPointerDown=(e:AddRangePointer)=>{
    const {project,scale,snapping,bypass,viewport}=read();
    if(e.button!==2)return;
    // Una nueva pulsación siempre recupera el menú normal, incluso después de cancelar.
    suppress.current=false;
    const target=e.target as Element,trackNode=target.closest<HTMLElement>(".track[data-track-id]"),trackId=trackNode?.dataset.trackId;
    if(!trackId||target.closest(".clip,button,input,select,textarea,[role=separator]"))return;
    const track=project.tracks.find(t=>t.id===trackId),scroll=target.closest<HTMLDivElement>(".timeline-scroll")??viewport.current;
    if(!track||track.locked||!scroll)return;
    const rect=scroll.getBoundingClientRect();
    if(e.clientX<rect.left||e.clientX>rect.left+scroll.clientWidth||e.clientY<rect.top||e.clientY>rect.top+scroll.clientHeight)return;
    const raw=(e.clientX-rect.left+scroll.scrollLeft)/scale;
    if(track.clips.some(c=>c.from<=raw&&c.from+c.durationInFrames>raw))return;
    cleanup.current?.();
    const root=e.currentTarget,doc=root.ownerDocument,win=doc.defaultView!;
    const startX=e.clientX,pointerId=e.pointerId;
    const anchor=snapTimeline(project,raw,scale,snapping&&!bypass(e.nativeEvent)).frame;
    let stopped=false,moved=false,lastX=startX,lastY=e.clientY,edge=anchor,hit:SnapHit|null=null,drawn:AddRange|null=null,raf=0;
    const update=(ev?:MouseEvent)=>{
      if(!moved)return;
      const current=latest.current,box=scroll.getBoundingClientRect();
      const x=Math.max(box.left,Math.min(box.left+scroll.clientWidth,lastX));
      hit=snapTimeline(current.project,(x-box.left+scroll.scrollLeft)/current.scale,current.scale,current.snapping&&!(ev?current.bypass(ev):false),{previous:hit});
      edge=hit.frame;
      const next={trackId,...addRangeBounds(anchor,edge),snap:hit.point};
      if(!drawn||next.start!==drawn.start||next.end!==drawn.end||next.snap!==drawn.snap){drawn=next;setRange(next);}
    };
    let lastEvent:MouseEvent=e.nativeEvent;
    const tick=()=>{
      if(moved){
        const box=scroll.getBoundingClientRect();
        const speed=lastX<box.left+24?-Math.min(18,(box.left+24-lastX)/2)
          :lastX>box.left+scroll.clientWidth-24?Math.min(18,(lastX-box.left-scroll.clientWidth+24)/2):0;
        if(speed)scroll.scrollLeft+=speed;
        update(lastEvent);
      }
      raf=win.requestAnimationFrame(tick);
    };
    const stop=()=>{
      if(stopped)return;
      stopped=true;
      win.cancelAnimationFrame(raf);
      win.removeEventListener("pointermove",move,{capture:true});
      win.removeEventListener("pointerup",up,{capture:true});
      win.removeEventListener("pointercancel",cancel,{capture:true});
      win.removeEventListener("keydown",key,{capture:true});
      win.removeEventListener("blur",cancel);
      doc.removeEventListener("contextmenu",context,{capture:true});
      root.removeEventListener("lostpointercapture",cancel);
      if(root.hasPointerCapture(pointerId))root.releasePointerCapture(pointerId);
      setRange(null);
      cleanup.current=null;
    };
    const cancel=()=>{suppress.current=true;stop();};
    const context=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}};
    const move=(event:PointerEvent)=>{
      if(stopped||event.pointerId!==pointerId)return;
      if(!(event.buttons&2)){cancel();return;}
      lastX=event.clientX;lastY=event.clientY;lastEvent=event;
      if(Math.abs(lastX-startX)>=5)moved=true;
      if(moved){suppress.current=true;event.preventDefault();update(event);}
    };
    const up=(event:PointerEvent)=>{
      if(stopped||event.pointerId!==pointerId||event.button!==2)return;
      const box=scroll.getBoundingClientRect(),inside=event.clientX>=box.left&&event.clientX<=box.left+scroll.clientWidth&&event.clientY>=box.top&&event.clientY<=box.top+scroll.clientHeight;
      lastX=event.clientX;lastY=event.clientY;update(event);
      const bounds=addRangeBounds(anchor,edge);suppress.current=true;stop();
      if(moved&&inside&&latest.current.project.tracks.some(t=>t.id===trackId&&!t.locked))latest.current.onAdd(bounds.start,bounds.end-bounds.start,trackId);
      else if(!moved&&inside){ // Abrir nosotros conserva el clic derecho en plataformas que disparan contextmenu al pulsar.
        latest.current.onMenu(lastX,lastY,Math.max(0,Math.round(raw)),trackId);
      }
    };
    root.setPointerCapture(pointerId);
    root.addEventListener("lostpointercapture",cancel);
    cleanup.current=stop;
    doc.addEventListener("contextmenu",context,{capture:true});
    win.addEventListener("pointermove",move,{capture:true});
    win.addEventListener("pointerup",up,{capture:true});
    win.addEventListener("pointercancel",cancel,{capture:true});
    win.addEventListener("keydown",key,{capture:true});
    win.addEventListener("blur",cancel);
    raf=win.requestAnimationFrame(tick);
  };
  return {onPointerDown,suppressContextMenu:()=>suppress.current,destroy:()=>cleanup.current?.()};
}
