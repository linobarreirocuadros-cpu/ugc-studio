import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, destinationTrack, trackOutputEnabled, type VideoClip, type AudioClip } from "../src/project/types";
import * as ops from "../src/project/ops";

const original = { src: "/media/original.mp4", name: "Original", durationInFrames: 600, hasAudio: true };
const replacement = { ...original, src: "/media/replacement.mp4", name: "Nuevo" };
const fixture = () => ops.addSourceRange(createEmptyProject(), original, "V1", 0, 60, 360);
const videos = (p: ReturnType<typeof fixture>) => p.tracks.flatMap((t) => t.clips).filter((c): c is VideoClip => c.kind === "video");
function pairs(p: ReturnType<typeof fixture>) {
  for (const c of videos(p)) if (c.linkedClipId) {
    const mate = ops.findClip(p, c.linkedClipId)!.clip as AudioClip;
    assert.equal(mate.linkedClipId, c.id);
    assert.deepEqual([mate.from, mate.durationInFrames, mate.trimStart], [c.from, c.durationInFrames, c.trimStart]);
  }
}

test("sobrescribir el centro conserva ambos extremos y sus parejas sin superposición", () => {
  const before = fixture(), snapshot = JSON.stringify(before);
  const next = ops.addSourceRange(before, replacement, "V1", 90, 15, 75);
  assert.deepEqual(videos(next).sort((a,b)=>a.from-b.from).map((c)=>[c.name,c.from,c.durationInFrames,c.trimStart]), [["Original",0,90,60],["Nuevo",90,60,15],["Original",150,150,210]]);
  assert.equal(next.tracks.flatMap((t)=>t.clips).length,6); pairs(next);
  assert.equal(JSON.stringify(before),snapshot);
});

test("sobrescribir principio, final o todo no deja el sonido anterior detrás", () => {
  for (const [at,length,count] of [[0,60,2],[240,120,2],[0,360,1]]) {
    const p=ops.addSourceRange(fixture(),replacement,"V1",at,0,length);
    assert.equal(videos(p).length,count); pairs(p);
    for(const track of p.tracks) {
      const clips=[...track.clips].sort((a,b)=>a.from-b.from);
      assert.ok(clips.every((c,i)=>!i||clips[i-1].from+clips[i-1].durationInFrames<=c.from));
    }
  }
});

test("mover a una pista ocupada sobrescribe allí y conserva hueco de origen y sincronía", () => {
  let p=ops.addSourceRange(fixture(),replacement,"V2",330,0,60);
  const id=videos(p).find(c=>c.name==="Nuevo")!.id;
  p=ops.moveClip(p,id,90,"V1"); pairs(p);
  assert.equal(p.tracks.find(t=>t.id==="V2")!.clips.length,0);
  assert.equal(videos(p).length,3);
  const cut=ops.splitAt(p,120,id); pairs(cut);
  assert.equal(videos(cut).length,4);
});

test("extender un borde sobrescribe el vecino conservando su offset y audio", () => {
  let p=ops.addSourceRange(fixture(),replacement,"V1",300,0,90);
  const first=videos(p)[0];
  p=ops.trimClip(p,first.id,"end",30); pairs(p);
  const last=videos(p).find(c=>c.name==="Nuevo")!;
  assert.deepEqual([last.from,last.durationInFrames,last.trimStart],[330,60,30]);
});

test("candado protege edición manual, parejas, sobreescritura y resumen global", () => {
  const base=fixture(), video=videos(base)[0];
  const locked=ops.setTrackState(base,"A0",{locked:true});
  assert.equal(ops.moveClip(locked,video.id,60),locked);
  assert.equal(ops.trimClip(locked,video.id,"end",-30),locked);
  assert.equal(ops.slipClip(locked,video.id,30),locked);
  assert.equal(ops.deleteClip(locked,video.id),locked);
  assert.equal(ops.addSourceRange(locked,replacement,"V1",60,0,60),locked);
  assert.equal(videos(ops.splitAt(locked,90)).length,1);
  assert.throws(()=>ops.keepTimelineRanges(locked,[{start:0,end:60}]),/Desbloquea/);
  const lockedVideo=ops.setTrackState(base,"V1",{locked:true});
  assert.equal(ops.addSourceRange(lockedVideo,replacement,"V1",360,0,60),lockedVideo);
  assert.equal(destinationTrack(ops.setTrackState(lockedVideo,"V1",{targeted:true}),"video"),undefined);
});

test("salida de pistas, solo múltiple y destino se guardan en el proyecto", () => {
  let p=fixture();
  p=ops.setTrackState(p,"V1",{hidden:true,locked:true});
  p=ops.setTrackState(p,"A1",{solo:true});
  assert.equal(trackOutputEnabled(p,p.tracks.find(t=>t.id==="V1")!),false);
  assert.equal(trackOutputEnabled(p,p.tracks.find(t=>t.id==="A0")!),false);
  assert.equal(trackOutputEnabled(p,p.tracks.find(t=>t.id==="A1")!),true);
  p=ops.setTrackState(p,"A0",{solo:true,muted:true});
  assert.equal(trackOutputEnabled(p,p.tracks.find(t=>t.id==="A0")!),false);
  p=ops.setTrackState(p,"V2",{targeted:true});
  assert.equal(destinationTrack(p,"video"),"V2");
  assert.equal(destinationTrack(JSON.parse(JSON.stringify(p)),"video"),"V2");
});

test("el audio de video completo respeta el destino elegido y no elude su candado", () => {
  let p=ops.setTrackState(createEmptyProject(),"A1",{targeted:true});
  p=ops.addSourceRange(p,original,"V1",0,0,90);
  const video=videos(p)[0];
  assert.equal(ops.findClip(p,video.linkedClipId!)!.track.id,"A1");
  const locked=ops.setTrackState(p,"A1",{locked:true});
  assert.equal(ops.addSourceRange(locked,replacement,"V2",120,0,60),locked);
});

test("sobrescribir audio independiente conserva extremos y offsets sin mezclarlo", () => {
  let p=ops.addAudioClip(createEmptyProject(),{src:"/media/old.wav",name:"Antes",durationInFrames:300},"A0",0);
  p=ops.addAudioClip(p,{src:"/media/new.wav",name:"Nuevo",durationInFrames:60},"A0",90);
  const audio=p.tracks.find(t=>t.id==="A0")!.clips as AudioClip[];
  assert.deepEqual([...audio].sort((a,b)=>a.from-b.from).map(c=>[c.name,c.from,c.durationInFrames,c.trimStart]),[["Antes",0,90,0],["Nuevo",90,60,0],["Antes",150,150,150]]);
});

test("seguir ripple cierra huecos en pistas optadas y respeta las excluidas o bloqueadas", () => {
  let p=fixture();
  p=ops.addAudioClip(p,{src:"/media/music.wav",name:"Música",durationInFrames:450},"A1",0);
  p=ops.addTextClip(p,{text:"Texto",from:330,durationInFrames:60});
  p=ops.setTrackState(p,"A1",{syncLock:true});
  p=ops.setTrackState(p,"T1",{syncLock:true,locked:true});
  const video=videos(p)[0];
  const next=ops.rippleTrimClip(p,video.id,"end",-60); pairs(next);
  const music=next.tracks.find(t=>t.id==="A1")!.clips;
  assert.deepEqual(music.map(c=>[c.from,c.durationInFrames]),[[0,240],[240,150]]);
  assert.equal(next.tracks.find(t=>t.id==="T1")!.clips[0].from,330);
});
