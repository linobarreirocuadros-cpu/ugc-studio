import test from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, ambiguousBindings, conflicts, defaultBindings, eventChord, normalizeBindings, resolveCommand, validChord } from "../src/app/commands";
import { anchoredZoom, normalizeGestures, wheelModifier, wheelPixels } from "../src/app/gesturePreferences";
import { createEmptyProject, type AudioClip, type Project, type VideoClip } from "../src/project/types";
import * as ops from "../src/project/ops";
import reference from "../src/app/premiereReference.json";
import { normalizeShortcutSettings } from "../src/app/useShortcuts";

test("el catálogo tiene IDs únicos, combinaciones válidas y ninguna ambigüedad dentro de un panel",()=>{
  assert.equal(new Set(COMMANDS.map(c=>c.id)).size,COMMANDS.length);
  for(const c of COMMANDS) for(const chord of c.defaults) assert.ok(validChord(chord),`${c.id}: ${chord}`);
  assert.deepEqual(ambiguousBindings(defaultBindings()),[]);
  assert.equal(validChord("Alt+Ctrl+KeyA"),false);assert.equal(validChord("Ctrl+ControlLeft"),false);
});
test("los atajos del panel prevalecen, una reserva pendiente no ejecuta otra acción y los cambios sustituyen el mapa",()=>{
  const bindings=defaultBindings();
  assert.equal(resolveCommand(bindings,"ArrowRight","timeline")?.id,"stepRight1");
  assert.equal(resolveCommand(bindings,"ArrowRight","bin")?.id,"binmoveRight");
  assert.equal(resolveCommand(bindings,"Shift+KeyO","source")?.id,"goOut");
  assert.equal(resolveCommand(bindings,"Shift+KeyO","bin")?.id,"binSource");
  assert.ok(resolveCommand(bindings,"Ctrl+KeyR","program")?.pending);
  bindings["tool.razor"]=["F2"];assert.equal(resolveCommand(bindings,"KeyC","timeline"),undefined);assert.equal(resolveCommand(bindings,"F2","timeline")?.id,"tool.razor");
  assert.ok(conflicts(bindings,"tool.razor","KeyV").some(c=>c.id==="tool.select"));
  assert.equal(conflicts(bindings,"binmoveRight","ArrowRight").some(c=>c.id==="historyForward"),false);
  const loaded=normalizeBindings({"tool.razor":[],save:["Ctrl+KeyP"],undo:["evil"],unknown:["KeyC"]});
  assert.deepEqual(loaded["tool.razor"],[]);assert.deepEqual(loaded.save,["Ctrl+KeyP"]);assert.deepEqual(loaded.undo,["Ctrl+KeyZ"]);
});
test("la referencia conserva las 629 asignaciones de ambos modos y corrige Shift+L sin borrar preferencias",()=>{
  assert.equal(reference.entries.length,629);assert.equal(reference.entries.filter(r=>r.mode==="Edit").length,394);assert.equal(reference.entries.filter(r=>r.mode==="Color").length,235);
  for(const r of reference.entries)assert.ok(validChord(r.chord),`${r.command}: ${r.chord}`);
  assert.equal(reference.entries.find(r=>r.mode==="Edit"&&r.command==="cmd.transport.shuttle.slow.right")!.chord,"Shift+KeyL");
  assert.equal(resolveCommand(defaultBindings(),"Shift+KeyL","timeline")?.id,"slowForward");
  const migrated=normalizeShortcutSettings({version:1,bindings:{linkedSelection:["Shift+KeyL"],maximize:["Backquote","Shift+Backquote"],"tool.razor":["F2"]}});
  assert.deepEqual(migrated.bindings.linkedSelection,[]);assert.deepEqual(migrated.bindings.maximize,["Backquote"]);assert.deepEqual(migrated.bindings["tool.razor"],["F2"]);
});
test("captura física ignora composición y AltGr, mantiene modificadores exactos sin activar otros atajos",()=>{
  const event={code:"KeyK",ctrlKey:true,altKey:true,shiftKey:false,metaKey:false,isComposing:false,getModifierState:()=>false};
  assert.equal(eventChord(event),"Ctrl+Alt+KeyK");
  assert.equal(eventChord({...event,isComposing:true}),null);assert.equal(eventChord({...event,getModifierState:()=>true}),null);
  assert.equal(eventChord({...event,code:"AltRight"}),null);
  assert.equal(resolveCommand(defaultBindings(),"Ctrl+Alt+KeyK","timeline")?.id,"shortcuts");
  assert.equal(resolveCommand(defaultBindings(),"Alt+KeyK","timeline"),undefined);
});
test("rueda conserva el fotograma bajo el puntero, normaliza unidades y tolera preferencias antiguas",()=>{
  const next=anchoredZoom(2,1.25,180,240);assert.equal((next.left+240)/next.scale,(180+240)/2);
  assert.equal(anchoredZoom(20,4,0,0).scale,20);
  assert.equal(wheelModifier({ctrlKey:true,metaKey:false,altKey:true,shiftKey:true}),"Ctrl+Alt+Shift");
  assert.equal(wheelPixels(3,1,300),48);assert.equal(wheelPixels(1,2,300),300);
  assert.equal(normalizeGestures({Alt:"evil",Ctrl:"zoom"}).Alt,"zoom");assert.equal(normalizeGestures({Ctrl:"zoom"}).Ctrl,"zoom");
  assert.equal(normalizeGestures({Alt:"constructor",Ctrl:{toString:null}}).Ctrl,"vertical");
});
const media={src:"/media/original.mp4",name:"Original",durationInFrames:600,hasAudio:true};
const fixture=()=>ops.addSourceRange(createEmptyProject(),media,"V1",0,60,360);
function pairs(p:Project){for(const c of p.tracks.flatMap(t=>t.clips))if(c.kind==="video"&&c.linkedClipId){const mate=ops.findClip(p,c.linkedClipId)?.clip as AudioClip;assert.ok(mate);assert.equal(mate.linkedClipId,c.id);assert.deepEqual([mate.from,mate.durationInFrames,mate.trimStart],[c.from,c.durationInFrames,c.trimStart]);}}
test("copiar/pegar remapea enlaces, mantiene offsets, sobrescribe atómicamente y protege candados",()=>{
  const base=fixture(),video=base.tracks.flatMap(t=>t.clips).find(c=>c.kind==="video")!,snapshot=JSON.stringify(base);
  const copy=ops.copyClips(base,[video.id]),pasted=ops.pasteClips(base,copy,300);
  assert.equal(pasted.tracks.flatMap(t=>t.clips).length,4);pairs(pasted);assert.equal(JSON.stringify(base),snapshot);
  const pastedVideo=pasted.tracks.flatMap(t=>t.clips).find(c=>c.kind==="video"&&c.from===300) as VideoClip;
  assert.equal(pastedVideo.trimStart,60);assert.notEqual(pastedVideo.id,video.id);
  const overwrite=ops.pasteClips(base,copy,90);pairs(overwrite);assert.equal(overwrite.tracks.find(t=>t.id==="V1")!.clips.length,2);
  const locked=ops.setTrackState(base,"A0",{locked:true});assert.equal(ops.pasteClips(locked,copy,300),locked);
  const independent=ops.pasteClips(base,ops.copyClips(base,[video.id],false),300);const single=independent.tracks.flatMap(t=>t.clips).find(c=>c.id!==video.id&&c.kind==="video") as VideoClip;assert.equal(single.linkedClipId,undefined);
});
test("insertar Origen abre espacio, conserva parejas y offsets, mueve seguidores y marcadores una vez",()=>{
  let base=ops.addTextClip(fixture(),{text:"Seguimiento",from:120,durationInFrames:30});base=ops.setTrackState(base,"T1",{syncLock:true});base=ops.setMarker(base,{id:"m",frame:150,label:"M",color:"#5ab0ff"});
  const snapshot=JSON.stringify(base),next=ops.insertSourceRange(base,{...media,src:"/media/new.mp4",name:"Nuevo"},"V1",90,10,70);
  pairs(next);assert.equal(JSON.stringify(base),snapshot);
  const video=next.tracks.find(t=>t.id==="V1")!.clips.sort((a,b)=>a.from-b.from) as VideoClip[];
  assert.deepEqual(video.map(c=>[c.name,c.from,c.durationInFrames,c.trimStart]),[["Original",0,90,60],["Nuevo",90,60,10],["Original",150,210,150]]);
  assert.equal(next.tracks.find(t=>t.id==="T1")!.clips[0].from,180);assert.equal(next.markers![0].frame,210);
  const locked=ops.setTrackState(base,"A0",{locked:true});assert.equal(ops.insertSourceRange(locked,media,"V1",90,0,60),locked);
  assert.equal(ops.insertSourceRange(base,media,"V1",90,90,60),base);
});
test("pegar referencias de secuencias no crea ciclos ni referencias perdidas",()=>{
  const base=fixture(),id=base.tracks.find(t=>t.id==="V1")!.clips[0].id,withSeq=ops.createSequence(base,[id],"S");
  const seq=Object.keys(withSeq.sequences!)[0],nested=ops.placeSequence(withSeq,seq,"V2",330,true),clip=nested.tracks.find(t=>t.id==="V2")!.clips[0];
  const copy=ops.copyClips(nested,[clip.id]);assert.equal(ops.pasteClips(nested,copy,600,seq),nested);
  const absent={...nested,sequences:{}};assert.equal(ops.pasteClips(absent,copy,600),absent);
});
