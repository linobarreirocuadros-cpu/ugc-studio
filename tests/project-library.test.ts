import test from "node:test";
import assert from "node:assert/strict";
import {createEmptyProject,type AudioClip} from "../src/project/types";
import * as ops from "../src/project/ops";
import {projectItems,projectItemUses} from "../src/project/library";
import {assertProject,parseProjectFile} from "../src/project/projectFile";
import {parseMediaMetadata} from "../server/mediaMetadata";
import {resolveCommand,defaultBindings} from "../src/app/commands";

const source={src:"/media/take.mp4",name:"Toma original",kind:"video" as const,durationInFrames:600,hasAudio:true},other={...source,src:"/media/unused.mp4",name:"Sin usar"};
function fixture(){let p=ops.ensureProjectLibrary(createEmptyProject(),[source,other]);p=ops.addSourceRange(p,source,"V1",30,0,120);const video=p.tracks.find(t=>t.id==="V1")!.clips[0];return{p,video};}

test("biblioteca antigua migra al JSON y guardar/abrir da prioridad a su biblioteca canónica",()=>{
  const old=createEmptyProject(),parsed=parseProjectFile(JSON.stringify({project:old,media:[source]}));const p=ops.ensureProjectLibrary(parsed.project,parsed.media);
  assert.deepEqual(p.library!.media,[{...source,frameBase:old.fps}]);assert.equal(old.library,undefined);assertProject(p);
  const roundtrip=parseProjectFile(JSON.stringify({project:p,media:[other]}));assert.deepEqual(roundtrip.media,[{...source,frameBase:old.fps}]);assert.deepEqual(roundtrip.project,JSON.parse(JSON.stringify(p)));
});
test("eliminar sin usos no toca el montaje y conserva la instantánea necesaria para Deshacer",()=>{
  const {p}=fixture(),snapshot=JSON.stringify(p),removed=ops.removeProjectItems(p,[other.src]);
  assert.equal(removed.library!.media.length,1);assert.deepEqual(removed.tracks,p.tracks);assert.equal(JSON.stringify(p),snapshot);assertProject(removed);
});
test("borrado usado exige revisar usos y retira imagen/audio también de las secuencias",()=>{
  let {p,video}=fixture();p={...p,transcripts:{[source.src]:[{text:"Hola",start:0,end:30}],[other.src]:[]}};p=ops.createSequence(p,[video.id],"Alternativa");
  const snapshot=JSON.stringify(p);assert.equal(projectItemUses(p,[source.src]).length,4);assert.throws(()=>ops.removeProjectItems(p,[source.src]),/usado/);
  const next=ops.removeProjectItems(p,[source.src],true);assert.equal(projectItemUses(next,[source.src]).length,0);assert.equal(next.tracks.flatMap(t=>t.clips).length,0);assert.equal(Object.values(next.sequences!)[0].tracks.flatMap(t=>t.clips).length,0);assert.equal(Object.values(next.sequences!)[0].transcripts?.[source.src],undefined);assert.equal(next.transcripts?.[source.src],undefined);assert.ok(next.transcripts?.[other.src]);assertProject(next);assert.equal(JSON.stringify(p),snapshot);
});
test("parejas y audio con canales derivados están protegidos por candados al borrar su original",()=>{
  let {p,video}=fixture();const audio=ops.linkedIds(p,[video.id]).map(id=>ops.findClip(p,id)!.clip).find(c=>c.kind==="audio") as AudioClip;
  p=ops.updateClip(p,audio.id,{src:"/media/left.wav",channelSource:source.src,channelMode:"left"});p=ops.setTrackState(p,"A0",{locked:true});
  assert.throws(()=>ops.removeProjectItems(p,[source.src],true),/bloqueadas/);assert.equal(projectItemUses(p,[source.src]).length,2);
  const replaced=ops.updateClip(p,audio.id,{channelSource:undefined});assert.equal(projectItemUses(replaced,[source.src]).length,2);assert.throws(()=>ops.removeProjectItems(replaced,[source.src],true),/bloqueadas/);
  const unlocked=ops.setTrackState(p,"A0",{locked:false}),next=ops.removeProjectItems(unlocked,[source.src],true);assert.equal(next.tracks.flatMap(t=>t.clips).length,0);assertProject(next);
});
test("carpetas anidadas se mueven y borran completas; ciclos y destinos inexistentes se rechazan",()=>{
  let {p}=fixture();p=ops.addProjectFolder(p,"Material",undefined,"a");p=ops.addProjectFolder(p,"Brutos","a","b");p=ops.moveProjectItems(p,[other.src],"b");p=ops.addProjectElement(p,"solid","Fondo",60,"#123456","b","solid");
  assert.throws(()=>ops.moveProjectItems(p,["folder:a"],"b"),/dentro/);assert.throws(()=>ops.moveProjectItems(p,[source.src],"missing"),/no existe/);
  p=ops.renameProjectItem(p,"folder:b","Rodaje");p=ops.setProjectItemMetadata(p,"folder:b",{notes:"Notas de carpeta",labelColor:"#8761ad"});assert.equal(projectItems(p).find(i=>i.key==="folder:b")!.notes,"Notas de carpeta");assertProject(p);
  const next=ops.removeProjectItems(p,["folder:a"]);assert.equal(next.library!.folders.length,0);assert.equal(next.library!.elements.length,0);assert.deepEqual(next.library!.media.map(m=>m.src),[source.src]);assertProject(next);
  const corrupt=structuredClone(p);corrupt.library!.folders[0].parentId="b";assert.throws(()=>assertProject(corrupt),/circular/);
});
test("renombrar actualiza usos y referencias, conservando el nombre físico original",()=>{
  let {p,video}=fixture();p=ops.createSequence(p,[video.id],"Versión");p=ops.renameProjectItem(p,source.src,"Hook elegido");
  assert.equal(p.library!.media[0].originalName,source.name);assert.equal(p.library!.media[0].name,"Hook elegido");assert.equal((ops.findClip(p,video.id)!.clip as {name:string}).name,"Hook elegido");assert.equal((Object.values(p.sequences!)[0].tracks.find(t=>t.id==="V1")!.clips[0] as {name:string}).name,"Hook elegido");assertProject(p);
});
test("eliminar secuencia quita sus referencias pero conserva medios y otras secuencias",()=>{
  let {p,video}=fixture();p=ops.createSequence(p,[video.id],"Versión");const id=Object.keys(p.sequences!)[0];p=ops.placeSequence(p,id,"V2",180,true);p=ops.setProjectItemMetadata(p,`sequence:${id}`,{labelColor:"#8761ad"});
  assert.throws(()=>ops.removeProjectItems(p,[`sequence:${id}`]),/usado/);const next=ops.removeProjectItems(p,[`sequence:${id}`],true);assert.equal(next.sequences?.[id],undefined);assert.equal(next.library!.sequenceMeta[id],undefined);assert.equal(next.library!.media.length,2);assert.ok(ops.findClip(next,video.id));assertProject(next);
});
test("elementos de Proyecto son reutilizables e independientes; eliminar sus usos respeta parejas y JSON",()=>{
  let {p}=fixture();p=ops.addProjectElement(p,"adjustment","Look",90,"#ffffff",undefined,"look");p=ops.placeProjectElement(p,"look",0);p=ops.placeProjectElement(p,"look",180);
  assert.equal(projectItemUses(p,["element:look"]).length,2);assert.equal(p.library!.elements[0].clip.from,0);assertProject(p);
  const next=ops.removeProjectItems(p,["element:look"],true);assert.equal(next.library!.elements.length,0);assert.equal(next.tracks.flatMap(t=>t.clips).filter(c=>c.projectItemId==="look").length,0);assertProject(next);
});
test("editar una secuencia conserva biblioteca global sin copiarla dentro de cada secuencia",()=>{
  let {p,video}=fixture();p=ops.createSequence(p,[video.id],"Interior");const s=Object.values(p.sequences!)[0];assert.equal("library" in s,false);
  const view={...s,sequences:p.sequences,library:p.library},changed=ops.addProjectFolder(view,"Global",undefined,"global"),root=ops.updateSequence(p,s.id,changed);
  assert.equal(root.library!.folders[0].id,"global");assert.equal("library" in root.sequences![s.id],false);assertProject(root);
});
test("metadatos conservan FPS fraccional y audio reales, sin inventar valores de streams ausentes",()=>{
  const m=parseMediaMetadata({streams:[{codec_type:"video",width:1080,height:1920,avg_frame_rate:"24000/1001",codec_name:"h264",start_time:"0"},{codec_type:"audio",codec_name:"aac",sample_rate:"44100",channels:2,channel_layout:"stereo"}],format:{duration:"26.109"}},1000,"2026-10-20T12:00:00Z");
  assert.equal(m.frameRate,24000/1001);assert.equal(m.sampleRate,44100);assert.equal(m.channels,2);assert.equal(m.width,1080);assert.equal(m.durationSeconds,26.109);
  const audio=parseMediaMetadata({streams:[{codec_type:"audio",sample_rate:"48000",channels:1}],format:{}},12,"now");assert.equal(audio.frameRate,undefined);assert.equal(audio.width,undefined);assert.equal(audio.durationSeconds,undefined);
});
test("Delete y Backspace de Proyecto resuelven su acción disponible sin borrar el timeline",()=>{
  const b=defaultBindings();for(const chord of ["Delete","Backspace"]){assert.equal(resolveCommand(b,chord,"bin")!.id,"binDelete");assert.equal(resolveCommand(b,chord,"bin")!.pending,undefined);assert.equal(resolveCommand(b,chord,"timeline")!.id,"delete");}
});

