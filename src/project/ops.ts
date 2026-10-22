import {transcriptSource} from "./transcript";
import {retimeStandaloneClip,retimeProject,validSequenceSettings,type SequenceSettings} from "./sequenceSettings";
import {assertProject} from "./projectFile";
import {DEFAULT_MOTION,validMotion,sliceMotion,motionSupported,hyperframesSupported,type ClipMotion,type RenderEngine} from "./motion";
import {bakeTrackMix} from "./audioMix";
import {validEffects,presetById,adjacentPrevious,adjacentNext,sliceClipEdges,type ClipEffects,type VideoTransition} from "./effects";
// Operaciones puras sobre el proyecto. Cada una recibe un Project y devuelve uno nuevo.
// La UI las usa hoy; en la Fase 2 el chat de IA las llamará como "tools".

import {
  getProjectDuration,
  sourceFrame, availableFrames, createEmptyProject,
  type GraphicClip,
  type LibraryMedia, type ProjectLibrary, type LibraryMetadata,
  destinationTrack, trackFamily, trackAcceptsClip,
  nameTracks,
  trackOutputEnabled,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_TEXT_STYLE,
  type CaptionClip,
  type CaptionStyle,
  type Clip,
  type Project,
  type AudioClip,
  type TextStyle,
  type Track,
  type VideoClip,
  type Word,
  type TimelineMarker,
} from "./types";
import { emptyLibrary, projectLibrary, projectItems, expandProjectItems, projectItemUses } from "./library";

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Migración del archivo antiguo: biblioteca global dentro del mismo JSON e historial. */
export const ensureProjectLibrary = (p:Project,legacyMedia:LibraryMedia[]=[]):Project => p.library?p.library.media.every(m=>m.frameBase!==undefined)&&p.library.elements.every(e=>e.frameBase!==undefined)?p:{...p,library:{...p.library,media:p.library.media.map(m=>({...m,frameBase:m.frameBase??p.fps})),elements:p.library.elements.map(e=>({...e,frameBase:e.frameBase??p.fps}))}}:{...p,library:{...emptyLibrary(),media:legacyMedia.map(m=>({...m,frameBase:m.frameBase??p.fps}))}};
export const setLibraryMedia = (p:Project,media:LibraryMedia[]):Project => {
  const library=projectLibrary(p);return media===library.media||JSON.stringify(media)===JSON.stringify(library.media)?p:{...p,library:{...library,media}};
};
/** Un proxy es información derivada; aplicarla también a instantáneas de historial. */
export const annotateProjectProxy=(p:Project,src:string,proxySrc:string):Project=>{
  let next=p;
  if(p.library?.media.some(m=>m.src===src&&m.proxySrc!==proxySrc))next=setLibraryMedia(p,p.library.media.map(m=>m.src===src?{...m,proxySrc}:m));
  const update=(view:Project)=>view.tracks.some(t=>t.clips.some(c=>c.kind==="video"&&c.src===src&&c.proxySrc!==proxySrc))?setProxy(view,src,proxySrc):view;
  next=update(next);
  const sequences=p.sequences?Object.fromEntries(Object.entries(p.sequences).map(([id,s])=>[id,update(s)])):undefined;
  if(sequences&&Object.keys(sequences).some(id=>sequences[id]!==p.sequences?.[id]))next={...next,sequences:sequences as Project["sequences"]};
  return next;
};
export const addProjectFolder = (p:Project,name:string,parentId?:string,id=newId()):Project => {
  const l=projectLibrary(p);if(parentId&&!l.folders.some(f=>f.id===parentId))throw new Error("La carpeta de destino ya no existe.");
  if(l.folders.some(f=>f.id===id))throw new Error("La carpeta ya existe.");
  return {...p,library:{...l,folders:[...l.folders,{id,name:name.trim().slice(0,160)||"Nueva carpeta",parentId}]}};
};
export const moveProjectItems = (p:Project,keys:string[],folderId?:string):Project => {
  const l=projectLibrary(p),chosen=new Set(keys);
  if(folderId&&!l.folders.some(f=>f.id===folderId))throw new Error("La carpeta de destino ya no existe.");
  if(folderId&&expandProjectItems(p,keys).has(`folder:${folderId}`))throw new Error("Una carpeta no se puede mover dentro de sí misma ni de una subcarpeta.");
  const change=(key:string,meta:LibraryMetadata):LibraryMetadata=>chosen.has(key)?{...meta,folderId}:meta;
  return {...p,library:{...l,media:l.media.map(m=>({...m,...change(m.src,m)})),folders:l.folders.map(f=>chosen.has(`folder:${f.id}`)?{...f,parentId:folderId}:f),elements:l.elements.map(e=>({...e,...change(`element:${e.id}`,e)})),sequenceMeta:Object.fromEntries(Object.keys(p.sequences??{}).map(id=>[id,change(`sequence:${id}`,l.sequenceMeta[id]??{})]))}};
};
export const setProjectItemMetadata = (p:Project,key:string,patch:Pick<LibraryMetadata,"labelColor"|"notes">):Project => {
  if(patch.labelColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(patch.labelColor))throw new Error("Color de etiqueta no válido.");
  const l=projectLibrary(p),sequence=key.startsWith("sequence:")?key.slice(9):undefined;
  return {...p,library:{...l,media:l.media.map(m=>m.src===key?{...m,...patch}:m),elements:l.elements.map(e=>`element:${e.id}`===key?{...e,...patch}:e),folders:l.folders.map(f=>`folder:${f.id}`===key?{...f,...patch}:f),sequenceMeta:sequence?{...l.sequenceMeta,[sequence]:{...l.sequenceMeta[sequence],...patch}}:l.sequenceMeta}};
};
export const renameProjectItem = (p:Project,key:string,name:string):Project => {
  name=name.trim().slice(0,160);if(!name)throw new Error("Escribe un nombre.");
  const l=projectLibrary(p);if(!projectItems(p).some(i=>i.key===key))return p;
  const sequenceId=key.startsWith("sequence:")?key.slice(9):undefined;
  const rename=(tracks:Track[])=>tracks.map(t=>({...t,clips:t.clips.map(c=>(c.kind==="video"||c.kind==="audio")&&(c.src===key||sequenceId&&c.sequenceId===sequenceId)?{...c,name}:c)}));
  return {...p,tracks:rename(p.tracks),sequences:p.sequences?Object.fromEntries(Object.entries(p.sequences).map(([id,s])=>[id,{...s,name:id===sequenceId?name:s.name,tracks:rename(s.tracks)}])):undefined,library:{...l,media:l.media.map(m=>m.src===key?{...m,originalName:m.originalName??m.name,name}:m),folders:l.folders.map(f=>`folder:${f.id}`===key?{...f,name}:f),elements:l.elements.map(e=>`element:${e.id}`===key?{...e,name,clip:{...e.clip,...(e.clip.kind==="graphic"?{name}:{})}}:e)}};
};
export type LibraryElementType="adjustment"|"solid"|"rectangle"|"text"|"black"|"transparent";
export const addProjectElement = (p:Project,type:LibraryElementType,name:string,duration:number,color="#ffffff",folderId?:string,id=newId()):Project => {
  if(!Number.isSafeInteger(duration)||duration<1||!/^#[0-9a-f]{6}$/i.test(color))throw new Error("Duración o color no válidos.");
  const l=projectLibrary(p);if(folderId&&!l.folders.some(f=>f.id===folderId))throw new Error("La carpeta de destino ya no existe.");
  name=name.trim().slice(0,160)||"Elemento";
  const clip:GraphicClip|import("./types").TextClip=type==="text"?{id,kind:"text",text:name,from:0,durationInFrames:duration,style:{...DEFAULT_TEXT_STYLE}}:{id,kind:"graphic",shape:type==="adjustment"?"adjustment":type==="rectangle"?"rectangle":"solid",name,from:0,durationInFrames:duration,color:type==="black"?"#000000":color,x:.5,y:.5,width:.3,height:Math.min(1,.3*p.width/p.height),opacity:type==="transparent"?0:1,brightness:1,contrast:1,saturation:1};
  return {...p,library:{...l,elements:[...l.elements,{id,name,folderId,clip,frameBase:p.fps}]}};
};
export const placeProjectElement = (p:Project,id:string,at:number,hostId?:string,trackId?:string,duration?:number):Project => {
  if(duration!==undefined&&(!Number.isSafeInteger(duration)||duration<1))return p;
  const item=projectLibrary(p).elements.find(e=>e.id===id);if(!item)return p;
  const template=retimeStandaloneClip(item.clip,item.frameBase??p.fps,p.fps);const clip={...template,durationInFrames:duration??template.durationInFrames,projectItemId:id,labelColor:item.labelColor};
  if(trackId){const target=p.tracks.find(t=>t.id===trackId);if(!target||target.locked||!trackAcceptsClip(target,clip)||!Number.isSafeInteger(at)||at<0)return p;const placed={...clip,id:newId(),from:at};return overwritePlaced(p,mapTracks(p,t=>t.id===trackId?{...t,clips:[...t.clips,placed]}:t),[placed.id],true);}
  const track:Track={id:clip.kind==="text"?"T1":`G-item-${id}`,kind:clip.kind,name:item.name,clips:[clip]};
  return pasteClips(p,{...p,tracks:[track]},at,hostId);
};
/** Reutilizar un texto/gráfico en la pista elegida, sin modificar su plantilla ni su origen. */
export const placeElementClip = (p:Project,source:Project,id:string,at:number,trackId?:string,duration?:number,hostId?:string):Project => {
  const found=findClip(source,id);if(!found||(found.clip.kind!=="text"&&found.clip.kind!=="graphic")||!Number.isSafeInteger(at)||at<0||duration!==undefined&&(!Number.isSafeInteger(duration)||duration<1))return p;
  const target=trackId?p.tracks.find(t=>t.id===trackId):found.track;
  if(!target||target.kind==="audio"||target.locked)return p;
  const clip={...found.clip,from:0,durationInFrames:duration??found.clip.durationInFrames};
  return pasteClips(p,{...source,tracks:[{...target,clips:[clip]}]},at,hostId,undefined,true);
};
/** Colocar varios elementos consecutivos en una sola operación reversible. */
export const placeProjectItems = (p:Project,keys:string[],at:number,hostId?:string,nested=true):Project => {
  if(!Number.isSafeInteger(at)||at<0)return p;
  let next=p,cursor=at;const library=projectLibrary(p);
  for(const key of keys){
    const original=library.media.find(m=>m.src===key),m=original?{...original,durationInFrames:Math.max(1,Math.round(original.durationInFrames*p.fps/(original.frameBase??p.fps))),frameBase:p.fps}:undefined,s=key.startsWith("sequence:")?p.sequences?.[key.slice(9)]:undefined,e=key.startsWith("element:")?library.elements.find(e=>e.id===key.slice(8)):undefined;
    const before=next;
    if(m){const target=destinationTrack(next,m.kind==="audio"?"audio":"video");if(!target)return p;next=addSourceRange(next,m,target,cursor);cursor+=m.durationInFrames;}
    else if(s){const target=destinationTrack(next,"video");if(!target)return p;next=placeSequence(next,s.id,target,cursor,nested,hostId);cursor+=Math.max(1,Math.round(s.durationInFrames*p.fps/s.fps));}
    else if(e){next=placeProjectElement(next,e.id,cursor,hostId);cursor+=Math.max(1,Math.round(e.clip.durationInFrames*p.fps/(e.frameBase??p.fps)));}
    else return p;
    if(next===before)return p;
  }
  return next;
};
/** Quitar de Proyecto nunca borra archivos. Usos y biblioteca son una sola transacción. */
export const removeProjectItems = (p:Project,keys:string[],allowUsed=false):Project => {
  const selected=expandProjectItems(p,keys),items=projectItems(p).filter(i=>selected.has(i.key));if(!items.length)return p;
  const uses=projectItemUses(p,keys),removedSequences=new Set(items.filter(i=>i.kind==="sequence").map(i=>i.key.slice(9)));
  if(uses.length&&!allowUsed)throw new Error("El elemento está usado en secuencias. Revisa la eliminación antes de continuar.");
  for(const id of removedSequences)if(p.sequences?.[id]?.tracks.some(t=>t.locked&&t.clips.length))throw new Error("La secuencia contiene pistas bloqueadas. Desbloquéalas antes de eliminarla.");
  const remove=(view:Project,sequenceId?:string):Project=>{
    const ids=uses.filter(u=>u.sequenceId===sequenceId).map(u=>u.clipId);
    if(!clipsEditable(view,ids))throw new Error("Hay clips o parejas en pistas bloqueadas. Desbloquéalas antes de eliminar.");
    const clean=deleteClips(view,ids);return {...clean,transcripts:clean.transcripts?Object.fromEntries(Object.entries(clean.transcripts).filter(([src])=>!selected.has(src))):undefined,transcriptInfo:clean.transcriptInfo?Object.fromEntries(Object.entries(clean.transcriptInfo).filter(([src])=>!selected.has(src))):undefined};
  };
  let next=remove(p);
  next={...next,sequences:Object.fromEntries(Object.entries(p.sequences??{}).filter(([id])=>!removedSequences.has(id)).map(([id,s])=>[id,{...s,...remove(s,id)}]))};
  const l=projectLibrary(p);return {...next,library:{...l,media:l.media.filter(m=>!selected.has(m.src)),folders:l.folders.filter(f=>!selected.has(`folder:${f.id}`)),elements:l.elements.filter(e=>!selected.has(`element:${e.id}`)),sequenceMeta:Object.fromEntries(Object.entries(l.sequenceMeta).filter(([id])=>!removedSequences.has(id)))}};
};

/** Selección de grupo y parejas, transitiva. Alt permite aislar una parte en la UI. */
export const groupedIds = (p: Project, ids: string[]): string[] => {
  const result = new Set(ids); let previous = -1;
  while (previous !== result.size) {
    previous = result.size;
    const groups = new Set(p.tracks.flatMap(t => t.clips).filter(c => result.has(c.id) && c.groupId).map(c => c.groupId));
    p.tracks.flatMap(t => t.clips).filter(c => c.groupId && groups.has(c.groupId)).forEach(c => result.add(c.id));
    linkedIds(p, [...result]).forEach(id => result.add(id));
  }
  return [...result];
};
export const groupClips = (p: Project, ids: string[], group = true): Project => {
  const selected = groupedIds(p, ids);
  if (!clipsEditable(p, selected) || group && selected.length < 2) return p;
  const groupId = group ? newId() : undefined;
  return mapTracks(p, t => ({ ...t, clips: t.clips.map(c => selected.includes(c.id) ? { ...c, groupId } : c) }));
};
export const labelClips = (p: Project, ids: string[], color?: string): Project => {
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color) || !clipsEditable(p, ids)) return p;
  return mapTracks(p, t => ({ ...t, clips: t.clips.map(c => ids.includes(c.id) ? { ...c, labelColor: color } : c) }));
};
export const setClipVolume = (p: Project, ids: string[], value: number, relative = false): Project => {
  if (!Number.isFinite(value) || !clipsEditable(p, ids)) return p;
  const audio = new Set(linkedIds(p, ids).filter(id => {
    const c = findClip(p, id)?.clip;
    return c?.kind === "audio" || c?.kind === "video" && !c.linkedClipId && c.freezeFrame === undefined;
  }));
  if([...audio].every(id=>{const c=findClip(p,id)!.clip as AudioClip|VideoClip;return c.volume===Math.max(0,Math.min(4,relative?c.volume*value:value));}))return p;
  return mapTracks(p, t => ({ ...t, clips: t.clips.map(c => audio.has(c.id) && (c.kind === "audio" || c.kind === "video") ? { ...c, volume: Math.max(0, Math.min(4, relative ? c.volume * value : value)) } : c) }));
};
export const createEmptySequence = (p: Project, name: string,settings?:SequenceSettings): Project => {
  if(settings&&!validSequenceSettings(settings))throw new Error("Parámetros de secuencia inválidos");
  const id = newId(), empty = createEmptyProject();
  return { ...p, sequences: { ...p.sequences, [id]: { ...empty, id, name: name.trim().slice(0,100) || "Secuencia", fps: p.fps, width: p.width, height: p.height,...(settings?{width:settings.width,height:settings.height,fps:settings.fps,audioSampleRate:settings.audioSampleRate??48000}:{}), durationInFrames: Math.ceil(settings?.fps??p.fps) } } };
};
/** Anidar sustituye la selección por una referencia editable; crear subsecuencia solo copia. */
export const nestClips = (p: Project, ids: string[], name: string, hostId?: string): Project => {
  const chosen = groupedIds(p, ids), clips = chosen.map(id => findClip(p,id)?.clip).filter((c): c is Clip => Boolean(c));
  if (!clips.length || !clipsEditable(p, chosen)) return p;
  let next = createSequence(p, chosen, name);
  const sequenceId = Object.keys(next.sequences ?? {}).find(id => !p.sequences?.[id]);
  if (!sequenceId) return p;
  next = mapTracks(next,t=>({...t,clips:t.clips.filter(c=>!chosen.includes(c.id))}));
  // Mantener la posición de apilamiento respecto a material no seleccionado.
  const from=Math.min(...clips.map(c=>c.from)),end=Math.max(...clips.map(c=>c.from+c.durationInFrames));
  const visual=p.tracks.map((t,i)=>({t,i})).filter(({t})=>t.kind!=="audio"&&t.clips.some(c=>chosen.includes(c.id)));
  const low=visual[0]?.i,high=visual.at(-1)?.i;
  if(low!==undefined&&high!==undefined&&p.tracks.slice(low+1,high).some(t=>t.kind!=="audio"&&t.clips.some(c=>!chosen.includes(c.id)&&c.from<end&&c.from+c.durationInFrames>from)))return p;
  const oldTracks=new Set(next.tracks.map(t=>t.id));next=addTrack(next,"video");
  const target=next.tracks.find(t=>!oldTracks.has(t.id))!;
  if(high!==undefined){const tracks=next.tracks.filter(t=>t.id!==target.id);tracks.splice(high+1,0,target);next=nameTracks({...next,tracks});}
  const hasAudio = clips.some(c=>c.kind==="audio" || c.kind==="video" && c.volume>0);
  if (hasAudio) { next=addTrack(next,"audio");const audio=next.tracks.find(t=>t.kind==="audio")!;next=setTrackState(next,audio.id,{targeted:true,solo:p.tracks.some(t=>t.kind==="audio"&&t.solo&&t.clips.some(c=>chosen.includes(c.id)))}); }
  const placed=placeSequence(next,sequenceId,target.id,Math.min(...clips.map(c=>c.from)),true,hostId);
  return placed===next ? p : placed;
};
export const addGraphic = (p: Project, shape: GraphicClip["shape"], at: number, duration = p.fps*5,trackId?:string): Project => {
  if (!Number.isFinite(at) || !Number.isFinite(duration)) return p;
  const clip: GraphicClip={id:newId(),kind:"graphic",name:shape==="adjustment"?"Capa de ajuste":shape==="solid"?"Sólido":"Cuadrado",from:Math.max(0,Math.round(at)),durationInFrames:Math.max(1,Math.round(duration)),shape,color:"#ffffff",x:.5,y:.5,width:.3,height:Math.min(1,.3*p.width/p.height),opacity:1,brightness:1,contrast:1,saturation:1};
  if(trackId){const target=p.tracks.find(t=>t.id===trackId);if(!target||target.locked||target.kind==="audio")return p;return overwritePlaced(p,mapTracks(p,t=>t.id===trackId?{...t,clips:[...t.clips,clip]}:t),[clip.id],true);}
  return nameTracks({...p,tracks:[...p.tracks,{id:`G-${newId()}`,kind:"graphic",name:clip.name,clips:[clip]}]});
};
/** Velocidad constante, sin ripple: extender sobrescribe el destino como cualquier recorte. */
export const setClipSpeed = (p: Project, ids: string[], rate: number): Project => {
  const chosen=linkedIds(p,ids);
  if (!Number.isFinite(rate) || rate<.25 || rate>4 || !clipsEditable(p,chosen)) return p;
  const clips=chosen.map(id=>findClip(p,id)?.clip);
  if (clips.some(c=>!c || c.kind!=="video"&&c.kind!=="audio" || c.sequenceId || c.kind==="video"&&c.freezeFrame!==undefined)) return p;
  const next=mapTracks(p,t=>({...t,clips:t.clips.map(c=> chosen.includes(c.id)&&(c.kind==="video"||c.kind==="audio") ? {...c,playbackRate:rate,durationInFrames:Math.max(1,Math.floor(c.durationInFrames*(c.playbackRate??1)/rate)),...(c.kind==="audio"?{fadeIn:Math.min(c.fadeIn,Math.max(1,Math.floor(c.durationInFrames*(c.playbackRate??1)/rate))),fadeOut:Math.min(c.fadeOut,Math.max(1,Math.floor(c.durationInFrames*(c.playbackRate??1)/rate)))}:{})} : c)}));
  return overwritePlaced(p,next,chosen);
};
/** Mantener todo el clip o desde el cabezal. El audio conserva su reproducción. */
export const holdFrame = (p: Project, id: string, at: number, mode: "whole"|"tail"|"insert", length = p.fps*2): Project => {
  const c=findClip(p,id)?.clip;
  if (!c || c.kind!=="video" || c.sequenceId || !clipsEditable(p,[id]) || !Number.isSafeInteger(at) || at<c.from || at>=c.from+c.durationInFrames) return p;
  const frozen=sourceFrame(c,at-c.from);
  if(mode==="whole") return updateClip(p,id,{freezeFrame:frozen});
  if(mode==="tail") {
    const next=splitAt(p,at,id),tail=next.tracks.find(t=>t.id===findClip(p,id)!.track.id)?.clips.find(v=>v.kind==="video"&&v.from===at&&v.src===c.src);
    return tail?updateClip(next,tail.id,{freezeFrame:frozen}):p;
  }
  if (!Number.isSafeInteger(length) || length<1 || p.tracks.some(t=>t.locked&&t.clips.some(v=>v.from+v.durationInFrames>at))) return p;
  // Inserción global: abre el hueco en todas las pistas para conservar la sincronía.
  const cut=splitAt(p,at), next=mapTracks(cut,t=>({...t,clips:t.clips.map(v=>v.from>=at?{...v,from:v.from+length}:v)}));
  const target=findClip(next,id)!.track.id;
  const still: VideoClip={...c,id:newId(),from:at,durationInFrames:length,freezeFrame:frozen,volume:0,linkedClipId:undefined,audioMode:"none",groupId:undefined};
  return {...mapTracks(next,t=>t.id===target?{...t,clips:[...t.clips,still]}:t),markers:next.markers?.map(m=>m.frame>=at?{...m,frame:m.frame+length}:m)};
};

