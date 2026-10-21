import type {AudioClip,Clip,Project,Track,VideoClip} from "./types";
import {trackOutputEnabled} from "./types";
export type PanMatrix=[number,number,number,number];
export const IDENTITY:PanMatrix=[1,0,0,1];
const clean=(n:number)=>Math.abs(n)<1e-7?0:Math.round(n*1e6)/1e6;
/** Panner estéreo de potencia constante: centro conserva L/R; extremos suman hacia un lado. */
export function panMatrix(pan:number):PanMatrix{const p=Math.max(-1,Math.min(1,pan));return p<0?[1,clean(Math.cos((p+1)*Math.PI/2)),0,clean(Math.sin((p+1)*Math.PI/2))]:[clean(Math.cos(p*Math.PI/2)),0,clean(Math.sin(p*Math.PI/2)),1];}
export function multiplyMatrix(a:PanMatrix,b:PanMatrix):PanMatrix{return[clean(a[0]*b[0]+a[1]*b[2]),clean(a[0]*b[1]+a[1]*b[3]),clean(a[2]*b[0]+a[3]*b[2]),clean(a[2]*b[1]+a[3]*b[3])];}
export const isIdentity=(m:PanMatrix)=>m.every((v,i)=>v===IDENTITY[i]);
export const panHeadroom=(m:PanMatrix)=>Math.max(1,Math.abs(m[0])+Math.abs(m[1]),Math.abs(m[2])+Math.abs(m[3]));
export const audioKey=(src:string,m:PanMatrix)=>JSON.stringify(["pan3",src,m.map(clean)]);
export const clipMatrix=(track:Track,clip:Clip,parent:PanMatrix=IDENTITY)=>multiplyMatrix(parent,multiplyMatrix(panMatrix(track.kind==="audio"?track.pan??0:0),multiplyMatrix(panMatrix(clip.pan??0),clip.mix?.matrix??IDENTITY)));
export type MixRequest={src:string;matrix:PanMatrix;key:string;optional?:boolean};
export function audioMixRequests(project:Project,includeIdentity=false):MixRequest[]{const requests=new Map<string,MixRequest>();const sequences=project.sequences??{};const walk=(p:Project,parent:PanMatrix,stack:string[])=>{for(const t of p.tracks.filter(t=>trackOutputEnabled(p,t)))for(const c of t.clips){if(c.kind!=="audio"&&!(c.kind==="video"&&c.volume>0&&c.audioMode!=="none"&&c.freezeFrame===undefined))continue;const matrix=clipMatrix(t,c,parent);if(c.sequenceId){const s=sequences[c.sequenceId];if(s&&!stack.includes(s.id)&&stack.length<8)walk(s,matrix,[...stack,s.id]);}else if(includeIdentity||!isIdentity(matrix)){const key=audioKey(c.src,matrix);requests.set(key,{src:c.src,matrix,key,optional:(requests.get(key)?.optional??true)&&c.kind==="video"});}}};walk(project,IDENTITY,[]);return[...requests.values()];}
export function bakeTrackMix<T extends Clip>(clip:T,track:Track,project:Project):T{if(clip.kind!=="audio"&&clip.kind!=="video")return clip;const gain=(clip.mix?.gain??1)*(track.kind==="audio"?track.volume??1:1)*(project.masterVolume??1);const matrix=clipMatrix(track,clip);return gain===1&&isIdentity(matrix)?{...clip,pan:undefined,mix:undefined}:{...clip,pan:undefined,mix:{gain,matrix}};}
