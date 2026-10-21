import type {AudioClip,VideoClip,Clip,Project,Track} from "./types";
export type VideoTransition={type:"dissolve"|"dipBlack"|"dipWhite"|"wipe";frames:number};
export type AudioTransition={curve:"linear"|"equalPower";frames:number};
export type EffectValues={x:number;y:number;scaleX:number;scaleY:number;rotation:number;anchorX:number;anchorY:number;opacity:number;cropLeft:number;cropRight:number;cropTop:number;cropBottom:number;brightness:number;contrast:number;saturation:number;blur:number;grayscale:number;sepia:number;invert:number;shadowX:number;shadowY:number;shadowBlur:number;shadowOpacity:number;shadowColor:string;fit:"cover"|"contain"};
export type ClipEffects=Partial<EffectValues>&{enabled?:boolean};
export const DEFAULT_EFFECTS:EffectValues={x:.5,y:.5,scaleX:1,scaleY:1,rotation:0,anchorX:.5,anchorY:.5,opacity:1,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,brightness:1,contrast:1,saturation:1,blur:0,grayscale:0,sepia:0,invert:0,shadowX:12,shadowY:12,shadowBlur:16,shadowOpacity:0,shadowColor:"#000000",fit:"cover"};
export const EFFECT_LIMITS:Record<Exclude<keyof EffectValues,"fit"|"shadowColor">,[number,number]>={x:[-5,5],y:[-5,5],scaleX:[.01,10],scaleY:[.01,10],rotation:[-3600,3600],anchorX:[0,1],anchorY:[0,1],opacity:[0,1],cropLeft:[0,1],cropRight:[0,1],cropTop:[0,1],cropBottom:[0,1],brightness:[0,4],contrast:[0,4],saturation:[0,4],blur:[0,100],grayscale:[0,1],sepia:[0,1],invert:[0,1],shadowX:[-1000,1000],shadowY:[-1000,1000],shadowBlur:[0,200],shadowOpacity:[0,1]};
export function validEffects(value:unknown):value is ClipEffects{if(!value||typeof value!=="object"||Array.isArray(value))return false;return Object.entries(value).every(([key,v])=>key==="enabled"?typeof v==="boolean":key==="fit"?["cover","contain"].includes(String(v)):key==="shadowColor"?/^#[0-9a-f]{6}$/i.test(String(v)):key in EFFECT_LIMITS&&typeof v==="number"&&Number.isFinite(v)&&v>=EFFECT_LIMITS[key as keyof typeof EFFECT_LIMITS][0]&&v<=EFFECT_LIMITS[key as keyof typeof EFFECT_LIMITS][1]);}
export type EffectPreset={id:string;name:string;category:"Video"|"Transiciones de video"|"Audio"|"Transiciones de audio";patch?:ClipEffects;transition?:VideoTransition["type"];audio?:"in"|"out"|"both"|AudioTransition["curve"]};
export const EFFECT_PRESETS:EffectPreset[]=[
{id:"cross-dissolve",name:"Disolución cruzada · Cross Dissolve",category:"Transiciones de video",transition:"dissolve"},
{id:"dip-black",name:"Fundido a negro",category:"Transiciones de video",transition:"dipBlack"},
{id:"dip-white",name:"Fundido a blanco",category:"Transiciones de video",transition:"dipWhite"},
{id:"wipe-left",name:"Barrido lateral",category:"Transiciones de video",transition:"wipe"},
{id:"drop-shadow",name:"Sombra paralela · Drop Shadow",category:"Video",patch:{shadowOpacity:.55,shadowX:12,shadowY:12,shadowBlur:16}},
{id:"transform",name:"Transformación",category:"Video",patch:{x:.5,y:.5,scaleX:1,scaleY:1,rotation:0}},
{id:"crop",name:"Recorte",category:"Video",patch:{cropLeft:.05,cropRight:.05,cropTop:.05,cropBottom:.05}},
{id:"color-basic",name:"Corrección de color básica",category:"Video",patch:{brightness:1.05,contrast:1.08,saturation:1.05}},
{id:"black-white",name:"Blanco y negro",category:"Video",patch:{grayscale:1}},
{id:"blur",name:"Desenfoque",category:"Video",patch:{blur:8}},
{id:"fade-audio-in",name:"Fundido de entrada",category:"Transiciones de audio",audio:"in"},
{id:"fade-audio-out",name:"Fundido de salida",category:"Transiciones de audio",audio:"out"},
{id:"fade-audio",name:"Fundidos de entrada y salida",category:"Transiciones de audio",audio:"both"},
{id:"constant-power",name:"Potencia constante · Crossfade",category:"Transiciones de audio",audio:"equalPower"},
{id:"constant-gain",name:"Ganancia constante · Crossfade",category:"Transiciones de audio",audio:"linear"}];
export const presetById=(id:string)=>EFFECT_PRESETS.find(p=>p.id===id);
export const adjacentPrevious=(track:Track,clip:Clip)=>track.clips.find(c=>c.id!==clip.id&&c.from+c.durationInFrames===clip.from&&(c.kind==="audio")===(clip.kind==="audio"));
export const adjacentNext=(track:Track,clip:Clip)=>track.clips.find(c=>c.id!==clip.id&&c.from===clip.from+clip.durationInFrames&&(c.kind==="audio")===(clip.kind==="audio"));
export function transitionTiming(track:Track,clip:Clip){const previous=adjacentPrevious(track,clip),next=adjacentNext(track,clip);const incoming=clip.kind==="audio"?clip.crossfadeIn:clip.transitionIn;const outgoing=next?.kind==="audio"?next.crossfadeIn:next?.transitionIn;const extendsMedia=(t:VideoTransition|AudioTransition|undefined)=>Boolean(t&&("curve" in t||t.type==="dissolve"||t.type==="wipe"));const pre=previous&&extendsMedia(incoming)?Math.min(clip.from,previous.durationInFrames,Math.floor(incoming!.frames/2)):0;const inPost=previous&&incoming?Math.min(clip.durationInFrames,Math.ceil(incoming.frames/2)):Math.min(clip.durationInFrames,incoming?.frames??0);const post=next&&extendsMedia(outgoing)?Math.min(next.durationInFrames,Math.ceil(outgoing!.frames/2)):0;const outPre=next&&outgoing?Math.min(clip.durationInFrames,Math.floor(outgoing.frames/2)):0;return{previous,next,incoming,outgoing,pre,inPost,post,outPre,from:clip.from-pre,duration:clip.durationInFrames+pre+post};}
/** Un corte/rango conserva solo transiciones de los extremos que aún existen. */
export function sliceClipEdges<T extends Clip>(clip:T,offset:number,length:number):T{return{...clip,...(offset>0?{transitionIn:undefined,...(clip.kind==="audio"?{crossfadeIn:undefined}:{} )}:{}),...(offset+length<clip.durationInFrames?{transitionOut:undefined}:{})};}
export function effectStyle(clip:Clip,p:Pick<Project,"width"|"height">){const e=clip.effects?.enabled===false?DEFAULT_EFFECTS:{...DEFAULT_EFFECTS,...clip.effects};const hex=e.shadowColor;const color=`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${e.shadowOpacity})`;return{opacity:e.opacity,transform:`translate(${(e.x-.5)*p.width}px,${(e.y-.5)*p.height}px) rotate(${e.rotation}deg) scale(${e.scaleX},${e.scaleY})`,transformOrigin:`${e.anchorX*100}% ${e.anchorY*100}%`,clipPath:`inset(${e.cropTop*100}% ${e.cropRight*100}% ${e.cropBottom*100}% ${e.cropLeft*100}%)`,filter:`brightness(${e.brightness}) contrast(${e.contrast}) saturate(${e.saturation}) blur(${e.blur}px) grayscale(${e.grayscale}) sepia(${e.sepia}) invert(${e.invert})${e.shadowOpacity?` drop-shadow(${e.shadowX}px ${e.shadowY}px ${e.shadowBlur}px ${color})`:""}`};}

/** Una transición de imagen no extiende ni mezcla el sonido embebido del video. */
export const audioTransitionTiming=(track:Track,clip:AudioClip|VideoClip)=>clip.kind==="audio"?transitionTiming(track,clip):transitionTiming({...track,clips:[]},{...clip,kind:"audio",fadeIn:0,fadeOut:0});
