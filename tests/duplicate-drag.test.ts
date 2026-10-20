import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, type VideoClip, type AudioClip } from "../src/project/types";
import * as ops from "../src/project/ops";
const fixture=()=>{const p=ops.addSourceRange(createEmptyProject(),{src:"/media/test.mp4",name:"Plano",durationInFrames:900,hasAudio:true},"V1",30,90,180);return {p,v:p.tracks.find(t=>t.id==="V1")!.clips[0] as VideoClip};};

test("copia arrastrada conserva originales, trim y pareja nueva en otra pista",()=>{
  const {p,v}=fixture(),before=JSON.stringify(p),next=ops.duplicateClips(p,[v.id],120,1);
  assert.equal(JSON.stringify(p),before);
  assert.deepEqual(ops.findClip(next,v.id)?.clip,v);
  const copy=next.tracks.find(t=>t.id==="V2")!.clips[0] as VideoClip;
  assert.notEqual(copy.id,v.id);assert.equal(copy.from,150);assert.equal(copy.trimStart,90);assert.equal(copy.durationInFrames,90);
  assert.notEqual(copy.linkedClipId,v.linkedClipId);
  const sound=ops.findClip(next,copy.linkedClipId!)!.clip as AudioClip;
  assert.equal(sound.linkedClipId,copy.id);assert.equal(sound.from,copy.from);assert.equal(sound.trimStart,copy.trimStart);
  assert.equal(ops.findClip(next,v.linkedClipId!)!.clip.from,30);
});
test("copia aislada de audio no copia video ni enlaza al original",()=>{
  const {p,v}=fixture(),next=ops.duplicateClips(p,[v.linkedClipId!],120,0,false);
  const all=next.tracks.flatMap(t=>t.clips),sound=all.filter(c=>c.kind==="audio") as AudioClip[];
  assert.equal(all.filter(c=>c.kind==="video").length,1);assert.equal(sound.length,2);
  assert.equal(sound.find(c=>c.id!==v.linkedClipId)!.linkedClipId,undefined);
  assert.equal(ops.findClip(next,v.id)!.clip.kind,"video");
});
test("copia bloquea destinos y parejas protegidas, y no duplica un clic sin desplazamiento",()=>{
  const {p,v}=fixture();assert.equal(ops.duplicateClips(p,[v.id],0),p);
  const locked=ops.setTrackState(p,"V2",{locked:true});assert.equal(ops.duplicateClips(locked,[v.id],100,1),locked);
  const audio=ops.findClip(p,v.linkedClipId!)!.track.id,lockedAudio=ops.setTrackState(p,audio,{locked:true});
  assert.equal(ops.duplicateClips(lockedAudio,[v.id],100),lockedAudio);
  assert.notEqual(ops.duplicateClips(lockedAudio,[v.id],100,0,false),lockedAudio);
});
test("mover tras Alt+clic conserva pareja, deja su audio quieto y muestra diferencia reversible",()=>{
  const {p,v}=fixture();const next=ops.editSelection(p,[v.id],false,x=>ops.moveClips(x,[v.id],15));
  assert.equal(ops.findClip(next,v.id)!.clip.from,45);assert.equal(ops.findClip(next,v.linkedClipId!)!.clip.from,30);
  assert.equal((ops.findClip(next,v.id)!.clip as VideoClip).linkedClipId,v.linkedClipId);
  const restored=ops.editSelection(next,[v.id],false,x=>ops.moveClips(x,[v.id],-15));
  assert.deepEqual(restored,p);
});
test("copia sobre un vecino conserva sus extremos y selecciona solo la copia, sin incluir fragmentos",()=>{
  const {p,v}=fixture(),busy=ops.addSourceRange(p,{src:"/media/other.mp4",name:"Vecino",durationInFrames:900,hasAudio:true},"V1",200,0,300);
  const result=ops.duplicateClipsWithSelection(busy,[v.id],270);
  assert.equal(result.ids.length,2);
  for(const id of result.ids){const c=ops.findClip(result.project,id)!.clip;assert.equal(c.from,300);assert.equal(c.durationInFrames,90);}
  const pieces=result.project.tracks.find(t=>t.id==="V1")!.clips.filter(c=>c.kind==="video"&&c.src==="/media/other.mp4");
  assert.deepEqual(pieces.map(c=>[c.from,c.durationInFrames]),[[200,100],[390,110]]);
  assert.deepEqual(ops.findClip(result.project,v.id)!.clip,v);
});
