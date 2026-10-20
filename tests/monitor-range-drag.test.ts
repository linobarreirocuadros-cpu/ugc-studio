import test from "node:test";
import assert from "node:assert/strict";
import {createEmptyProject,type VideoClip,type AudioClip,type CaptionClip} from "../src/project/types";
import {assertProject} from "../src/project/projectFile";
import * as ops from "../src/project/ops";

const media={src:"/media/qa.mp4",name:"Plano",durationInFrames:600,hasAudio:true};
function fixture(){
  let p=ops.addSourceRange(createEmptyProject(),media,"V1",30,60,150);
  p=ops.addSourceRange(p,{...media,src:"/media/qa2.mp4",name:"Segundo"},"V1",150,10,100);
  p=ops.addSourceRange(p,media,"V2",45,0,75,true);
  p=ops.addTextClip(p,{text:"Título",from:60,durationInFrames:50});
  p=ops.setTranscript(p,media.src,[{text:"Hola",start:80,end:100},{text:"Lino",start:110,end:130}]);
  return ops.generateCaptions(p,ops.DEFAULT_CAPTION_OPTIONS);
}

test("rango de Programa atraviesa cortes y conserva huecos, capas, trim, palabras y enlaces",()=>{
  const p=fixture(),before=JSON.stringify(p),range=ops.copyTimelineRange(p,60,180);
  assert.equal(JSON.stringify(p),before);assertProject(range);
  const video=range.tracks.find(t=>t.id==="V1")!.clips as VideoClip[];
  assert.deepEqual(video.map(c=>[c.from,c.durationInFrames,c.trimStart]),[[0,60,90],[90,30,10]]);
  for(const c of video){const mate=ops.findClip(range,c.linkedClipId!)!.clip as AudioClip;assert.equal(mate.from,c.from);assert.equal(mate.trimStart,c.trimStart);assert.equal(mate.linkedClipId,c.id);}
  const caption=range.tracks.find(t=>t.kind==="caption")!.clips[0] as CaptionClip;
  assert.equal(caption.from,0);assert.deepEqual(caption.words.map(w=>[w.text,w.start,w.end]),[["Hola",0,10],["Lino",20,40]]);
  const leadingGap=ops.copyTimelineRange(p,0,120);
  const pasted=ops.placeTimelineRange(p,leadingGap,"V1",300);
  const ids=new Set(p.tracks.flatMap(t=>t.clips.map(c=>c.id)));
  assert.equal(pasted.tracks.find(t=>t.id==="V1")!.clips.find(c=>!ids.has(c.id))!.from,330);
});

test("colocar ambas señales en otra pista mantiene capas, crea destino faltante e identidades nuevas",()=>{
  const p=fixture(),before=JSON.stringify(p),range=ops.copyTimelineRange(p,60,180),ids=new Set(p.tracks.flatMap(t=>t.clips.map(c=>c.id)));
  const next=ops.placeTimelineRange(p,range,"V2",300);assertProject(next);assert.equal(JSON.stringify(p),before);
  assert.equal(next.tracks.filter(t=>t.kind==="video").length,3);
  const copies=next.tracks.flatMap(t=>t.clips).filter(c=>!ids.has(c.id));
  const first=next.tracks.find(t=>t.id==="V2")!.clips.find(c=>c.from===300) as VideoClip;
  assert.equal(first.trimStart,90);assert.equal(first.durationInFrames,60);
  const mate=ops.findClip(next,first.linkedClipId!)!.clip as AudioClip;assert.equal(mate.from,300);assert.equal(mate.linkedClipId,first.id);assert.ok(!ids.has(mate.id));
  assert.ok(copies.some(c=>c.kind==="text"));assert.ok(copies.some(c=>c.kind==="caption"));
  assert.equal(next.tracks.find(t=>t.id==="V3")!.clips[0].from,300);
});

test("solo imagen silencia audio embebido; solo audio no copia imagen, textos ni enlaces ajenos",()=>{
  const p=fixture(),video=ops.copyTimelineRange(p,60,180,"video"),audio=ops.copyTimelineRange(p,60,180,"audio");
  assert.equal(video.tracks.flatMap(t=>t.clips).some(c=>c.kind==="audio"),false);
  for(const c of video.tracks.flatMap(t=>t.clips))if(c.kind==="video"){assert.equal(c.volume,0);assert.equal(c.linkedClipId,undefined);assert.equal(c.audioMode,"none");}
  for(const c of audio.tracks.flatMap(t=>t.clips)){assert.equal(c.kind,"audio");assert.equal((c as AudioClip).linkedClipId,undefined);}
  const legacy=ops.addVideoClip(createEmptyProject(),{src:media.src,name:"Embebido",durationInFrames:120},"V1");
  const extracted=ops.copyTimelineRange(legacy,30,90,"audio").tracks.flatMap(t=>t.clips) as AudioClip[];
  assert.equal(extracted.length,1);assert.equal(extracted[0].trimStart,30);assert.equal(extracted[0].durationInFrames,60);
  assertProject(ops.placeTimelineRange(p,ops.copyTimelineRange(p,60,180),"A1",300));
});

test("candados de destino, fps, tipos incompatibles y secuencias recursivas no dejan cambios parciales",()=>{
  const p=fixture(),range=ops.copyTimelineRange(p,60,180),locked=ops.setTrackState(p,"A0",{locked:true,targeted:true});
  assert.equal(ops.placeTimelineRange(locked,range,"V2",300),locked);
  const overlayLocked=ops.setTrackState(p,"T1",{locked:true});assert.equal(ops.placeTimelineRange(overlayLocked,range,"V2",300),overlayLocked);
  assert.equal(ops.placeTimelineRange(p,range,"A1",300,"video"),p);
  assert.equal(ops.placeTimelineRange(p,range,"V2",300,"audio"),p);
  assert.equal(ops.placeTimelineRange(p,{...range,fps:24},"V2",300),p);
  assert.equal(ops.placeTimelineRange(p,range,"V2",NaN),p);
  const seq=ops.createSequence(p,p.tracks.find(t=>t.id==="V1")!.clips.map(c=>c.id),"Anidada"),id=Object.keys(seq.sequences!)[0];
  const nested=ops.placeSequence({...createEmptyProject(),sequences:seq.sequences},id,"V1",0,true),fragment=ops.copyTimelineRange(nested,0,60);
  assert.equal(ops.placeTimelineRange(nested,fragment,"V2",300,"auto",id),nested);
  const lockedSource=ops.setTrackState(p,"V1",{locked:true});assert.ok(ops.copyTimelineRange(lockedSource,60,180).tracks.find(t=>t.id==="V1")!.clips.length);
});
