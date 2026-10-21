import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {PANEL_LABEL,type Panel,type Rect} from "./workspaceLayout";
import {UiDocument} from "./UiDocument";

export type DisplayInfo={label:string;isPrimary:boolean;availLeft:number;availTop:number;availWidth:number;availHeight:number};
type ScreenDetails=EventTarget&{screens:DisplayInfo[];currentScreen:DisplayInfo};
type ManagedWindow=Window&{getScreenDetails?:()=>Promise<ScreenDetails>};
const maximizedWindows=new WeakMap<Window,Rect>();
export type WindowPlacement={display?:DisplayInfo;rect:Rect};
export function matchDisplay(saved:DisplayInfo|undefined,screens:DisplayInfo[]):DisplayInfo|undefined{
  return saved&&(screens.find(s=>saved.label&&s.label===saved.label)||screens.find(s=>s.isPrimary===saved.isPrimary&&s.availWidth===saved.availWidth&&s.availHeight===saved.availHeight)||screens.find(s=>s.isPrimary===saved.isPrimary));
}
export function restoredWindow(p:WindowPlacement,screens:DisplayInfo[]):Rect{
  const to=matchDisplay(p.display,screens)??screens.find(s=>s.isPrimary)??screens[0];if(!to)return p.rect;
  const from=p.display&&[p.display.availLeft,p.display.availTop,p.display.availWidth,p.display.availHeight].every(Number.isFinite)&&p.display.availWidth>0&&p.display.availHeight>0?p.display:to,w=Math.min(to.availWidth,Math.max(240,p.rect.width/from.availWidth*to.availWidth)),h=Math.min(to.availHeight,Math.max(180,p.rect.height/from.availHeight*to.availHeight));
  return{x:to.availLeft+Math.max(0,Math.min(to.availWidth-w,(p.rect.x-from.availLeft)/from.availWidth*to.availWidth)),y:to.availTop+Math.max(0,Math.min(to.availHeight-h,(p.rect.y-from.availTop)/from.availHeight*to.availHeight)),width:w,height:h};
}
export function PanelHost({children,external}:{children:ReactNode;external?:Window}){
  const placeholder=useRef<HTMLSpanElement>(null),[host]=useState(()=>{const node=document.createElement("div");node.className="workspace-panel-host";return node;});
  useLayoutEffect(()=>{const target=external?.document.body??placeholder.current;target?.appendChild(host);if(external)requestAnimationFrame(()=>{if(!external.closed&&external.document.activeElement===external.document.body)([...host.querySelectorAll<HTMLElement>("[data-shortcut-scope]")].find(n=>n.getClientRects().length)??host.querySelector<HTMLElement>("[data-workspace-panel]"))?.focus({preventScroll:true});});return()=>{if(external&&placeholder.current)placeholder.current.appendChild(host);else host.remove();};},[host,external]);
  return <><span ref={placeholder} className="workspace-panel-anchor"/>{createPortal(<UiDocument.Provider value={external?.document??document}>{children}</UiDocument.Provider>,host)}</>;
}
export function usePanelWindows(onClose:(panel:Panel)=>void,onDocument:(doc:Document)=>void){
  const [windows,setWindows]=useState<Partial<Record<Panel,Window>>>({}),[notice,setNotice]=useState(""),[displays,setDisplays]=useState<DisplayInfo[]>([]);
  const current=useRef(windows);current.current=windows;const closeRef=useRef(onClose),docRef=useRef(onDocument);closeRef.current=onClose;docRef.current=onDocument;
  const details=useRef<ScreenDetails|null>(null),cleanups=useRef(new Map<Panel,()=>void>());
  const close=(panel:Panel)=>{const win=current.current[panel];if(!win)return;docRef.current(document);cleanups.current.get(panel)?.();cleanups.current.delete(panel);setWindows(s=>{const n={...s};delete n[panel];return n;});if(!win.closed)win.close();};
  const place=(win:Window,placement:WindowPlacement)=>{const r=restoredWindow(placement,details.current?.screens??[]);win.moveTo(Math.round(r.x),Math.round(r.y));win.resizeTo(Math.round(r.width),Math.round(r.height));};
  const open=(panel:Panel,placement?:WindowPlacement)=>{
    if(current.current[panel]&&!current.current[panel]!.closed){const win=current.current[panel]!;if(placement)place(win,placement);win.focus();return;}
    const r=placement?restoredWindow(placement,details.current?.screens??[]):{x:window.screenX+80,y:window.screenY+80,width:700,height:500};
    const win=window.open("",`ugc-${panel}-${crypto.randomUUID()}`,`popup=yes,width=${Math.round(r.width)},height=${Math.round(r.height)},left=${Math.round(r.x)},top=${Math.round(r.y)}`);
    if(!win){setNotice("El navegador bloqueó la ventana. Permite ventanas emergentes para este editor y vuelve a intentarlo.");return;}
    win.document.title=`${PANEL_LABEL[panel]} · UGC Studio`;win.document.documentElement.lang="es";win.document.body.className="external-panel-window";
    const base=win.document.createElement("base");base.href=document.baseURI;win.document.head.appendChild(base);
    const copyStyles=()=>{win.document.head.querySelectorAll("[data-studio-style]").forEach(n=>n.remove());document.querySelectorAll('style,link[rel="stylesheet"]').forEach(n=>{const clone=n.cloneNode(true) as HTMLElement;clone.dataset.studioStyle="true";if(n instanceof HTMLLinkElement)(clone as HTMLLinkElement).href=n.href;win.document.head.appendChild(clone);});};copyStyles();
    const observer=new MutationObserver(copyStyles);observer.observe(document.head,{childList:true,subtree:true,characterData:true});
    const forward=(event:Event)=>{if(event.defaultPrevented)return;let copy:Event;
      if(event.type.startsWith("key")){const e=event as KeyboardEvent;copy=new KeyboardEvent(e.type,{key:e.key,code:e.code,ctrlKey:e.ctrlKey,altKey:e.altKey,shiftKey:e.shiftKey,metaKey:e.metaKey,repeat:e.repeat,cancelable:true});}
      else{const e=event as PointerEvent;const options={clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,button:e.button,buttons:e.buttons,ctrlKey:e.ctrlKey,altKey:e.altKey,shiftKey:e.shiftKey,metaKey:e.metaKey,cancelable:true};copy=event.type.startsWith("pointer")?new PointerEvent(e.type,{...options,pointerId:e.pointerId,pointerType:e.pointerType}):new MouseEvent(e.type,options);}
      Object.defineProperty(copy,"target",{value:event.target});window.dispatchEvent(copy);if(copy.defaultPrevented)event.preventDefault();
    };
    const types=["keydown","keyup","mousemove","mouseup","pointermove","pointerup","pointercancel"];
    types.forEach(t=>win.addEventListener(t,forward));const focused=()=>docRef.current(win.document);win.addEventListener("focus",focused);win.document.addEventListener("pointerdown",focused,true);
    const resized=()=>setWindows(s=>({...s}));win.addEventListener("resize",resized);
    const unload=()=>{closeRef.current(panel);docRef.current(document);setWindows(s=>{const n={...s};delete n[panel];return n;});cleanup();};win.addEventListener("beforeunload",unload);
    const cleanup=()=>{observer.disconnect();types.forEach(t=>win.removeEventListener(t,forward));win.removeEventListener("beforeunload",unload);win.removeEventListener("focus",focused);win.document.removeEventListener("pointerdown",focused,true);win.removeEventListener("resize",resized);};cleanups.current.set(panel,cleanup);
    setNotice("");setWindows(s=>({...s,[panel]:win}));win.focus();
  };
  const snapshot=(s:DisplayInfo):DisplayInfo=>({label:s.label,isPrimary:s.isPrimary,availLeft:s.availLeft,availTop:s.availTop,availWidth:s.availWidth,availHeight:s.availHeight});
  const refreshScreens=()=>setDisplays(details.current?.screens.map(snapshot)??[]);
  const detect=async()=>{try{const get=(window as ManagedWindow).getScreenDetails;if(!get){setNotice("Este navegador no permite identificar pantallas. Puedes mover las ventanas manualmente; el preset conservará sus posiciones.");return;}details.current=await get.call(window);refreshScreens();setNotice(`${details.current.screens.length} pantalla(s) detectada(s).`);}catch{setNotice("No se permitió detectar pantallas. Puedes seguir acomodando las ventanas manualmente.");}};
  const capture=():Partial<Record<Panel,WindowPlacement>>=>Object.fromEntries(Object.entries(current.current).filter(([,w])=>w&&!w.closed).map(([panel,w])=>{const rect={x:w!.screenX,y:w!.screenY,width:w!.outerWidth,height:w!.outerHeight},s=details.current?.screens.find(s=>rect.x>=s.availLeft&&rect.x<s.availLeft+s.availWidth&&rect.y>=s.availTop&&rect.y<s.availTop+s.availHeight),display=s?{label:s.label,isPrimary:s.isPrimary,availLeft:s.availLeft,availTop:s.availTop,availWidth:s.availWidth,availHeight:s.availHeight}:undefined;return[panel,{rect,display}];}));
  useEffect(()=>{let live=true;const get=(window as ManagedWindow).getScreenDetails;const changed=()=>{if(live)refreshScreens();};if(get)void navigator.permissions.query({name:"window-management" as PermissionName}).then(async p=>{if(p.state==="granted"){const d=await get.call(window);if(live){details.current=d;changed();d.addEventListener("screenschange",changed);}}}).catch(()=>{});return()=>{live=false;details.current?.removeEventListener("screenschange",changed);};},[displays.length]);
  useEffect(()=>{const dispose=()=>{for(const p of Object.keys(current.current) as Panel[]){cleanups.current.get(p)?.();current.current[p]?.close();}};window.addEventListener("pagehide",dispose);return()=>{window.removeEventListener("pagehide",dispose);dispose();};},[]);
  const toScreen=(panel:Panel,index:number)=>{const s=displays[index],win=current.current[panel];if(s&&win){place(win,{display:s,rect:{x:s.availLeft+s.availWidth*.06,y:s.availTop+s.availHeight*.06,width:s.availWidth*.88,height:s.availHeight*.88}});setWindows(v=>({...v}));}};
  const toggleMax=(panel:Panel)=>{const win=current.current[panel];if(!win)return;const old=maximizedWindows.get(win);if(old){win.moveTo(old.x,old.y);win.resizeTo(old.width,old.height);maximizedWindows.delete(win);}else{const r={x:win.screenX,y:win.screenY,width:win.outerWidth,height:win.outerHeight};maximizedWindows.set(win,r);const screen=details.current?.screens.find(s=>r.x>=s.availLeft&&r.x<s.availLeft+s.availWidth&&r.y>=s.availTop&&r.y<s.availTop+s.availHeight);win.moveTo(screen?.availLeft??r.x,screen?.availTop??r.y);win.resizeTo(screen?.availWidth??win.screen.availWidth,screen?.availHeight??win.screen.availHeight);}setWindows(s=>({...s}));};
  return{windows,open,close,detect,capture,notice,setNotice,displays,toScreen,toggleMax,isMaximized:(p:Panel)=>Boolean(current.current[p]&&maximizedWindows.has(current.current[p]!))};
}
