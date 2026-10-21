import type { Project, ProjectLibrary, Clip } from "./types";

export const emptyLibrary = (): ProjectLibrary => ({media:[],folders:[],elements:[],sequenceMeta:{}});
export const projectLibrary = (p:Project) => p.library ?? emptyLibrary();
export type ProjectItem = {key:string;kind:"video"|"audio"|"sequence"|"folder"|"element";name:string;folderId?:string;labelColor?:string;notes?:string;src?:string;durationInFrames?:number};
export function projectItems(p:Project):ProjectItem[] {
  const l=projectLibrary(p);
  return [
    ...l.folders.map(f=>({key:`folder:${f.id}`,kind:"folder" as const,name:f.name,folderId:f.parentId,labelColor:f.labelColor,notes:f.notes})),
    ...l.media.map(m=>({...m,key:m.src,kind:m.kind??"video" as const})),
    ...Object.values(p.sequences??{}).map(s=>({...l.sequenceMeta[s.id],key:`sequence:${s.id}`,kind:"sequence" as const,name:s.name,durationInFrames:s.durationInFrames})),
    ...l.elements.map(e=>({...e,key:`element:${e.id}`,kind:"element" as const,name:e.name,durationInFrames:e.clip.durationInFrames})),
  ];
}
/** Carpetas incluidas con todo su contenido, sin depender de la vista o del buscador. */
export function expandProjectItems(p:Project,keys:string[]):Set<string> {
  const selected=new Set(keys),items=projectItems(p);let count=-1;
  while(count!==selected.size){count=selected.size;for(const item of items)if(item.folderId&&selected.has(`folder:${item.folderId}`))selected.add(item.key);}
  return selected;
}
export type ProjectUse = {sequenceId?:string;sequenceName:string;trackId:string;clipId:string;locked:boolean;kind:Clip["kind"]};
export function projectItemUses(p:Project,keys:string[]):ProjectUse[] {
  const selected=expandProjectItems(p,keys),out:ProjectUse[]=[];
  const match=(c:Clip)=>selected.has(`element:${c.projectItemId}`)||((c.kind==="video"||c.kind==="audio")&&(selected.has(c.src)||c.sequenceId&&selected.has(`sequence:${c.sequenceId}`)||c.kind==="audio"&&(c.channelSource&&selected.has(c.channelSource)||c.derivedFrom&&selected.has(c.derivedFrom.src))));
  for(const [sequenceId,view] of [[undefined,p],...Object.entries(p.sequences??{})] as [string|undefined,Project][]) {
    const matched=view.tracks.flatMap(t=>t.clips).filter(match),ids=new Set(matched.map(c=>c.id));
    for(const c of matched)if((c.kind==="video"||c.kind==="audio")&&c.linkedClipId)ids.add(c.linkedClipId);
    for(const t of view.tracks)for(const c of t.clips)if(ids.has(c.id))out.push({sequenceId,sequenceName:view.name,trackId:t.id,clipId:c.id,locked:Boolean(t.locked),kind:c.kind});
  }
  return out;
}
