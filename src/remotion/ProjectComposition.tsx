import {HyperframesLayer} from "./HyperframesLayer";
import { useState, type ReactNode } from "react";
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AudioClip, CaptionClip, GraphicClip, Project, TextClip, VideoClip } from "../project/types";
import {EffectFrame} from "./EffectFrame";
import {transitionTiming,audioTransitionTiming} from "../project/effects";
import {audioKey,clipMatrix,panHeadroom,IDENTITY,isIdentity,type PanMatrix} from "../project/audioMix";
import { trackOutputEnabled } from "../project/types";
import { cssFont, ensureFont, fontWeightFor } from "./fonts";

// Convierte rutas relativas (/media/x.mp4) en absolutas para el render en el servidor.
// `preview` = true en el Player de la app: usa proxies livianos para reproducir fluido.
export type CompositionProps = { project: Project; mediaBaseUrl?: string; preview?: boolean; previewSources?: Record<string,string>; output?: "both" | "video" | "audio"; gain?: number; sequences?: Project["sequences"]; stack?: string[]; durationOverride?: number; audioSources?:Record<string,string>;parentPan?:PanMatrix;meterTrack?:string;meterGain?:number };

const resolveSrc = (src: string, base?: string) =>
  base && src.startsWith("/") ? base.replace(/\/$/, "") + src : src;

const VideoLayer: React.FC<{ clip: VideoClip; base?: string; preview?: boolean; previewSources?: Record<string,string> }> = ({ clip, base, preview, previewSources }) => {
  // En la vista previa: si el proxy falla se usa el original; si también falla, se avisa en pantalla.
  // En la exportación no hay onError, así un archivo faltante detiene el render con un error claro.
  const [useOriginal, setUseOriginal] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = preview && !useOriginal ? (previewSources ? previewSources[clip.src] ?? clip.src : clip.proxySrc ?? clip.src) : clip.src;

  if (failed) {
    return (
      <AbsoluteFill style={{ background: "#2a1212", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{ color: "#ffb4b4", fontSize: 44, fontFamily: "sans-serif", textAlign: "center", lineHeight: 1.3 }}>
          ⚠ No se puede reproducir
          <br />
          <b>{clip.name}</b>
          <br />
          <span style={{ fontSize: 34 }}>Vuelve a importar el video y reemplaza este clip.</span>
        </div>
      </AbsoluteFill>
    );
  }

  const video = (
    <OffthreadVideo
      key={src}
      src={resolveSrc(src, base)}
      startFrom={clip.freezeFrame ?? clip.trimStart}
      playbackRate={clip.freezeFrame === undefined ? clip.playbackRate ?? 1 : 1}
      muted
      volume={0}
      pauseWhenBuffering
      acceptableTimeShiftInSeconds={0.3}
      style={{ width: "100%", height: "100%", objectFit: clip.effects?.enabled===false?"cover":clip.effects?.fit??"cover" }}
      onError={
        preview
          ? () => {
              if (src !== clip.src) setUseOriginal(true);
              else setFailed(true);
            }
          : undefined
      }
    />
  );
  return clip.freezeFrame !== undefined ? <Freeze frame={0}>{video}</Freeze> : video;
};

const AudioLayer=({clip,trackId,base,preview,pre=0,timing,meterVolume}:{meterVolume:number;clip:AudioClip;trackId:string;base?:string;preview?:boolean;pre?:number;timing:ReturnType<typeof transitionTiming>})=>{
 const f=useCurrentFrame(),local=f-pre,rate=clip.playbackRate??1;const start=clip.trimStart-Math.floor(pre*rate),missing=Math.max(0,Math.ceil(-start/rate)),trim=Math.max(0,start),available=Math.ceil((clip.sourceDurationInFrames-trim)/rate);
 if(f<missing||f>=missing+available)return null;
 const clamp=(v:number)=>Math.max(0,Math.min(1,v));let envelope=Math.min(clip.fadeIn?clamp(local/clip.fadeIn):1,clip.fadeOut?clamp((clip.durationInFrames-local)/clip.fadeOut):1);
 if(clip.crossfadeIn&&timing.previous){const x=clamp(f/Math.max(1,timing.pre+timing.inPost));envelope*=clip.crossfadeIn.curve==="equalPower"?Math.sin(x*Math.PI/2):x;}
 if(timing.next?.kind==="audio"&&timing.next.crossfadeIn){const x=clamp((local-(clip.durationInFrames-timing.outPre))/Math.max(1,timing.outPre+timing.post));envelope*=timing.next.crossfadeIn.curve==="equalPower"?Math.cos(x*Math.PI/2):1-x;}
 const volume=clip.volume*(clip.mix?.gain??1)*envelope;
 return <Sequence from={missing} layout="none"><Audio src={resolveSrc(clip.src,base)} startFrom={trim} playbackRate={rate} useWebAudioApi={Boolean(preview)} ref={element=>{if(element){element.dataset.ugcVolume=String(volume);element.dataset.ugcTrack=trackId;element.dataset.ugcTrackVolume=String(meterVolume*(clip.mix?.gain??1)*envelope);}}} volume={volume} pauseWhenBuffering/></Sequence>;
};

const TextLayer: React.FC<{ clip: TextClip }> = ({ clip }) => {
  const s = clip.style;
  ensureFont(s.fontFamily);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${s.y * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "85%",
          textAlign: "center",
          fontFamily: cssFont(s.fontFamily),
          fontSize: s.fontSize,
          fontWeight: fontWeightFor(s.fontFamily, 800),
          lineHeight: 1.15,
          color: s.color,
          background: s.background ?? undefined,
          padding: s.background ? "0.2em 0.45em" : 0,
          borderRadius: 16,
        }}
      >
        {clip.text}
      </div>
    </AbsoluteFill>
  );
};

