import { useEffect, useState } from "react";

export type PreviewQuality = 1|2|4|8|16;
const cache=new Map<string,Promise<string>>();
const originalSources:Record<string,string>={};
const request=(src:string,divisor:PreviewQuality)=>{
  const key=`${src}|${divisor}`;
  if(!cache.has(key)) {
    const job=fetch("/api/preview-quality",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({src,divisor})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return String(d.src);});
    cache.set(key,job);void job.catch(()=>cache.delete(key));
  }
  return cache.get(key)!;
};
/** Solo entrega el mapa cuando todas las fuentes están listas; Full siempre usa originales. */
export function usePreviewQuality(sources:string[],quality:PreviewQuality) {
  const key=JSON.stringify([...new Set(sources)].sort());
  const [state,setState]=useState<{key:string;quality:PreviewQuality;map:Record<string,string>;error?:string}>({key:"",quality:1,map:{}});
  useEffect(()=>{
    let active=true;
    if(quality===1)return;
    const list=JSON.parse(key) as string[];
    void Promise.all(list.map(async src=>[src,await request(src,quality)] as const)).then(entries=>{if(active)setState({key,quality,map:Object.fromEntries(entries)});}).catch(e=>{if(active)setState({key,quality,map:{},error:String(e.message??e)});});
    return()=>{active=false;};
  },[key,quality]);
  const ready=quality===1||state.key===key&&state.quality===quality;
  return {sources:quality===1||!ready?originalSources:state.map,pending:!ready,error:ready&&quality!==1?state.error:undefined};
}
