import type {Express} from "express";
import {promises as fs} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {RenderInternals} from "@remotion/renderer";
import {localMedia} from "./localTasks";
import {audioMixRequests,audioKey,panHeadroom,isIdentity,type PanMatrix} from "../src/project/audioMix";
import type {Project} from "../src/project/types";
let queue:Promise<unknown>=Promise.resolve();
const channelsCache=new Map<string,Promise<number>>();
async function channels(file:string){
 const stat=await fs.stat(file),key=`${file}:${stat.size}:${stat.mtimeMs}`;
 if(!channelsCache.has(key))channelsCache.set(key,(async()=>{const {stdout}=await RenderInternals.callFf({bin:"ffprobe",args:["-v","error","-select_streams","a:0","-show_entries","stream=channels","-of","csv=p=0",file],indent:false,logLevel:"error",binariesDirectory:null,cancelSignal:undefined});const n=Number(stdout.trim());if(!Number.isInteger(n)||n<0)throw new Error("El archivo no contiene una pista de audio válida");return n;})().catch(error=>{channelsCache.delete(key);throw error;}));
 return channelsCache.get(key)!;
}
export async function preparePan(dataDir:string,src:string,matrix:PanMatrix,optional=false){
 if(!Array.isArray(matrix)||matrix.length!==4||!matrix.every(n=>Number.isFinite(n)&&Math.abs(n)<=64))throw new Error("Panorama inválido");
 const file=localMedia(dataDir,src),stat=await fs.stat(file),key=createHash("sha256").update(`${file}:${stat.size}:${stat.mtimeMs}:${audioKey(src,matrix)}:pan3-pcm24`).digest("hex").slice(0,24),name=`pan-${key}.wav`,out=path.join(dataDir,"media",name);
 const count=await channels(file);if(count===0){if(optional)return "";throw new Error("El archivo no contiene una pista de audio válida");}
 const job=queue.catch(()=>{}).then(async()=>{
  try{await fs.access(out);return;}catch{}
  const temp=out+".tmp.wav";
  try{
   const headroom=panHeadroom(matrix),[a,b,c,d]=matrix.map(v=>v/headroom),mono=await channels(file)===1;
   // Mono se duplica como lo hace el monitor; aformat lo atenuaba 3 dB al panear.
   const filter=mono?`pan=stereo|c0=${a+b}*c0|c1=${c+d}*c0`:`aformat=channel_layouts=stereo,pan=stereo|c0=${a}*c0+${b}*c1|c1=${c}*c0+${d}*c1`;
   await RenderInternals.callFf({bin:"ffmpeg",args:["-y","-i",file,"-map","0:a:0","-vn","-af",filter,"-ar","48000","-c:a","pcm_s24le",temp],indent:false,logLevel:"error",binariesDirectory:null,cancelSignal:undefined});
   await fs.rename(temp,out);
  }catch(error){console.error("Preparación de panorama:",error);throw new Error("No se pudo preparar el panorama local. Comprueba el archivo de audio y el espacio disponible, y vuelve a intentarlo.");}
  finally{await fs.rm(temp,{force:true});}
 });
 queue=job;await job;return `/media/${name}`;
}
export async function prepareAudioMix(project:Project,dataDir:string){
 const sources:Record<string,string>={};
 for(const r of audioMixRequests(project,true)){
  // El monitor duplica mono a L/R; evitar que el render lo atenúe al convertir a estéreo.
  const count=await channels(localMedia(dataDir,r.src));if(count===0){if(r.optional){sources[r.key]="";continue;}throw new Error("El archivo no contiene una pista de audio válida");}
  if(isIdentity(r.matrix)&&count!==1)continue;
  sources[r.key]=await preparePan(dataDir,r.src,r.matrix,r.optional);
 }
 return sources;
}
export function registerAudioMix(app:Express,dataDir:string){app.post("/api/audio-pan",async(req,res)=>{try{res.json({src:await preparePan(dataDir,req.body.src,req.body.matrix,req.body.optional===true)});}catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}});}
