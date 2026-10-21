import test from "node:test";
import assert from "node:assert/strict";
import {createEmptyProject,DEFAULT_CAPTION_STYLE,type Project} from "../src/project/types";
import {assertProject,parseProjectFile} from "../src/project/projectFile";
import * as ops from "../src/project/ops";
import {snapTimeline} from "../src/app/timelineSnap";
import {placeMedia,previewMedia,dropDuration,placedMediaIds} from "../src/app/mediaPlacement";
import {bypassSnap,normalizeGestures} from "../src/app/gesturePreferences";
import type {MediaDrag} from "../src/app/Timeline";

const media={src:"/media/toma.mp4",name:"Toma",kind:"video" as const,hasAudio:true,durationInFrames:600};
const options={media:[media],nested:true};
const payload:MediaDrag={src:media.src,kind:"video",mode:"auto",inFrame:60,outFrame:150};
function fixture(){let p=ops.ensureProjectLibrary(createEmptyProject(),[media]);return ops.addSourceRange(p,media,"V1",0,0,300);}
const geometry=(p:Project)=>p.tracks.flatMap(t=>t.clips.map(c=>({trackId:t.id,kind:c.kind,from:c.from,duration:c.durationInFrames,trim:"trimStart" in c?c.trimStart:undefined})));

test("imán del cabezal entra en el corte, permite seguir moviendo y se puede ignorar",()=>{
  const p=fixture(),hit=snapTimeline(p,297,1,true);assert.equal(hit.frame,300);assert.equal(hit.point,300);
  assert.equal(snapTimeline(p,310,1,true,{previous:hit}).frame,300);
  const released=snapTimeline(p,314,1,true,{previous:hit});assert.equal(released.frame,314);assert.equal(released.point,null);
  assert.equal(snapTimeline(p,297,1,false,{previous:hit}).frame,297);
  assert.equal(snapTimeline(p,297,4,true).frame,297); // el umbral conserva tamaño físico al hacer zoom
});
test("imán de entrada alinea comienzo o final de la silueta y respeta cero",()=>{
  const p=fixture(),hit=snapTimeline(p,212,1,true,{duration:90});assert.equal(hit.frame,210);assert.equal(hit.point,300);assert.equal(hit.edge,"end");
  assert.equal(snapTimeline(p,-5,1,true,{duration:90}).frame,0);
  assert.equal(snapTimeline(p,299,1,true,{maximum:299}).frame,299);
});
test("la silueta de Origen representa video y audio con el I/O exacto sin cambiar el proyecto",()=>{
  const p=fixture(),before=JSON.stringify(p),shapes=previewMedia(p,payload,"T1",330,options);
  assert.equal(JSON.stringify(p),before);assert.equal(shapes.length,2);
  assert.deepEqual(shapes.map(s=>({trackId:s.trackId,kind:s.clip.kind,from:s.clip.from,duration:s.clip.durationInFrames,trim:"trimStart" in s.clip?s.clip.trimStart:undefined})),geometry(placeMedia({...p,tracks:p.tracks.map(t=>({...t,clips:[]}))},payload,"T1",330,options)));
  assert.ok(shapes.every(s=>s.clip.from===330&&s.clip.durationInFrames===90));
  const placed=placeMedia(p,payload,"T1",330,options);assertProject(placed);
  const v=placed.tracks.find(t=>t.id==="T1")!.clips[0];assert.equal(v.kind,"video");if(v.kind==="video"){assert.equal(v.trimStart,60);assert.ok(v.linkedClipId);}
});
test("modos solo video/audio no inventan una pareja, y destinos incompatibles no cambian nada",()=>{
  const p=fixture();const image=previewMedia(p,{...payload,mode:"video"},"S1",330,options);assert.equal(image.length,1);assert.equal(image[0].clip.kind,"video");assert.equal("volume" in image[0].clip&&image[0].clip.volume,0);
  const sound=previewMedia(p,{...payload,mode:"audio"},"A1",330,options);assert.equal(sound.length,1);assert.equal(sound[0].clip.kind,"audio");
  assert.equal(placeMedia(p,{...payload,mode:"audio"},"T1",0,options),p);
  assert.equal(placeMedia(p,{...payload,mode:"video"},"A0",0,options),p);
  const locked=ops.setTrackState(p,"A0",{locked:true,targeted:true});assert.deepEqual(previewMedia(locked,payload,"V2",330,options),[]);assert.equal(placeMedia(locked,payload,"V2",330,options),locked);
});
test("cualquier pista B admite imagen/texto/gráficos/subtítulos y se guarda con nombres consecutivos",()=>{
  let p=fixture();p=ops.addTextClip(p,{id:"texto",text:"Oferta",from:330,durationInFrames:60},"V1");p=ops.addGraphic(p,"rectangle",400,60,"V1");
  p=ops.moveClip(p,"texto",330,"S1");assert.equal(ops.findClip(p,"texto")!.track.id,"S1");
  p={...p,tracks:p.tracks.map(t=>t.id==="V2"?{...t,clips:[{id:"sub",kind:"caption",from:0,durationInFrames:30,words:[{text:"Hola",start:0,end:30}],style:DEFAULT_CAPTION_STYLE}]}:t)};
  assertProject(p);const loaded=parseProjectFile(JSON.stringify({project:p})).project;
  assert.deepEqual(loaded.tracks.filter(t=>t.kind!=="audio").map(t=>t.name),["B1","B2","B3","B4"]);
  const invalid=structuredClone(p);invalid.tracks.find(t=>t.id==="A2")!.clips=[ops.findClip(p,"texto")!.clip];assert.throws(()=>assertProject(invalid));
});
test("Proyecto muestra todos los elementos consecutivos y coloca gráficos en la pista elegida",()=>{
  let p=ops.addProjectElement(fixture(),"text","Oferta",60,undefined,undefined,"oferta");
  const drag:MediaDrag={...payload,items:[{...payload,mode:"video"},{src:"",kind:"video",mode:"auto",inFrame:0,outFrame:60,elementId:"oferta"}]};
  assert.equal(dropDuration(drag),150);const shapes=previewMedia(p,drag,"V2",330,options);assert.equal(shapes.length,2);assert.deepEqual(shapes.map(s=>[s.trackId,s.clip.from,s.clip.durationInFrames]),[["V2",330,90],["V2",420,60]]);
  const placed=placeMedia(p,drag,"V2",330,options);assertProject(placed);assert.equal(placed.tracks.find(t=>t.id==="V2")!.clips[1].kind,"text");
  const audio=ops.placeProjectElement(p,"oferta",0,undefined,"A0");assert.equal(audio,p);
});
test("rango de Programa conserva capas mixtas, huecos y solo el modo solicitado",()=>{
  let p=fixture();p=ops.addTextClip(p,{text:"Texto",from:30,durationInFrames:60},"V2");p=ops.addGraphic(p,"rectangle",90,60,"T1");
  const copied=ops.copyTimelineRange(p,30,180),drag:MediaDrag={src:"",kind:"video",mode:"auto",inFrame:0,outFrame:150,timelineRange:{project:copied,documentEpoch:1}};
  const shapes=previewMedia(p,drag,"V2",330,options);assert.ok(shapes.some(s=>s.clip.kind==="text"));assert.ok(shapes.some(s=>s.clip.kind==="graphic"));assert.ok(shapes.some(s=>s.clip.kind==="audio"));
  const placed=placeMedia(p,drag,"V2",330,options);assertProject(placed);
  assert.ok(previewMedia(p,{...drag,mode:"audio"},"A1",330,options).every(s=>s.clip.kind==="audio"));
  assert.ok(previewMedia(p,{...drag,mode:"video"},"T1",330,options).every(s=>s.clip.kind!=="audio"));
});

