import {editAvailable} from "./editAvailability";
import {useUiDocument} from "./UiDocument";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GraphicClip, Project } from "../project/types";
import { destinationTrack, clipLabel } from "../project/types";
import * as ops from "../project/ops";
import { ActionDialog } from "./ActionDialog";

export type EditAction = "add"|"newSequence"|"nest"|"speed"|"channels"|"hold"|"holdTail"|"holdInsert"|"unfreeze"|"group"|"ungroup"|"link"|"gain"|"copy"|"cut"|"delete"|"rippleDelete";
export type EditDialogKind = "add"|"newSequence"|"nest"|"speed"|"channels"|"hold"|"holdInsert";
export const LABEL_COLORS = [{name:"Azul",color:"#487ab0"},{name:"Violeta",color:"#8761ad"},{name:"Cian",color:"#329aa0"},{name:"Verde",color:"#528b68"},{name:"Ámbar",color:"#bd9846"},{name:"Rosa",color:"#b46587"},{name:"Rojo",color:"#af5757"}];

export function EditContextMenu({x,y,ids,project,onAction,onLabel,onClose}: {x:number;y:number;ids:string[];project:Project;onAction:(action:EditAction)=>void;onLabel:(color?:string)=>void;onClose:()=>void}) {
  const uiDoc=useUiDocument(),uiWindow=uiDoc.defaultView??window;
  const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({x,y});
  useLayoutEffect(()=>{const box=ref.current?.getBoundingClientRect();if(box)setPosition({x:Math.max(4,Math.min(x,uiWindow.innerWidth-box.width-4)),y:Math.max(4,Math.min(y,uiWindow.innerHeight-box.height-4))});},[x,y]);
  useEffect(()=>{ref.current?.focus();const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))onClose();};uiWindow.addEventListener("pointerdown",close,true);uiWindow.addEventListener("blur",onClose);return()=>{uiWindow.removeEventListener("pointerdown",close,true);uiWindow.removeEventListener("blur",onClose);};},[onClose]);
  const clips=ids.map(id=>ops.findClip(project,id)?.clip),video=clips.find(c=>c?.kind==="video"&&!c.sequenceId),media=clips.some(c=>c?.kind==="audio"||c?.kind==="video"),locked=!ops.clipsEditable(project,ids);
  const item=(id:EditAction,label:string,disabled=false)=><button key={id} role="menuitem" disabled={disabled||!editAvailable(project,ids,id)} onClick={()=>{onClose();onAction(id);}}>{label}</button>;
  return createPortal(<div ref={ref} role="menu" aria-label="Opciones de edición" tabIndex={-1} data-command-ui className="edit-context-menu" style={{left:position.x,top:position.y}} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const i=buttons.indexOf(uiDoc.activeElement as HTMLButtonElement);buttons[(i+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}}}>
    {item("add","Añadir…")}
    {ids.length>0&&<><hr/>{item("cut","Cortar",locked)}{item("copy","Copiar")}{item("delete","Borrar",locked)}{item("rippleDelete","Eliminar y cerrar hueco",locked)}<hr/>
      {item("link",clips.some(c=>c&&(c.kind==="video"||c.kind==="audio")&&c.linkedClipId)?"Desenlazar":"Enlazar video y audio",locked||!media)}
      {item("group","Agrupar",locked||ids.length<2)}{item("ungroup","Desagrupar",locked||!clips.some(c=>c?.groupId))}{item("nest","Anidar…",locked)}
      <details><summary>Etiqueta de color</summary><div className="label-swatches">{LABEL_COLORS.map(c=><button role="menuitem" key={c.color} disabled={locked} title={c.name} aria-label={`Etiqueta ${c.name}`} style={{background:c.color}} onClick={()=>{onLabel(c.color);onClose();}}/>)}<button role="menuitem" disabled={locked} onClick={()=>{onLabel();onClose();}}>Quitar</button></div></details>
      <hr/>{item("speed","Velocidad / duración…",locked||!media||clips.some(c=>c&&((c.kind!=="video"&&c.kind!=="audio")||c.sequenceId||c.kind==="video"&&c.freezeFrame!==undefined)))}
      {item("gain","Ganancia de audio…",locked||!media)}{item("channels","Canales de audio…",!editAvailable(project,ids,"channels"))}
      <hr/>{item("hold","Opciones de congelado…",locked||!video)}{item("holdTail","Congelar desde el cabezal",locked||!video)}{item("holdInsert","Insertar segmento congelado…",locked||!video)}{video?.kind==="video"&&video.freezeFrame!==undefined&&item("unfreeze","Quitar congelado",locked)}
    </>}
  </div>,uiDoc.body);
}

