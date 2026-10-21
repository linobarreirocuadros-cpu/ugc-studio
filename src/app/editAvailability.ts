import type {Project} from "../project/types";
import {clipsEditable,findClip,linkedIds} from "../project/ops";
/** Misma compatibilidad para menús superiores y contexto. */
export function editAvailable(p:Project,ids:string[],action:string):boolean{
  const clips=ids.map(id=>findClip(p,id)?.clip).filter(c=>!!c),linked=linkedIds(p,ids).map(id=>findClip(p,id)?.clip).filter(c=>!!c),editable=clips.length>0&&clipsEditable(p,ids);
  if(["copy","duplicate","subsequence","cut","delete","rippleDelete","nest"].includes(action))return action==="copy"?clips.length>0:editable;
  if(action==="gain")return editable&&linked.some(c=>c.kind==="audio"||c.kind==="video"&&!c.linkedClipId&&c.audioMode!=="none"&&c.freezeFrame===undefined);
  if(action==="channels")return editable&&linked.some(c=>c.kind==="audio"&&!c.sequenceId);
  if(action==="speed")return editable&&clips.every(c=>(c.kind==="video"||c.kind==="audio")&&!c.sequenceId&&(c.kind!=="video"||c.freezeFrame===undefined));
  if(action==="group")return editable&&linked.length>=2;
  if(action==="ungroup")return editable&&linked.some(c=>!!c.groupId);
  if(action==="link")return editable&&(clips.some(c=>(c.kind==="audio"||c.kind==="video")&&c.linkedClipId)||clips.some(c=>c.kind==="video")&&clips.some(c=>c.kind==="audio"));
  if(["hold","holdTail","holdInsert","unfreeze"].includes(action))return editable&&clips.some(c=>c.kind==="video"&&!c.sequenceId);
  return true;
}