test("colocar solo una señal no borra el contenido de su pareja en otra pista",()=>{
  const p=fixture(),timing=(p:Project,id:string)=>p.tracks.find(t=>t.id===id)!.clips.map(c=>({kind:c.kind,from:c.from,duration:c.durationInFrames,trim:"trimStart" in c?c.trimStart:undefined}));
  const sound=placeMedia(p,{...payload,mode:"audio"},"A0",90,options);assert.deepEqual(timing(sound,"V1"),timing(p,"V1"));assertProject(sound);
  const image=placeMedia(p,{...payload,mode:"video"},"V1",90,options);assert.deepEqual(timing(image,"A0"),timing(p,"A0"));assertProject(image);
  const text=ops.addTextClip(p,{text:"Oferta",from:90,durationInFrames:60},"V1");assert.deepEqual(timing(text,"A0"),timing(p,"A0"));assertProject(text);
});

test("ignorar imán usa preferencias editables y migra presets antiguos de rueda",()=>{
  const event={ctrlKey:false,metaKey:false,altKey:false,shiftKey:true};assert.equal(bypassSnap(event,normalizeGestures({Alt:"zoom"})),true);
  assert.equal(bypassSnap(event,normalizeGestures({snapBypass:"Ctrl"})),false);assert.equal(bypassSnap({...event,ctrlKey:true,shiftKey:false},normalizeGestures({snapBypass:"Ctrl"})),true);
  assert.equal(bypassSnap(event,normalizeGestures({snapBypass:"none"})),false);
});

test("la selección al soltar contiene solo lo colocado, nunca extremos conservados al sobrescribir",()=>{
  const p=fixture(),shapes=previewMedia(p,payload,"V1",90,options),next=placeMedia(p,payload,"V1",90,options),ids=placedMediaIds(p,next,shapes);assert.equal(ids.length,2);for(const id of ids){const c=ops.findClip(next,id)!.clip;assert.equal(c.from,90);assert.equal(c.durationInFrames,90);}
});

test("generar subtítulos no borra video en la antigua S1 ni crea salidas duplicadas al repetir",()=>{
  let p=fixture();const video=p.tracks.find(t=>t.id==="V1")!.clips[0];p=ops.moveClip(p,video.id,0,"S1");p=ops.setTranscript(p,media.src,[{text:"Hola",start:0,end:20},{text:"mundo",start:22,end:42}]);
  const captioned=ops.generateCaptions(p);assert.equal(ops.findClip(captioned,video.id)!.track.id,"S1");assert.ok(captioned.tracks.some(t=>t.clips.some(c=>c.kind==="caption")));assertProject(captioned);
  const repeated=ops.generateCaptions(captioned);assert.equal(repeated.tracks.length,captioned.tracks.length);assertProject(repeated);
});
