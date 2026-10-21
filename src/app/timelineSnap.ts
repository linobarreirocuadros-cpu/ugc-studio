import type {Project} from "../project/types";

export type SnapHit={frame:number;point:number|null;edge:"start"|"end"};
/** Umbrales en píxeles: entrar suavemente y soltar al seguir arrastrando. */
export function snapTimeline(project:Project,raw:number,pxPerFrame:number,enabled:boolean,options:{duration?:number;playhead?:number;previous?:SnapHit|null;maximum?:number}={}):SnapHit{
  const limit=options.maximum??Number.MAX_SAFE_INTEGER;
  const clamp=(f:number)=>Math.max(0,Math.min(limit,Math.round(f)));
  const plain:SnapHit={frame:clamp(raw),point:null,edge:"start"};
  if(!enabled||!Number.isFinite(raw)||pxPerFrame<=0)return plain;
  const points=[...new Set([0,...project.tracks.flatMap(t=>t.clips.flatMap(c=>[c.from,c.from+c.durationInFrames])),...(project.markers??[]).map(m=>m.frame),...(options.playhead===undefined?[]:[options.playhead])])].map(p=>Math.min(p,limit+(options.duration??0)));
  const edges=options.duration?[{offset:0,edge:"start" as const},{offset:options.duration,edge:"end" as const}]:[{offset:0,edge:"start" as const}];
  const previous=options.previous;
  if(previous?.point!==null&&previous?.point!==undefined&&points.includes(previous.point)){
    const offset=previous.edge==="end"?(options.duration??0):0;
    if(Math.abs(raw+offset-previous.point)*pxPerFrame<=13&&previous.point-offset>=0&&previous.point-offset<=limit)return{frame:previous.point-offset,point:previous.point,edge:previous.edge};
  }
  let best=8;
  for(const p of points)for(const e of edges){const at=p-e.offset,distance=Math.abs(raw-at)*pxPerFrame;if(at>=0&&at<=limit&&distance<=best){best=distance;plain.frame=at;plain.point=p;plain.edge=e.edge;}}
  return plain;
}
