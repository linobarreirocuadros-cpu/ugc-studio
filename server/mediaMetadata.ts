import type { Express } from "express";
import fs from "node:fs/promises";
import { RenderInternals } from "@remotion/renderer";
import { localMedia } from "./localTasks";

export function parseMediaMetadata(data:{streams?:Record<string,unknown>[];format?:Record<string,unknown>},bytes:number,modifiedAt:string) {
  const streams=data.streams??[],v=streams.find(s=>s.codec_type==="video"),a=streams.find(s=>s.codec_type==="audio"),f=data.format??{};
  const n=(value:unknown)=>Number.isFinite(Number(value))&&value!==undefined?Number(value):undefined;
  const rate=(value:unknown)=>{const [top,bottom]=String(value??"0/1").split("/").map(Number);const r=bottom?top/bottom:top;return Number.isFinite(r)&&r>0?r:undefined;};
  const tags=(v?.tags??f.tags??{}) as Record<string,unknown>;
  return {bytes,modifiedAt,durationSeconds:n(f.duration??v?.duration??a?.duration),startSeconds:n(v?.start_time??a?.start_time??f.start_time),width:n(v?.width),height:n(v?.height),frameRate:rate(v?.avg_frame_rate)??rate(v?.r_frame_rate),frameRateFraction:v?.avg_frame_rate,videoCodec:v?.codec_name,audioCodec:a?.codec_name,sampleRate:n(a?.sample_rate),channels:n(a?.channels),channelLayout:a?.channel_layout,hasVideo:Boolean(v),hasAudio:Boolean(a),timecode:typeof tags.timecode==="string"?tags.timecode:undefined};
}
/** Lectura del original, nunca del proxy. Caché por tamaño/fecha y ffprobe serial. */
export function registerMediaMetadata(app:Express,dataDir:string) {
  const cache=new Map<string,Promise<ReturnType<typeof parseMediaMetadata>>>();let queue:Promise<unknown>=Promise.resolve();
  app.post("/api/media-metadata",async(req,res)=>{
    try{
      const file=localMedia(dataDir,req.body.src),stat=await fs.stat(file),key=`${file}:${stat.size}:${stat.mtimeMs}`;
      if(!cache.has(key)){
        const job=queue.catch(()=>{}).then(async()=>{const r=await RenderInternals.callFf({bin:"ffprobe",args:["-v","error","-show_streams","-show_format","-of","json",file],indent:false,logLevel:"error",binariesDirectory:null,cancelSignal:undefined});return parseMediaMetadata(JSON.parse(r.stdout),stat.size,stat.mtime.toISOString());});
        queue=job;cache.set(key,job);void job.catch(()=>cache.delete(key));
      }
      res.json(await cache.get(key));
    }catch(e){res.status(400).json({error:e instanceof Error?e.message:String(e)});}
  });
}
