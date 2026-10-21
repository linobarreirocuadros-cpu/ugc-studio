import {useEffect,useRef,useState} from "react";
/** El campo numérico conserva entradas parciales (-, 0.) mientras se escribe. */
export function CommittedNumber({label,value,min,max,step=1,disabled=false,vertical=false,integer=false,onPreview,onCommit}:{label:string;value:number;min:number;max:number;step?:number;disabled?:boolean;vertical?:boolean;integer?:boolean;onPreview?:(value:number|null)=>void;onCommit:(value:number)=>void}) {
 const [draft,setDraft]=useState(value),latest=useRef(value),dirty=useRef(false),number=useRef<HTMLInputElement>(null);
 const display=(v:number)=>String(Math.round(v*1000)/1000);
 useEffect(()=>{if(!dirty.current){setDraft(value);latest.current=value;if(number.current)number.current.value=display(value);}},[value]);
 useEffect(()=>()=>{if(dirty.current)onPreview?.(null);},[]);
 const change=(n:number)=>{if(!Number.isFinite(n))return;const v=Math.max(min,Math.min(max,integer?Math.round(n):n));latest.current=v;dirty.current=true;setDraft(v);if(number.current&&number.current.ownerDocument.activeElement!==number.current)number.current.value=display(v);onPreview?.(v);};
 const commit=()=>{if(number.current)number.current.value=display(latest.current);if(!dirty.current)return;dirty.current=false;onCommit(latest.current);onPreview?.(null);};
 const cancel=()=>{dirty.current=false;latest.current=value;setDraft(value);if(number.current)number.current.value=display(value);onPreview?.(null);};
 return <label className={`committed-number ${vertical?"vertical-fader":""}`}><span>{label}</span>
 <input type="range" aria-label={`Control ${label}`} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={e=>change(e.currentTarget.valueAsNumber)} onPointerUp={commit} onPointerCancel={cancel} onKeyUp={e=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key))commit();}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();cancel();}}} onBlur={commit}/>
 <input ref={number} type="number" aria-label={label} min={min} max={max} step={step} defaultValue={display(value)} disabled={disabled} onChange={e=>change(e.currentTarget.valueAsNumber)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();}if(e.key==="Escape"){e.preventDefault();cancel();}}}/>
 </label>;
}