const mapTracks = (project: Project, fn: (t: Track) => Track): Project => ({
  ...project,
  tracks: project.tracks.map(fn),
});

const trackEnd = (track: Track) =>
  track.clips.reduce((end, c) => Math.max(end, c.from + c.durationInFrames), 0);

export const findClip = (project: Project, clipId: string) => {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
};

export const linkedIds = (project: Project, ids: string[]): string[] => {
  const result = new Set(ids);
  for (const id of ids) {
    const clip = findClip(project, id)?.clip;
    if (clip && (clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId && findClip(project, clip.linkedClipId)) result.add(clip.linkedClipId);
  }
  return [...result];
};

export const clipsEditable = (project: Project, ids: string[]) =>
  linkedIds(project, ids).every((id) => !findClip(project, id)?.track.locked);

/** Editar una parte sin arrastrar a su pareja. Restaurar el enlace de los IDs que sobreviven. */
export const editSelection = (project: Project, ids: string[], followLinks: boolean, operation: (p: Project) => Project): Project => {
  if (followLinks) return operation(project);
  if (ids.some((id) => findClip(project, id)?.track.locked)) return project;
  const detached = new Set(linkedIds(project, ids));
  const links = new Map<string, string>();
  const isolated = mapTracks(project, (t) => ({ ...t, clips: t.clips.map((c) => {
    if ((c.kind !== "video" && c.kind !== "audio") || !detached.has(c.id) || !c.linkedClipId) return c;
    links.set(c.id, c.linkedClipId); return { ...c, linkedClipId: undefined };
  }) }));
  const edited = operation(isolated);
  if (edited === isolated) return project;
  return mapTracks(edited, (t) => ({ ...t, clips: t.clips.map((c) => {
    if ((c.kind !== "video" && c.kind !== "audio") || !links.has(c.id)) return c;
    const mate = links.get(c.id)!;
    return { ...c, linkedClipId: findClip(edited, mate) ? mate : undefined };
  }) }));
};

export const setMarker = (project: Project, marker: TimelineMarker): Project => {
  if (!Number.isInteger(marker.frame) || marker.frame < 0 || marker.frame >= getProjectDuration(project) || !/^#[0-9a-f]{6}$/i.test(marker.color)) return project;
  const markers = [...(project.markers ?? []).filter((m) => m.id !== marker.id), { ...marker, label: marker.label.trim().slice(0, 160) || "Marcador" }].sort((a, b) => a.frame - b.frame);
  return { ...project, markers };
};

export const deleteMarker = (project: Project, id: string): Project => ({ ...project, markers: (project.markers ?? []).filter((m) => m.id !== id) });

/** Copia editable del montaje seleccionado. Los originales permanecen en la secuencia actual. */
export const createSequence = (project: Project, ids: string[], name: string): Project => {
  const selected = new Set(linkedIds(project, ids));
  const clips = project.tracks.flatMap((t) => t.clips).filter((c) => selected.has(c.id));
  if (!clips.length) return project;
  const start = Math.min(...clips.map((c) => c.from)), end = Math.max(...clips.map((c) => c.from + c.durationInFrames));
  const id = newId();
  const { sequences: _, library: _library,exportRanges:_exportRanges, ...base } = project;
  const sequence = { ...base, masterVolume:undefined, id, name: name.trim().slice(0, 100) || "Secuencia", durationInFrames: end - start,
    tracks: project.tracks.map((t) => ({ ...t, locked: false, targeted: false, clips: t.clips.filter((c) => selected.has(c.id)).map((c) => ({ ...c, from: c.from - start })) })),
    markers: (project.markers ?? []).filter((m) => m.frame >= start && m.frame < end).map((m) => ({ ...m, frame: m.frame - start })),
  };
  return { ...project, sequences: { ...project.sequences, [id]: sequence } };
};

export const updateSequence = (project: Project, id: string, contents: Project): Project => {
  if (!project.sequences?.[id]) return project;
  const { sequences, library, ...sequence } = contents;
  const end = Math.max(1, ...sequence.tracks.flatMap((t) => t.clips.map((c) => c.from + c.durationInFrames)));
  const refresh = (tracks: Track[],hostFps:number) => {const frames=Math.max(1,Math.round(end*hostFps/sequence.fps));return tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.kind === "video" || c.kind === "audio") && c.sequenceId === id ? { ...c, name: sequence.name, sourceDurationInFrames: frames, trimStart: Math.min(c.trimStart,frames-1), durationInFrames: Math.min(c.durationInFrames,frames-Math.min(c.trimStart,frames-1)) } : c) }));};
  const next = { ...sequences, [id]: { ...sequence, id, durationInFrames: end } };
  return { ...project, ...(library ? {library} : {}), tracks: refresh(project.tracks,project.fps), sequences: Object.fromEntries(Object.entries(next).map(([key, value]) => [key, { ...value, tracks: refresh(value.tracks,value.fps) }])) };
};

