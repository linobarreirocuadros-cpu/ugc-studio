import test from "node:test";
import assert from "node:assert/strict";
import * as ops from "../src/project/ops";
import {createEmptyProject,DEFAULT_CAPTION_STYLE,type CaptionClip,type Project} from "../src/project/types";
import {DEFAULT_MOTION,motionAt} from "../src/project/motion";
import {assertProject,parseProjectFile} from "../src/project/projectFile";
import {executeMotionTool,parseMotion} from "../src/app/chat/executeMotionTool";
import {guardAssistantSession} from "../src/app/assistantSession";
import {hyperframesHtml,HYPERFRAMES_VERSION} from "../src/remotion/hyperframesHtml";
function fixture(){return ops.addMotionScene(createEmptyProject(),[{kind:"caption",text:"Todo sigue editable",from:0,durationInFrames:90,style:{...DEFAULT_CAPTION_STYLE,fontFamily:"Poppins"},motion:{entrance:"rise",exit:"fade",keys:[{frame:0,x:0,scale:1},{frame:60,x:90,scale:1.2}]}}],"hyperframes");}
const caption=(p:Project)=>p.tracks.flatMap(t=>t.clips).find(c=>c.kind==="caption") as CaptionClip;
test("escenas de ambos motores son elementos JSON editables, agrupados y serializables",()=>{
 const before=createEmptyProject(),snapshot=JSON.stringify(before),p=ops.addMotionScene(before,[{kind:"rectangle",from:10,durationInFrames:90,layer:0},{kind:"caption",text:"Texto editable",from:10,durationInFrames:90,layer:1,style:{fontFamily:"Poppins",fontSize:48}}],"hyperframes");
 assert.equal(JSON.stringify(before),snapshot);assertProject(p);
 const clips=p.tracks.flatMap(t=>t.clips);assert.equal(clips.length,2);assert.equal(clips[0].groupId,clips[1].groupId);assert.ok(clips[0].groupId);assert.equal(caption(p).words[1].text,"editable");assert.equal(caption(p).style.fontFamily,"Poppins");
 assert.deepEqual(parseProjectFile(JSON.stringify({project:p})).project,p);
});
test("cambiar el motor no aplana, elimina texto, cambia tiempos ni convierte medios",()=>{
 const p=fixture(),c=caption(p),next=ops.setClipMotion(p,[c.id],{wordScale:1.4},"remotion"),d=caption(next);
 assert.equal(d.renderEngine,"remotion");assert.equal(d.id,c.id);assert.deepEqual(d.words,c.words);assert.deepEqual(d.style,c.style);assert.equal(d.durationInFrames,c.durationInFrames);assert.equal(d.motion?.wordScale,1.4);assert.equal("src"in d,false);
 assert.equal(c.motion?.wordScale,DEFAULT_MOTION.wordScale);
});
test("candados e incompatibilidades rechazan toda la transacción y no crean pistas huérfanas",()=>{
 const p=fixture(),c=caption(p),track=p.tracks.find(t=>t.clips.some(x=>x.id===c.id))!,locked=ops.setTrackState(p,track.id,{locked:true});
 assert.equal(ops.setClipMotion(locked,[c.id],{entrance:"pop"},"remotion"),locked);
 assert.equal(ops.addMotionScene(locked,[{kind:"caption",text:"No",from:0,durationInFrames:30,trackId:track.id},{kind:"text",text:"Tampoco",from:0,durationInFrames:30,layer:2}]),locked);
 const video=ops.addVideoClip(p,{src:"/media/test.mp4",name:"video",durationInFrames:100},"V1",0),v=video.tracks.flatMap(t=>t.clips).find(x=>x.kind==="video")!;
 assert.equal(ops.setClipMotion(video,[c.id,v.id],{},"hyperframes"),video);
 assert.throws(()=>assertProject({...video,tracks:video.tracks.map(t=>({...t,clips:t.clips.map(x=>x.id===v.id?{...x,renderEngine:"hyperframes"}:x)}))}));
});
test("cortar, recortar y copiar rangos conserva el reloj de animación y los tiempos de palabras",()=>{
 const p=fixture(),c=caption(p),cut=ops.splitAt(p,29,c.id),right=cut.tracks.flatMap(t=>t.clips).find(x=>x.from===29)!;
 assert.deepEqual(motionAt(right,7),motionAt(c,36));assert.deepEqual(right.motion?.keys,c.motion?.keys);assert.equal(right.renderEngine,"hyperframes");
 const trimmed=caption(ops.trimClip(p,c.id,"start",20));assert.deepEqual(motionAt(trimmed,9),motionAt(c,29));assert.equal(trimmed.words[0].start,0);assert.equal(trimmed.words[0].end,10);
 const range=caption(ops.copyTimelineRange(p,20,55));assert.deepEqual(motionAt(range,12),motionAt(c,32));assert.ok(range.words.every(w=>w.start>=0&&w.end<=35));assertProject(ops.copyTimelineRange(p,20,55));
 const shortened=caption(ops.trimClip(p,c.id,"end",-50));assert.ok(shortened.words.every(w=>w.end<=40));
});
test("texto, tipografía y palabra/tiempos cambian sin perder motor ni claves",()=>{
 const p=fixture(),c=caption(p),a=ops.setCaptionText(p,c.id,"Todo queda editable"),b=ops.setCaptionWord(a,c.id,1,{text:"sigue",start:32,end:57}),d=caption(b);
 assert.equal(d.words[1].text,"sigue");assert.equal(d.words[1].start,32);assert.deepEqual(d.motion,c.motion);assert.equal(d.renderEngine,c.renderEngine);
 assert.equal(ops.setCaptionWord(b,c.id,1,{end:300}),b);assert.equal(ops.setCaptionWord(b,c.id,1,{text:""}),b);assert.equal(ops.setClipMotion(p,[c.id],{keys:[{frame:8,x:1},{frame:8,x:2}]}),p);
});
test("chat genera múltiples elementos con tiempos reales, una sola confirmación y sin servicios pagos",()=>{
 let p={...createEmptyProject(),fps:25};const old=p,commits:Project[]=[],panels:string[]=[];
 const ctx={getProject:()=>p,commit:(n:Project)=>{p=n;commits.push(n);},showPanel:(id:string)=>panels.push(id)};
 const result=JSON.parse(executeMotionTool("create_motion_scene",{render_engine:"hyperframes",elements:[{kind:"caption",start_s:2,duration_s:3,words:[{text:"Hola",start_s:0,end_s:.8},{text:"Lino",start_s:1,end_s:2.7}],style:{fontFamily:"Inter",fontSize:40,background:null},motion:{entrance:"pop",in_s:.2}},{kind:"rectangle",start_s:2,duration_s:3,layer:1,color:"#00ccff"}]},ctx));
 assert.equal(commits.length,1);assert.equal(result.created.length,2);assert.equal(caption(p).from,50);assert.equal(caption(p).words[1].start,25);assert.equal(caption(p).motion?.inFrames,5);assert.equal(caption(p).style.background,null);assert.equal(old.tracks.flatMap(t=>t.clips).length,0);assert.equal(panels.at(-1),"effectControls");
 p=old;assert.equal(p.tracks.flatMap(t=>t.clips).length,0);
});
test("chat conserva la selección capturada y bloquea operaciones asíncronas de otra sesión",()=>{
 let p=fixture(),current=true;const c=caption(p),ctx=guardAssistantSession({getProject:()=>p,commit:(n:Project)=>{p=n;},selectedClipIds:[c.id]},()=>current);
 executeMotionTool("set_motion_parameters",{values:{entrance:"fade",keys:[{time_s:0,x:0},{time_s:1,x:200}]}},ctx);assert.equal(caption(p).motion?.keys[1].frame,30);
 current=false;const snapshot=p;assert.throws(()=>executeMotionTool("set_motion_parameters",{values:{exit:"pop"}},ctx),/Cambiaste/);assert.equal(p,snapshot);
});
test("validación rechaza código, valores inválidos y motores no admitidos antes de guardar",()=>{
 const p=fixture(),c=caption(p);assert.equal(ops.setClipMotion(p,[c.id],{distance:Infinity}),p);assert.throws(()=>parseMotion({html:"<script/>"},30));assert.throws(()=>parseMotion({in_s:-1},30));
 const bad=structuredClone(p);caption(bad).motion!.keys=[{frame:NaN,x:2}];assert.throws(()=>assertProject(bad));
 let commits=0;assert.throws(()=>executeMotionTool("create_motion_scene",{elements:[{kind:"caption",start_s:0,duration_s:3,text:"x",html:"código"}]},{getProject:()=>p,commit:()=>{commits++;}}));assert.equal(commits,0);
});
test("plantilla HyperFrames usa runtime oficial local y escapa texto sin convertirlo en HTML",()=>{
 const p=fixture(),c={...caption(p),words:[{text:'</script><img src=x onerror=alert(1)>',start:0,end:60}]},html=hyperframesHtml(c,p,[]);
 assert.equal(HYPERFRAMES_VERSION,"0.8.185");assert.ok(html.includes("renderSeek"));assert.ok(html.includes("__playerReady"));assert.ok(html.includes("Content-Security-Policy"));assert.equal(html.includes(c.words[0].text),false);assert.ok(html.includes("\\u003c/script>"));assert.equal(html.match(/<script>/g)?.length,1);
});

test("elegir motor en un caption antiguo conserva su aparición y no añade una animación distinta",()=>{
 const p=fixture(),c=caption(p),old=ops.updateClip(p,c.id,{motion:undefined,renderEngine:undefined});
 const next=ops.setClipMotion(old,[c.id],{},"hyperframes");assert.equal(caption(next).motion,undefined);assert.deepEqual(caption(next).words,c.words);assert.equal(caption(next).renderEngine,"hyperframes");
});
