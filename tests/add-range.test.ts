import test from "node:test";
import assert from "node:assert/strict";
import {createAddRangeGesture,addRangeBounds,type AddRange,type AddRangeOptions,type AddRangePointer} from "../src/app/addRangeGesture";
import {createEmptyProject,type Project} from "../src/project/types";
import {assertProject} from "../src/project/projectFile";
import * as ops from "../src/project/ops";

/** Puerto DOM mínimo: prueba los mismos listeners que utiliza el hook, sin navegador simulado. */
function gesture(project=createEmptyProject()){
  const win=Object.assign(new EventTarget(),{requestAnimationFrame:(fn:FrameRequestCallback)=>{tick=fn;return 1;},cancelAnimationFrame:()=>{tick=undefined;}});
  let tick:FrameRequestCallback|undefined,preview:AddRange|null=null,captured=false;
  const doc=Object.assign(new EventTarget(),{defaultView:win});
  const root=Object.assign(new EventTarget(),{ownerDocument:doc,setPointerCapture:()=>{captured=true;},hasPointerCapture:()=>captured,releasePointerCapture:()=>{captured=false;}});
  const scroll={scrollLeft:0,clientWidth:600,clientHeight:200,getBoundingClientRect:()=>({left:100,top:50})};
  const added:unknown[][]=[],menus:unknown[][]=[];
  const options:AddRangeOptions={project,scale:1,snapping:false,bypass:e=>e.shiftKey,viewport:{current:scroll as HTMLDivElement},onAdd:(...args)=>added.push(args),onMenu:(...args)=>menus.push(args)};
  const controller=createAddRangeGesture(()=>options,range=>{preview=range;});
  const fire=(type:string,fields:Record<string,unknown>={},where:EventTarget=win)=>{const e=Object.assign(new Event(type,{cancelable:true}),{pointerId:1,button:2,buttons:2,clientX:300,clientY:100,shiftKey:false,...fields});where.dispatchEvent(e);return e;};
  const down=(x=300,trackId="V1",onClip=false)=>{controller.onPointerDown({button:2,clientX:x,clientY:100,pointerId:1,currentTarget:root,target:{closest:(selector:string)=>selector.startsWith(".track")?{dataset:{trackId}}:onClip?{}:null},nativeEvent:{shiftKey:false}} as unknown as AddRangePointer);};
  return {options,down,fire,controller,added,menus,scroll,root,doc,preview:()=>preview,captured:()=>captured,tick:()=>tick?.(0)};
}