const containsSequence = (project: Project, id: string, sought: string, visited = new Set<string>()): boolean => {
  if (id === sought) return true;
  if (visited.has(id)) return false; visited.add(id);
  return project.sequences?.[id]?.tracks.some((t) => t.clips.some((c) => (c.kind === "video" || c.kind === "audio") && c.sequenceId && containsSequence(project, c.sequenceId, sought, visited))) ?? false;
};

/** Coloca una secuencia como bloque anidado o como todos sus clips y pistas originales. */
export const placeSequence = (project: Project, sequenceId: string, trackId: string, at: number, nested: boolean, hostId?: string,maximumDuration?:number): Project => {
  if(maximumDuration!==undefined&&(!Number.isSafeInteger(maximumDuration)||maximumDuration<1||!nested))return project;
  if (hostId && containsSequence(project, sequenceId, hostId)) return project;
  const originalSequence=project.sequences?.[sequenceId],sequence=originalSequence?retimeProject(originalSequence,project.fps):undefined, target = project.tracks.find((t) => t.id === trackId);
  if (!sequence || !target || trackFamily(target.kind) !== "video"&&!(nested&&target.kind==="audio") || target.locked || !Number.isFinite(at)) return project;
  const from = Math.max(0, Math.round(at));
  if (nested) {
    const videoId = newId(), audioId = newId(), audioOnly=target.kind==="audio", audioTrack = audioOnly?target.id:destinationTrack(project, "audio");
    const hasSound = sequence.tracks.some((t) => t.clips.some((c) => c.kind === "audio" || c.kind === "video" && c.volume > 0));
    if (hasSound && !audioTrack || audioOnly&&!hasSound) return project;
    const common = { src: "", sequenceId, name: sequence.name, from, durationInFrames: Math.min(sequence.durationInFrames,maximumDuration??sequence.durationInFrames), sourceDurationInFrames: sequence.durationInFrames, trimStart: 0 };
    const video: VideoClip = { ...common, id: videoId, kind: "video", volume: 0, audioMode: hasSound ? "separate" : "none", linkedClipId: hasSound ? audioId : undefined };
    const audio: AudioClip = { ...common, id: audioId, kind: "audio", volume: 1, fadeIn: 0, fadeOut: 0, linkedClipId: audioOnly?undefined:videoId };
    const placed = mapTracks(project, (t) => ({ ...t, clips: [...t.clips, ...(!audioOnly&&t.id === trackId ? [video] : []), ...(hasSound && t.id === audioTrack ? [audio] : [])] }));
    return overwritePlaced(project, placed, audioOnly?[audioId]:hasSound ? [videoId, audioId] : [videoId]);
  }
  let next = project;
  const destinations = new Map<string, string>();
  for (const kind of ["video", "audio"] as const) {
    const sources = sequence.tracks.filter((t) => trackFamily(t.kind) === kind && t.clips.length);
    const list = () => { const tracks = next.tracks.filter((t) => trackFamily(t.kind) === kind); return kind === "audio" ? tracks.reverse() : tracks; };
    let targets = list();
    const anchor = kind === "video" ? trackId : kind === "audio" ? destinationTrack(next, "audio") : targets[0]?.id;
    const offset = Math.max(0, targets.findIndex((t) => t.id === anchor));
    while (targets.length < offset + sources.length && (kind === "video" || kind === "audio")) { next = addTrack(next, kind); targets = list(); }
    for (const [i, source] of sources.entries()) {
      const destination = targets[offset + i];
      if (!destination || destination.locked) return project;
      destinations.set(source.id, destination.id);
    }
  }
  const identities = new Map(sequence.tracks.flatMap((t) => t.clips.map((c) => [c.id, newId()]))), groups=new Map(sequence.tracks.flatMap(t=>t.clips).filter(c=>c.groupId).map(c=>[c.groupId!,newId()]));
  const placed = mapTracks(next, (t) => ({ ...t, clips: [...t.clips, ...sequence.tracks.filter((s) => destinations.get(s.id) === t.id).flatMap((s) => s.clips.map((c): Clip => {
    const clip = { ...bakeTrackMix(c,s,sequence), id: identities.get(c.id)!, from: from + c.from, groupId:c.groupId?groups.get(c.groupId):undefined };
    if (clip.kind === "video" || clip.kind === "audio") clip.linkedClipId = clip.linkedClipId ? identities.get(clip.linkedClipId) : undefined;
    if (clip.kind === "audio" && clip.derivedFrom) clip.derivedFrom = { ...clip.derivedFrom, clipId: identities.get(clip.derivedFrom.clipId) ?? clip.derivedFrom.clipId };
    return clip;
  }))] }));
  return overwritePlaced(project, placed, [...identities.values()]);
};

export const linkClips = (project: Project, ids: string[], linked: boolean): Project => {
  if (!clipsEditable(project, ids)) return project;
  const selected = ids.map((id) => findClip(project, id)?.clip).filter((c) => c?.kind === "video" || c?.kind === "audio");
  if (linked && (selected.length !== 2 || !selected.some((c) => c?.kind === "video") || !selected.some((c) => c?.kind === "audio"))) return project;
  const affected = new Set(linkedIds(project, ids));
  const clean = mapTracks(project, (t) => ({ ...t, clips: t.clips.map((c) => (c.kind === "video" || c.kind === "audio") && affected.has(c.id) ? { ...c, linkedClipId: undefined } : c) }));
  return !linked ? clean : mapTracks(clean, (t) => ({ ...t, clips: t.clips.map((c) => selected.some((s) => s?.id === c.id) && (c.kind === "video" || c.kind === "audio") ? { ...c, linkedClipId: selected.find((s) => s?.id !== c.id)!.id } : c) }));
};

export const setTrackState = (project: Project, id: string, patch: Partial<Pick<Track, "locked" | "hidden" | "muted" | "solo" | "targeted" | "syncLock">>): Project => {
  const track = project.tracks.find((t) => t.id === id);
  if (!track) return project;
  return mapTracks(project, (t) => ({ ...t, ...(patch.targeted && trackFamily(t.kind) === trackFamily(track.kind) ? { targeted: false } : {}), ...(t.id === id ? patch : {}) }));
};

type Range = { start: number; end: number };
const mergeRanges = (ranges: Range[]): Range[] => {
  const out: Range[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ ...range });
  }
  return out;
};

/** Conserva un fragmento sin perder offset de origen, palabras ni fades de los extremos. */
const clipSlice = (clip: Clip, start: number, end: number, id: string): Clip => {
  const offset = start - clip.from, durationInFrames = end - start;
  const base = { ...sliceClipEdges(clip,offset,durationInFrames), ...(clip.motion?{motion:sliceMotion(clip,offset)}:{}), id, from: start, durationInFrames };
  if (base.kind === "video" || base.kind === "audio") base.trimStart = sourceFrame(base, offset);
  if (base.kind === "audio") {
    base.fadeIn = offset ? 0 : Math.min(base.fadeIn, durationInFrames);
    base.fadeOut = end === clip.from + clip.durationInFrames ? Math.min(base.fadeOut, durationInFrames) : 0;
  }
  if (base.kind === "caption") base.words = base.words.filter((w) => w.end > offset && w.start < offset + durationInFrames).map((w) => ({ ...w, start: Math.max(0, w.start - offset), end: Math.min(durationInFrames, w.end - offset) }));
  return base;
};

/** Resta huecos de clips concretos y reconstruye sus enlaces por fragmento. */
const cutClipRanges = (project: Project, cuts: Map<string, Range[]>): Project => {
  const pieces = new Map<string, Clip[]>();
  for (const [id, ranges] of cuts) {
    const clip = findClip(project, id)?.clip; if (!clip) continue;
    let cursor = clip.from;
    const fragments: Clip[] = [], end = clip.from + clip.durationInFrames;
    for (const range of mergeRanges(ranges)) {
      if (range.end <= cursor || range.start >= end) continue;
      if (range.start > cursor) fragments.push(clipSlice(clip, cursor, Math.min(end, range.start), fragments.length ? newId() : clip.id));
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < end) fragments.push(clipSlice(clip, cursor, end, fragments.length ? newId() : clip.id));
    pieces.set(id, fragments);
  }
  return mapTracks(project, (t) => ({ ...t, clips: t.clips.flatMap((c) => (pieces.get(c.id) ?? [c]).map((part): Clip => {
    if ((part.kind === "video" || part.kind === "audio") && part.linkedClipId && pieces.has(part.linkedClipId)) {
      const mate = pieces.get(part.linkedClipId)!.find((m) => m.from === part.from && m.durationInFrames === part.durationInFrames);
      return { ...part, linkedClipId: mate?.id };
    }
    return part;
  })) }));
};

/** Las pistas que optan por seguir ripple cierran los mismos huecos que las pistas editadas. */
const rippleFollowers = (before: Project, after: Project, anchors: Set<string>, gaps: Range[]): Project => {
  const ranges = mergeRanges(gaps), ids = new Set<string>();
  for (const track of before.tracks) if (track.syncLock && !track.locked && !anchors.has(track.id)) {
    for (const clip of track.clips) {
      const pair = linkedIds(before, [clip.id]);
      if (clipsEditable(before, pair) && pair.every((id) => !anchors.has(findClip(before, id)!.track.id))) pair.forEach((id) => ids.add(id));
    }
  }
  const cuts = new Map([...ids].map((id) => [id, ranges]));
  const cut = cutClipRanges(after, cuts);
  const followers = new Set([...ids].flatMap((id) => linkedIds(before, [id])));
  const followerTracks = new Set([...followers].map((id) => findClip(before, id)!.track.id));
  // Los fragmentos nuevos pertenecen a las mismas pistas; solo mover los procedentes de seguidores.
  const moved = mapTracks(cut, (t) => !followerTracks.has(t.id) ? t : { ...t, clips: t.clips.map((c) => {
    const source = before.tracks.find((original) => original.id === t.id)?.clips.find((original) => followers.has(original.id) && c.from >= original.from && c.from < original.from + original.durationInFrames);
    return source ? { ...c, from: c.from - ranges.reduce((sum, r) => sum + (r.end <= c.from ? r.end - r.start : 0), 0) } : c;
  }) });
  return preserveLocked(before, moved);
};

const preserveLocked = (before: Project, after: Project): Project => before.tracks.some((t) => t.locked && JSON.stringify(t.clips) !== JSON.stringify(after.tracks.find((n) => n.id === t.id)?.clips)) ? before : after;

/** Sobrescribe únicamente lo ocupado en las pistas destino; no desplaza el resto del montaje. */
const overwritePlaced = (before: Project, placed: Project, ids: string[],destinationOnly=false): Project => {
  const incoming = new Set(ids), cuts = new Map<string, Range[]>();
  if (!clipsEditable(placed, ids)) return before;
  for (const track of placed.tracks) for (const clip of track.clips.filter((c) => incoming.has(c.id))) {
    for (const victim of track.clips) {
      if (incoming.has(victim.id) || victim.from >= clip.from + clip.durationInFrames || victim.from + victim.durationInFrames <= clip.from) continue;
      const range = { start: clip.from, end: clip.from + clip.durationInFrames };
      if (!clipsEditable(placed, [victim.id])) return before;
      for (const id of destinationOnly?[victim.id]:linkedIds(placed, [victim.id])) cuts.set(id, [...cuts.get(id) ?? [], range]);
    }
  }
  return cuts.size ? cutClipRanges(destinationOnly?linkClips(placed,[...cuts.keys()],false):placed, cuts) : placed;
};

