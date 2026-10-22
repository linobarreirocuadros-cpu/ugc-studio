import {useLayoutEffect,useMemo,useRef,useState} from "react";
import {AbsoluteFill,cancelRender,continueRender,delayRender,useCurrentFrame,useVideoConfig} from "remotion";
import type {CaptionClip,GraphicClip,TextClip} from "../project/types";
import {hyperframesHtml} from "./hyperframesHtml";
import {fontSources} from "./fonts";

/** Remotion conserva el reloj y la composición final; espera el ACK del runtime oficial. */
export function HyperframesLayer({clip,preview,canvas}:{clip:CaptionClip|TextClip|GraphicClip;preview:boolean;canvas?:{width:number;height:number}}){
  const frame=useCurrentFrame(),rootConfig=useVideoConfig(),config={...rootConfig,...canvas},iframe=useRef<HTMLIFrameElement>(null);
  const [error,setError]=useState("");
  const serialized=JSON.stringify(clip);
  const html=useMemo(()=>hyperframesHtml(clip,config,clip.kind==="graphic"?[]:fontSources(clip.style.fontFamily,clip.kind==="caption"?900:800).map(f=>({...f,src:new URL(f.src,window.location.href).href}))),[serialized,config.width,config.height,config.fps]);
  const sequence=useRef(0),ready=useRef(false),send=useRef<(()=>void)|null>(null);
  useLayoutEffect(()=>{
    ready.current=false;setError("");
    const win=iframe.current?.ownerDocument.defaultView??window;
    const message=(e:MessageEvent)=>{
      if(e.source!==iframe.current?.contentWindow||e.data?.source!=="ugc-hyperframes")return;
      if(e.data.type==="ready"){ready.current=true;send.current?.();}
    };
    win.addEventListener("message",message);
    return()=>{win.removeEventListener("message",message);};
  },[html]);
  useLayoutEffect(()=>{
    if(error)return;
    const handle=delayRender("Fotograma de HyperFrames",{timeoutInMilliseconds:25000});
    const win=iframe.current?.ownerDocument.defaultView??window;
    const request=++sequence.current;let finished=false,timer:number|undefined;
    const finish=()=>{if(!finished){finished=true;if(timer!==undefined)win.clearTimeout(timer);continueRender(handle);}};
    const fail=(message:string)=>{if(finished)return;finish();if(preview)setError(message);else cancelRender(new Error(message));};
    const seek=()=>{iframe.current?.contentWindow?.postMessage(ready.current?{source:"ugc-remotion",type:"seek",request,frame:Math.max(0,frame)}:{source:"ugc-remotion",type:"hello"},"*");};
    const listener=(e:MessageEvent)=>{
      if(e.source!==iframe.current?.contentWindow||e.data?.source!=="ugc-hyperframes")return;
      if(e.data.type==="frame"&&e.data.request===request&&e.data.frame===frame)finish();
      if(e.data.type==="error"&&typeof e.data.message==="string")fail(e.data.message);
    };
    send.current=seek;win.addEventListener("message",listener);
    timer=win.setTimeout(()=>fail("HyperFrames no respondió. Revisa este clip o cambia su motor a Remotion."),20000);
    seek();
    return()=>{win.clearTimeout(timer);win.removeEventListener("message",listener);if(send.current===seek)send.current=null;finish();};
  },[frame,html,error,preview]);
  return <AbsoluteFill>{error?<AbsoluteFill style={{background:"#291e28",color:"#ffddd8",fontSize:32,padding:40,justifyContent:"center"}}>⚠ {error}</AbsoluteFill>:<iframe ref={iframe} title="Escena editable de HyperFrames" onLoad={()=>iframe.current?.contentWindow?.postMessage({source:"ugc-remotion",type:"hello"},"*")} sandbox="allow-scripts allow-same-origin" srcDoc={html} style={{width:"100%",height:"100%",border:0,colorScheme:"normal",background:"transparent",pointerEvents:"none"}}/>}</AbsoluteFill>;
}