const STROKE = "0 0 2px #000, 0 0 2px #000, 3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000";

const CaptionLayer: React.FC<{ clip: CaptionClip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const s = clip.style;
  ensureFont(s.fontFamily);
  const activeIndex = clip.words.findIndex((w) => frame >= w.start && frame < w.end);
  // Pequeño "pop" al aparecer el bloque
  const pop = clip.motion?1:interpolate(frame, [0, 4], [0.85, 1], { extrapolateRight: "clamp" });
  const words =
    s.preset === "palabra"
      ? clip.words.filter((w, i) => i === activeIndex || (activeIndex === -1 && frame >= w.start)).slice(-1)
      : clip.words;

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${s.y * 100}%`,
          transform: `translateY(-50%) scale(${pop})`,
          maxWidth: "88%",
          textAlign: "center",
          fontFamily: cssFont(s.fontFamily),
          fontSize: s.preset === "palabra" ? s.fontSize * 1.25 : s.fontSize,
          fontWeight: fontWeightFor(s.fontFamily, 900),
          lineHeight: 1.1,
          color: s.color,
          textTransform: s.uppercase ? "uppercase" : "none",
          textShadow: s.stroke ? STROKE : undefined,
          background: s.preset === "bloque" ? s.background ?? "rgba(0,0,0,0.6)" : s.background ?? undefined,
          padding: s.preset === "bloque" || s.background ? "0.15em 0.4em" : 0,
          borderRadius: 14,
        }}
      >
        {words.map((w, i) => {
          const active = s.preset === "karaoke" && clip.words.indexOf(w) === activeIndex;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 0.18em",
                color: active ? s.highlightColor : undefined,
                transform: active ? `scale(${clip.motion?.wordScale??1.08})` : undefined,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const GraphicLayer = ({clip}: {clip: GraphicClip}) => <AbsoluteFill style={{pointerEvents:"none"}}><div style={{position:"absolute",background:clip.color,opacity:clip.opacity,...(clip.shape==="solid"?{inset:0}:{left:`${clip.x*100}%`,top:`${clip.y*100}%`,width:`${clip.width*100}%`,height:`${clip.height*100}%`,transform:"translate(-50%,-50%)"})}}/></AbsoluteFill>;

/** Separar el sonido de la pila visual evita que un ajuste de color afecte al audio. */
export const ProjectComposition: React.FC<CompositionProps> = ({project,mediaBaseUrl,preview,previewSources,output="both",gain=1,meterGain=1,sequences=project.sequences,stack=[],durationOverride,audioSources={},parentPan=IDENTITY,meterTrack})=>{
 const frame=useCurrentFrame();let visuals:ReactNode=null;const audio:ReactNode[]=[];const busGain=gain*(project.masterVolume??1),meterBusGain=meterGain*(stack.length?project.masterVolume??1:1);
 const nested=(clip:VideoClip|AudioClip,level:number,matrix:PanMatrix,trackId:string,meterLevel=meterBusGain)=><NestedSequence clip={clip} base={mediaBaseUrl} preview={preview} previewSources={previewSources} sequences={sequences} stack={stack} gain={level} matrix={matrix} audioSources={audioSources} meterTrack={trackId} meterGain={meterLevel}/>;
 for(const track of project.tracks.filter(t=>trackOutputEnabled(project,t)))for(const clip of [...track.clips].sort((a,b)=>a.from-b.from)){
   const timing=transitionTiming(track,clip),trackId=meterTrack??track.id;
   if((clip.kind==="audio"||clip.kind==="video"&&clip.volume>0&&clip.freezeFrame===undefined&&clip.audioMode!=="none")&&output!=="video"){
     const soundTiming=audioTransitionTiming(track,clip);const a:AudioClip=clip.kind==="audio"?clip:{...clip,kind:"audio",fadeIn:0,fadeOut:0};const matrix=clipMatrix(track,a,parentPan),key=audioKey(a.src,matrix),level=busGain*(track.kind==="audio"?track.volume??1:1);
     if(a.sequenceId)audio.push(<Sequence key={a.id} from={a.from} durationInFrames={a.durationInFrames}>{nested(a,level,matrix,trackId,meterBusGain*(track.kind==="audio"?track.volume??1:1))}</Sequence>);
     else if(audioSources[key]!==""&&(!preview||isIdentity(matrix)||audioSources[key]))audio.push(<Sequence key={a.id} from={soundTiming.from} durationInFrames={soundTiming.duration}><AudioLayer clip={{...a,src:audioSources[key]??a.src,volume:a.volume*level*(audioSources[key]?panHeadroom(matrix):1)}} meterVolume={a.volume*(audioSources[key]?panHeadroom(matrix):1)*meterBusGain*(track.kind==="audio"?track.volume??1:1)} timing={soundTiming} trackId={trackId} pre={soundTiming.pre} base={mediaBaseUrl} preview={preview}/></Sequence>);
   }
   if(output==="audio"||clip.kind==="audio")continue;
   if(clip.kind==="graphic"&&clip.shape==="adjustment"){
     if(frame>=clip.from&&frame<clip.from+clip.durationInFrames)visuals=<AbsoluteFill key={clip.id} style={{filter:`brightness(${1+(clip.brightness-1)*clip.opacity}) contrast(${1+(clip.contrast-1)*clip.opacity}) saturate(${1+(clip.saturation-1)*clip.opacity})`}}>{visuals}</AbsoluteFill>;continue;
   }
   const layer=clip.renderEngine==="hyperframes"&&(clip.kind==="text"||clip.kind==="caption"||clip.kind==="graphic"&&clip.shape!=="adjustment")?<HyperframesLayer clip={{...clip,durationInFrames:timing.duration,...(clip.motion?{motion:{...clip.motion,offset:(clip.motion.offset??0)-timing.pre,sourceDuration:clip.motion.sourceDuration??clip.durationInFrames}}:{}),...(clip.kind==="caption"?{words:clip.words.map(w=>({...w,start:w.start+timing.pre,end:w.end+timing.pre}))}:{})}} preview={preview??false}/>:clip.kind==="video"?<ExtendedVideo clip={clip} pre={timing.pre} duration={timing.duration} render={c=>c.sequenceId?nested(c,busGain,parentPan,trackId):<VideoLayer key={c.src} clip={c} base={mediaBaseUrl} preview={preview} previewSources={previewSources}/>}/>:clip.kind==="text"?<TextLayer clip={clip}/>:clip.kind==="caption"?<CaptionLayer clip={{...clip,words:clip.words.map(w=>({...w,start:w.start+timing.pre,end:w.end+timing.pre}))}}/>:<GraphicLayer clip={clip}/>;
   visuals=<>{visuals}<Sequence key={clip.id} from={timing.from} durationInFrames={timing.duration} premountFor={clip.kind==="video"?project.fps:undefined}><EffectFrame clip={clip} track={track} project={project}>{layer}</EffectFrame></Sequence></>;
 }
 return <AbsoluteFill style={{backgroundColor:output!=="both"||stack.length>0?"transparent":"black"}}>{visuals}{audio}</AbsoluteFill>;
};
const ExtendedVideo=({clip,pre,duration,render}:{clip:VideoClip;pre:number;duration:number;render:(c:VideoClip)=>ReactNode})=>{const frame=useCurrentFrame();if(clip.freezeFrame!==undefined)return render(clip);const rate=clip.playbackRate??1,start=clip.trimStart-Math.floor(pre*rate),missing=Math.max(0,Math.ceil(-start/rate)),trim=Math.max(0,start),available=Math.max(1,Math.ceil((clip.sourceDurationInFrames-trim)/rate));const adjusted={...clip,trimStart:trim};if(frame<missing)return <Freeze frame={0}>{render(adjusted)}</Freeze>;if(frame>=missing+available)return <Freeze frame={available-1}>{render(adjusted)}</Freeze>;return <Sequence from={missing} durationInFrames={Math.min(available,duration-missing)} layout="none">{render(adjusted)}</Sequence>;};
const NestedSequence:React.FC<{clip:VideoClip|AudioClip;base?:string;preview?:boolean;previewSources?:Record<string,string>;sequences?:Project["sequences"];stack:string[];gain:number;matrix:PanMatrix;audioSources:Record<string,string>;meterTrack:string;meterGain:number}>=({clip,base,preview,previewSources,sequences,stack,gain,matrix,audioSources,meterTrack,meterGain})=>{
 const sequence=sequences?.[clip.sequenceId!];if(!sequence)throw new Error(`No se encuentra la secuencia ${clip.name}.`);if(stack.includes(sequence.id)||stack.length>=8)throw new Error("Secuencia circular o más de 8 niveles");const frame=useCurrentFrame();const fade=clip.kind==="audio"?Math.min(clip.fadeIn?Math.max(0,Math.min(1,frame/clip.fadeIn)):1,clip.fadeOut?Math.max(0,Math.min(1,(clip.durationInFrames-frame)/clip.fadeOut)):1):1;return <Sequence from={-clip.trimStart} durationInFrames={sequence.durationInFrames}><ProjectComposition project={sequence} mediaBaseUrl={base} preview={preview} previewSources={previewSources} audioSources={audioSources} output={clip.kind==="audio"?"audio":"video"} gain={clip.kind==="audio"?gain*clip.volume*(clip.mix?.gain??1)*fade:gain} parentPan={matrix} meterGain={clip.kind==="audio"?meterGain*clip.volume*(clip.mix?.gain??1)*fade:meterGain} meterTrack={meterTrack} sequences={sequences} stack={[...stack,sequence.id]} durationOverride={sequence.durationInFrames}/></Sequence>;
};
