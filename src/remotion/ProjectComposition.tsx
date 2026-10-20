import { useState, type ReactNode } from "react";
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AudioClip, CaptionClip, GraphicClip, Project, TextClip, VideoClip } from "../project/types";
import { trackOutputEnabled } from "../project/types";
import { cssFont, ensureFont, fontWeightFor } from "./fonts";

// Convierte rutas relativas (/media/x.mp4) en absolutas para el render en el servidor.
// `preview` = true en el Player de la app: usa proxies livianos para reproducir fluido.
export type CompositionProps = { project: Project; mediaBaseUrl?: string; preview?: boolean; previewSources?: Record<string,string>; output?: "both" | "video" | "audio"; gain?: number; sequences?: Project["sequences"]; stack?: string[]; durationOverride?: number };

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
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
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

const AudioLayer: React.FC<{ clip: AudioClip; base?: string; compositionEnd?: number; preview?: boolean }> = ({ clip, base, compositionEnd, preview }) => {
  // Si la canción dura más que el video, el fade out se hace donde termina el video
  const { durationInFrames: videoEnd } = useVideoConfig();
  const d = Math.min(clip.durationInFrames, (compositionEnd ?? videoEnd) - clip.from);
  const f=useCurrentFrame();
  const fadeIn=clip.fadeIn>0?interpolate(f,[0,clip.fadeIn],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}):1;
  const fadeOut=clip.fadeOut>0?interpolate(f,[d-clip.fadeOut,d],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}):1;
  const volume=clip.volume*Math.min(fadeIn,fadeOut);
  return (
  <Audio src={resolveSrc(clip.src,base)} startFrom={clip.trimStart} playbackRate={clip.playbackRate??1}
    useWebAudioApi={Boolean(preview)} ref={element=>{if(element)element.dataset.ugcVolume=String(volume);}} volume={volume} pauseWhenBuffering/>

  );
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
  const pop = interpolate(frame, [0, 4], [0.85, 1], { extrapolateRight: "clamp" });
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
                transform: active ? "scale(1.08)" : undefined,
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
export const ProjectComposition: React.FC<CompositionProps> = ({ project, mediaBaseUrl, preview, previewSources, output = "both", gain = 1, sequences = project.sequences, stack = [], durationOverride }) => {
  const frame=useCurrentFrame(); let visuals: ReactNode = null;
  const audio: ReactNode[]=[];
  const nested=(clip: VideoClip|AudioClip)=><NestedSequence clip={clip} base={mediaBaseUrl} preview={preview} previewSources={previewSources} sequences={sequences} stack={stack} gain={gain}/>;
  const timed=(clip: Project["tracks"][number]["clips"][number],node: ReactNode)=><Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames} premountFor={clip.kind==="video"?project.fps:undefined}>{node}</Sequence>;
  for(const track of project.tracks.filter(t=>trackOutputEnabled(project,t))) {
    for(const clip of track.clips) {
      if((clip.kind==="audio" || clip.kind==="video"&&clip.volume>0&&clip.freezeFrame===undefined)&&output!=="video") {
        const a: AudioClip = clip.kind==="audio"?clip:{...clip,kind:"audio",fadeIn:0,fadeOut:0};
        audio.push(timed(a,a.sequenceId?nested(a):<AudioLayer clip={{...a,volume:a.volume*gain}} base={mediaBaseUrl} compositionEnd={durationOverride} preview={preview}/>));
      }
      if(output==="audio" || clip.kind==="audio")continue;
      if(clip.kind==="graphic"&&clip.shape==="adjustment") {
        if(frame>=clip.from&&frame<clip.from+clip.durationInFrames) visuals=<AbsoluteFill key={clip.id} style={{filter:`brightness(${1+(clip.brightness-1)*clip.opacity}) contrast(${1+(clip.contrast-1)*clip.opacity}) saturate(${1+(clip.saturation-1)*clip.opacity})`}}>{visuals}</AbsoluteFill>;
        continue;
      }
      const layer=clip.kind==="video"?(clip.sequenceId?nested(clip):<VideoLayer key={clip.src} clip={clip} base={mediaBaseUrl} preview={preview} previewSources={previewSources}/>):clip.kind==="text"?<TextLayer clip={clip}/>:clip.kind==="caption"?<CaptionLayer clip={clip}/>:<GraphicLayer clip={clip}/>;
      visuals=<>{visuals}{timed(clip,layer)}</>;
    }
  }
  return <AbsoluteFill style={{backgroundColor:output!=="both"||stack.length>0?"transparent":"black"}}>{visuals}{audio}</AbsoluteFill>;
};

const NestedSequence: React.FC<{ clip: VideoClip | AudioClip; base?: string; preview?: boolean; previewSources?: Record<string,string>; sequences?: Project["sequences"]; stack: string[]; gain: number }> = ({ clip, base, preview, previewSources, sequences, stack, gain }) => {
  const sequence = sequences?.[clip.sequenceId!];
  if (!sequence) throw new Error(`No se encuentra la secuencia ${clip.name}.`);
  if (stack.includes(sequence.id) || stack.length >= 8) throw new Error("Secuencia circular o más de 8 niveles de anidación.");
  const frame = useCurrentFrame();
  const fade = clip.kind === "audio" ? Math.min(clip.fadeIn ? Math.max(0, Math.min(1, frame / clip.fadeIn)) : 1, clip.fadeOut ? Math.max(0, Math.min(1, (clip.durationInFrames - frame) / clip.fadeOut)) : 1) : 1;
  return <Sequence from={-clip.trimStart} durationInFrames={sequence.durationInFrames}>
    <ProjectComposition project={sequence} mediaBaseUrl={base} preview={preview} previewSources={previewSources} output={clip.kind === "audio" ? "audio" : "video"} gain={clip.kind === "audio" ? gain * clip.volume * fade : gain} sequences={sequences} stack={[...stack, sequence.id]} durationOverride={sequence.durationInFrames}/>
  </Sequence>;
};
