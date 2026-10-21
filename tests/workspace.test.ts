import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, dockPanel, dockTargets, dockScopes, layoutRects, normalizeLayout, panelsIn, PANELS, setSplitRatio, type DockNode,tabGroups } from "../src/app/workspaceLayout";

test("el acoplamiento conserva cada panel una vez y permite bordes globales o de otro panel", () => {
  let tree = defaultLayout();
  for (const panel of PANELS) for (const target of [...PANELS, "workspace"] as const) for (const edge of ["left", "right", "top", "bottom", "center"] as const) {
    tree = dockPanel(tree, panel, target, edge);
    assert.deepEqual([...panelsIn(tree)].sort(), [...PANELS].sort());
    assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(tree))), tree);
  }
});
test("el centro intercambia dos paneles manteniendo las divisiones cuando hay espacio", () => {
  const tree = defaultLayout(), swapped = dockPanel(tree, "bin", "timeline", "center");
  const before = layoutRects(tree, 2000, 1000), after = layoutRects(swapped, 2000, 1000);
  assert.deepEqual(after.panels.bin, before.panels.timeline);
  assert.deepEqual(after.panels.timeline, before.panels.bin);
  assert.deepEqual(after.dividers, before.dividers.map(d => ({ ...d,
    first: d.first.replace("Proyecto", "TEMP").replace("Timeline", "Proyecto").replace("TEMP", "Timeline"),
    second: d.second.replace("Proyecto", "TEMP").replace("Timeline", "Proyecto").replace("TEMP", "Timeline") })));
  assert.equal(dockPanel(tree, "bin", "bin", "left"), tree);
});
test("acoplar al borde exterior permite ocupar toda la altura o anchura", () => {
  const right = layoutRects(dockPanel(defaultLayout(), "monitor", "workspace", "right"), 1200, 700);
  assert.equal(right.panels.monitor.height, 700); assert.equal(right.panels.monitor.y, 0);
  const bottom = layoutRects(dockPanel(defaultLayout(), "timeline", "workspace", "bottom"), 1200, 700);
  assert.equal(bottom.panels.timeline.width, 1200); assert.equal(bottom.panels.timeline.x, 0);
});
test("la geometría queda dentro del área y sin solapamientos incluso en ventanas pequeñas", () => {
  let tree = defaultLayout();
  for (const panel of PANELS) {
    tree = dockPanel(tree, panel, "workspace", "right");
    for (const [w, h] of [[1600, 900], [756, 500], [320, 180], [0, 0]]) {
      const rects = Object.entries(layoutRects(tree, w, h).panels).filter(([id])=>!tabGroups(tree).some(g=>g.panels.includes(id as typeof PANELS[number])&&g.panels[0]!==id)).map(([,r])=>r);
      for (const r of rects) {
        assert.ok(r.width >= 0 && r.height >= 0 && Number.isFinite(r.x + r.y + r.width + r.height));
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= w + .0001 && r.y + r.height <= h + .0001);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= .0001 || Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) <= .0001);
      }
    }
  }
});
test("migra las zonas antiguas y rechaza distribuciones incompletas o corruptas", () => {
  const migrated = normalizeLayout({ slots: { left: "bin", center: "monitor", right: "timeline", bottom: "inspector" }, left: 200, right: 300, bottom: 220 });
  assert.deepEqual([...panelsIn(migrated)].sort(), [...PANELS].sort());
  assert.deepEqual(normalizeLayout({ type: "panel", panel: "bin" }), defaultLayout());
  const broken = { ...defaultLayout(), ratio: NaN };
  assert.deepEqual(normalizeLayout(broken), defaultLayout());
});
test("redimensionar modifica solo la división elegida y conserva el árbol original", () => {
  const tree = defaultLayout();
  const before = JSON.stringify(tree), resized = setSplitRatio(tree, "audio", .5);
  assert.equal(JSON.stringify(tree), before);
  assert.notDeepEqual(layoutRects(resized, 1200, 700).panels.meter, layoutRects(tree, 1200, 700).panels.meter);
  assert.deepEqual(layoutRects(resized, 1200, 700).panels.monitor, layoutRects(tree, 1200, 700).panels.monitor);
  assert.equal((setSplitRatio(tree, "rows", 4) as Extract<DockNode, { type: "split" }>).ratio, .98);
  assert.equal(setSplitRatio(tree, "rows", NaN), tree);
});