const alignLinkedChanges = (before: Project, after: Project): Project => {
  const updates = new Map<string, { from: number; durationInFrames: number; trimStart: number }>();
  const seen = new Set<string>();
  for (const clip of after.tracks.flatMap((t) => t.clips)) {
    if ((clip.kind !== "video" && clip.kind !== "audio") || !clip.linkedClipId || seen.has(clip.id)) continue;
    const mate = findClip(after, clip.linkedClipId)?.clip, old = findClip(before, clip.id)?.clip;
    if (!mate || (mate.kind !== "video" && mate.kind !== "audio") || !old || (old.kind !== "video" && old.kind !== "audio")) continue;
    if (clip.from !== old.from || clip.durationInFrames !== old.durationInFrames || clip.trimStart !== old.trimStart) {
      const oldMate = findClip(before, mate.id)?.clip;
      if (oldMate && (oldMate.kind === "audio" || oldMate.kind === "video") && mate.from === oldMate.from && mate.durationInFrames === oldMate.durationInFrames && mate.trimStart === oldMate.trimStart) updates.set(mate.id, { from: mate.from + clip.from - old.from, durationInFrames: mate.durationInFrames + clip.durationInFrames - old.durationInFrames, trimStart: mate.trimStart + clip.trimStart - old.trimStart });
      seen.add(clip.id); seen.add(mate.id);
    }
  }
  return updates.size ? mapTracks(after, (t) => ({ ...t, clips: t.clips.map((c) => updates.has(c.id) ? { ...c, ...updates.get(c.id)! } : c) })) : after;
};

export const effectiveVolume = (project: Project, clip: VideoClip | AudioClip): number => {
  const linked = clip.kind === "video" && clip.linkedClipId ? findClip(project, clip.linkedClipId)?.clip : null;
  return linked?.kind === "audio" ? linked.volume : clip.volume;
};

export const resolveTrackId = (project: Project, value: string) => {
  const track = project.tracks.find((t) => t.id === value || t.name.toLowerCase() === value.trim().toLowerCase());
  if (!track) throw new Error(`No existe la pista ${value}. Consulta las pistas disponibles.`);
  return track.id;
};

export const addTrack = (project: Project, kind: "video" | "audio"): Project => {
  const prefix = kind === "video" ? "V" : "A";
  const number = Math.max(kind === "video" ? 0 : -1, ...project.tracks.map((t) => new RegExp(`^${prefix}(\\d+)$`).exec(t.id)).filter((m) => m !== null).map((m) => Number(m![1]))) + 1;
  const track: Track = { id: `${prefix}${number}`, kind, name: "", clips: [] };
  const tracks = [...project.tracks];
  const index = kind === "audio" ? 0 : tracks.length;
  tracks.splice(index < 0 ? tracks.length : index, 0, track);
  return nameTracks({ ...project, tracks });
};

/** Hace visible el audio embebido sin recodificar ni cambiar su nivel audible. */
export const exposeEmbeddedAudio = (project: Project, ids: string[], preferredTrackId?: string): Project => {
  let next = project;
  for (const id of ids) {
    const video = findClip(next, id)?.clip;
    if (!video || video.kind !== "video" || video.sequenceId || video.linkedClipId || video.audioMode === "none" || video.audioMode === "separate" || !clipsEditable(next, [id])) continue;
    let target = preferredTrackId ? next.tracks.find((t) => t.id === preferredTrackId && t.kind === "audio" && !t.locked) : [...next.tracks].reverse().find((t) => t.kind === "audio" && !t.locked && !t.clips.some((c) => c.from < video.from + video.durationInFrames && c.from + c.durationInFrames > video.from));
    if (preferredTrackId && !target) continue;
    if (!target) { next = addTrack(next, "audio"); target = next.tracks[0]; }
    const audioId = newId();
    const audio: AudioClip = { id: audioId, kind: "audio", src: video.src, name: video.name, from: video.from, durationInFrames: video.durationInFrames, trimStart: video.trimStart, sourceDurationInFrames: video.sourceDurationInFrames, volume: video.volume, playbackRate:video.playbackRate,pan:video.pan,mix:video.mix,audioRole:video.audioRole,labelColor:video.labelColor,groupId:video.groupId,fadeIn: 0, fadeOut: 0, linkedClipId: video.id };
    const placed = mapTracks(next, (t) => ({ ...t, clips: [...t.clips.map((c): Clip => c.id === video.id ? { ...video, volume: 0, audioMode: "separate", linkedClipId: audioId } : c), ...(t.id === target!.id ? [audio] : [])] }));
    next = preferredTrackId ? overwritePlaced(next, placed, [video.id, audioId]) : placed;
  }
  return next;
};

/**
 * Agrega video al final de B1 por defecto. `from` elige posición y `videoOnly` omite el sonido.
 * Con metadatos de audio, inserta también su pareja enlazada en una pista libre.
 */
export const addVideoClip = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number; proxySrc?: string; hasAudio?: boolean },
  trackId = "V1",
  from?: number,
  videoOnly = false,
): Project => {
  const track = project.tracks.find((t) => t.id === trackId && trackFamily(t.kind) === "video");
  return track ? addSourceRange(project, media, trackId, from ?? trackEnd(track), 0, media.durationInFrames, videoOnly) : project;
};

/** Agrega música o un efecto de sonido en la pista indicada, desde el frame `from`. */
export const addAudioClip = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number },
  trackId: string,
  from: number,
): Project => addSourceRange(project, { ...media, kind: "audio" }, trackId, from);

/** Inserta un rango marcado en el monitor de origen, como video o solo audio. */
export const addSourceRange = (
  project: Project,
  media: { src: string; name: string; durationInFrames: number; proxySrc?: string; kind?: "video" | "audio"; hasAudio?: boolean },
  trackId: string,
  from: number,
  inFrame = 0,
  outFrame = media.durationInFrames,
  videoOnly = false,
  destinationOnly = false,
): Project => {
  let addedId: string | undefined;
  const next = mapTracks(project, (track) => {
    if (track.id !== trackId || track.locked) return track;
    if (trackFamily(track.kind) === "video" && media.kind === "audio") return track;
    const start = Math.max(0, Math.min(media.durationInFrames - 1, Math.round(inFrame)));
    const end = Math.max(start + 1, Math.min(media.durationInFrames, Math.round(outFrame)));
    const common = {
      id: newId(), src: media.src, name: media.name, from: Math.max(0, Math.round(from)),
      trimStart: start, durationInFrames: end - start, sourceDurationInFrames: media.durationInFrames,
    };
    const clip: VideoClip | AudioClip = track.kind !== "audio"
      ? { ...common, kind: "video", proxySrc: media.proxySrc, volume: videoOnly ? 0 : 1, audioMode: videoOnly || media.hasAudio === false ? "none" : "embedded" }
      : { ...common, kind: "audio", volume: 1, fadeIn: 0, fadeOut: 0 };
    addedId = clip.id;
    return { ...track, clips: [...track.clips, clip] };
  });
  const overwritten = addedId ? overwritePlaced(project, next, [addedId],destinationOnly) : project;
  if (addedId && media.hasAudio === true && !videoOnly && findClip(overwritten, addedId)?.clip.kind === "video") {
    const target = destinationTrack(project, "audio");
    if (!target) return project;
    const withAudio = exposeEmbeddedAudio(overwritten, [addedId], target);
    const added = findClip(withAudio, addedId)?.clip;
    return added?.kind === "video" && added.linkedClipId ? withAudio : project;
  }
  return overwritten;
};

/** Portapapeles interno inmutable. No escribe archivos ni usa el portapapeles del SO. */
export const copyClips = (project: Project, ids: string[], linked = true): Project => {
  const selected = new Set(linked ? linkedIds(project, ids) : ids);
  return structuredClone({ ...project, tracks: project.tracks.map(t => ({ ...t, clips: t.clips.filter(c => selected.has(c.id)) })) });
};

/** Alt+arrastrar: copia con IDs/enlaces nuevos y la misma sobrescritura que una colocación. */
export const duplicateClipsWithSelection = (project: Project, ids: string[], deltaFrames: number, trackOffset = 0, followLinks = true): {project:Project;ids:string[]} => {
  const unchanged={project,ids:[] as string[]};
  const selected = new Set(followLinks ? linkedIds(project, ids) : ids), vertical = new Set(ids);
  const clips = project.tracks.flatMap(t => t.clips).filter(c => selected.has(c.id));
  if (!clips.length || !Number.isFinite(deltaFrames) || !Number.isInteger(trackOffset)) return unchanged;
  if (project.tracks.some(t => t.locked && t.clips.some(c => selected.has(c.id)))) return unchanged;
  const offset = project.tracks.every((t,i) => !t.clips.some(c => vertical.has(c.id)) || project.tracks[i+trackOffset] && trackFamily(project.tracks[i+trackOffset].kind) === trackFamily(t.kind)) ? trackOffset : 0;
  if (project.tracks.some((t,i) => t.clips.some(c => vertical.has(c.id)) && project.tracks[i+offset]?.locked)) return unchanged;
  const start = Math.min(...clips.map(c => c.from)), delta = Math.max(-start,Math.round(deltaFrames));
  if (!delta && !offset) return unchanged;
  const identities=new Map(clips.map(c=>[c.id,newId()])), groups=new Map(clips.filter(c=>c.groupId).map(c=>[c.groupId!,newId()]));
  const placed=mapTracks(project,(t)=>({...t,clips:[...t.clips,...project.tracks.flatMap((source,index)=>source.clips.filter(c=>selected.has(c.id)&&project.tracks[vertical.has(c.id)?index+offset:index]?.id===t.id).map(c=>{
    const copy=structuredClone({...c,id:identities.get(c.id)!,from:c.from+delta});
    copy.groupId=copy.groupId?groups.get(copy.groupId):undefined;
    if(copy.kind==="audio"||copy.kind==="video")copy.linkedClipId=copy.linkedClipId?identities.get(copy.linkedClipId):undefined;
    if(copy.kind==="audio"&&copy.derivedFrom){const parent=identities.get(copy.derivedFrom.clipId);copy.derivedFrom=parent?{...copy.derivedFrom,clipId:parent}:undefined;}
    return copy;
  }))]}));
  const next=overwritePlaced(project,placed,[...identities.values()]);
  return {project:next,ids:[...identities.values()].filter(id=>findClip(next,id))};
};
export const duplicateClips = (project:Project,ids:string[],deltaFrames:number,trackOffset=0,followLinks=true):Project => duplicateClipsWithSelection(project,ids,deltaFrames,trackOffset,followLinks).project;

/** Pega en las mismas pistas, manteniendo offsets y remapeando las relaciones de los clips. */
export const pasteClips = (project: Project, clipboard: Project, at: number, hostId?: string, origin?: number,destinationOnly=false): Project => {
  const clips = clipboard.tracks.flatMap(t => t.clips);
  if (!clips.length || clipboard.fps !== project.fps || !Number.isFinite(at)) return project;
  // No crear referencias perdidas o recursivas entre secuencias al pegar entre montajes.
  if (clips.some(c => (c.kind === "audio" || c.kind === "video") && c.sequenceId && (!project.sequences?.[c.sequenceId] || hostId && containsSequence(project, c.sequenceId, hostId)))) return project;
  let next = project;
  const destinations = new Map<string,string>();
  for (const source of clipboard.tracks.filter(t => t.clips.length)) {
    let target = next.tracks.find(t => t.id === source.id && trackFamily(t.kind) === trackFamily(source.kind));
    if (!target && (source.kind === "audio" || source.kind === "video")) { next = addTrack(next, source.kind); target = next.tracks.find(t => !project.tracks.some(old => old.id === t.id) && ![...destinations.values()].includes(t.id)); }
    if(!target && source.kind==="graphic") {const id=`G-${newId()}`;next={...next,tracks:[...next.tracks,{id,kind:"graphic",name:source.name,clips:[]}]};target=next.tracks.at(-1);}
    target ??= next.tracks.find(t => t.kind === source.kind && ![...destinations.values()].includes(t.id));
    if (!target || target.locked) return project;
    destinations.set(source.id,target.id);
  }
  const start = origin ?? Math.min(...clips.map(c => c.from)), delta = Math.max(0,Math.round(at)) - start;
  const identities = new Map(clips.map(c => [c.id,newId()])), groups=new Map(clips.filter(c=>c.groupId).map(c=>[c.groupId!,newId()]));
  const placed = mapTracks(next,t => ({ ...t, clips: [...t.clips, ...clipboard.tracks.filter(s => destinations.get(s.id) === t.id).flatMap(s => s.clips.map(c => {
    const clip = structuredClone({ ...c, id: identities.get(c.id)!, from: c.from + delta });
    clip.groupId=clip.groupId?groups.get(clip.groupId):undefined;
    if (clip.kind === "audio" || clip.kind === "video") clip.linkedClipId = clip.linkedClipId ? identities.get(clip.linkedClipId) : undefined;
    if (clip.kind === "audio" && clip.derivedFrom) { const parent = identities.get(clip.derivedFrom.clipId); clip.derivedFrom = parent ? { ...clip.derivedFrom, clipId: parent } : undefined; }
    return clip;
  }))] }));
  return overwritePlaced(project,placed,[...identities.values()],destinationOnly);
};

