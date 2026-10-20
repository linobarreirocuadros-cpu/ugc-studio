import test from "node:test";
import assert from "node:assert/strict";
import {createEmptyProject,sourceFrame,type VideoClip,type AudioClip} from "../src/project/types";
import {assertProject,parseProjectFile} from "../src/project/projectFile";
import * as ops from "../src/project/ops";

function fixture(){const p=ops.addSourceRange(createEmptyProject(),{src:"/media/clip.mp4",name:"Plano",durationInFrames:900,hasAudio:true},"V1",30,60,240);const video=p.tracks.find(t=>t.id==="V1")!.clips[0] as VideoClip;return{p,video,audio:ops.findClip(p,video.linkedClipId!)!.clip as AudioClip};}

test("ganancia amplifica una pareja una sola vez, respeta candados y admite silencio",()=>{
  const {p,video,audio}=fixture();const louder=ops.setClipVolume(p,[video.id,audio.id],2,true);
  assert.equal((ops.findClip(louder,audio.id)!.clip as AudioClip).volume,2);
  assert.equal((ops.findClip(louder,video.id)!.clip as VideoClip).volume,0);
  assertProject(louder);const locked=ops.setTrackState(p,"A0",{locked:true});assert.equal(ops.setClipVolume(locked,[video.id],2),locked);
  const muted=ops.setClipVolume(louder,[audio.id],0);assert.equal((ops.findClip(muted,audio.id)!.clip as AudioClip).volume,0);
  assert.equal((ops.findClip(p,audio.id)!.clip as AudioClip).volume,1);
});
test("grupos transitivos y etiquetas se guardan; las copias no se agrupan con el original",()=>{
  const {p,video,audio}=fixture();const grouped=ops.groupClips(p,[video.id]);
  assert.deepEqual(new Set(ops.groupedIds(grouped,[audio.id])),new Set([video.id,audio.id]));
  const colored=ops.labelClips(grouped,[video.id,audio.id],"#8761ad"),copied=ops.duplicateClipsWithSelection(colored,[video.id,audio.id],300);
  assert.equal(ops.groupedIds(copied.project,copied.ids).length,2);
  assert.notEqual(ops.findClip(copied.project,copied.ids[0])!.clip.groupId,ops.findClip(grouped,video.id)!.clip.groupId);
  assert.equal(ops.findClip(ops.groupClips(grouped,[video.id],false),audio.id)!.clip.groupId,undefined);
  assertProject(colored);assert.equal(ops.findClip(colored,video.id)!.clip.labelColor,"#8761ad");
});
test("velocidad conserva rango de origen y sincronía después de cortar, recortar y resumir",()=>{
  const {p,video,audio}=fixture();const fast=ops.setClipSpeed(p,[video.id],2);
  for(const id of [video.id,audio.id]){const c=ops.findClip(fast,id)!.clip as VideoClip|AudioClip;assert.equal(c.durationInFrames,90);assert.equal(sourceFrame(c,20),100);}
  const split=ops.splitAt(fast,60,video.id);const right=split.tracks.find(t=>t.id==="V1")!.clips[1] as VideoClip;
  assert.equal(right.trimStart,120);assert.equal((ops.findClip(split,right.linkedClipId!)!.clip as AudioClip).trimStart,120);assertProject(split);
  const trimmed=ops.trimClip(fast,video.id,"start",15);assert.equal((ops.findClip(trimmed,video.id)!.clip as VideoClip).trimStart,90);
  const kept=ops.keepTimelineRanges(fast,[{start:45,end:75}]);assert.equal((kept.tracks.find(t=>t.id==="V1")!.clips[0] as VideoClip).trimStart,90);assertProject(kept);
  const slipped=ops.slipClip(fast,video.id,10);assert.equal((ops.findClip(slipped,video.id)!.clip as VideoClip).trimStart,80);
  assert.equal(ops.setClipSpeed(p,[video.id],0),p);assert.equal(ops.setClipSpeed(ops.setTrackState(p,"A0",{locked:true}),[video.id],2).tracks.find(t=>t.id==="V1")!.clips[0].durationInFrames,180);
});
test("congelados mantienen fuente, audio y sincronía de inserción; pista protegida impide insertar",()=>{
  const {p,video,audio}=fixture();const whole=ops.holdFrame(p,video.id,60,"whole");assert.equal((ops.findClip(whole,video.id)!.clip as VideoClip).freezeFrame,90);assert.equal((ops.findClip(whole,audio.id)!.clip as AudioClip).volume,1);
  const tail=ops.holdFrame(p,video.id,90,"tail");assert.equal(tail.tracks.find(t=>t.id==="V1")!.clips.length,2);assert.equal((tail.tracks.find(t=>t.id==="V1")!.clips[1] as VideoClip).freezeFrame,120);assertProject(tail);
  const inserted=ops.holdFrame(p,video.id,90,"insert",60);const v=inserted.tracks.find(t=>t.id==="V1")!.clips as VideoClip[];
  assert.equal(v.find(c=>c.freezeFrame!==undefined)!.durationInFrames,60);assert.equal(v.find(c=>c.from===150)!.trimStart,120);
  const a=inserted.tracks.find(t=>t.id==="A0")!.clips as AudioClip[];assert.equal(a.find(c=>c.from===150)!.trimStart,120);assert.equal(a.some(c=>c.from===90),false);assertProject(inserted);
  const locked=ops.setTrackState(p,"A0",{locked:true});assert.equal(ops.holdFrame(locked,video.id,90,"insert",60),locked);
  const extended=ops.trimClip(whole,video.id,"end",900);assertProject(extended);
});
test("elementos gráficos editables sobreviven copia, rangos, secuencias y validación",()=>{
  let {p}=fixture();for(const shape of ["solid","rectangle","adjustment"] as const)p=ops.addGraphic(p,shape,30,90);
  assertProject(p);const ids=p.tracks.filter(t=>t.kind==="graphic").flatMap(t=>t.clips.map(c=>c.id));
  const copied=ops.copyClips(p,ids);const pasted=ops.pasteClips(createEmptyProject(),copied,0);assert.equal(pasted.tracks.filter(t=>t.kind==="graphic").length,3);assertProject(pasted);
  const range=ops.copyTimelineRange(p,30,90);const placed=ops.placeTimelineRange(createEmptyProject(),range,"V1",0);assert.equal(placed.tracks.filter(t=>t.kind==="graphic").length,3);assertProject(placed);
  const sequence=ops.createSequence(p,ids,"Diseño"),id=Object.keys(sequence.sequences!)[0];const individual=ops.placeSequence(sequence,id,"V2",300,false);assert.equal(individual.tracks.filter(t=>t.kind==="graphic").flatMap(t=>t.clips).length,6);assertProject(individual);
  const invalid=structuredClone(p);(invalid.tracks.at(-1)!.clips[0] as {brightness:number}).brightness=NaN;assert.throws(()=>assertProject(invalid));
});
test("anidar sustituye selección, conserva capas, permite editar y evita ciclos",()=>{
  const {p,video,audio}=fixture();const nested=ops.nestClips(p,[video.id],"Mi secuencia");
  assert.equal(ops.findClip(nested,video.id),null);assert.equal(ops.findClip(nested,audio.id),null);
  const sequence=Object.values(nested.sequences!)[0];assert.equal(sequence.name,"Mi secuencia");assert.equal(sequence.durationInFrames,180);assert.equal(sequence.tracks.flatMap(t=>t.clips).length,2);assertProject(nested);
  const saved=parseProjectFile(JSON.stringify({project:nested,media:[]}));assert.equal(JSON.stringify(saved.project),JSON.stringify(nested));
  const blank=ops.createEmptySequence(p,"Vacía");assert.equal(Object.values(blank.sequences!)[0].tracks.flatMap(t=>t.clips).length,0);assertProject(blank);
  const host=sequence.id;const view={...sequence,sequences:nested.sequences};assert.equal(ops.placeSequence(view,host,"V2",0,true,host),view);
});

