import test from "node:test";
import assert from "node:assert/strict";
import {groupPanel,activateTab,tabGroups,defaultLayout,panelsIn,PANELS,normalizeLayout,removePanel,dockPanel,layoutRects,constrainFloating,normalizeFloating} from "../src/app/workspaceLayout";
import {matchDisplay,restoredWindow,type DisplayInfo} from "../src/app/panelWindows";
import {editAvailable} from "../src/app/editAvailability";
import {createEmptyProject} from "../src/project/types";
import * as ops from "../src/project/ops";
test("pestañas conservan paneles únicos, selección y serialización; extraer una no pierde el grupo",()=>{
  let tree=groupPanel(defaultLayout(),"inspector","bin");tree=groupPanel(tree,"timeline","bin");
  assert.deepEqual([...panelsIn(tree)].sort(),[...PANELS].sort());assert.equal(tabGroups(tree)[0].active,"timeline");
  tree=activateTab(tree,"bin");assert.equal(tabGroups(tree)[0].active,"bin");assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(tree))),tree);
  const removed=removePanel(tree,"bin")!;assert.deepEqual(tabGroups(removed)[0].panels,["inspector","timeline"]);assert.ok(panelsIn(removed).includes("inspector"));
  const docked=dockPanel(tree,"timeline","workspace","bottom");assert.deepEqual(tabGroups(docked)[0].panels,["bin","inspector"]);assert.equal(layoutRects(docked,1200,700).panels.timeline.width,1200);
});
test("cada panel se puede agrupar y separar; pestañas inválidas no sustituyen una distribución válida",()=>{
  for(const source of PANELS)for(const target of PANELS){const tree=groupPanel(defaultLayout(),source,target);assert.deepEqual([...panelsIn(tree)].sort(),[...PANELS].sort());assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(tree))),tree);}
  assert.deepEqual(normalizeLayout({type:"tabs",panels:["bin","bin","monitor","inspector","timeline","meter"],active:"bin"}),defaultLayout());
  const tree=PANELS.slice(1).reduce((t,p)=>groupPanel(t,p,"bin"),defaultLayout());assert.equal(tabGroups(tree)[0].panels.length,5);for(const r of Object.values(layoutRects(tree,800,500).panels))assert.deepEqual(r,{x:0,y:0,width:800,height:500});
});
test("flotantes no quedan fuera del área al quitar un monitor o reducir la ventana",()=>{
  const r=constrainFloating({x:1400,y:800,width:700,height:500},640,380);assert.deepEqual(r,{x:0,y:0,width:640,height:380});
  assert.deepEqual(constrainFloating({x:-90,y:-20,width:50,height:20},640,380),{x:0,y:0,width:180,height:140});
  assert.deepEqual(normalizeFloating({timeline:{x:NaN,y:0,width:30,height:50},fake:{x:0,y:0,width:50,height:50}}),{});
});
const primary:DisplayInfo={label:"Principal",isPrimary:true,availLeft:0,availTop:0,availWidth:1920,availHeight:1040};
const secondary:DisplayInfo={label:"Edición",isPrimary:false,availLeft:1920,availTop:0,availWidth:2560,availHeight:1400};
test("preset identifica el monitor por identidad aunque cambie el orden y la posición al reconectarlo",()=>{
  const moved={...secondary,availLeft:-2560};assert.equal(matchDisplay(secondary,[moved,primary]),moved);
  assert.deepEqual(restoredWindow({display:secondary,rect:{x:2176,y:140,width:1280,height:700}},[moved,primary]),{x:-2304,y:140,width:1280,height:700});
});
test("sin segundo monitor el preset cabe en el principal; al reconectar recupera el destino guardado",()=>{
  const placement={display:secondary,rect:{x:2176,y:140,width:1280,height:700}},snapshot=JSON.stringify(placement);
  const one=restoredWindow(placement,[primary]);assert.ok(one.x>=0&&one.x+one.width<=1920&&one.y+one.height<=1040);
  const two=restoredWindow(placement,[primary,secondary]);assert.equal(two.x,2176);assert.equal(JSON.stringify(placement),snapshot);
});
test("ganancia/canales/anidar se habilitan solo con selección compatible y respetan parejas bloqueadas",()=>{
  let p=ops.addSourceRange(createEmptyProject(),{src:"/media/a.mp4",name:"Toma",durationInFrames:300,hasAudio:true},"V1",0);const video=p.tracks.find(t=>t.id==="V1")!.clips[0];
  assert.ok(editAvailable(p,[video.id],"gain"));assert.ok(editAvailable(p,[video.id],"channels"));assert.ok(editAvailable(p,[video.id],"speed"));
  p=ops.addTextClip(p,{text:"Texto",from:0,durationInFrames:30});const text=p.tracks.flatMap(t=>t.clips).find(c=>c.kind==="text")!;assert.equal(editAvailable(p,[text.id],"gain"),false);assert.equal(editAvailable(p,[text.id],"channels"),false);assert.equal(editAvailable(p,[text.id],"speed"),false);
  p=ops.setTrackState(p,"A0",{locked:true});for(const action of ["gain","channels","speed","nest","delete"])assert.equal(editAvailable(p,[video.id],action),false);assert.ok(editAvailable(p,[video.id],"copy"));
});

test("metadatos de pantalla dañados no restauran una ventana con coordenadas invisibles",()=>{
  const r=restoredWindow({display:{...secondary,availLeft:NaN,availWidth:0},rect:{x:2176,y:140,width:1280,height:700}},[primary]);assert.ok(Object.values(r).every(Number.isFinite));assert.ok(r.x>=0&&r.x+r.width<=primary.availWidth);
});
