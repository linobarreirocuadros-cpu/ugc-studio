import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {PanelHost,usePanelWindows,type WindowPlacement} from "./panelWindows";
import {ActionDialog} from "./ActionDialog";
import {activateTab,tabGroups,groupPanel,removePanel,normalizeFloating,constrainFloating,type FloatingPanels} from "./workspaceLayout";
import { defaultLayout, dockPanel, dockScopes, dockTargets, GAP, layoutRects, normalizeLayout, PANEL_LABEL, PANELS, setSplitRatio, type Divider, type DockNode, type DockTarget, type Edge, type Panel, type Rect } from "./workspaceLayout";

const KEY = "ugc-studio:workspace";
type Target = { panel: DockTarget; edge: Edge; label: string; scope: number; count: number };
type Hit = { panel: Panel | "workspace"; edge: Edge };
const geometry = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.width, height: r.height });
const EDGE_LABEL = { left: "a la izquierda", right: "a la derecha", top: "arriba", bottom: "abajo", center: "Agrupar en pestañas" };
function load() { try { const value = JSON.parse(localStorage.getItem(KEY) ?? "null"); return {tree:normalizeLayout([2,3].includes(value?.version)?value.tree:value,window.innerWidth,window.innerHeight),floating:normalizeFloating(value?.floating)}; } catch { return {tree:defaultLayout(),floating:{}}; } }
type Preset={id:string;name:string;tree:DockNode;floating:FloatingPanels;windows:Partial<Record<Panel,WindowPlacement>>};
const PRESETS="ugc-studio:workspace-presets";
function loadPresets():Preset[]{try{const list=JSON.parse(localStorage.getItem(PRESETS)??"[]");return Array.isArray(list)?list.filter(p=>p&&typeof p.id==="string"&&typeof p.name==="string").map(p=>({...p,tree:normalizeLayout(p.tree),floating:normalizeFloating(p.floating),windows:Object.fromEntries(Object.entries(p.windows??{}).filter(([key,v])=>PANELS.includes(key as Panel)&&v&&typeof v==="object"&&"rect" in v&&["x","y","width","height"].every(k=>Number.isFinite(((v as WindowPlacement).rect as unknown as Record<string,number>)?.[k]))&&(v as WindowPlacement).rect.width>0&&(v as WindowPlacement).rect.height>0))})):[];}catch{return[];}}