test("velocidad fraccionaria no congela fuera del origen y extender sobrescribe conservando extremos",()=>{
  let {p,video}=fixture();
  const slow=ops.setClipSpeed(p,[video.id],.25),c=ops.findClip(slow,video.id)!.clip as VideoClip;
  const end=c.from+c.durationInFrames-1;const frozen=ops.holdFrame(slow,c.id,end,"whole");
  assert.ok((ops.findClip(frozen,c.id)!.clip as VideoClip).freezeFrame!<c.sourceDurationInFrames);assertProject(frozen);
  p=ops.addSourceRange(p,{src:"/media/other.mp4",name:"Vecino",durationInFrames:900,hasAudio:true},"V1",240,0,180);
  const stretched=ops.setClipSpeed(p,[video.id],.5);assert.equal(ops.findClip(stretched,video.id)!.clip.durationInFrames,360);
  const neighbor=stretched.tracks.find(t=>t.id==="V1")!.clips.find(c=>c.id!==video.id)!;assert.equal(neighbor.from,390);assert.equal(neighbor.durationInFrames,30);assertProject(stretched);
});

test("acortar contenido de una anidación no deja referencias fuera de su duración",()=>{
  const {p,video}=fixture(),root=ops.nestClips(p,[video.id],"Anidada"),sequence=Object.values(root.sequences!)[0];
  const content=ops.keepTimelineRanges({...sequence,sequences:root.sequences},[{start:0,end:60}]);
  const updated=ops.updateSequence(root,sequence.id,content);
  for(const c of updated.tracks.flatMap(t=>t.clips))if((c.kind==="video"||c.kind==="audio")&&c.sequenceId===sequence.id){assert.equal(c.sourceDurationInFrames,60);assert.equal(c.durationInFrames,60);}
  assertProject(updated);
});

test("anidar conserva overlays superiores y salida de una pista en solo; rechaza capas intercaladas",()=>{
  let {p,video}=fixture();p=ops.addSourceRange(p,{src:"/media/overlay.mp4",name:"Overlay",durationInFrames:900,hasAudio:false},"V2",30,0,180,true);p=ops.setTrackState(p,"A0",{solo:true});
  const root=ops.nestClips(p,[video.id],"Plano");const nestedTrack=root.tracks.findIndex(t=>t.clips.some(c=>c.kind==="video"&&c.sequenceId));assert.ok(nestedTrack<root.tracks.findIndex(t=>t.id==="V2"));assert.ok(root.tracks.some(t=>t.kind==="audio"&&t.solo&&t.clips.some(c=>c.kind==="audio"&&c.sequenceId)));assertProject(root);
  p=ops.addGraphic(p,"rectangle",30,180);const square=p.tracks.at(-1)!.clips[0];assert.equal(ops.nestClips(p,[video.id,square.id],"Intercalada"),p);
});
