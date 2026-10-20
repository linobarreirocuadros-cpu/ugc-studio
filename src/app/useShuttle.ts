import { useEffect, useRef } from "react";
type Transport = { current:()=>number; seek:(frame:number)=>void; play:()=>void; pause:()=>void; toggle:()=>void; rate:(rate:number)=>void; end:number; fps:number };
/** Revisión inversa por fotogramas, sin audio. La reproducción hacia delante usa el motor normal. */
export function useShuttle(transport:Transport) {
  const latest=useRef(transport);latest.current=transport;
  const speed=useRef(0), animation=useRef(0);
  const stopReverse=()=>{cancelAnimationFrame(animation.current);animation.current=0;};
  const stop=()=>{stopReverse();speed.current=0;latest.current.pause();latest.current.rate(1);};
  useEffect(()=>{window.addEventListener("blur",stop);return()=>{window.removeEventListener("blur",stop);cancelAnimationFrame(animation.current);};},[]);
  return (id:string)=>{
    if(id==="stop"){stop();return true;}
    if(id==="play"){if(speed.current<0){stop();return true;}speed.current=0;latest.current.rate(1);latest.current.toggle();return true;}
    if(id!=="forwardPlay"&&id!=="reversePlay")return false;
    const direction=id==="forwardPlay"?1:-1, next=Math.sign(speed.current)===direction?Math.min(16,Math.abs(speed.current)*2):1;
    stopReverse();speed.current=direction*next;
    if(direction>0){latest.current.rate(next);latest.current.play();return true;}
    latest.current.pause();const start=latest.current.current(),time=performance.now();let last=-1;
    const tick=(now:number)=>{const at=Math.max(0,Math.round(start-(now-time)/1000*latest.current.fps*next));if(at!==last){last=at;latest.current.seek(at);}if(at>0&&speed.current<0)animation.current=requestAnimationFrame(tick);else speed.current=0;};
    animation.current=requestAnimationFrame(tick);return true;
  };
}