/** Copia I/O de Programa sin tocar originales; conserva capas, huecos, trim y palabras. */
export const copyTimelineRange=(project:Project,start:number,end:number,mode:"auto"|"video"|"audio"="auto"):Project=>{
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>getProjectDuration(project))throw new Error("El rango marcado está fuera del montaje.");
  const embedded:AudioClip[]=[];
  const tracks:Track[]=project.tracks.filter(t=>trackOutputEnabled(project,t)).map(t=>({...t,clips:t.clips.flatMap((c):Clip[]=>{
    const a=Math.max(start,c.from),b=Math.min(end,c.from+c.durationInFrames);if(b<=a)return [];
    const part=clipSlice(c,a,b,c.id);part.from-=start;
    if(mode==="audio"&&part.kind!=="audio"){
      if(part.kind==="video"&&!part.linkedClipId&&part.audioMode!=="none"&&part.volume>0&&!part.sequenceId)embedded.push({id:part.id,kind:"audio",src:part.src,name:part.name,from:part.from,durationInFrames:part.durationInFrames,trimStart:part.trimStart,sourceDurationInFrames:part.sourceDurationInFrames,volume:part.volume,pan:part.pan,mix:part.mix,fadeIn:0,fadeOut:0});
      return [];
    }
    if(mode==="video"&&part.kind==="audio")return [];
    if(mode==="video"&&part.kind==="video"){part.volume=0;part.audioMode="none";}
    return part.kind==="caption"&&!part.words.length?[]:[part];
  })}));
  if(embedded.length)tracks.push({id:`range-audio-${newId()}`,kind:"audio",name:"Audio",clips:embedded});
  const ids=new Set(tracks.flatMap(t=>t.clips.map(c=>c.id)));
  return structuredClone({...project,markers:[],transcripts:{},tracks:tracks.map(t=>({...t,clips:t.clips.map(c=>{
    if(c.kind!=="video"&&c.kind!=="audio")return c;
    return {...c,linkedClipId:c.linkedClipId&&ids.has(c.linkedClipId)?c.linkedClipId:undefined};
  })}))});
};

/** Coloca las capas del rango en pistas compatibles desde el destino, en un solo paso. */
export const placeTimelineRange=(project:Project,clipboard:Project,trackId:string,at:number,mode:"auto"|"video"|"audio"="auto",hostId?:string):Project=>{
  const target=project.tracks.find(t=>t.id===trackId);
  if(!target||target.locked||!Number.isFinite(at)||clipboard.fps!==project.fps||target.kind!=="audio"&&mode==="audio"||target.kind==="audio"&&mode==="video")return project;
  const content=copyTimelineRange(clipboard,0,getProjectDuration(clipboard),target.kind==="audio"?"audio":mode);
  let next=project;const mapped:Track[]=[];
  const ordered=(p:Project,kind:"video"|"audio")=>{const tracks=p.tracks.filter(t=>trackFamily(t.kind)===kind);return kind==="audio"?tracks.reverse():tracks;};
  for(const kind of ["video","audio"] as const){
    const sources=ordered(content,kind).filter(t=>t.clips.length);if(!sources.length)continue;
    const base=kind===trackFamily(target.kind)?trackId:destinationTrack(next,kind);if(!base)return project;
    let offset=ordered(next,kind).findIndex(t=>t.id===base);
    for(const source of sources){let destination=ordered(next,kind)[offset++];
      if(!destination){next=addTrack(next,kind);destination=ordered(next,kind)[offset-1];}
      if(!destination||destination.locked)return project;
      mapped.push({...source,id:destination.id});
    }
  }
  const placed=pasteClips(next,{...content,tracks:mapped},at,hostId,0,mode!=="auto"||target.kind==="audio");
  return placed===next?project:placed;
};

/** Abre espacio para Origen en las pistas destino y las que siguen ripple. Transacción atómica. */
export const insertSourceRange = (project: Project, media: Parameters<typeof addSourceRange>[1], trackId: string, from: number, inFrame = 0, outFrame = media.durationInFrames, videoOnly = false): Project => {
  if (![from,inFrame,outFrame,media.durationInFrames].every(Number.isFinite) || outFrame <= inFrame) return project;
  const target = project.tracks.find(t => t.id === trackId);
  if (!target || target.locked) return project;
  const start = Math.max(0,Math.min(media.durationInFrames-1,Math.round(inFrame))), end = Math.max(start+1,Math.min(media.durationInFrames,Math.round(outFrame)));
  const at = Math.max(0,Math.round(from)), length = end-start;
  const audio = target.kind !== "audio" && !videoOnly && media.hasAudio === true ? destinationTrack(project,"audio") : undefined;
  if (target.kind !== "audio" && !videoOnly && media.hasAudio === true && !audio) return project;
  const affected = new Set(project.tracks.filter(t => t.id === trackId || t.id === audio || t.syncLock && !t.locked).map(t => t.id));
  // Incluir parejas aunque su pista no tenga syncLock, sin eludir candados.
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of project.tracks) if (affected.has(t.id)) for (const c of t.clips.filter(c => c.from+c.durationInFrames>at)) for (const id of linkedIds(project,[c.id])) {
      const mate = findClip(project,id)!; if (mate.track.locked) return project;
      if (!affected.has(mate.track.id)) { affected.add(mate.track.id); changed = true; }
    }
  }
  let next = project;
  for (const t of project.tracks.filter(t => affected.has(t.id))) for (const c of t.clips.filter(c => c.from < at && c.from+c.durationInFrames > at)) next = splitAt(next,at,c.id);
  next = mapTracks(next,t => !affected.has(t.id) ? t : ({...t,clips:t.clips.map(c => c.from>=at ? {...c,from:c.from+length}:c)}));
  const placed = addSourceRange(next,media,trackId,at,start,end,videoOnly);
  if (placed === next) return project;
  const withMarkers = { ...placed, markers: (project.markers??[]).map(m=>m.frame>=at?{...m,frame:m.frame+length}:m) };
  return preserveLocked(project,withMarkers);
};

export const addTextClip = (project:Project,opts:{text:string;from:number;durationInFrames:number;style?:Partial<TextStyle>;id?:string},trackId="T1"):Project=>{
  const target=project.tracks.find(t=>t.id===trackId);if(!target||target.locked||target.kind==="audio")return project;
  const clip:import("./types").TextClip={id:opts.id??newId(),kind:"text",text:opts.text,from:opts.from,durationInFrames:Math.max(1,Math.round(opts.durationInFrames)),style:{...DEFAULT_TEXT_STYLE,...opts.style}};
  return overwritePlaced(project,mapTracks(project,t=>t.id===trackId?{...t,clips:[...t.clips,clip]}:t),[clip.id],true);
};

export const updateClip = (project: Project, clipId: string, patch: Partial<Clip>): Project => {
  if (!clipsEditable(project, [clipId])) return project;
  const clip = findClip(project, clipId)?.clip;
  const volume = "volume" in patch && typeof patch.volume === "number" ? patch.volume : undefined;
  const linkedAudio = clip?.kind === "video" && clip.linkedClipId && volume !== undefined ? clip.linkedClipId : undefined;
  return mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.map((c) => c.id === clipId ? ({ ...c, ...patch, ...(linkedAudio ? { volume: 0 } : {}) } as Clip) : c.id === linkedAudio ? ({ ...c, volume } as Clip) : c),
  }));
};

/** Dos cortes en un clip, en una sola operación de historial. No mueve otras pistas. */
export const splitClipRange = (project: Project, clipId: string, start: number, end: number): Project => {
  const clip = findClip(project, clipId)?.clip;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return project;
  const a = Math.max(clip.from, Math.round(start)), b = Math.min(clip.from + clip.durationInFrames, Math.round(end));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return project;
  return splitAt(splitAt(project, b, clipId), a, clipId);
};

export type ProcessedStem = { role: "voice" | "background"; src: string; name: string };

/** Los resultados corresponden solo al rango visible del clip: trimStart del WAV = 0. */
export const applyProcessedAudio = (project: Project, clipId: string, stems: ProcessedStem[], mode: string): Project => {
  if (!clipsEditable(project, [clipId])) return project;
  if (project.tracks.some((t) => t.locked && t.clips.some((c) => c.kind === "audio" && c.derivedFrom?.clipId === clipId))) return project;
  const clip = findClip(project, clipId)?.clip;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio") || !stems.length) return project;
  const prior = project.tracks.flatMap((t) => t.clips).find((c): c is AudioClip => c.kind === "audio" && c.derivedFrom?.clipId === clipId);
  const originalVolume = prior?.derivedFrom?.originalVolume ?? effectiveVolume(project, clip);
  const clean = restoreOriginalAudio(project, clipId);
  const silenced = updateClip(clean, clipId, { volume: 0 });
  const tracks = silenced.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
  for (const stem of stems) {
    const trackId = `A_LOCAL_${stem.role}_${clipId}`;
    const audio: AudioClip = {
      id: newId(), kind: "audio", src: stem.src, name: stem.name, from: clip.from,
      durationInFrames: clip.durationInFrames, sourceDurationInFrames: clip.durationInFrames,
      trimStart: 0, volume: stem.role === "background" && mode === "separate-clean" ? 0 : originalVolume,
      fadeIn: clip.kind === "audio" ? clip.fadeIn : 0, fadeOut: clip.kind === "audio" ? clip.fadeOut : 0,
      derivedFrom: { clipId, src: clip.src, originalVolume, mode },
    };
    const existing = tracks.find((t) => t.id === trackId);
    if (existing) existing.clips.push(audio);
    else tracks.unshift({ id: trackId, kind: "audio", name: stem.name, clips: [audio] });
  }
  return nameTracks({ ...clean, tracks });
};

export const restoreOriginalAudio = (project: Project, clipId: string): Project => {
  if (!clipsEditable(project, [clipId]) || project.tracks.some((t) => t.locked && t.clips.some((c) => c.kind === "audio" && c.derivedFrom?.clipId === clipId))) return project;
  const prior = project.tracks.flatMap((t) => t.clips).find((c): c is AudioClip => c.kind === "audio" && c.derivedFrom?.clipId === clipId);
  if (!prior?.derivedFrom) return project;
  const volume = prior.derivedFrom.originalVolume;
  const cleaned = { ...project, tracks: project.tracks.map((t) => ({ ...t, clips: t.clips
    .filter((c) => !(c.kind === "audio" && c.derivedFrom?.clipId === clipId))
    }))
    .filter((t) => t.clips.length || ![ `A_LOCAL_voice_${clipId}`, `A_LOCAL_background_${clipId}` ].includes(t.id)) };
  return nameTracks(updateClip(cleaned, clipId, { volume }));
};

/** Mueve un clip en el tiempo y, opcionalmente, a otra pista del mismo tipo (ej. A1 → A2). */
export const moveClip = (project: Project, clipId: string, from: number, toTrackId?: string): Project => {
  const found = findClip(project, clipId);
  if (!found) return project;
  const target = project.tracks.findIndex((t) => t.id === toTrackId && trackFamily(t.kind) === trackFamily(found.track.kind));
  return moveClips(project, [clipId], from - found.clip.from, target < 0 ? 0 : target - project.tracks.indexOf(found.track));
};

export const deleteClip = (project: Project, clipId: string): Project =>
  deleteClips(project, [clipId]);

/** Un único desplazamiento para conservar las distancias del grupo, también al llegar a cero. */
export const moveClips = (project: Project, ids: string[], deltaFrames: number, trackOffset = 0): Project => {
  const selected = new Set(linkedIds(project, ids)), vertical = new Set(ids);
  const clips = project.tracks.flatMap((t) => t.clips).filter((c) => selected.has(c.id));
  if (!clips.length || !clipsEditable(project, ids) || !Number.isFinite(deltaFrames) || !Number.isInteger(trackOffset)) return project;
  const delta = Math.max(-Math.min(...clips.map((c) => c.from)), Math.round(deltaFrames));
  const validOffset = project.tracks.every((track, index) => !track.clips.some((c) => vertical.has(c.id)) || project.tracks[index + trackOffset] && trackFamily(project.tracks[index + trackOffset].kind) === trackFamily(track.kind)) ? trackOffset : 0;
  if (project.tracks.some((t, i) => t.clips.some((c) => vertical.has(c.id)) && project.tracks[i + validOffset]?.locked)) return project;
  if (!delta && !validOffset) return project;
  const placed = { ...project, tracks: project.tracks.map((track, index) => ({ ...track, clips: !validOffset ? track.clips.map((c) => selected.has(c.id) ? { ...c, from: c.from + delta } : c) : [
    ...track.clips.filter((c) => !vertical.has(c.id)).map((c) => selected.has(c.id) ? { ...c, from: c.from + delta } : c),
    ...(project.tracks[index - validOffset]?.clips ?? []).filter((c) => vertical.has(c.id)).map((c) => ({ ...c, from: c.from + delta })),
  ] })) };
  return overwritePlaced(project, placed, [...selected]);
};

