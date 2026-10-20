import test from "node:test";
import assert from "node:assert/strict";
import {createEmptyProject,DEFAULT_TEXT_STYLE} from "../src/project/types";
import * as ops from "../src/project/ops";
import {assertProject,parseProjectFile} from "../src/project/projectFile";
import {updateMonitorRange,sourceRange} from "../src/app/monitorRange";
import {exportProject} from "../src/app/exportJob";
import {guardAssistantSession} from "../src/app/assistantSession";

test("una respuesta pendiente no escribe medios ni cambia el documento abierto después",async()=>{
  let epoch=0,project=fixture();const captured=epoch;
  const context=guardAssistantSession({getProject:()=>project,commit:(p:typeof project)=>{project=p;}},()=>epoch===captured);
  const prior=context.getProject();
  const delayed=Promise.resolve(ops.addTextClip(prior,{text:"Respuesta tardía",from:0,durationInFrames:30}));
  epoch++;project=createEmptyProject();
  assert.throws(()=>context.commit(prior),/Cambiaste de proyecto/);
  assert.throws(()=>context.getProject(),/Cambiaste de proyecto/);
  const late=await delayed;
  assert.throws(()=>context.commit(late),/Cambiaste de proyecto/);
  assert.equal(project.tracks.flatMap(t=>t.clips).length,0);
});

test("I/O incluye el último frame, permite cambiar el orden y distingue sin marca de frame cero",()=>{
  let r={start:null,end:null} as {start:number|null;end:number|null};
  assert.deepEqual(sourceRange(r,300),{inFrame:0,outFrame:300});
  r=updateMonitorRange(r,"markOut",59,300);assert.deepEqual(r,{start:null,end:60});
  r=updateMonitorRange(r,"markIn",90,300);assert.deepEqual(r,{start:90,end:null});
  r=updateMonitorRange(r,"markOut",30,300);assert.deepEqual(r,{start:null,end:31});
  r=updateMonitorRange(r,"markIn",0,300);assert.deepEqual(r,{start:0,end:31});
  assert.deepEqual(sourceRange(r,300),{inFrame:0,outFrame:31});
  r=updateMonitorRange(r,"clearIn",100,300);assert.deepEqual(r,{start:null,end:31});
  r=updateMonitorRange(r,"clearMarks",100,300);assert.deepEqual(r,{start:null,end:null});
  assert.deepEqual(updateMonitorRange(r,"markOut",400,300),{start:null,end:300});
});

const fixture=()=>ops.addVideoClip(createEmptyProject(),{src:"/media/qa.mp4",name:"QA",durationInFrames:600},"V1");
test("guardar/abrir conserva cortes, parejas, pistas, subtítulos y secuencias; admite pistas antiguas",()=>{
  let p=fixture();p=ops.exposeEmbeddedAudio(p,p.tracks.flatMap(t=>t.clips.map(c=>c.id)));
  p=ops.splitAt(p,60);
  p=ops.addTextClip(p,{text:"Prueba",from:30,durationInFrames:60,style:DEFAULT_TEXT_STYLE});
  p=ops.setTranscript(p,"/media/qa.mp4",[{text:"Prueba",start:0,end:20}]);
  p=ops.generateCaptions(p,ops.DEFAULT_CAPTION_OPTIONS);
  const ids=p.tracks.find(t=>t.id==="V1")!.clips.map(c=>c.id);
  p=ops.createSequence(p,ids,"QA anidada");
  assertProject(p);
  const file=parseProjectFile(JSON.stringify({project:p,media:[{src:"/media/qa.mp4",name:"QA",durationInFrames:600}]}));
  assert.deepEqual(file.project,JSON.parse(JSON.stringify(p)));
  const old={...createEmptyProject(),tracks:[]};assert.equal(parseProjectFile(JSON.stringify({project:old})).project.tracks.length,7);
});
test("proyecto malformado, tiempos imposibles, duplicados y ciclos se rechazan antes de abrir/renderizar",()=>{
  assert.throws(()=>parseProjectFile("{"),/JSON válido/);
  for(const bad of [null,{}, {project:{tracks:[]}}, {project:{...fixture(),fps:0}}, {project:fixture(),media:[null]}])assert.throws(()=>parseProjectFile(JSON.stringify(bad)),/inválido/);
  const p=fixture(),clip=p.tracks.find(t=>t.id==="V1")!.clips[0];
  const bad=structuredClone(p);bad.tracks.find(t=>t.id==="V1")!.clips.push(clip);assert.throws(()=>assertProject(bad),/duplicado/);
  const outside=structuredClone(p);outside.tracks.find(t=>t.id==="V1")!.clips[0].durationInFrames=601;assert.throws(()=>assertProject(outside),/recorte fuera/);
  const cyclic=structuredClone(p);const c=cyclic.tracks.find(t=>t.id==="V1")!.clips[0];if(c.kind==="video")c.sequenceId="s";
  cyclic.sequences={s:{...structuredClone(cyclic),id:"s",durationInFrames:600}};assert.throws(()=>assertProject(cyclic),/circular/);
});

function mockFetch(replies:unknown[]) {
  const urls:string[]=[];
  const fetcher=(async(url:RequestInfo|URL)=>{urls.push(String(url));const next=replies.shift();if(next instanceof Error)throw next;return next instanceof Response?next:new Response(JSON.stringify(next),{headers:{"Content-Type":"application/json"}});}) as typeof fetch;
  return {fetcher,urls,wait:async()=>{}};
}
test("exportación sigue progreso y confirma archivo; HTTP, desconexión y estado inválido no quedan exportando",async()=>{
  const normal=mockFetch([{id:"qa"},{status:"rendering",progress:.25},{status:"done",url:"/out/qa.mp4"}]),progress:unknown[]=[];
  await exportProject(fixture(),"h264-draft",p=>progress.push(p),normal);
  assert.deepEqual(progress,[{progress:.25},{progress:1,url:"/out/qa.mp4"}]);
  assert.deepEqual(normal.urls,["/api/render","/api/render/qa","/api/render/qa"]);
  const failures=[
    [{error:"Proyecto rechazado"},400],
    [new Error("Servidor desconectado"),0],
    [{wrong:"sin id"},0],
  ] as const;
  for(const [body,status] of failures){const q=mockFetch([status?new Response(JSON.stringify(body),{status}):body]);await assert.rejects(exportProject(fixture(),"h264-high",()=>{},q));}
  for(const job of [{status:"error",error:"Medio ausente"},{status:"done"},{status:"rendering",progress:null},{error:"No existe"}])await assert.rejects(exportProject(fixture(),"h264-high",()=>{},mockFetch([{id:"qa"},job])));
  const controller=new AbortController();controller.abort();await assert.rejects(exportProject(fixture(),"h264-high",()=>{}, {...mockFetch([{id:"qa"}]),signal:controller.signal}),{name:"AbortError"});
});
