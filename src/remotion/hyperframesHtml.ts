import {getHyperframeRuntimeScript} from "@hyperframes/core/runtime-script";
import type {CaptionStyle,Clip,Project} from "../project/types";
import {DEFAULT_MOTION} from "../project/motion";

export const HYPERFRAMES_VERSION="0.8.185";
type Visual=Extract<Clip,{kind:"text"|"caption"|"graphic"}>;
type Payload={clip:Visual;width:number;height:number;fps:number;fonts:{family:string;weight:number;src:string}[]};
const scriptData=(v:unknown)=>JSON.stringify(v).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");

/** Solo esta plantilla de confianza produce HTML. Texto y valores entran como datos,
 * nunca como HTML/JS/CSS escrito por el chat o importado del proyecto. */
function boot(data:Payload,defaults:typeof DEFAULT_MOTION,runtime:string){
  const c=data.clip,m={...defaults,...c.motion},fps=data.fps,ms=1000/fps,offset=m.offset??0,duration=m.sourceDuration??c.durationInFrames;
  const root=document.getElementById("ugc-root")!;
  const easing=m.easing==="linear"?"linear":m.easing==="easeOut"?"cubic-bezier(.3333333333,1,.6666666667,1)":"cubic-bezier(.3333333333,0,.6666666667,1)";
  const reversed=m.easing==="easeOut"?"cubic-bezier(.3333333333,0,.6666666667,0)":easing;
  const div=(parent:HTMLElement)=>{const el=document.createElement("div");Object.assign(el.style,{position:"absolute",inset:"0"});parent.append(el);return el;};
  const animate=(el:HTMLElement,keys:Keyframe[],frames:number,delay=0,curve=easing)=>{const a=el.animate(keys,{duration:Math.max(1,frames)*ms,delay:delay*ms,fill:"both",easing:curve});a.pause();return a;};
  let holder=root;let wordAtFrame:((frame:number)=>void)|undefined;
  if(c.motion){
    // Traslaciones por fuera de rotación/escala: la misma composición que motionAt.
    for(const end of [false,true]){
      const kind=end?m.exit:m.entrance;if(kind==="none")continue;
      const wrap=div(holder);animate(wrap,end?[{opacity:1},{opacity:0}]:[{opacity:0},{opacity:1}],end?m.outFrames:m.inFrames,end?duration-1-m.outFrames-offset:-offset,end?reversed:easing);holder=wrap;
      if(kind==="rise"){const move=div(holder),rest={transform:"translateY(0px)"},away={transform:`translateY(${m.distance}px)`};animate(move,end?[rest,away]:[away,rest],end?m.outFrames:m.inFrames,end?duration-1-m.outFrames-offset:-offset,end?reversed:easing);holder=move;}
    }
    for(const prop of ["x","y","rotation","scale","opacity"] as const){
      const points=m.keys.filter(k=>k[prop]!==undefined);if(!points.length)continue;
      const wrap=div(holder),last=Math.max(1,points.at(-1)!.frame);
      const value=(v:number)=>prop==="opacity"?{opacity:v}:{transform:prop==="x"?`translateX(${v}px)`:prop==="y"?`translateY(${v}px)`:prop==="rotation"?`rotate(${v}deg)`:`scale(${v})`};
      const keys=points.map(k=>({...value(k[prop]!),offset:k.frame/last,easing}));
      if(keys[0].offset!==0)keys.unshift({...keys[0],offset:0});
      if(keys.at(-1)!.offset!==1)keys.push({...keys.at(-1)!,offset:1});
      animate(wrap,keys,last,-offset,"linear");holder=wrap;
    }
    for(const end of [false,true])if((end?m.exit:m.entrance)==="pop"){
      const wrap=div(holder),rest={transform:"scale(1)"},away={transform:"scale(.8)"};animate(wrap,end?[rest,away]:[away,rest],end?m.outFrames:m.inFrames,end?duration-1-m.outFrames-offset:-offset,end?reversed:easing);holder=wrap;
    }
  }
  if(c.kind==="graphic"){
    const shape=div(holder);Object.assign(shape.style,{background:c.color,opacity:String(c.opacity)});
    if(c.shape==="rectangle")Object.assign(shape.style,{inset:"auto",left:`${c.x*100}%`,top:`${c.y*100}%`,width:`${c.width*100}%`,height:`${c.height*100}%`,transform:"translate(-50%,-50%)"});
  }else{
    const s=c.style as CaptionStyle,box=document.createElement("div");holder.append(box);
    const font=data.fonts[0];
    Object.assign(box.style,{position:"absolute",left:"0",right:"0",margin:"0 auto",width:"max-content",top:`${s.y*100}%`,transform:"translateY(-50%)",maxWidth:c.kind==="text"?"85%":"88%",textAlign:"center",fontFamily:font?JSON.stringify(font.family)+",sans-serif":s.fontFamily,fontWeight:String(font?.weight??800),fontSize:`${s.fontSize*(c.kind==="caption"&&s.preset==="palabra"?1.25:1)}px`,lineHeight:c.kind==="text"?"1.15":"1.1",color:s.color,background:s.background??(c.kind==="caption"&&s.preset==="bloque"?"rgba(0,0,0,.6)":"transparent"),padding:s.background||c.kind==="caption"&&s.preset==="bloque"?(c.kind==="text"?".2em .45em":".15em .4em"):"0",borderRadius:c.kind==="text"?"16px":"14px",whiteSpace:"normal"});
    if(c.kind==="text"){box.textContent=c.text;}
    else{
      box.style.textTransform=s.uppercase?"uppercase":"none";
      if(s.stroke)box.style.textShadow="0 0 2px #000,0 0 2px #000,3px 3px 0 #000,-3px 3px 0 #000,3px -3px 0 #000,-3px -3px 0 #000";
      if(!c.motion){const pop=div(holder);box.remove();pop.append(box);animate(pop,[{transform:"scale(.85)"},{transform:"scale(1)"}],4,0,"linear");}
      if(s.preset==="palabra"){
        const span=document.createElement("span");Object.assign(span.style,{display:"inline-block",margin:"0 .18em"});box.append(span);
        wordAtFrame=f=>{const index=c.words.findIndex(w=>f>=w.start&&f<w.end);let last=-1;c.words.forEach((w,i)=>{if(w.start<=f)last=i;});span.textContent=c.words[index>=0?index:last]?.text??"";};wordAtFrame(0);
      }else for(const [index,w] of c.words.entries()){
        const span=document.createElement("span");span.textContent=w.text;Object.assign(span.style,{display:"inline-block",margin:"0 .18em"});box.append(span);
        const total=c.durationInFrames;
        const points=[...new Set([0,total,...c.words.flatMap(word=>[word.start,word.end])])].filter(t=>t>=0&&t<=total).sort((a,b)=>a-b);
        const keys=points.map(f=>{const active=s.preset==="karaoke"&&c.words.findIndex(word=>f>=word.start&&f<word.end)===index;return {offset:f/total,color:active?s.highlightColor:s.color,transform:`scale(${active?m.wordScale:1})`,opacity:1,easing:"steps(1,end)"};});
        animate(span,keys,total,0,"linear");
      }
    }
  }
  let lastRequest=0;
  const send=(payload:Record<string,unknown>)=>parent.postMessage({source:"ugc-hyperframes",...payload},"*");
  const fail=(error:unknown)=>send({type:"error",message:error instanceof Error?error.message:String(error)});
  window.addEventListener("error",e=>fail(e.message));
  window.addEventListener("unhandledrejection",e=>fail(e.reason));
  const hf=()=>window as unknown as {__player?:{renderSeek:(s:number,o:{exact:boolean})=>void;pause:()=>void};__renderReady?:boolean;__playerReady?:boolean};
  window.addEventListener("message",async e=>{
    if(e.source===parent&&e.data?.source==="ugc-remotion"&&e.data?.type==="hello"){if(hf().__playerReady&&hf().__renderReady===true)send({type:"ready"});return;}
    if(e.source!==parent||e.data?.source!=="ugc-remotion"||e.data?.type!=="seek"||!Number.isSafeInteger(e.data.frame)||e.data.frame<0||!Number.isSafeInteger(e.data.request))return;
    const request=e.data.request;lastRequest=request;
    try{
      if(!hf().__playerReady)throw new Error("HyperFrames todavía no está listo");
      hf().__player!.pause();hf().__player!.renderSeek(e.data.frame/fps,{exact:true});wordAtFrame?.(e.data.frame);
      const started=performance.now();
      while(hf().__renderReady!==true){if(performance.now()-started>12000)throw new Error("HyperFrames no completó el fotograma");await new Promise(requestAnimationFrame);if(request!==lastRequest)return;}
      await new Promise(requestAnimationFrame);
      if(request===lastRequest)send({type:"frame",request,frame:e.data.frame});
    }catch(error){fail(error);}
  });
  (async()=>{
    for(const f of data.fonts){const face=new FontFace(f.family,`url(${JSON.stringify(f.src)})`,{weight:String(f.weight)});document.fonts.add(await face.load());}
    await document.fonts.ready;
    const script=document.createElement("script");script.textContent=runtime;document.head.append(script);
    const started=performance.now();
    while(!hf().__playerReady||hf().__renderReady!==true){if(performance.now()-started>12000)throw new Error("No se pudo iniciar el runtime de HyperFrames");await new Promise(requestAnimationFrame);}
    hf().__player!.pause();send({type:"ready"});
  })().catch(fail);
}

export function hyperframesHtml(clip:Visual,project:Pick<Project,"width"|"height"|"fps">,fonts:Payload["fonts"]){
  const payload={clip,width:project.width,height:project.height,fps:project.fps,fonts};
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';font-src http: https: data:;img-src data:;"><style>:root{color-scheme:normal}*,*::before,*::after{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}#ugc-root{position:absolute;inset:0}</style></head><body><div id="ugc-root" data-composition-id="ugc" data-start="0" data-duration="${clip.durationInFrames/project.fps}" data-fps="${project.fps}" data-width="${project.width}" data-height="${project.height}"></div><script>try{(${boot.toString()})(${scriptData(payload)},${scriptData(DEFAULT_MOTION)},${scriptData(getHyperframeRuntimeScript())});}catch(e){parent.postMessage({source:"ugc-hyperframes",type:"error",message:String(e)},"*");}</script></body></html>`;
}