/** Borrado de selección en una transacción; ripple cierra la unión de sus huecos por pista. */
export const deleteClips = (project: Project, ids: string[], ripple = false): Project => {
  if (!clipsEditable(project, ids)) return project;
  const selected = new Set(linkedIds(project, ids));
  const next = mapTracks(project, (track) => {
    const ranges: { start: number; end: number }[] = [];
    if (ripple) for (const clip of track.clips.filter((c) => selected.has(c.id)).sort((a, b) => a.from - b.from)) {
      const last = ranges.at(-1), end = clip.from + clip.durationInFrames;
      if (last && clip.from <= last.end) last.end = Math.max(last.end, end);
      else ranges.push({ start: clip.from, end });
    }
    return { ...track, clips: track.clips.filter((c) => !selected.has(c.id)).map((c) => ({ ...c, from: c.from - ranges.reduce((sum, r) => sum + (r.end <= c.from ? r.end - r.start : 0), 0) })) };
  });
  const anchors = new Set(project.tracks.filter((t) => t.clips.some((c) => selected.has(c.id))).map((t) => t.id));
  const gaps = project.tracks.flatMap((t) => t.clips.filter((c) => selected.has(c.id)).map((c) => ({ start: c.from, end: c.from + c.durationInFrames })));
  return ripple ? preserveLocked(project, alignLinkedChanges(project, rippleFollowers(project, next, anchors, gaps))) : next;
};

/** Borra el clip y corre hacia la izquierda los clips que venían después (como "Ripple Delete"). */
export const rippleDeleteClip = (project: Project, clipId: string): Project => {
  return deleteClips(project, [clipId], true);
};

/** Corta cualquier clip que pase por el frame indicado (como la herramienta Razor / Cmd+K). */
export const splitAt = (project: Project, frame: number, onlyClipId?: string): Project => {
  const targets = new Set(onlyClipId ? clipsEditable(project, [onlyClipId]) ? linkedIds(project, [onlyClipId]) : [] : project.tracks.flatMap((t) => t.clips.filter((c) => clipsEditable(project, [c.id])).map((c) => c.id)));
  const rightIds = new Map(project.tracks.flatMap((t) => t.clips).filter((c) => (!targets || targets.has(c.id)) && frame > c.from && frame < c.from + c.durationInFrames).map((c) => [c.id, newId()]));
  return mapTracks(project, (track) => ({
    ...track,
    clips: track.clips.flatMap((c): Clip[] => {
      if (targets && !targets.has(c.id)) return [c];
      const offset = frame - c.from;
      if (offset <= 0 || offset >= c.durationInFrames) return [c];
      const left = { ...sliceClipEdges(c,0,offset), ...(c.motion?{motion:sliceMotion(c,0)}:{}), durationInFrames: offset };
      const right = { ...sliceClipEdges(c,offset,c.durationInFrames-offset), ...(c.motion?{motion:sliceMotion(c,offset)}:{}), id: rightIds.get(c.id)!, from: frame, durationInFrames: c.durationInFrames - offset };
      if ((right.kind === "video" || right.kind === "audio") && right.linkedClipId) right.linkedClipId = rightIds.get(right.linkedClipId);
      if (right.kind === "audio" && right.derivedFrom && rightIds.has(right.derivedFrom.clipId)) right.derivedFrom = { ...right.derivedFrom, clipId: rightIds.get(right.derivedFrom.clipId)! };
      if (right.kind === "video" || right.kind === "audio") right.trimStart = sourceFrame(c as VideoClip | AudioClip, offset);
      if (left.kind === "caption" && right.kind === "caption" && c.kind === "caption") {
        left.words = c.words.filter((w) => w.start < offset).map((w) => ({ ...w, end: Math.min(w.end, offset) }));
        right.words = c.words.filter((w) => w.end > offset).map((w) => ({ ...w, start: Math.max(0, w.start - offset), end: w.end - offset }));
      }
      if (left.kind === "audio") left.fadeOut = 0; // el fade queda solo al final real del clip
      if (right.kind === "audio") right.fadeIn = 0;
      return [left, right as Clip];
    }),
  }));
};

/** Ajusta el inicio o el final de un clip sin salirse del archivo original. */
const trimSingle = (
  project: Project,
  clipId: string,
  edge: "start" | "end",
  deltaFrames: number,
): Project => {
  const found = findClip(project, clipId);
  if (!found) return project;
  const c = found.clip;
  const d = Math.round(deltaFrames);
  if (edge === "end") {
    let duration = Math.max(1, c.durationInFrames + d);
    if (c.kind === "video" || c.kind === "audio") duration = Math.min(duration, availableFrames(c));
    return updateClip(project, clipId, { durationInFrames: duration,...(c.kind==="caption"?{words:c.words.filter(w=>w.start<duration).map(w=>({...w,end:Math.min(duration,w.end)}))}:{}) });
  }
  // start: positivo recorta, negativo extiende hacia atrás
  let delta = Math.min(d, c.durationInFrames - 1);
  delta = Math.max(delta, -c.from);
  if (c.kind === "video" || c.kind === "audio") delta = Math.max(delta, -Math.floor(c.trimStart / (c.playbackRate ?? 1)));
  const patch: Partial<Clip> = { from: c.from + delta, durationInFrames: c.durationInFrames - delta, ...(c.motion?{motion:sliceMotion(c,delta)}:{}) };
  if (c.kind === "video" || c.kind === "audio") (patch as Partial<VideoClip>).trimStart = sourceFrame(c, delta);
  if(c.kind==="caption")(patch as Partial<CaptionClip>).words=c.words.filter(w=>w.end>delta).map(w=>({...w,start:Math.max(0,w.start-delta),end:w.end-delta}));
  return updateClip(project, clipId, patch);
};

export const trimClip = (project: Project, id: string, edge: "start" | "end", deltaFrames: number): Project => {
  if (!findClip(project, id) || !clipsEditable(project, [id]) || !Number.isFinite(deltaFrames)) return project;
  const ids = linkedIds(project, [id]);
  let delta = Math.round(deltaFrames);
  for (const clipId of ids) {
    const before = findClip(project, clipId)!.clip, after = findClip(trimSingle(project, clipId, edge, delta), clipId)!.clip;
    delta = edge === "start" ? after.from - before.from : after.durationInFrames - before.durationInFrames;
  }
  return overwritePlaced(project, ids.reduce((p, clipId) => trimSingle(p, clipId, edge, delta), project), ids);
};

/** Cambia el contenido visible sin mover los bordes del clip. */
export const slipClip = (project: Project, clipId: string, deltaFrames: number): Project => {
  if (!clipsEditable(project, [clipId])) return project;
  const clip = findClip(project, clipId)?.clip;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio") || clip.kind === "video" && clip.freezeFrame !== undefined || !Number.isFinite(deltaFrames)) return project;
  const trimStart = Math.max(0, Math.min(clip.sourceDurationInFrames - Math.ceil(clip.durationInFrames * (clip.playbackRate ?? 1)), clip.trimStart + Math.round(deltaFrames * (clip.playbackRate ?? 1))));
  let delta = trimStart - clip.trimStart;
  const ids = linkedIds(project, [clipId]);
  for (const id of ids) { const other = findClip(project, id)!.clip; if (other.kind === "video" || other.kind === "audio") delta = Math.max(-other.trimStart, Math.min(delta, other.sourceDurationInFrames - Math.ceil(other.durationInFrames * (other.playbackRate ?? 1)) - other.trimStart)); }
  return !delta ? project : ids.reduce((p, id) => { const c = findClip(p, id)!.clip; return c.kind === "video" || c.kind === "audio" ? updateClip(p, id, { trimStart: c.trimStart + delta }) : p; }, project);
};

/** Recorte ripple en la pista del clip: conserva su inicio y desplaza los clips posteriores. */
const rippleTrimSingle = (project: Project, clipId: string, edge: "start" | "end", deltaFrames: number): Project => {
  const found = findClip(project, clipId);
  if (!found || !Number.isFinite(deltaFrames)) return project;
  const { clip, track } = found, oldEnd = clip.from + clip.durationInFrames;
  if (clip.kind !== "video" && clip.kind !== "audio") return project;
  // Un solapamiento requiere una decisión sobre las capas: no se cierra a ciegas.
  if (track.clips.some((other) => other.id !== clip.id && other.from < oldEnd && other.from + other.durationInFrames > clip.from)) return project;
  let delta = Math.round(deltaFrames);
  if (edge === "start") {
    delta = Math.min(delta, clip.durationInFrames - 1);
    delta = Math.max(delta, -Math.floor(clip.trimStart / (clip.playbackRate ?? 1)));
  } else {
    delta = Math.max(delta, 1 - clip.durationInFrames);
    if (clip.kind === "video" || clip.kind === "audio") delta = Math.min(delta, availableFrames(clip) - clip.durationInFrames);
  }
  if (!delta) return project;
  const durationDelta = edge === "start" ? -delta : delta;
  return mapTracks(project, (t) => t.id !== track.id ? t : { ...t, clips: t.clips.map((c): Clip => {
    if (c.id === clip.id) return { ...c, durationInFrames: c.durationInFrames + durationDelta, ...((c.kind === "audio" || c.kind === "video") && edge === "start" ? { trimStart: sourceFrame(c, delta) } : {}) };
    return c.from >= oldEnd ? { ...c, from: c.from + durationDelta } : c;
  }) });
};

export const rippleTrimClip = (project: Project, clipId: string, edge: "start" | "end", deltaFrames: number): Project => {
  if (!clipsEditable(project, [clipId])) return project;
  const ids = linkedIds(project, [clipId]); let delta = deltaFrames;
  for (const id of ids) {
    const before = findClip(project, id)?.clip, after = findClip(rippleTrimSingle(project, id, edge, delta), id)?.clip;
    if (!before || !after) return project;
    delta = (after.durationInFrames - before.durationInFrames) * (edge === "start" ? -1 : 1);
    if (!delta) return project;
  }
  let next = ids.reduce((p, id) => rippleTrimSingle(p, id, edge, delta), project);
  const clip = findClip(project, clipId)!.clip, anchors = new Set(ids.map((id) => findClip(project, id)!.track.id));
  const lengthDelta = delta * (edge === "start" ? -1 : 1), end = clip.from + clip.durationInFrames;
  if (lengthDelta < 0) next = rippleFollowers(project, next, anchors, [{ start: end + lengthDelta, end }]);
  else {
    const followers = project.tracks.filter((t) => t.syncLock && !t.locked && !anchors.has(t.id)).flatMap((t) => t.clips.filter((c) => c.from >= end && clipsEditable(project, [c.id]) && linkedIds(project, [c.id]).every((id) => !anchors.has(findClip(project, id)!.track.id))).flatMap((c) => linkedIds(project, [c.id])));
    const following = new Set(followers);
    next = mapTracks(next, (t) => ({ ...t, clips: t.clips.map((c) => following.has(c.id) ? { ...c, from: c.from + lengthDelta } : c) }));
  }
  return preserveLocked(project, alignLinkedChanges(project, next));
};

/** Asigna el proxy de vista previa a todos los clips de un archivo. */
export const setProxy = (project: Project, src: string, proxySrc: string): Project =>
  mapTracks(project, (t) => ({
    ...t,
    clips: t.clips.map((c) => (c.kind === "video" && c.src === src ? { ...c, proxySrc } : c)),
  }));

/** Reconecta los clips de un archivo perdido a uno nuevo (como "Link Media" en Premiere). */
export const relinkMedia = (project: Project, oldSrc: string, newSrc: string, proxySrc?: string): Project => {
  const relinked = mapTracks(project, (t) => ({
    ...t,
    clips: t.clips.map((c) => ((c.kind === "video" || c.kind === "audio") && c.src === oldSrc ? { ...c, src: newSrc, ...(c.kind === "video" ? { proxySrc } : {}) } : c)),
  }));
  const transcript = project.transcripts?.[oldSrc];
  if (!transcript) return relinked;
  const { [oldSrc]: _, ...rest } = project.transcripts!;
  return { ...relinked, transcripts: { ...rest, [newSrc]: transcript } };
};

// --- Transcripción y subtítulos -------------------------------------------------

/** Proyectos guardados antes de la Fase 1 no tienen pista de subtítulos. */
const ensureCaptionTrack = (project: Project): Project =>
  project.tracks.some((t) => t.id === "S1")
    ? project
    : nameTracks({ ...project, tracks: [...project.tracks, { id: "S1", kind: "caption", name: "", clips: [] }] });

export const setTranscript = (project: Project, src: string, words: Word[], info?: NonNullable<Project["transcriptInfo"]>[string]): Project => ({
  ...project,
  transcripts: { ...project.transcripts, [src]: words },
  ...(info ? { transcriptInfo: { ...project.transcriptInfo, [src]: info } } : {}),
});