test("arrastre derecho abre Añadir con inicio/duración; no edita ni abre el menú de clips",()=>{
  const g=gesture(),before=JSON.stringify(g.options.project);g.down();
  assert.equal(g.fire("contextmenu",{},g.doc).defaultPrevented,true);
  g.fire("pointermove",{clientX:420});assert.deepEqual(g.preview(),{trackId:"V1",start:200,end:320,snap:null});
  assert.equal(JSON.stringify(g.options.project),before);assert.equal(g.added.length,0);
  g.fire("pointerup",{clientX:420,buttons:0});assert.deepEqual(g.added,[[200,120,"V1"]]);
  assert.equal(g.menus.length,0);assert.equal(g.preview(),null);assert.equal(g.captured(),false);
  g.fire("pointerup");assert.equal(g.added.length,1);g.controller.destroy();
});
test("rango invertido, escala y scroll actuales, autoscroll y salida de un fotograma",()=>{
  assert.deepEqual(addRangeBounds(0,0),{start:0,end:1});assert.deepEqual(addRangeBounds(7,2),{start:2,end:7});
  const g=gesture();g.scroll.scrollLeft=100;g.down(400);g.options.scale=2;
  g.fire("pointermove",{clientX:200});assert.deepEqual(g.preview(),{trackId:"V1",start:100,end:400,snap:null});
  g.fire("pointerup",{clientX:200});assert.deepEqual(g.added,[[100,300,"V1"]]);
  const auto=gesture();auto.down();auto.fire("pointermove",{clientX:699});auto.tick();assert.ok(auto.scroll.scrollLeft>0);auto.controller.destroy();
});
test("imán de bordes se conserva; modificador evita encaje sin modificar preferencias",()=>{
  const g=gesture(ops.addGraphic(createEmptyProject(),"solid",400,60,"V1"));g.options.snapping=true;g.down();
  g.fire("pointermove",{clientX:496});assert.equal(g.preview()?.end,400);assert.equal(g.preview()?.snap,400);
  g.fire("pointermove",{clientX:496,shiftKey:true});assert.equal(g.preview()?.end,396);assert.equal(g.preview()?.snap,null);g.controller.destroy();
});
test("clic derecho sin arrastre conserva menú; Escape, blur, cancelación, salida y desmontaje no insertan",()=>{
  const click=gesture();click.down();click.fire("pointermove",{clientX:303});click.fire("pointerup",{clientX:303});assert.equal(click.menus.length,1);assert.equal(click.added.length,0);
  for(const kind of ["Escape","blur","pointercancel","lostpointercapture","outside","destroy"]){
    const g=gesture();g.down();g.fire("pointermove",{clientX:420});
    if(kind==="Escape")g.fire("keydown",{key:"Escape"});else if(kind==="destroy")g.controller.destroy();else if(kind==="outside")g.fire("pointerup",{clientX:420,clientY:400});else g.fire(kind,{},kind==="lostpointercapture"?g.root:undefined);
    g.fire("pointerup",{clientX:420});assert.equal(g.added.length,0,kind);assert.equal(g.menus.length,0,kind);assert.equal(g.preview(),null,kind);
  }
});
test("no intercepta clips ni candados; cambiar/bloquear pista durante el gesto impide añadir",()=>{
  const g=gesture();g.down(300,"V1",true);assert.equal(g.captured(),false);
  g.options.project=ops.setTrackState(g.options.project,"V1",{locked:true});g.down();assert.equal(g.captured(),false);
  g.options.project=ops.setTrackState(g.options.project,"V1",{locked:false});g.down();g.fire("pointermove",{clientX:420});g.options.project=ops.setTrackState(g.options.project,"V1",{locked:true});g.fire("pointerup",{clientX:420});assert.equal(g.added.length,0);
});
test("texto, gráficos y plantillas ocupan el rango exacto en la pista elegida, conservando extremos",()=>{
  let p=ops.addGraphic(createEmptyProject(),"solid",0,600,"V1");
  p=ops.addProjectElement(p,"rectangle","Logo",150,"#334455",undefined,"logo");const before=structuredClone(p);
  const next=ops.placeProjectElement(p,"logo",100,undefined,"V1",60);
  assert.deepEqual(next.tracks.find(t=>t.id==="V1")!.clips.map(c=>[c.from,c.durationInFrames]).sort((a,b)=>a[0]-b[0]),[[0,100],[100,60],[160,440]]);
  assert.deepEqual(p,before);assert.equal(next.library!.elements[0].clip.durationInFrames,150);assertProject(next);
  const source=ops.addTextClip(createEmptyProject(),{text:"Plantilla",from:50,durationInFrames:200},"V1");
  const copied=ops.placeElementClip(p,source,source.tracks.find(t=>t.id==="V1")!.clips[0].id,700,"V2",19);
  assert.equal(copied.tracks.find(t=>t.id==="V2")!.clips[0].durationInFrames,19);assertProject(copied);
  const locked=ops.setTrackState(p,"V1",{locked:true});assert.equal(ops.placeProjectElement(locked,"logo",100,undefined,"V1",60),locked);
  assert.equal(ops.placeProjectElement(p,"logo",100,undefined,"V1",NaN),p);
});
test("secuencia recorta ambas parejas sin estirar y permite añadir solo sonido a Audio",()=>{
  const source=ops.addSourceRange(createEmptyProject(),{src:"/media/qa.mp4",name:"QA",durationInFrames:300,hasAudio:true},"V1",0,0,300);
  const p:Project={...createEmptyProject(),sequences:{s:{...source,id:"s",durationInFrames:300}}};
  const placed=ops.placeSequence(p,"s","V1",30,true,undefined,70);
  const clips=placed.tracks.flatMap(t=>t.clips);assert.equal(clips.length,2);for(const c of clips){assert.equal(c.from,30);assert.equal(c.durationInFrames,70);}assertProject(placed);
  const long=ops.placeSequence(p,"s","V1",30,true,undefined,800);assert.ok(long.tracks.flatMap(t=>t.clips).every(c=>c.durationInFrames===300));
  const audio=ops.placeSequence(p,"s","A0",30,true,undefined,80);const only=audio.tracks.flatMap(t=>t.clips);assert.equal(only.length,1);assert.equal(only[0].kind,"audio");assert.equal(only[0].durationInFrames,80);assertProject(audio);
  assert.equal(ops.placeSequence(p,"s","V1",0,true,"s",70),p);
  assert.equal(ops.placeSequence(ops.setTrackState(p,"A0",{locked:true}),"s","V1",0,true,undefined,70).tracks.flatMap(t=>t.clips).length,2); // Puede elegir otra pista de audio desbloqueada.
});