test("timeline puede abarcar Proyecto y Monitores sin invadir el chat lateral",()=>{
  const tree:DockNode={type:"split",id:"chat",axis:"x",ratio:.78,first:{type:"split",id:"left",axis:"x",ratio:.5,first:{type:"split",id:"library",axis:"y",ratio:.6,first:{type:"panel",panel:"bin"},second:{type:"split",id:"audio",axis:"x",ratio:.85,first:{type:"panel",panel:"timeline"},second:{type:"panel",panel:"meter"}}},second:{type:"panel",panel:"monitor"}},second:{type:"panel",panel:"inspector"}};
  const original=JSON.stringify(tree),before=layoutRects(tree,1600,900);
  const group=dockScopes(tree,"timeline","monitor").find(t=>typeof t.target==="object")!;
  assert.deepEqual([...group.panels].sort(),["bin","meter","monitor"]);
  let next=dockPanel(tree,"timeline",group.target,"bottom");next=dockPanel(next,"meter","timeline","right");
  const {panels,dividers}=layoutRects(next,1600,900);
  assert.deepEqual(panels.inspector,before.panels.inspector);assert.equal(panels.timeline.x,panels.bin.x);
  assert.equal(panels.meter.x+panels.meter.width,panels.monitor.x+panels.monitor.width);
  assert.equal(panels.timeline.y,panels.meter.y);assert.ok(panels.timeline.y>panels.monitor.y+panels.monitor.height);
  const upper=dividers.find(d=>d.first==="Proyecto"&&d.second==="Monitores")!;
  const resized=layoutRects(setSplitRatio(next,upper.id,.35),1600,900);
  assert.deepEqual(resized.panels.timeline,panels.timeline);assert.deepEqual(resized.panels.meter,panels.meter);
  assert.equal(JSON.stringify(tree),original);assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(next))),normalizeLayout(next));
});
test("acoplar cada panel a conjuntos conserva regiones sin duplicados ni solapamientos",()=>{
  let tree=dockPanel(defaultLayout(),"inspector","workspace","right");
  for(const source of PANELS)for(const target of dockTargets(tree,source))for(const edge of ["left","right","top","bottom"] as const){
    const next=dockPanel(tree,source,target.target,edge);assert.deepEqual([...panelsIn(next)].sort(),[...PANELS].sort());
    assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(next))),normalizeLayout(next));
    for(const [w,h] of [[1600,900],[640,380]]){
      const rects=Object.values(layoutRects(next,w,h).panels);
      for(const r of rects)assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w+.0001&&r.y+r.height<=h+.0001);
      for(const a of rects)for(const b of rects)if(a!==b)assert.ok(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<=.0001||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<=.0001);
    }
  }
});
test("alcances de arrastre son progresivos y un destino de conjunto obsoleto no cambia la distribución",()=>{
  const tree=dockPanel(defaultLayout(),"inspector","workspace","right"),scopes=dockScopes(tree,"timeline","bin");
  assert.equal(scopes[0].target,"bin");assert.equal(scopes.at(-1)!.target,"workspace");
  assert.ok(scopes.every((s,i)=>!i||s.panels.length>scopes[i-1].panels.length));
  assert.equal(dockPanel(tree,"timeline",{group:"missing"},"bottom"),tree);
  const group=scopes.find(s=>typeof s.target==="object")!;assert.equal(dockPanel(tree,"timeline",group.target,"center"),tree);
});