test("colocación múltiple conserva el orden y es atómica si un destino está bloqueado",()=>{
  let p=ops.ensureProjectLibrary(createEmptyProject(),[source,other]);const placed=ops.placeProjectItems(p,[source.src,other.src],0);const videos=placed.tracks.find(t=>t.id==="V1")!.clips;
  assert.equal(videos.length,2);assert.equal(videos[0].from,0);assert.equal(videos[1].from,600);assertProject(placed);
  const locked=ops.setTrackState(p,"A0",{locked:true,targeted:true});assert.equal(ops.placeProjectItems(locked,[source.src,other.src],0),locked);
});
test("un proxy tardío no recrea un medio eliminado ni introduce cambios vacíos en su historial",()=>{
  const {p}=fixture(),deleted=ops.removeProjectItems(p,[other.src]);assert.equal(ops.annotateProjectProxy(deleted,other.src,"/media/proxies/u.mp4"),deleted);
  const annotated=ops.annotateProjectProxy(p,source.src,"/media/proxies/take.mp4");assert.equal(annotated.library!.media[0].proxySrc,"/media/proxies/take.mp4");assert.equal(annotated.tracks.find(t=>t.id==="V1")!.clips[0].from,30);assert.equal(p.library!.media[0].proxySrc,undefined);assertProject(annotated);
  assert.equal(ops.setLibraryMedia(p,p.library!.media.map(m=>({...m}))),p);
});
