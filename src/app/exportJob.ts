import type { Project } from "../project/types";

export type ExportPreset="h264-high"|"h264-draft"|"prores-hq";
export type ExportProgress={progress:number;url?:string;error?:string};
type Options={signal?:AbortSignal;fetcher?:typeof fetch;wait?:()=>Promise<void>};
/** Los errores HTTP, de red o de protocolo deben salir del estado «Exportando». */
export async function exportProject(project:Project,preset:ExportPreset,onProgress:(p:ExportProgress)=>void,options:Options={}) {
  const request=options.fetcher??fetch;
  const json=async(url:string,init?:RequestInit)=>{
    const response=await request(url,{...init,signal:options.signal});
    const data=await response.json().catch(()=>{throw new Error("El servidor devolvió una respuesta inválida.");});
    if(!response.ok)throw new Error(data.error??`Error HTTP ${response.status}`);
    return data;
  };
  const data=await json("/api/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project,preset})});
  if(typeof data.id!=="string"||!data.id)throw new Error("El servidor no confirmó la exportación.");
  for(;;){
    options.signal?.throwIfAborted();
    const job=await json(`/api/render/${encodeURIComponent(data.id)}`);
    if(job.status==="error")throw new Error(job.error??"No se pudo exportar el montaje.");
    if(job.status==="done"){
      if(typeof job.url!=="string"||!job.url.startsWith("/out/"))throw new Error("No se recibió el archivo exportado.");
      onProgress({progress:1,url:job.url});return;
    }
    if(job.status!=="rendering"||typeof job.progress!=="number"||!Number.isFinite(job.progress))throw new Error("El servidor devolvió un estado de exportación inválido.");
    onProgress({progress:Math.max(0,Math.min(1,job.progress))});
    await (options.wait?.()??new Promise(resolve=>setTimeout(resolve,700)));
  }
}