/** Conserva rangos del montaje completo y cierra los huecos en todas las pistas a la vez. */
export const keepTimelineRanges = (project: Project, ranges: { start: number; end: number }[]): Project => {
  if (project.tracks.some((t) => t.locked && t.clips.length)) throw new Error("Desbloquea las pistas antes de aplicar un resumen a todo el montaje.");
  const duration = getProjectDuration(project);
  if (!ranges.length || ranges.some((r, i) => !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end <= r.start || r.end > duration || (i > 0 && r.start < ranges[i - 1].end))) throw new Error("Los rangos deben estar ordenados, dentro del montaje y sin solaparse.");
  const identities = new Map<string, string>(), seen = new Set<string>();
  for (const [index, range] of ranges.entries()) for (const track of project.tracks) for (const clip of track.clips) {
    if (clip.from < range.end && clip.from + clip.durationInFrames > range.start) {
      identities.set(`${index}:${clip.id}`, seen.has(clip.id) ? newId() : clip.id); seen.add(clip.id);
    }
  }
  let markerCursor = 0;
  const markers = ranges.flatMap((range) => { const mapped = (project.markers ?? []).filter((m) => m.frame >= range.start && m.frame < range.end).map((m) => ({ ...m, frame: markerCursor + m.frame - range.start })); markerCursor += range.end - range.start; return mapped; });
  return { ...project, markers, tracks: project.tracks.map((track) => {
    let cursor = 0;
    const clips: Clip[] = [];
    ranges.forEach((range, index) => {
      for (const clip of track.clips) {
        const a = Math.max(clip.from, range.start), b = Math.min(clip.from + clip.durationInFrames, range.end);
        if (b <= a) continue;
        const offset = a - clip.from, length = b - a;
        const base = { ...sliceClipEdges(clip,offset,length), id: identities.get(`${index}:${clip.id}`)!, from: cursor + a - range.start, durationInFrames: length };
        if (base.kind === "video" || base.kind === "audio") {
          base.trimStart = sourceFrame(base, offset);
          if (base.linkedClipId) base.linkedClipId = identities.get(`${index}:${base.linkedClipId}`);
          if (base.kind === "audio") {
            base.fadeIn = offset === 0 ? Math.min(base.fadeIn, length) : 0;
            base.fadeOut = b === clip.from + clip.durationInFrames ? Math.min(base.fadeOut, length) : 0;
            if (base.derivedFrom) base.derivedFrom = { ...base.derivedFrom, clipId: identities.get(`${index}:${base.derivedFrom.clipId}`) ?? base.derivedFrom.clipId };
          }
        } else if (base.kind === "caption") {
          base.words = base.words.filter((w) => w.end > offset && w.start < offset + length).map((w) => ({ ...w, start: Math.max(0, w.start - offset), end: Math.min(length, w.end - offset) }));
          if (!base.words.length) continue;
        }
        clips.push(base);
      }
      cursor += range.end - range.start;
    });
    return { ...track, clips };
  }) };
};

/** Palabras de un clip de video, ya convertidas a frames de la línea de tiempo. */
export const wordsOnTimeline = (project: Project, clip: VideoClip|AudioClip): Word[] => {
  const words = project.transcripts?.[transcriptSource(clip)] ?? [];
  if (clip.kind==="video"&&clip.freezeFrame !== undefined) return [];
  const rate = clip.playbackRate ?? 1, inEnd = sourceFrame(clip, clip.durationInFrames);
  return words
    .filter((w) => w.start >= clip.trimStart && w.start < inEnd)
    .map((w) => ({ text: w.text, start: clip.from + Math.round((w.start - clip.trimStart) / rate), end: clip.from + Math.round((Math.min(w.end, inEnd) - clip.trimStart) / rate) }));
};

export type CaptionOptions = {
  maxWords: number; // palabras máximas por bloque
  maxChars: number; // caracteres máximos por bloque
  breakOnPauseFrames: number; // pausa que obliga a empezar un bloque nuevo
  style?: Partial<CaptionStyle>;
};

export const DEFAULT_CAPTION_OPTIONS: CaptionOptions = { maxWords: 3, maxChars: 18, breakOnPauseFrames: 12 };

/** Genera subtítulos desde la pista visual de destino con video, sin borrar otros tipos de clip. */
export const generateCaptions = (project: Project, opts: CaptionOptions = DEFAULT_CAPTION_OPTIONS): Project => {
  if (project.tracks.find((t) => t.id === "S1")?.locked) return project;
  const p = ensureCaptionTrack(project);
  const preferred=destinationTrack(p,"video");
  const video = p.tracks.find(t=>t.id===preferred&&t.clips.some(c=>c.kind==="video"))??p.tracks.find(t=>t.clips.some(c=>c.kind==="video"))??p.tracks.find(t=>t.clips.some(c=>c.kind==="audio"));
  if (!video) return p;
  const words = video.clips
    .filter((c): c is VideoClip|AudioClip => c.kind === "video"||c.kind==="audio")
    .flatMap((c) => wordsOnTimeline(p, c))
    .sort((a, b) => a.start - b.start);

  const pages: Word[][] = [];
  for (const w of words) {
    const page = pages[pages.length - 1];
    const prev = page?.[page.length - 1];
    const chars = page ? page.map((x) => x.text).join(" ").length + 1 + w.text.length : 0;
    const startNew =
      !page ||
      page.length >= opts.maxWords ||
      chars > opts.maxChars ||
      w.start - prev!.end > opts.breakOnPauseFrames ||
      /[.!?]$/.test(prev!.text);
    if (startNew) pages.push([w]);
    else page.push(w);
  }

  const style = { ...DEFAULT_CAPTION_STYLE, ...opts.style };
  const clips: CaptionClip[] = pages.map((page, i) => {
    const from = page[0].start;
    const next = pages[i + 1]?.[0].start ?? Infinity;
    // El bloque se queda en pantalla hasta el siguiente, salvo que haya una pausa larga.
    const end = Math.min(next, page[page.length - 1].end + opts.breakOnPauseFrames);
    return {
      id: newId(),
      kind: "caption",
      from,
      durationInFrames: Math.max(1, end - from),
      words: page.map((w) => ({ text: w.text, start: w.start - from, end: w.end - from })),
      style,
    };
  });
  let output=p;let target=p.tracks.find(t=>t.id==="S1");
  if(target?.clips.some(c=>c.kind!=="caption")){target=p.tracks.find(t=>t.id!=="S1"&&t.kind==="caption"&&!t.locked&&t.clips.every(c=>c.kind==="caption"));if(!target){target={id:`S-${newId()}`,kind:"caption",name:"",clips:[]};output=nameTracks({...p,tracks:[...p.tracks,target]});}}
  return mapTracks(output,t=>t.id===target?.id?{...t,clips}:t);
};

/** Cambia el estilo de todos los subtítulos a la vez. */
export const styleAllCaptions = (project: Project, patch: Partial<CaptionStyle>): Project =>
  mapTracks(project, (t) => t.locked ? t : ({
    ...t,
    clips: t.clips.map((c) => (c.kind === "caption" ? { ...c, style: { ...c.style, ...patch } } : c)),
  }));

/** Edita el texto de un bloque. Si cambia la cantidad de palabras, reparte el tiempo en partes iguales. */
export const setCaptionText = (project: Project, clipId: string, text: string): Project => {
  const found = findClip(project, clipId);
  if (!found || found.clip.kind !== "caption") return project;
  const c = found.clip;
  const tokens = text.split(/\s+/).filter(Boolean);
  let words: Word[];
  if (tokens.length === c.words.length) {
    words = c.words.map((w, i) => ({ ...w, text: tokens[i] }));
  } else {
    const step = c.durationInFrames / Math.max(1, tokens.length);
    words = tokens.map((t, i) => ({ text: t, start: Math.round(i * step), end: Math.round((i + 1) * step) }));
  }
  return updateClip(project, clipId, { words } as Partial<CaptionClip>);
};

/**
 * Corta los silencios de los clips de V1 usando la transcripción ("jump cuts").
 * Deja `padFrames` antes y después de cada frase y cierra los huecos.
 */
export const removeSilences = (
  project: Project,
  opts: { minSilenceFrames: number; padFrames: number } = { minSilenceFrames: 15, padFrames: 4 },
): Project => {
  if (!clipsEditable(project, project.tracks.find((t) => t.id === "V1")?.clips.map((c) => c.id) ?? [])) return project;
  const audioPieces = new Map<string, AudioClip[]>();
  if(project.tracks.flatMap(t=>t.clips).some(c=>(c.kind==="video"||c.kind==="audio")&&((c.playbackRate??1)!==1||c.kind==="video"&&c.freezeFrame!==undefined))) throw new Error("Quitar silencios en clips con velocidad o congelados todavía no está disponible. Hazlo antes de cambiar la velocidad.");
  const next = mapTracks(project, (track) => {
    if (track.id !== "V1") return track;
    const sorted = [...track.clips].sort((a, b) => a.from - b.from);
    const out: Clip[] = [];
    let shift = 0;
    for (const clip of sorted) {
      const push = (part: Clip) => {
        const mate = clip.kind === "video" && clip.linkedClipId ? findClip(project, clip.linkedClipId)?.clip : null;
        if (mate?.kind === "audio" && part.kind === "video" && clip.kind === "video") {
          const id = part.id === clip.id ? mate.id : newId();
          part = { ...part, linkedClipId: id };
          const fragment: AudioClip = { ...mate, id, linkedClipId: part.id, from: part.from, durationInFrames: part.durationInFrames, trimStart: mate.trimStart + part.trimStart - clip.trimStart, fadeIn: part.trimStart === clip.trimStart ? mate.fadeIn : 0, fadeOut: part.trimStart + part.durationInFrames === clip.trimStart + clip.durationInFrames ? mate.fadeOut : 0 };
          audioPieces.set(mate.id, [...audioPieces.get(mate.id) ?? [], fragment]);
        }
        out.push(part);
      };
      const words = clip.kind === "video" ? project.transcripts?.[clip.src] : undefined;
      if (clip.kind !== "video" || !words?.length) {
        push({ ...clip, from: clip.from - shift });
        continue;
      }
      const inStart = clip.trimStart;
      const inEnd = clip.trimStart + clip.durationInFrames;
      // Rangos con voz (en frames del archivo), unidos si la pausa es corta.
      const ranges: [number, number][] = [];
      for (const w of words) {
        if (w.end <= inStart || w.start >= inEnd) continue;
        const a = Math.max(inStart, w.start - opts.padFrames);
        const b = Math.min(inEnd, w.end + opts.padFrames);
        const last = ranges[ranges.length - 1];
        if (last && a - last[1] < opts.minSilenceFrames) last[1] = Math.max(last[1], b);
        else ranges.push([a, b]);
      }
      if (ranges.length === 0) {
        push({ ...clip, from: clip.from - shift });
        continue;
      }
      let cursor = clip.from - shift;
      ranges.forEach(([a, b], i) => {
        push({ ...clip, id: i === 0 ? clip.id : newId(), from: cursor, trimStart: a, durationInFrames: b - a });
        cursor += b - a;
      });
      shift += clip.durationInFrames - (cursor - (clip.from - shift));
    }
    return { ...track, clips: out };
  });
  return mapTracks(next, (t) => ({ ...t, clips: t.clips.flatMap((c) => audioPieces.get(c.id) ?? [c]) }));
};

