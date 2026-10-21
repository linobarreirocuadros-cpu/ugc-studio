import type {AssistantContext} from "../localAssistant";
import type {CaptionStyle} from "../../project/types";
import type {ClipMotion,MotionKey,RenderEngine} from "../../project/motion";
import {MOTION_PRESETS} from "../../project/motion";
import {MOTION_ITEM_SCHEMA,MOTION_SCHEMA,MOTION_STYLE_SCHEMA} from "../../ai/motionSchema";
import * as ops from "../../project/ops";
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const number=(v:unknown)=>{if(typeof v!=="number"||!Number.isFinite(v))throw new Error("Número inválido en la escena");return v;};
const text=(v:unknown)=>{if(typeof v!=="string"||!v.trim())throw new Error("Falta texto válido");return v;};
function fields(v:unknown,allowed:string[]){if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw new Error("Parámetros de animación desconocidos");return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null&&x!==undefined));}
export function parseMotion(v:unknown,fps:number):Partial<ClipMotion>{
 const o=fields(v,Object.keys(MOTION_SCHEMA.properties)),out:Partial<ClipMotion>={};
 for(const key of ["entrance","exit","easing"] as const)if(o[key]!==undefined)(out as Record<string,unknown>)[key]=o[key];
 for(const [input,key,factor] of [["in_s","inFrames",fps],["out_s","outFrames",fps],["distance_px","distance",1],["word_scale","wordScale",1]] as const)if(o[input]!==undefined){const n=number(o[input]);if((input==="in_s"||input==="out_s")&&(n<=0||n>10))throw new Error("Duración de animación fuera de rango");out[key]=input==="in_s"||input==="out_s"?Math.max(1,Math.round(n*factor)):n;}
 if(o.keys!==undefined){if(!Array.isArray(o.keys)||o.keys.length>500)throw new Error("Lista de claves inválida");out.keys=o.keys.map(raw=>{const k=fields(raw,["time_s","x","y","scale","rotation","opacity"]),time=number(k.time_s);if(time<0)throw new Error("Tiempo de clave inválido");return {frame:Math.round(time*fps),...Object.fromEntries(Object.entries(k).filter(([p])=>p!=="time_s").map(([p,n])=>[p,number(n)]))} as MotionKey;});}
 return out;
}
export function executeMotionTool(name:string,input:Record<string,unknown>,ctx:AssistantContext):string{
 const project=ctx.getProject(),fps=project.fps,frames=(v:unknown)=>{const n=number(v);if(n<0)throw new Error("Tiempo negativo");return Math.round(n*fps);};
 if(name==="list_animation_presets")return JSON.stringify({engines:["remotion","hyperframes"],presets:MOTION_PRESETS,editable:["text","words","word_times","typography","motion","keys"],note:"Remotion compone la salida. HyperFrames usa la plantilla local de texto/gráficos; no acepta código arbitrario."});
 if(name==="set_motion_parameters"){
   const ids=input.all_captions===true?project.tracks.filter(t=>!t.locked).flatMap(t=>t.clips.filter(c=>c.kind==="caption").map(c=>c.id)):Array.isArray(input.clip_ids)?input.clip_ids.map(text):ctx.selectedClipIds??(ctx.selectedClipId?[ctx.selectedClipId]:[]);
   const engine=input.render_engine==null?undefined:input.render_engine as RenderEngine;
   const patch=parseMotion(input.values??{},fps);if(!Object.keys(patch).length&&engine===undefined)throw new Error("Indica motor o parámetros de animación");
   const next=ops.setClipMotion(project,ids,patch,engine);
   if(next===project)throw new Error("Selecciona elementos compatibles y desbloqueados; revisa motor y parámetros");
   ctx.commit(next);ctx.showPanel?.("effectControls");return "Animación y motor guardados como parámetros editables. Puedes deshacerlo.";
 }
 if(name==="set_caption_word"){
   const id=text(input.clip_id),index=number(input.word_index),patch={...(input.text==null?{}:{text:text(input.text)}),...(input.start_s==null?{}:{start:frames(input.start_s)}),...(input.end_s==null?{}:{end:frames(input.end_s)})};
   const next=ops.setCaptionWord(project,id,index,patch);if(next===project)throw new Error("Palabra, tiempos o selección protegida; consulta el estado del proyecto");ctx.commit(next);ctx.showPanel?.("properties");return "Palabra y tiempos guardados en el subtítulo editable.";
 }
 if(name!=="create_motion_scene"||!Array.isArray(input.elements)||!input.elements.length||input.elements.length>100)throw new Error("Escena estructurada inválida");
 const elements=input.elements.map(raw=>{
   const e=fields(raw,Object.keys(MOTION_ITEM_SCHEMA.properties));
   const track=e.track===undefined?undefined:project.tracks.find(t=>t.id===e.track||t.name.toLocaleLowerCase()===String(e.track).toLocaleLowerCase());if(e.track!==undefined&&!track)throw new Error("La pista indicada no existe");
   const style=e.style===undefined?undefined:fields(e.style,Object.keys(MOTION_STYLE_SCHEMA.properties)) as Partial<CaptionStyle>;
   // null es un fondo transparente explícito, no una propiedad ausente.
   if(style&&object(e.style)&&e.style.background===null)style.background=null;
   let words:ops.MotionSceneElement["words"];
   if(e.words!==undefined){if(!Array.isArray(e.words)||e.words.length>500)throw new Error("Palabras inválidas");words=e.words.map(raw=>{const w=fields(raw,["text","start_s","end_s"]);return {text:text(w.text),start:frames(w.start_s),end:frames(w.end_s)};});}
   return {kind:e.kind as ops.MotionSceneElement["kind"],from:frames(e.start_s),durationInFrames:Math.max(1,frames(e.duration_s)),...(e.text===undefined?{}:{text:text(e.text)}),trackId:track?.id,layer:e.layer as number|undefined,style,words,motion:e.motion===undefined?undefined:parseMotion(e.motion,fps),...Object.fromEntries(["color","x","y","width","height","opacity"].filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))};
 });
 if(input.elements.some(raw=>object(raw)&&number(raw.duration_s)<=0))throw new Error("La duración debe ser positiva");
 const next=ops.addMotionScene(project,elements,(input.render_engine??"remotion") as RenderEngine);if(next===project)throw new Error("No se pudo colocar: revisa las pistas bloqueadas");
 const created=next.tracks.flatMap(t=>t.clips).filter(c=>!ops.findClip(project,c.id));
 ctx.commit(next);ctx.onSeek?.(Math.min(...elements.map(e=>e.from)));ctx.onSelectClips?.([(created.find(c=>c.kind==="caption")??created[0]).id]);ctx.showPanel?.("effectControls");
 return JSON.stringify({created:next.tracks.flatMap(t=>t.clips).filter(c=>!ops.findClip(project,c.id)).map(c=>({id:c.id,kind:c.kind,render_engine:c.renderEngine})),editable:true,undo:"una transacción",words:elements.some(e=>e.kind==="caption"&&!e.words)?"Tiempos iniciales repartidos, requieren revisión de escucha.":"Tiempos proporcionados conservados."});
}
