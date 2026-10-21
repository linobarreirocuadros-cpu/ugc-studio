import type {Clip} from "./types";

export type RenderEngine="remotion"|"hyperframes";
export type MotionPreset="none"|"fade"|"rise"|"pop";
export type MotionKey={frame:number;x?:number;y?:number;scale?:number;rotation?:number;opacity?:number};
export type ClipMotion={entrance:MotionPreset;exit:MotionPreset;inFrames:number;outFrames:number;distance:number;wordScale:number;easing:"linear"|"easeOut"|"easeInOut";keys:MotionKey[];offset?:number;sourceDuration?:number};
export const DEFAULT_MOTION:ClipMotion={entrance:"none",exit:"none",inFrames:8,outFrames:8,distance:80,wordScale:1.08,easing:"easeOut",keys:[]};
export const MOTION_PRESETS=[{id:"none",name:"Sin animación"},{id:"fade",name:"Fundido"},{id:"rise",name:"Desplazamiento suave"},{id:"pop",name:"Entrada con escala"}] as const;
export const motionSupported=(c:Clip)=>c.kind!=="audio"&&!(c.kind==="graphic"&&c.shape==="adjustment");
export const hyperframesSupported=(c:Clip)=>c.kind==="text"||c.kind==="caption"||c.kind==="graphic"&&c.shape!=="adjustment";
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const num=(v:unknown,lo:number,hi:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=lo&&v<=hi;
const integer=(v:unknown,lo=0)=>num(v,lo,1e9)&&Number.isSafeInteger(v);
export function validMotion(v:unknown):v is ClipMotion{
  if(!obj(v)||Object.keys(v).some(k=>![...Object.keys(DEFAULT_MOTION),"offset","sourceDuration"].includes(k)))return false;
  if(!MOTION_PRESETS.some(p=>p.id===v.entrance)||!MOTION_PRESETS.some(p=>p.id===v.exit)||!integer(v.inFrames,1)||!integer(v.outFrames,1)||!num(v.distance,-2000,2000)||!num(v.wordScale,.5,2)||!["linear","easeOut","easeInOut"].includes(String(v.easing)))return false;
  if(v.offset!==undefined&&!integer(v.offset,-1e9)||v.sourceDuration!==undefined&&!integer(v.sourceDuration,1)||!Array.isArray(v.keys)||v.keys.length>500)return false;
  let previous=-1;
  return v.keys.every(k=>{if(!obj(k)||!integer(k.frame)||Number(k.frame)<=previous||Object.keys(k).some(p=>!["frame","x","y","scale","rotation","opacity"].includes(p)))return false;previous=Number(k.frame);return Object.entries(k).every(([p,n])=>p==="frame"||num(n,...({x:[-4000,4000],y:[-4000,4000],scale:[.01,10],rotation:[-3600,3600],opacity:[0,1]} as Record<string,[number,number]>)[p]));});
}
export function sliceMotion(clip:Clip,offset:number){return clip.motion?{...clip.motion,offset:(clip.motion.offset??0)+offset,sourceDuration:clip.motion.sourceDuration??clip.durationInFrames}:undefined;}
export function motionAt(clip:Clip,frame:number){
  const m=clip.motion??DEFAULT_MOTION,t=frame+(m.offset??0),duration=m.sourceDuration??clip.durationInFrames;
  const ease=(n:number)=>{const x=Math.max(0,Math.min(1,n));return m.easing==="linear"?x:m.easing==="easeOut"?1-(1-x)**3:x*x*(3-2*x);};
  let opacity=1,x=0,y=0,scale=1,rotation=0;
  const apply=(kind:MotionPreset,amount:number)=>{if(kind==="none")return;opacity*=amount;if(kind==="rise")y+=(1-amount)*m.distance;if(kind==="pop")scale*=.8+.2*amount;};
  apply(m.entrance,ease(t/m.inFrames));apply(m.exit,ease((duration-1-t)/m.outFrames));
  for(const prop of ["x","y","scale","rotation","opacity"] as const){
    const keys=m.keys.filter(k=>k[prop]!==undefined);if(!keys.length)continue;
    let left=keys[0],right=keys.at(-1)!;for(const key of keys){if(key.frame<=t)left=key;if(key.frame>=t){right=key;break;}}
    const ratio=left.frame===right.frame?0:ease((t-left.frame)/(right.frame-left.frame));const value=left[prop]!+(right[prop]!-left[prop]!)*ratio;
    if(prop==="x")x+=value;else if(prop==="y")y+=value;else if(prop==="scale")scale*=value;else if(prop==="rotation")rotation+=value;else opacity*=value;
  }
  return {opacity,x,y,scale,rotation};
}
export function motionStyle(clip:Clip,frame:number){const v=motionAt(clip,frame);return {opacity:v.opacity,transform:`translate(${v.x}px, ${v.y}px) rotate(${v.rotation}deg) scale(${v.scale})`};}