/** Controles constantes: una operación por gesto y los mismos valores en preview/exportación. */
export const setClipEffects=(p:Project,ids:string[],patch:ClipEffects):Project=>{
  if(!validEffects(patch))throw new Error("Parámetros de efecto inválidos");
  const targets=ids.map(id=>findClip(p,id));if(!targets.length||targets.some(t=>!t||t.track.locked||t.clip.kind==="audio"))return p;
  if(targets.some(t=>t!.clip.kind==="graphic"&&t!.clip.shape==="adjustment")&&Object.keys(patch).some(k=>!["brightness","contrast","saturation"].includes(k)))throw new Error("La capa de ajuste admite brillo, contraste y saturación en Propiedades");
  return mapTracks(p,t=>({...t,clips:t.clips.map(c=>ids.includes(c.id)?c.kind==="graphic"&&c.shape==="adjustment"?{...c,...patch}:{...c,effects:{...c.effects,...patch}}:c)}));
};
export const resetClipEffects=(p:Project,ids:string[]):Project=>mapTracks(p,t=>t.locked?t:{...t,clips:t.clips.map(c=>ids.includes(c.id)?{...c,effects:undefined,transitionIn:undefined,transitionOut:undefined,...(c.kind==="audio"?{crossfadeIn:undefined,fadeIn:0,fadeOut:0}: {})}:c)});
export const setTrackMix=(p:Project,id:string,patch:{volume?:number;pan?:number}):Project=>{if(patch.volume!==undefined&&(!Number.isFinite(patch.volume)||patch.volume<0||patch.volume>4)||patch.pan!==undefined&&(!Number.isFinite(patch.pan)||Math.abs(patch.pan)>1))throw new Error("Nivel o panorama inválido");return mapTracks(p,t=>t.id===id&&t.kind==="audio"&&!t.locked?{...t,...patch}:t);};
export const setMasterVolume=(p:Project,volume:number):Project=>{if(!Number.isFinite(volume)||volume<0||volume>4)throw new Error("Volumen maestro inválido");return{...p,masterVolume:volume};};
export const setClipPan=(p:Project,ids:string[],pan:number):Project=>{if(!Number.isFinite(pan)||Math.abs(pan)>1)throw new Error("Panorama inválido");return mapTracks(p,t=>t.locked?t:{...t,clips:t.clips.map(c=>ids.includes(c.id)&&(c.kind==="video"||c.kind==="audio")?{...c,pan}:c)});};
export const setAudioRole=(p:Project,ids:string[],role:"dialogue"|"music"|"sfx"|"ambience"):Project=>mapTracks(p,t=>t.locked?t:{...t,clips:t.clips.map(c=>ids.includes(c.id)&&(c.kind==="audio"||c.kind==="video")?{...c,audioRole:role}:c)});
export const applyEffectPreset=(p:Project,ids:string[],presetId:string,frames=Math.round(p.fps*.5),edge:"start"|"end"="start"):Project=>{
 const preset=presetById(presetId);if(!preset)throw new Error("No existe ese efecto");if(!Number.isInteger(frames)||frames<1||frames>p.fps*10)throw new Error("La transición debe durar de un frame a diez segundos");
 if(ids.some(id=>!findClip(p,id)))throw new Error("La selección cambió; vuelve a consultar el montaje");
 let targets=[...new Set(ids)].map(id=>findClip(p,id)).filter((v):v is NonNullable<typeof v>=>Boolean(v));
 if(preset.audio){targets=targets.map(t=>t.clip.kind==="video"&&t.clip.linkedClipId?findClip(p,t.clip.linkedClipId)??t:t);targets=[...new Map(targets.map(t=>[t.clip.id,t])).values()];}
 targets=targets.filter(t=>preset.audio?t.clip.kind==="audio":t.clip.kind!=="audio");
 if(!targets.length||targets.some(t=>t.track.locked))throw new Error(preset.audio?"Selecciona audio editable (o su video enlazado)":"Selecciona imagen, texto o gráficos en una pista desbloqueada");
 if(targets.some(t=>t.clip.kind==="graphic"&&t.clip.shape==="adjustment")&&!preset.patch)throw new Error("Las transiciones se aplican a clips visuales; para esta capa de ajuste usa color básico en Propiedades");
 if(preset.patch)return setClipEffects(p,targets.map(t=>t.clip.id),preset.patch);
 const outgoingIds=new Set<string>();if(preset.transition&&edge==="end"&&targets.length>1)targets=[targets.reduce((a,b)=>a.clip.from>b.clip.from?a:b)];
 if(preset.transition&&edge==="end")targets=targets.map(t=>{const next=adjacentNext(t.track,t.clip);if(!next)outgoingIds.add(t.clip.id);return next?{track:t.track,clip:next}:t;});
 if(preset.transition||preset.audio==="linear"||preset.audio==="equalPower"){const selected=new Set(targets.map(t=>t.clip.id)),rights=targets.filter(t=>{const previous=adjacentPrevious(t.track,t.clip);return previous&&selected.has(previous.id);});if(rights.length)targets=rights;}
 if(preset.audio==="linear"||preset.audio==="equalPower")for(const {clip,track}of targets){const previous=adjacentPrevious(track,clip);const pre=Math.floor(frames/2),post=frames-pre;if(clip.kind!=="audio"||previous?.kind!=="audio"||clip.sequenceId||previous.sequenceId||track.locked||clip.trimStart<pre*(clip.playbackRate??1)||availableFrames(previous)-previous.durationInFrames<post)throw new Error("El crossfade necesita dos clips contiguos con material extra antes y después del corte. Recorta sus extremos o utiliza fundidos de entrada/salida.");}
 const targetIds=new Set(targets.map(t=>t.clip.id));return mapTracks(p,t=>({...t,clips:t.clips.map(c=>{if(!targetIds.has(c.id))return c;if(preset.transition){const out=outgoingIds.has(c.id);return{...c,[out?"transitionOut":"transitionIn"]:{type:preset.transition,frames} as VideoTransition};}if(c.kind!=="audio")return c;if(preset.audio==="linear"||preset.audio==="equalPower")return{...c,crossfadeIn:{curve:preset.audio,frames}};return{...c,...(preset.audio==="in"||preset.audio==="both"?{fadeIn:Math.min(frames,c.durationInFrames)}:{}),...(preset.audio==="out"||preset.audio==="both"?{fadeOut:Math.min(frames,c.durationInFrames)}:{})};})}));
};

export const importSubtitleBlocks=(p:Project,blocks:{start:number;end:number;text:string}[]):Project=>{if(!blocks.length||blocks.some(b=>!Number.isSafeInteger(b.start)||b.start<0||!Number.isSafeInteger(b.end)||b.end<=b.start||!b.text.trim()))throw new Error("Subtítulos inválidos");const clips:CaptionClip[]=blocks.map(b=>{const tokens=b.text.trim().split(/\s+/),duration=b.end-b.start;return{id:newId(),kind:"caption",from:b.start,durationInFrames:duration,style:{...DEFAULT_CAPTION_STYLE},words:tokens.map((text,i)=>({text,start:Math.floor(i*duration/tokens.length),end:Math.floor((i+1)*duration/tokens.length)}))};});return nameTracks({...p,tracks:[...p.tracks,{id:`S-${newId()}`,kind:"caption",name:"",clips}]});};
export const setTranscriptWord=(p:Project,src:string,index:number,text:string):Project=>{const words=p.transcripts?.[src];if(!words||!Number.isInteger(index)||!words[index]||!text.trim()||words[index].text===text.trim())return p;return setTranscript(p,src,words.map((w,i)=>i===index?{...w,text:text.trim()}:w),p.transcriptInfo?.[src]);};

/** Cambios de motor/animación son ediciones del documento, atómicas y protegidas. */
export const setClipMotion=(p:Project,ids:string[],patch:Partial<ClipMotion>,engine?:RenderEngine):Project=>{
  if(!ids.length||!clipsEditable(p,ids)||Object.keys(patch).some(k=>!Object.keys(DEFAULT_MOTION).includes(k)))return p;
  const targets=ids.map(id=>findClip(p,id)?.clip);
  if(targets.some(c=>!c||!motionSupported(c)||engine!==undefined&&engine!=="remotion"&&engine!=="hyperframes"||engine==="hyperframes"&&!hyperframesSupported(c!)))return p;
  if(targets.some(c=>!validMotion({...DEFAULT_MOTION,...c!.motion,...patch})))return p;
  return mapTracks(p,t=>({...t,clips:t.clips.map(c=>ids.includes(c.id)?{...c,...(c.motion||Object.keys(patch).length?{motion:structuredClone({...DEFAULT_MOTION,...c.motion,...patch})}:{}),...(engine?{renderEngine:engine}:{})}:c)}));
};
export const resetClipMotion=(p:Project,ids:string[]):Project=>!clipsEditable(p,ids)?p:mapTracks(p,t=>({...t,clips:t.clips.map(c=>ids.includes(c.id)?{...c,motion:undefined,renderEngine:undefined}:c)}));

/** Coloca una escena estructurada, no código, en una sola transacción reversible. */
export function addEditableScene(p:Project,items:{trackId:string;clip:Clip}[]):Project{
 if(!items.length||items.length>100)return p;
 const groupId=items.length>1?newId():undefined;
 const rows=items.map(item=>({...item,clip:{...structuredClone(item.clip),id:newId(),groupId}}));
 if(rows.some(({trackId,clip})=>!hyperframesSupported(clip)||!p.tracks.some(t=>t.id===trackId&&!t.locked&&t.kind!=="audio")))return p;
 const next=mapTracks(p,t=>({...t,clips:[...t.clips,...rows.filter(row=>row.trackId===t.id).map(row=>row.clip)]}));
 assertProject(next);
 return overwritePlaced(p,next,rows.map(row=>row.clip.id),true);
}
export function setCaptionWord(p:Project,id:string,index:number,patch:Partial<Word>):Project{
 const clip=findClip(p,id)?.clip;if(clip?.kind!=="caption"||!Number.isInteger(index)||!clip.words[index]||Object.keys(patch).some(k=>!["text","start","end"].includes(k)))return p;
 const words=clip.words.map((w,i)=>i===index?{...w,...patch}:w);
 if(words.some((w,i)=>typeof w.text!=="string"||!w.text.trim()||!Number.isSafeInteger(w.start)||!Number.isSafeInteger(w.end)||w.start<0||w.end<=w.start||w.end>clip.durationInFrames||i>0&&w.start<words[i-1].start))return p;
 return updateClip(p,id,{words} as Partial<CaptionClip>);
}

export type MotionSceneElement={kind:"text"|"caption"|"rectangle"|"solid";text?:string;from:number;durationInFrames:number;layer?:number;trackId?:string;style?:Partial<CaptionStyle>;words?:Word[];motion?:Partial<ClipMotion>;color?:string;x?:number;y?:number;width?:number;height?:number;opacity?:number};
/** Generación declarativa local. Cada elemento y palabra se conserva en JSON. */
export function addMotionScene(p:Project,elements:MotionSceneElement[],engine:RenderEngine="remotion"):Project{
 if(!elements.length||elements.length>100||!["remotion","hyperframes"].includes(engine))throw new Error("Escena o motor inválido");
 let base=p;const layers=new Map<number,string>();
 for(const layer of [...new Set(elements.filter(e=>!e.trackId).map(e=>e.layer??0))].sort((a,b)=>a-b)){
   if(!Number.isInteger(layer)||layer<0||layer>19)throw new Error("La capa de la escena debe estar entre 0 y 19");
   const previous=base;base=addTrack(base,"video");layers.set(layer,base.tracks.find(t=>!previous.tracks.some(old=>old.id===t.id))!.id);
 }
 const items=elements.map(e=>{
  const common={id:newId(),from:e.from,durationInFrames:e.durationInFrames,renderEngine:engine,motion:{...DEFAULT_MOTION,entrance:"pop" as const,exit:"fade" as const,...e.motion}};
  let clip:Clip;
  if(e.kind==="text")clip={...common,kind:"text",text:e.text??"",style:{...DEFAULT_TEXT_STYLE,...e.style}};
  else if(e.kind==="caption"){
   const tokens=(e.text??"").trim().split(/\s+/).filter(Boolean);
   const words=e.words??tokens.map((text,i)=>({text,start:Math.round(i*e.durationInFrames/tokens.length),end:Math.round((i+1)*e.durationInFrames/tokens.length)}));
   if(!words.length||words.some((w,i)=>!w.text.trim()||w.end<=w.start||w.end>e.durationInFrames||i>0&&w.start<words[i-1].start))throw new Error("Revisa las palabras o aumenta la duración del subtítulo");
   clip={...common,kind:"caption",words,style:{...DEFAULT_CAPTION_STYLE,...e.style}};
  }else if(e.kind==="solid"||e.kind==="rectangle")clip={...common,kind:"graphic",shape:e.kind,name:e.kind==="solid"?"Sólido animado":"Rectángulo animado",color:e.color??"#8350c4",x:e.x??.5,y:e.y??.5,width:e.width??.5,height:e.height??.3,opacity:e.opacity??1,brightness:1,contrast:1,saturation:1};
  else throw new Error("Tipo de escena no admitido");
  return {trackId:e.trackId??layers.get(e.layer??0)!,clip};
 });
 const next=addEditableScene(base,items);return next===base?p:next;
}

/** Los pares de llaves de entrega pertenecen a la secuencia y comparten Deshacer. */
export const setExportRange=(p:Project,r:import("./types").ExportRange):Project=>{
 if(!r.id||!r.name.trim()||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start||(p.exportRanges?.length??0)>=500&&!p.exportRanges?.some(x=>x.id===r.id))return p;
 return {...p,exportRanges:[...(p.exportRanges??[]).filter(x=>x.id!==r.id),{...r,name:r.name.trim().slice(0,120)}].sort((a,b)=>a.start-b.start)};
};
export const deleteExportRange=(p:Project,id:string):Project=>({...p,exportRanges:p.exportRanges?.filter(r=>r.id!==id)});
export function setSequenceSettings(p:Project,settings:SequenceSettings,libraryFps=p.fps):Project{
 if(!validSequenceSettings(settings))throw new Error("Tamaño o FPS fuera de rango");
 if(p.tracks.some(t=>t.locked&&t.clips.length)&&p.fps!==settings.fps)throw new Error("Desbloquea las pistas antes de cambiar la base temporal");
 return {...retimeProject(p,settings.fps),...(p.library?{library:{...p.library,media:p.library.media.map(m=>({...m,frameBase:m.frameBase??libraryFps})),elements:p.library.elements.map(e=>({...e,frameBase:e.frameBase??libraryFps}))}}:{}),width:settings.width,height:settings.height,audioSampleRate:settings.audioSampleRate??p.audioSampleRate??48000,...(settings.name?.trim()?{name:settings.name.trim().slice(0,100)}:{})};
}

/** Control de borde del timeline: editar/quitar una disolución en una transacción. */
export function setClipDissolve(p:Project,id:string,edge:"start"|"end",frames:number):Project {
 const found=findClip(p,id);if(!found||found.track.locked||found.clip.kind==="audio"||found.clip.kind==="graphic"&&found.clip.shape==="adjustment")return p;
 if(!Number.isSafeInteger(frames)||frames<0||frames>Math.floor(p.fps*10))throw new Error("Duración de disolución inválida");
 const next=edge==="end"?adjacentNext(found.track,found.clip):undefined;
 if(next?.kind==="graphic"&&next.shape==="adjustment")return p;
 if(frames){const current=edge==="start"?found.clip.transitionIn:next?.transitionIn??found.clip.transitionOut;if(current?.type==="dissolve"&&current.frames===frames)return p;return applyEffectPreset(p,[id],"cross-dissolve",frames,edge); }
 const target=next??found.clip,key=edge==="start"||next?"transitionIn":"transitionOut";
 if(!target[key])return p;
 return mapTracks(p,t=>({...t,clips:t.clips.map(c=>c.id===target.id?{...c,[key]:undefined}:c)}));
}