export function EditingDialog({kind,project,ids,at,hostId,trackId,onApply,onClose}: {kind:EditDialogKind;project:Project;ids:string[];at:number;hostId?:string;trackId?:string;onApply:(fn:(p:Project)=>Project)=>void;onClose:()=>void}) {
  const clips=ids.map(id=>ops.findClip(project,id)?.clip),first=clips.find(c=>c?.kind==="video")??clips[0];
  const media=first&&(first.kind==="video"||first.kind==="audio")?first:undefined;
  const [query,setQuery]=useState(""),[name,setName]=useState(`Secuencia ${Object.keys(project.sequences??{}).length+1}`),[rate,setRate]=useState((media?.playbackRate??1)*100),[seconds,setSeconds]=useState(2),[holdAt,setHoldAt]=useState("playhead"),[channel,setChannel]=useState("mono"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const title={add:"Añadir al timeline",newSequence:"Nueva secuencia",nest:"Anidar selección",speed:"Velocidad / duración",channels:"Canales de audio",hold:"Opciones de congelado",holdInsert:"Insertar segmento congelado"}[kind];
  const apply=(fn:(p:Project)=>Project)=>{onApply(fn);onClose();};
  const addGraphic=(shape:GraphicClip["shape"])=>apply(p=>ops.addGraphic(p,shape,at));
  const templates=[project,...Object.values(project.sequences??{})].flatMap(p=>p.tracks.flatMap(t=>t.clips.filter(c=>c.kind==="graphic"||c.kind==="text").map(c=>({id:`element-${p.name}-${c.id}`,name:clipLabel(c),detail:`Elemento · ${p.name}`,run:()=>apply(current=>ops.pasteClips(current,ops.copyClips(p,[c.id],false),at,hostId))}))));
  const libraryItems=(project.library?.elements??[]).map(e=>({id:`library-${e.id}`,name:e.name,detail:"Elemento de Proyecto",run:()=>apply(p=>ops.placeProjectElement(p,e.id,at,hostId))}));
  const entries=[{id:"newSequence",name:"Nueva secuencia",detail:"Crear en Proyecto",run:()=>apply(p=>ops.createEmptySequence(p,name))},{id:"text",name:"Texto",detail:"Capa editable",run:()=>apply(p=>ops.addTextClip(p,{text:"Tu texto",from:at,durationInFrames:p.fps*5}))},{id:"solid",name:"Sólido",detail:"Color a pantalla completa",run:()=>addGraphic("solid")},{id:"rectangle",name:"Cuadrado",detail:"Forma editable",run:()=>addGraphic("rectangle")},{id:"adjustment",name:"Capa de ajuste",detail:"Brillo · Contraste · Saturación",run:()=>addGraphic("adjustment")},...Object.values(project.sequences??{}).filter(s=>s.id!==hostId).map(s=>({id:s.id,name:s.name,detail:"Secuencia · Colocar anidada",run:()=>apply(p=>{const target=trackId&&p.tracks.find(t=>t.id===trackId&&t.kind==="video")?.id||destinationTrack(p,"video");return target?ops.placeSequence(p,s.id,target,at,true,hostId):p;})})),...templates,...libraryItems].filter(e=>`${e.name} ${e.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const mapped=ops.linkedIds(project,ids).map(id=>ops.findClip(project,id)?.clip).filter(c=>c?.kind==="audio"&&!c.sequenceId);
  const submit=async()=>{
    if(kind==="newSequence"||kind==="nest"){apply(p=>kind==="nest"?ops.nestClips(p,ids,name,hostId):ops.createEmptySequence(p,name));return;}
    if(kind==="speed"){if(!Number.isFinite(rate)||rate<25||rate>400){setError("Usa entre 25 % y 400 %.");return;}apply(p=>ops.setClipSpeed(p,ids,rate/100));return;}
    if(kind==="hold"||kind==="holdInsert"){
      if(!media||media.kind!=="video")return;
      const position=holdAt==="in"?media.from:holdAt==="out"?media.from+media.durationInFrames-1:at;
      if(position<media.from||position>=media.from+media.durationInFrames){setError("Coloca el cabezal dentro del clip, o elige Entrada/Salida.");return;}
      if(kind==="holdInsert"&&(!Number.isFinite(seconds)||seconds<=0)){setError("La duración debe ser mayor que cero.");return;}
      apply(p=>ops.holdFrame(p,media.id,position,kind==="hold"?"whole":"insert",Math.round(seconds*p.fps)));return;
    }
    if(kind==="channels"){
      setBusy(true);setError("");
      try {
        const results:{id:string;old:string;original:string;src:string}[]=[];
        for(const c of mapped){if(c?.kind!=="audio")continue;const original=c.channelSource??c.src;let src=original;
          if(channel!=="stereo"){const r=await fetch("/api/audio-channels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({src:original,mode:channel})});const data=await r.json();if(!r.ok)throw new Error(data.error??"No se pudieron mapear los canales.");src=data.src;}
          results.push({id:c.id,old:c.src,original,src});
        }
        if(!live.current)return;
        apply(p=>{if(results.some(r=>{const c=ops.findClip(p,r.id)?.clip;return c?.kind!=="audio"||c.src!==r.old||!ops.clipsEditable(p,[r.id]);}))return p;return results.reduce((n,r)=>ops.updateClip(n,r.id,{src:r.src,channelSource:r.original,channelMode:channel as "stereo"|"mono"|"left"|"right"}),p);});
      }catch(e){if(live.current){setError(e instanceof Error?e.message:String(e));setBusy(false);}}
    }
  };
  return <ActionDialog title={title} onClose={onClose}>
    {kind==="add"?<><input autoFocus aria-label="Buscar secuencias y elementos" placeholder="Buscar secuencias, texto, sólido, ajuste…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")entries[0]?.run();}}/><div className="element-search-results">{entries.map(e=><button key={e.id} onClick={e.run}><strong>{e.name}</strong><span>{e.detail}</span></button>)}{!entries.length&&<p>Sin resultados.</p>}</div></>:
      kind==="newSequence"||kind==="nest"?<><label>Nombre<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><p>{kind==="nest"?"Sustituye la selección por una secuencia editable. Doble clic en el bloque para abrirla.":`Secuencia vacía · ${project.width} × ${project.height} · ${project.fps} fps. Se abre desde Proyecto.`}</p></>:
      kind==="speed"?<><label>Velocidad (%)<input autoFocus type="number" min={25} max={400} step={1} value={rate} onChange={e=>setRate(Number(e.target.value))}/></label><label>Duración del primer clip (s)<input aria-label="Duración del clip en segundos" type="number" step={1/project.fps} min={1/project.fps} value={media&&rate>0?Number((media.durationInFrames*(media.playbackRate??1)/(rate/100)/project.fps).toFixed(3)):0} onChange={e=>{const d=Number(e.target.value);if(media&&d>0)setRate(media.durationInFrames*(media.playbackRate??1)/(d*project.fps)*100);}}/></label><p>Velocidad constante para imagen y audio enlazados. Sin desplazar clips posteriores; al extender, sobrescribe el destino. Conserva el tono de voz.</p></>:
      kind==="channels"?<><label>Mapa de salida<select aria-label="Mapa de salida" value={channel} onChange={e=>setChannel(e.target.value)}><option value="stereo">Estéreo original</option><option value="mono">Mono · mezclar L + R</option><option value="left">Izquierdo en ambos canales</option><option value="right">Derecho en ambos canales</option></select></label><p>Copia WAV local; conserva el original y permite Deshacer. Se aplica al audio seleccionado y enlazado.</p></>:
      <><label>Fotograma<select aria-label="Fotograma para congelar" value={holdAt} onChange={e=>setHoldAt(e.target.value)}><option value="playhead">Cabezal actual</option><option value="in">Entrada del clip</option><option value="out">Último fotograma</option></select></label>{kind==="holdInsert"&&<label>Duración (s)<input type="number" min={1/project.fps} step={.1} value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label>}<p>{kind==="holdInsert"?"Abre un hueco en todas las pistas para conservar sincronía. El segmento congelado no lleva sonido.":"Mantiene ese fotograma durante todo el clip. El audio enlazado continúa reproduciéndose."}</p></>}
    {error&&<p role="alert">{error}</p>}<footer><button onClick={onClose}>{kind==="add"?"Cerrar":"Cancelar"}</button>{kind!=="add"&&<button className="primary" disabled={busy||(kind==="channels"&&!mapped.length)} onClick={()=>void submit()}>{busy?"Procesando localmente…":"Aplicar"}</button>}</footer>
  </ActionDialog>;
}
