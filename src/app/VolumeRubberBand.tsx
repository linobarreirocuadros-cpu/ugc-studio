import { useRef, useState } from "react";

export const volumeDb = (volume:number) => volume>0?Math.max(-60,20*Math.log10(volume)):-60;
export const dbVolume = (db:number) => db<=-60?0:10**(Math.min(12,db)/20);
export function VolumeRubberBand({name,volume,height,disabled,onChange,onPreview}:{name:string;volume:number;height:number;disabled:boolean;onChange:(volume:number)=>void;onPreview?:(volume:number|null)=>void}) {
  const [preview,setPreview]=useState<number|null>(null),gesture=useRef<{y:number;db:number;value:number}|null>(null);
  const db=preview??volumeDb(volume),position=db>=0 ? height*.60-db/12*(height*.60-5) : height*.60-db/60*(height*.40-5);
  return <span className="volume-rubber-band" data-no-marquee role="slider" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={`Volumen de ${name}`} aria-valuemin={-60} aria-valuemax={12} aria-valuenow={Number(db.toFixed(1))} aria-valuetext={db<=-60?"Silencio":`${db.toFixed(1)} dB`} title={db<=-60?"Silencio":`${db.toFixed(1)} dB · Arrastra para ajustar volumen`} style={{top:position}}
    onMouseDown={e=>{e.preventDefault();e.stopPropagation();}}
    onDoubleClick={e=>{e.stopPropagation();if(!disabled)onChange(1);}}
    onPointerDown={e=>{if(disabled||e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={y:e.clientY,db:volumeDb(volume),value:volume};setPreview(volumeDb(volume));}}
    onPointerMove={e=>{const g=gesture.current;if(!g)return;const next=Math.max(-60,Math.min(12,g.db+(g.y-e.clientY)*(e.shiftKey?.1:.75)));g.value=dbVolume(next);setPreview(next);onPreview?.(g.value);}}
    onPointerUp={e=>{if(!gesture.current)return;e.stopPropagation();const value=gesture.current.value;gesture.current=null;setPreview(null);onPreview?.(null);onChange(value);}}
    onPointerCancel={()=>{gesture.current=null;setPreview(null);onPreview?.(null);}}
    onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();gesture.current=null;setPreview(null);onPreview?.(null);}if(["ArrowUp","ArrowDown","Home","End"].includes(e.key)){e.preventDefault();e.stopPropagation();if(disabled)return;onChange(dbVolume(e.key==="Home"?0:e.key==="End"?-60:Math.min(12,Math.max(-60,db+(e.key==="ArrowUp"?1:-1)))));}}}>
    <i/>{preview!==null&&<output>{db<=-60?"−∞":db.toFixed(1)} dB</output>}
  </span>;
}
