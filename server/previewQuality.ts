import type { Express } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { RenderInternals } from "@remotion/renderer";
import { localMedia } from "./localTasks";

/** Caché local por original/fecha/divisor. Una conversión a la vez, nunca altera el original. */
export function registerPreviewQuality(app: Express, dataDir: string) {
  const jobs = new Map<string,Promise<string>>();
  let queue: Promise<unknown> = Promise.resolve();
  app.post("/api/preview-quality",async(req,res)=>{
    try {
      const divisor=Number(req.body.divisor);
      if(![2,4,8,16].includes(divisor)) throw new Error("Resolución de vista previa no válida.");
      const file=localMedia(dataDir,req.body.src),stat=await fs.stat(file);
      const key=createHash("sha256").update(`${file}:${stat.size}:${stat.mtimeMs}:${divisor}:v1`).digest("hex").slice(0,24);
      const name=`preview-${key}-${divisor}.mp4`,out=path.join(dataDir,"media","proxies",name);
      if(!jobs.has(key)) {
        const job=queue.catch(()=>{}).then(async()=>{
          try { await fs.access(out); }
          catch {
            const temp=out+".tmp.mp4";
            try {
              await RenderInternals.callFf({bin:"ffmpeg",args:["-y","-i",file,"-map","0:v:0","-map","0:a?","-vf",`scale='max(2,trunc(iw/${divisor}/2)*2)':'max(2,trunc(ih/${divisor}/2)*2)'`,"-c:v","libx264","-preset","veryfast","-crf","20","-g","15","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart",temp],indent:false,logLevel:"error",binariesDirectory:null,cancelSignal:undefined});
              await fs.rename(temp,out);
            } finally { await fs.rm(temp,{force:true}); }
          }
          return `/media/proxies/${name}`;
        });
        queue=job;jobs.set(key,job);void job.catch(()=>jobs.delete(key));
      }
      res.json({src:await jobs.get(key),divisor});
    } catch(error) {res.status(400).json({error:error instanceof Error?error.message:String(error)});}
  });
}
