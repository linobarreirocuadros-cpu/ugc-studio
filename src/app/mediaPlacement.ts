import {retimeProject} from "../project/sequenceSettings";
import type {Project,LibraryMedia,Clip} from "../project/types";
import {trackAcceptsClip} from "../project/types";
import * as ops from "../project/ops";
import type {MediaDrag} from "./Timeline";

export type PlacementOptions={media:LibraryMedia[];mediaFps?:number;hostId?:string;nested:boolean};
/** Misma operación pura para la silueta y para soltar; nunca escribe historial aquí. */
export function placeMedia(project:Project,payload:MediaDrag,trackId:string,at:number,options:PlacementOptions):Project{
  const target=project.tracks.find(t=>t.id===trackId);
  if(!target||target.locked||!Number.isSafeInteger(at)||at<0)return project;
  if(target.kind!=="audio"&&(payload.kind==="audio"||payload.mode==="audio"))return project;
  if(target.kind==="audio"&&payload.mode==="video")return project;
  if(payload.timelineRange)return ops.placeTimelineRange(project,retimeProject(payload.timelineRange.project,project.fps),trackId,at,payload.mode,options.hostId);
  let next=project,cursor=at;
  for(const item of payload.items??[payload]){
    if(item.outFrame<=item.inFrame)return project;
    let placed:Project;
    if(item.elementId)placed=ops.placeProjectElement(next,item.elementId,cursor,options.hostId,trackId);
    else if(item.sequenceId)placed=ops.placeSequence(next,item.sequenceId,trackId,cursor,options.nested,options.hostId);
    else{
      const original=options.media.find(m=>m.src===item.src),media=original?{...original,durationInFrames:Math.max(1,Math.round(original.durationInFrames*project.fps/(original.frameBase??options.mediaFps??project.fps)))}:undefined;if(!media||target.kind!=="audio"&&(item.kind==="audio"||item.mode==="audio")||target.kind==="audio"&&item.mode==="video")return project;
      placed=ops.addSourceRange(next,media,trackId,cursor,Math.round(item.inFrame*project.fps/(item.frameBase??project.fps)),Math.round(item.outFrame*project.fps/(item.frameBase??project.fps)),item.mode==="video",item.mode!=="auto"||target.kind==="audio");
    }
    if(placed===next)return project;
    next=placed;cursor+=Math.max(1,Math.round((item.outFrame-item.inFrame)*project.fps/(item.frameBase??project.fps)));
  }
  return next;
}
export function dropDuration(payload:MediaDrag,fps?:number):number{return(payload.items??[payload]).reduce((sum,item)=>sum+Math.max(0,Math.round((item.outFrame-item.inFrame)*(fps??item.frameBase??1)/(item.frameBase??fps??1))),0);}
export type DropShape={trackId:string;clip:Clip};
export function placedMediaIds(before:Project,next:Project,shapes:DropShape[]):string[]{
  const old=new Set(before.tracks.flatMap(t=>t.clips.map(c=>c.id)));
  return next.tracks.flatMap(t=>t.clips.filter(c=>!old.has(c.id)&&shapes.some(s=>s.trackId===t.id&&s.clip.kind===c.kind&&s.clip.from===c.from&&s.clip.durationInFrames===c.durationInFrames)).map(c=>c.id));
}
export function previewMedia(project:Project,payload:MediaDrag,trackId:string,at:number,options:PlacementOptions):DropShape[]{
  if(placeMedia(project,payload,trackId,at,options)===project)return [];
  const empty={...project,tracks:project.tracks.map(t=>({...t,clips:[]}))};
  const placed=placeMedia(empty,payload,trackId,at,options);
  return placed===empty?[]:placed.tracks.flatMap(t=>t.clips.filter(c=>trackAcceptsClip(t,c)).map(clip=>({trackId:t.id,clip})));
}
