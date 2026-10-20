import test from "node:test";
import assert from "node:assert/strict";
import {createEmptyProject,clipAtPlayhead,type VideoClip,type AudioClip} from "../src/project/types";
import * as ops from "../src/project/ops";
import {normalizeTimelinePreferences} from "../src/app/timelinePreferences";

const media={src:"/media/test.mp4",name:"Plano",durationInFrames:600,hasAudio:true};
function fixture(){const p=ops.addSourceRange(createEmptyProject(),media,"V1",30,60,150);const video=p.tracks.find(t=>t.id==="V1")!.clips[0] as VideoClip;return{p,video,audio:ops.findClip(p,video.linkedClipId!)!.clip as AudioClip};}

test("selección enlazada desactivada mueve solo imagen y conserva enlace y offset al reactivar",()=>{
  const {p,video,audio}=fixture(), snapshot=JSON.stringify(p);
  const moved=ops.editSelection(p,[video.id],false,current=>ops.moveClip(current,video.id,60));
  assert.equal(ops.findClip(moved,audio.id)!.clip.from,30);
  assert.equal((ops.findClip(moved,video.id)!.clip as VideoClip).linkedClipId,audio.id);
  const both=ops.editSelection(moved,[video.id],true,current=>ops.moveClip(current,video.id,90));
  assert.equal(ops.findClip(both,audio.id)!.clip.from,60);
  assert.equal(JSON.stringify(p),snapshot);
  const locked=ops.setTrackState(p,"A0",{locked:true});
  const independent=ops.editSelection(locked,[video.id],false,current=>ops.trimClip(current,video.id,"start",15));
  assert.equal(ops.findClip(independent,audio.id)!.clip.durationInFrames,90);
  assert.equal(ops.findClip(independent,video.id)!.clip.durationInFrames,75);
});

test("corte y borrado independientes no dejan enlaces a clips eliminados",()=>{
  const {p,video,audio}=fixture();
  const split=ops.editSelection(p,[video.id],false,current=>ops.splitAt(current,75,video.id));
  assert.equal(split.tracks.find(t=>t.id==="V1")!.clips.length,2);
  assert.equal(split.tracks.find(t=>t.id==="A0")!.clips.length,1);
  const removed=ops.editSelection(p,[video.id],false,current=>ops.deleteClip(current,video.id));
  assert.equal(ops.findClip(removed,video.id),null);
  assert.equal((ops.findClip(removed,audio.id)!.clip as AudioClip).linkedClipId,undefined);
  const unlinked=ops.linkClips(p,[video.id],false);
  const linked=ops.linkClips(unlinked,[video.id,audio.id],true);
  assert.equal((ops.findClip(linked,video.id)!.clip as VideoClip).linkedClipId,audio.id);
});

test("marcadores se editan, borran y mapean con los rangos conservados",()=>{
  let {p}=fixture();
  p=ops.setMarker(p,{id:"m",frame:75,label:"Gancho",color:"#00aaff"});
  p=ops.setMarker(p,{id:"m",frame:90,label:"Cierre",color:"#00aaff"});
  assert.equal(p.markers!.length,1);
  const cut=ops.keepTimelineRanges(p,[{start:60,end:120}]);
  assert.equal(cut.markers![0].frame,30);
  assert.equal(ops.deleteMarker(cut,"m").markers!.length,0);
  assert.equal(ops.setMarker(p,{id:"bad",frame:NaN,label:"",color:"no"}),p);
});

test("secuencias anidadas conservan fuentes, capas y actualizaciones; modo individual remapea IDs",()=>{
  const {p,video}=fixture();
  const withText=ops.addTextClip(p,{text:"Gancho",from:45,durationInFrames:45});
  const ids=withText.tracks.flatMap(t=>t.clips.map(c=>c.id));
  const saved=ops.createSequence(withText,ids,"Mi secuencia");
  const sequence=Object.values(saved.sequences!)[0];
  assert.equal(sequence.durationInFrames,90);
  const empty={...createEmptyProject(),sequences:saved.sequences};
  const nested=ops.placeSequence(empty,sequence.id,"V1",0,true);
  const nestedVideo=nested.tracks.find(t=>t.id==="V1")!.clips[0] as VideoClip;
  assert.equal(nestedVideo.sequenceId,sequence.id);
  assert.equal(nested.tracks.flatMap(t=>t.clips).length,2);
  const flat=ops.placeSequence(empty,sequence.id,"V1",0,false);
  assert.equal(flat.tracks.flatMap(t=>t.clips).length,3);
  assert.ok(flat.tracks.flatMap(t=>t.clips).every(c=>!ids.includes(c.id)));
  const flatVideo=flat.tracks.find(t=>t.id==="V1")!.clips[0] as VideoClip;
  assert.equal((ops.findClip(flat,flatVideo.linkedClipId!)!.clip as AudioClip).linkedClipId,flatVideo.id);
  const changed=ops.updateSequence(nested,sequence.id,ops.updateClip(sequence,video.id,{volume:0.5}));
  assert.equal(ops.effectiveVolume(changed.sequences![sequence.id],ops.findClip(changed.sequences![sequence.id],video.id)!.clip as VideoClip),0.5);
  assert.equal(ops.effectiveVolume(sequence,ops.findClip(sequence,video.id)!.clip as VideoClip),1);
  assert.equal(ops.placeSequence(saved,sequence.id,"V1",0,true,sequence.id),saved);
});

test("colocar secuencia respeta candados y serialización de medios, marcadores y referencias",()=>{
  const {p,video}=fixture();const saved=ops.createSequence(p,[video.id],"Secuencia");const sequence=Object.values(saved.sequences!)[0];
  const locked=ops.setTrackState(saved,"V1",{locked:true});
  assert.equal(ops.placeSequence(locked,sequence.id,"V1",0,true),locked);
  const reloaded=JSON.parse(JSON.stringify(saved));
  assert.equal(reloaded.sequences[sequence.id].tracks.find((t:{id:string})=>t.id==="V1").clips[0].src,media.src);
});

test("preferencias toleran almacenamiento antiguo o inválido y limitan altura",()=>{
  assert.equal(normalizeTimelinePreferences(null).linkedSelection,true);
  assert.equal(normalizeTimelinePreferences({trackHeight:999,snapping:"sí",showWaveforms:false}).trackHeight,120);
  assert.equal(normalizeTimelinePreferences({trackHeight:NaN}).trackHeight,56);
  assert.equal(normalizeTimelinePreferences({showWaveforms:false}).showWaveforms,false);
});

test("selección bajo cabezal respeta límites y destinos, y admite montaje de solo audio",()=>{
  const {p,video}=fixture();
  assert.equal(clipAtPlayhead(p,30)?.id,video.id);
  assert.equal(clipAtPlayhead(p,120),undefined);
  const audioOnly=ops.addAudioClip(createEmptyProject(),{src:"/media/voice.wav",name:"Voz",durationInFrames:90},"A0",0);
  assert.equal(clipAtPlayhead(audioOnly,30)?.kind,"audio");
  assert.equal(clipAtPlayhead(ops.setTrackState(audioOnly,"A0",{locked:true,targeted:true}),30),undefined);
});