export function useWorkspace() {
  const [initial]=useState(load),[tree, setTree] = useState<DockNode>(initial.tree),[floating,setFloating]=useState<FloatingPanels>(initial.floating);
  const [activeDocument,setActiveDocument]=useState(document),[front,setFront]=useState<Panel[]>([]),[settingsOpen,setSettingsOpen]=useState(false),[presets,setPresets]=useState(loadPresets),[presetName,setPresetName]=useState("Mi espacio"),[presetId,setPresetId]=useState("");
  const native=usePanelWindows(p=>{setFloating(s=>{const n={...s};delete n[p];return n;});setTree(t=>activateTab(t,p));},setActiveDocument);
  const [maximized, setMaximized] = useState<Panel | null>(null);
  const [dragged, setDragged] = useState<Panel | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [activePanel,setActivePanel]=useState<Panel>("timeline");
  const activatePanel=(target:EventTarget|null)=>{const el=target as Element|null;if(!el?.closest)return;setActiveDocument(el.ownerDocument);const panel=el.closest<HTMLElement>("[data-workspace-panel]")?.dataset.workspacePanel as Panel|undefined;if(panel&&PANELS.includes(panel)){setActivePanel(panel);setFront(s=>s.at(-1)===panel?s:[...s.filter(p=>p!==panel),panel]);}};
  const appRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(el); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ version: 3, tree,floating }));localStorage.setItem(PRESETS,JSON.stringify(presets)); } catch { /* almacenamiento deshabilitado */ } }, [tree,floating,presets]);
  useEffect(() => () => cleanup.current?.(), []);
  const visibleTree=(t:DockNode,source?:Panel)=>PANELS.filter(p=>p!==source&&(floating[p]||native.windows[p])).reduce<DockNode|null>((n,p)=>n?removePanel(n,p):null,t);
  const visible=visibleTree(tree),groups=visible?tabGroups(visible):[],layout=visible?layoutRects(visible,size.width,size.height):{panels:{} as Record<Panel,Rect>,dividers:[]};
  const find=(selector:string)=>appRef.current?.querySelector<HTMLElement>(selector)??Object.values(native.windows).map(w=>w?.document.querySelector<HTMLElement>(selector)).find(Boolean);
  const focusTab=(panel:Panel)=>{setTree(t=>activateTab(t,panel));setActivePanel(panel);requestAnimationFrame(()=>find(`[data-workspace-panel="${panel}"]`)?.focus({preventScroll:true}));};
  const reattach=(panel:Panel)=>{native.close(panel);setFloating(s=>{const n={...s};delete n[panel];return n;});focusTab(panel);};
  const finishDock=(panel:Panel,destination:DockTarget,edge:Edge,asTabs=false)=>{native.close(panel);setFloating(s=>{const n={...s};delete n[panel];return n;});setTree(t=>asTabs&&typeof destination==="string"&&destination!=="workspace"?groupPanel(t,panel,destination):dockPanel(t,panel,destination,edge));};
  const makeFloating=(panel:Panel)=>{native.close(panel);const r=layout.panels[panel]??{x:40,y:40,width:500,height:340};setFloating(s=>({...s,[panel]:constrainFloating({...r,x:r.x+24,y:r.y+24,width:Math.max(320,r.width),height:Math.max(240,r.height)},size.width,size.height)}));setFront(s=>[...s.filter(p=>p!==panel),panel]);setMaximized(null);};
  const toggleMax = (panel: Panel) => {if(native.windows[panel])native.toggleMax(panel);else setMaximized(value => value === panel ? null : panel);};
  const trackPointer = (move: (e: globalThis.PointerEvent) => void, finish: (cancel: boolean) => void, wheel?: (e: WheelEvent) => void) => {
    cleanup.current?.();
    const end = (cancel: boolean) => { stop(); finish(cancel); };
    const up = () => end(false), cancel = () => end(true), key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key, true); if(wheel)window.removeEventListener("wheel",wheel,true);document.body.classList.remove("workspace-resizing", "workspace-dragging"); cleanup.current = null; };
    cleanup.current = stop;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", key, true);
    if(wheel)window.addEventListener("wheel",wheel,{capture:true,passive:false});
  };
  const hitTarget = (x: number, y: number, source: Panel): Hit | null => {
    if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
    const edges: [number, Edge][] = [[x, "left"], [size.width - x, "right"], [y, "top"], [size.height - y, "bottom"]];
    const nearest = edges.sort((a, b) => a[0] - b[0])[0];
    if (nearest[0] < 20) return { panel: "workspace", edge: nearest[1] };
    for (const panel of PANELS) {
      const r = layout.panels[panel];
      if (!r||groups.some(g=>g.panels.includes(panel)&&g.active!==panel)||panel === source || x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.height) continue;
      const nx = (x - r.x) / r.width, ny = (y - r.y) / r.height;
      const candidates: [number, Edge][] = [[nx, "left"], [1 - nx, "right"], [ny, "top"], [1 - ny, "bottom"]];
      const side = candidates.sort((a, b) => a[0] - b[0])[0];
      return { panel, edge: side[0] < .27 ? side[1] : "center" };
    }
    return null;
  };
  const startDrag = (panel: Panel, event: PointerEvent) => {
    if (event.button !== 0 || maximized) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = event.clientX, y = event.clientY;
    let active = false, current: Target | null = null, hit:Hit|null=null,scope=0,lastWheel=-Infinity;
    const updateTarget=()=>{
      if(!hit){current=null;setTarget(null);return;}
      if(hit.panel==="workspace"||hit.edge==="center"){scope=0;current={...hit,label:hit.panel==="workspace"?"Todo el espacio":PANEL_LABEL[hit.panel],scope:0,count:1};}
      else {const scopes=dockScopes(tree,panel,hit.panel);scope=Math.min(scope,scopes.length-1);const selected=scopes[scope];current={panel:selected.target,edge:hit.edge,label:selected.label,scope,count:scopes.length};}
      setTarget(current);
    };
    trackPointer(e => {
      if (!active && Math.hypot(e.clientX - x, e.clientY - y) < 5) return;
      active = true; setDragged(panel); document.body.classList.add("workspace-dragging");
      const rect = canvasRef.current!.getBoundingClientRect(),nextHit=hitTarget(e.clientX - rect.left, e.clientY - rect.top, panel);if(nextHit?.panel!==hit?.panel)scope=0;hit=nextHit;updateTarget();
    }, cancel => { if (!cancel && current) { const destination = current;finishDock(panel,destination.panel,destination.edge,destination.edge==="center"); } setDragged(null); setTarget(null); },e=>{
      if(!active)return;e.preventDefault();e.stopPropagation();
      if(!hit||hit.panel==="workspace"||hit.edge==="center"||e.timeStamp-lastWheel<120||!e.deltaY)return;
      lastWheel=e.timeStamp;const scopes=dockScopes(tree,panel,hit.panel);scope=Math.max(0,Math.min(scopes.length-1,scope+(e.deltaY>0?1:-1)));updateTarget();
    });
  };
  const startResize = (divider: Divider, event: PointerEvent) => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const coordinate = divider.axis === "x" ? event.clientX : event.clientY;
    const length = (divider.axis === "x" ? divider.area.width : divider.area.height) - GAP;
    if (length <= 0) return;
    const original = tree;
    setResizing(divider.id);
    trackPointer(e => { const delta = (divider.axis === "x" ? e.clientX : e.clientY) - coordinate; setTree(setSplitRatio(original, divider.id, divider.ratio + delta / length)); }, cancel => { if (cancel) setTree(original); setResizing(null); });
    document.body.classList.add("workspace-resizing");
  };
  const floatingRect=(p:Panel)=>constrainFloating(floating[p]!,size.width,size.height);
  const panelProps = (panel: Panel) => {const external=native.windows[panel],group=groups.find(g=>g.panels.includes(panel)),isFloat=Boolean(floating[panel]),r=external?{x:0,y:0,width:external.innerWidth,height:external.innerHeight}:maximized===panel?{x:0,y:0,...size}:isFloat?floatingRect(panel):layout.panels[panel]??{x:0,y:0,width:0,height:0};return { "data-workspace-panel": panel,"data-workspace-tabs":!external&&!maximized&&(isFloat||group)?"true":undefined,"data-floating":isFloat?"true":undefined, "data-active":activePanel===panel?"true":undefined, style: { ...geometry(r),zIndex:isFloat?80+front.indexOf(panel)*3:undefined, display: !external&&(maximized&&maximized!==panel||!isFloat&&group&&group.active!==panel)?"none":undefined } };};
  const handle = (panel: Panel) => <div className="panel-dock-controls" data-no-marquee>
    <button type="button" className="panel-grip" aria-label={`Mover panel ${PANEL_LABEL[panel]}`} title="Arrastra a un borde; rueda para cambiar el alcance; doble clic para ampliar" onPointerDown={e => startDrag(panel, e)} onDoubleClick={() => toggleMax(panel)}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>{[4, 8, 12].flatMap(y => [5, 10].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1"/>))}</svg></button>
    <select aria-label={`Posición de ${PANEL_LABEL[panel]}`} title="Acoplar, agrupar o separar panel" value="" onChange={e => { setActiveDocument(e.currentTarget.ownerDocument);const value = e.target.value;if(value==="float"){makeFloating(panel);return;}if(value==="external"){setMaximized(null);native.open(panel);return;}if(value==="reattach"){reattach(panel);return;}if(value==="presets"){setSettingsOpen(true);return;}if(value.startsWith("tab:")){finishDock(panel,value.slice(4) as Panel,"center",true);return;}if(value==="maximize")toggleMax(panel);else if(value.startsWith("dock:")){const destination=JSON.parse(value.slice(5)) as {target:DockTarget;edge:Edge};setMaximized(null);finishDock(panel,destination.target,destination.edge);}else{const [kind,destination]=value.split(":");setMaximized(null);finishDock(panel,kind==="edge"?"workspace":destination as Panel,kind==="edge"?destination as Edge:"center");} }}>
      <option value="" disabled>Mover panel…</option>
      <option value="float">Flotar dentro del editor</option><option value="external">Abrir en ventana independiente</option>{(floating[panel]||native.windows[panel])&&<option value="reattach">Volver a acoplar</option>}
      <optgroup label="Agrupar en pestañas">{PANELS.filter(p=>p!==panel&&!native.windows[p]&&!floating[p]).map(p=><option key={p} value={`tab:${p}`}>Pestaña junto a {PANEL_LABEL[p]}</option>)}</optgroup><option value="presets">Presets de ventanas…</option>
      {(["left", "right", "top", "bottom"] as const).map(edge => <option key={edge} value={`edge:${edge}`}>Acoplar {EDGE_LABEL[edge]} del área</option>)}
      {PANELS.filter(p => p !== panel).map(p => <option key={p} value={`swap:${p}`}>Intercambiar con {PANEL_LABEL[p]}</option>)}
      {dockTargets(tree,panel).filter(t=>t.target!=="workspace").map(t=><optgroup key={JSON.stringify(t.target)} label={t.panels.length>1?`Conjunto: ${t.label}`:`Solo ${t.label}`}>
        {(["left","right","top","bottom"] as const).map(edge=><option key={edge} value={`dock:${JSON.stringify({target:t.target,edge})}`}>{edge==="top"?"Encima de":edge==="bottom"?"Debajo de":edge==="left"?"A la izquierda de":"A la derecha de"} {t.label}</option>)}
      </optgroup>)}
      <option value="maximize">{(native.windows[panel]?native.isMaximized(panel):maximized===panel) ? "Restaurar tamaño" : "Ampliar panel"}</option>
    </select>
    <button type="button" className="panel-maximize" aria-label={`${(native.windows[panel]?native.isMaximized(panel):maximized===panel) ? "Restaurar" : "Ampliar"} panel ${PANEL_LABEL[panel]}`} title="Ampliar / restaurar panel" aria-pressed={native.windows[panel]?native.isMaximized(panel):maximized===panel} onClick={() => toggleMax(panel)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden><rect x="3" y="3" width="10" height="10" rx="1"/>{(native.windows[panel]?native.isMaximized(panel):maximized===panel) && <path d="M5 6h5v5"/>}</svg></button>
  </div>;
  const previewTree=dragged&&target?(target.edge==="center"&&typeof target.panel==="string"&&target.panel!=="workspace"?groupPanel(tree,dragged,target.panel):dockPanel(tree,dragged,target.panel,target.edge)):null;
  const previewVisible=previewTree?visibleTree(previewTree,dragged??undefined):null;
  const preview = dragged&&previewVisible?layoutRects(previewVisible,size.width,size.height).panels[dragged]:null;
  const moveFloat=(panel:Panel,event:PointerEvent,resize=false)=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const r=floatingRect(panel),x=event.clientX,y=event.clientY,original=floating[panel];setFront(s=>[...s.filter(p=>p!==panel),panel]);trackPointer(e=>setFloating(s=>({...s,[panel]:constrainFloating(resize?{...r,width:r.width+e.clientX-x,height:r.height+e.clientY-y}:{...r,x:r.x+e.clientX-x,y:r.y+e.clientY-y},size.width,size.height)})),cancel=>{if(cancel)setFloating(s=>({...s,[panel]:original}));});};
  const overlays = <>
    {PANELS.some(p=>native.windows[p])&&<div className="external-panel-list" aria-label="Ventanas independientes abiertas">{PANELS.filter(p=>native.windows[p]).map(p=><span key={p}>{PANEL_LABEL[p]} · Otra ventana {native.displays.length>0&&<select aria-label={`Pantalla de ${PANEL_LABEL[p]}`} value="" onChange={e=>native.toScreen(p,Number(e.target.value))}><option value="" disabled>Mover a pantalla…</option>{native.displays.map((d,i)=><option value={i} key={i}>{d.label||`Pantalla ${i+1}`}{d.isPrimary?" · Principal":""}</option>)}</select>}<button onClick={()=>native.windows[p]?.focus()}>Activar</button><button aria-label={`Recuperar panel ${PANEL_LABEL[p]}`} onClick={()=>reattach(p)}>Acoplar</button></span>)}</div>}
    {!maximized&&groups.map(g=>{const r=layout.panels[g.active];return <div className="workspace-tab-strip" role="tablist" aria-label={`Grupo de paneles ${g.panels.map(p=>PANEL_LABEL[p]).join(", ")}`} key={g.panels.join("-")} style={{left:r.x,top:r.y,width:r.width}}>{g.panels.map(p=><button key={p} role="tab" aria-selected={g.active===p} tabIndex={g.active===p?0:-1} title="Clic: activar · Arrastra: separar y acoplar" onClick={()=>focusTab(p)} onPointerDown={e=>startDrag(p,e)} onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const next=g.panels[(g.panels.indexOf(p)+(e.key==="ArrowRight"?1:g.panels.length-1))%g.panels.length];focusTab(next);requestAnimationFrame(()=>canvasRef.current?.querySelector<HTMLButtonElement>(`[data-panel-tab="${next}"]`)?.focus());}}} data-panel-tab={p}>{PANEL_LABEL[p]}</button>)}</div>;})}
    {!maximized&&PANELS.filter(p=>floating[p]&&!native.windows[p]).map(p=>{const r=floatingRect(p);return <div key={p} className="floating-panel-chrome" style={{...geometry(r),zIndex:81+front.indexOf(p)*3}}><div className="floating-panel-title" onPointerDown={e=>moveFloat(p,e)}><strong>{PANEL_LABEL[p]}</strong><button onPointerDown={e=>e.stopPropagation()} onClick={()=>reattach(p)} aria-label={`Acoplar ventana ${PANEL_LABEL[p]}`}>↙</button></div><button className="floating-panel-resize" aria-label={`Redimensionar ventana ${PANEL_LABEL[p]}`} onPointerDown={e=>moveFloat(p,e,true)} onKeyDown={e=>{if(e.key.startsWith("Arrow")){e.preventDefault();setFloating(s=>({...s,[p]:constrainFloating({...r,width:r.width+(e.key==="ArrowRight"?20:e.key==="ArrowLeft"?-20:0),height:r.height+(e.key==="ArrowDown"?20:e.key==="ArrowUp"?-20:0)},size.width,size.height)}));}}}>◢</button></div>;})}
    {native.notice&&<div className="workspace-notice" role="status">{native.notice}<button onClick={()=>native.setNotice("")} aria-label="Cerrar aviso de ventanas">×</button></div>}
    {settingsOpen&&<ActionDialog title="Presets de ventanas" onClose={()=>setSettingsOpen(false)}><p>Guarda pestañas, tamaños, paneles flotantes y ventanas en otras pantallas. Detecta las pantallas antes de guardar un preset de dos monitores.</p><button onClick={()=>void native.detect()}>Detectar pantallas</button>{native.notice&&<p role="status">{native.notice}</p>}<ul aria-label="Ventanas incluidas en el preset">{Object.entries(native.capture()).map(([panel,p])=><li key={panel}>{PANEL_LABEL[panel as Panel]} · {p!.display?.label??"Posición manual"} · {Math.round(p!.rect.x)}, {Math.round(p!.rect.y)} · {Math.round(p!.rect.width)}×{Math.round(p!.rect.height)}</li>)}</ul><label>Nombre<input aria-label="Nombre del preset de ventanas" value={presetName} onChange={e=>setPresetName(e.target.value)}/></label><button onClick={()=>{const name=presetName.trim();if(!name)return;const preset={id:presetId||crypto.randomUUID(),name,tree,floating,windows:native.capture()};setPresets(s=>[...s.filter(p=>p.id!==preset.id),preset]);setPresetId(preset.id);}}>Guardar distribución</button><label>Presets guardados<select aria-label="Preset de ventanas" value={presetId} onChange={e=>{setPresetId(e.target.value);setPresetName(presets.find(p=>p.id===e.target.value)?.name??"Mi espacio");}}><option value="">Nuevo preset</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><footer><button disabled={!presetId} onClick={()=>{setPresets(s=>s.filter(p=>p.id!==presetId));setPresetId("");}}>Eliminar preset</button><button disabled={!presets.some(p=>p.id===presetId)} onClick={()=>{const p=presets.find(p=>p.id===presetId);if(!p)return;for(const panel of PANELS)if(!p.windows[panel])native.close(panel);setTree(p.tree);setFloating(p.floating);setMaximized(null);for(const panel of PANELS){const placement=p.windows[panel];if(placement)native.open(panel,placement);}setSettingsOpen(false);}}>Aplicar distribución</button></footer></ActionDialog>}
    {!maximized && layout.dividers.map(d => <div key={d.id} className={`dock-divider ${d.axis} ${resizing === d.id ? "active" : ""}`} style={geometry(d)} role="separator" aria-label={`Redimensionar ${d.first} / ${d.second}`} aria-orientation={d.axis === "x" ? "vertical" : "horizontal"} aria-valuemin={2} aria-valuemax={98} aria-valuenow={Math.round(d.ratio * 100)} tabIndex={0} onPointerDown={e => startResize(d, e)} onKeyDown={e => { const delta = d.axis === "x" ? e.key === "ArrowRight" ? .03 : e.key === "ArrowLeft" ? -.03 : 0 : e.key === "ArrowDown" ? .03 : e.key === "ArrowUp" ? -.03 : 0; if (delta) { e.preventDefault(); e.stopPropagation(); setTree(t => setSplitRatio(t, d.id, d.ratio + delta)); } }}/>) }
    {dragged && <div className="dock-drag-instructions" role="status">{target&&target.edge!=="center"?<><strong>Alcance: {target.label}</strong>{target.count>1&&<> · {target.scope+1}/{target.count} · Rueda ↓ ampliar / ↑ reducir</>}</>:"Borde: acoplar · Centro: agrupar en pestañas"} · Esc: cancelar</div>}
    {preview && target && <div className="dock-preview" style={geometry(preview)}><span>{target.edge === "center" ? "Agrupar en pestañas" : `Acoplar ${EDGE_LABEL[target.edge]}`} · {PANEL_LABEL[dragged!]}<small>{target.label}</small></span></div>}
  </>;
  return { activatePanel,activeDocument,find,settings:()=>setSettingsOpen(true),renderPanel:(panel:Panel,children:ReactNode)=><PanelHost key={panel} external={native.windows[panel]}>{children}</PanelHost>,appRef, canvasRef, panelProps, handle, overlays, dragged, toggleMax, showPanel: (panel:Panel) => {focusTab(panel);native.windows[panel]?.focus();if(maximized && maximized!==panel)setMaximized(null); }, style: { gridTemplateColumns: "minmax(0,1fr)", gridTemplateRows: "var(--ui-chrome-height,74px) auto minmax(0,1fr)", gridTemplateAreas: '"top" "status" "workspace"' } as CSSProperties, reset: () => {for(const p of PANELS)native.close(p);setFloating({});setTree(defaultLayout());setMaximized(null);} };
}
