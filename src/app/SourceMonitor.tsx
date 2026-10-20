import { MonitorViewer, transportActions, monitorIcon } from "./MonitorViewer";
import { usePreviewQuality, type PreviewQuality } from "./usePreviewQuality";
import { useImperativeHandle, useLayoutEffect, useRef, useState, type DragEvent, type Ref } from "react";
import { type MediaDrag } from "./Timeline";
import { useShuttle } from "./useShuttle";
import { sourceRange, updateMonitorRange, type MonitorRange } from "./monitorRange";

export type SourceHandle = { command:(id:string)=>boolean; range:()=>{inFrame:number;outFrame:number}; seek:(frame:number)=>void };

type SourceMedia = {
  src: string;
  proxySrc?: string;
  name: string;
  durationInFrames: number;
  kind?: "video" | "audio";
};

export function SourceMonitor({ media, fps, onInsert, onDragStart, ref, hint, onActivate }: {
  media: SourceMedia | null;
  fps: number;
  onInsert: (trackId: string, inFrame: number, outFrame: number, videoOnly: boolean) => void;
  onDragStart: (event: DragEvent, inFrame: number, outFrame: number, mode: MediaDrag["mode"]) => void;
  ref?:Ref<SourceHandle>; hint:(id:string)=>string;
  onActivate:()=>void;
}) {
  const [position, setPosition] = useState(0);
  const [marks, setMarks] = useState<MonitorRange>({start:null,end:null});
  const {inFrame,outFrame}=sourceRange(marks,media?.durationInFrames??1);
  const mediaRef=useRef<HTMLMediaElement|null>(null);
  const [quality,setQuality]=useState<PreviewQuality>(1),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(false),[dimensions,setDimensions]=useState({width:1920,height:1080});
  const preview=usePreviewQuality(media?.kind!=="audio"&&media?[media.src]:[],quality);
  const restore=useRef(0);
  const resolvedSrc=media?(preview.sources[media.src]??media.src):"";
  const pendingRestore=useRef<number|null>(null);
  useLayoutEffect(()=>{pendingRestore.current=restore.current;setPlaying(false);},[resolvedSrc]);
  const actions=[...transportActions,{id:"mute",label:"Silenciar / activar sonido",active:muted,icon:monitorIcon(<path d="M3 9h4l5-5v16l-5-5H3zm12-1c5 0 5 8 0 8"/>)}];
  const isAudio = media?.kind === "audio";
  const current = Math.max(0, Math.min((media?.durationInFrames ?? 1) - 1, position));

  const currentFrame=()=>Math.round((mediaRef.current?.currentTime??position/fps)*fps);
  const seek=(frame:number)=>{const at=Math.max(0,Math.min((media?.durationInFrames??1)-1,frame));restore.current=at;if(pendingRestore.current!==null)pendingRestore.current=at;if(mediaRef.current?.readyState)mediaRef.current.currentTime=at/fps;else pendingRestore.current=at;setPosition(at);};
  const shuttle=useShuttle({current:currentFrame,seek,play:()=>{void mediaRef.current?.play().catch(()=>{});},pause:()=>mediaRef.current?.pause(),toggle:()=>{const p=mediaRef.current;if(p){if(p.paused)void p.play().catch(()=>{});else p.pause();}},rate:rate=>{if(mediaRef.current)mediaRef.current.playbackRate=rate;},fps,end:media?.durationInFrames??1});
  const command=(id:string)=>{
    if(!media)return false;
    if(id==="mute"){if(mediaRef.current){mediaRef.current.muted=!mediaRef.current.muted;setMuted(mediaRef.current.muted);}return true;}
    if(shuttle(id))return true;
    if(["markIn","markOut","clearIn","clearOut","clearMarks"].includes(id))setMarks(range=>updateMonitorRange(range,id,currentFrame(),media.durationInFrames));
    else if(id==="markClip")setMarks({start:0,end:media.durationInFrames});
    else if(id==="goIn")seek(inFrame);
    else if(id==="goOut")seek(outFrame-1);
    else if(id==="start")seek(0);
    else if(id==="end")seek(media.durationInFrames-1);
    else if(/^step(Left|Right)[15]$/.test(id))seek(currentFrame()+(id.includes("Left")?-1:1)*Number(id.at(-1)));
    else return false;
    return true;
  };
  useImperativeHandle(ref,()=>({range:()=>({inFrame,outFrame}),seek,command}));

  return (
    <div className="source-monitor">
      <div className="monitor-label">Origen{media ? ` · ${media.name}` : ""}</div>
      {!media ? <div className="source-preview"><p className="hint">Selecciona un archivo en Proyecto para verlo aquí.</p></div> :
        <MonitorViewer name="Origen" width={dimensions.width} height={dimensions.height} frame={current} duration={media.durationInFrames} fps={fps} playing={playing} quality={quality} onQuality={q=>{restore.current=currentFrame();mediaRef.current?.pause();setQuality(q);}} pending={preview.pending} error={preview.error} onSeek={seek} onCommand={command} actions={actions} hint={hint} marks={marks}>
          {style=>isAudio?<><div className="monitor-audio-placeholder">Audio</div><audio ref={el=>{mediaRef.current=el;}} src={media.src} preload="metadata" onPlay={()=>{onActivate();setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onTimeUpdate={e=>setPosition(Math.round(e.currentTarget.currentTime*fps))}/></>:<video ref={el=>{mediaRef.current=el;}} src={resolvedSrc} style={{...style,objectFit:"contain"}} preload="auto" playsInline onPlay={()=>{onActivate();setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onTimeUpdate={e=>{if(pendingRestore.current!==null)return;const f=Math.round(e.currentTarget.currentTime*fps);setPosition(f);restore.current=f;}} onSeeked={e=>{pendingRestore.current=null;const f=Math.round(e.currentTarget.currentTime*fps);restore.current=f;setPosition(f);}} onLoadedMetadata={e=>{const video=e.currentTarget;if(quality===1)setDimensions({width:video.videoWidth||1920,height:video.videoHeight||1080});const at=pendingRestore.current??restore.current;video.currentTime=at/fps;if(at===0){pendingRestore.current=null;setPosition(0);}}}/>}
        </MonitorViewer>}
      {media && <>
        <div className="source-actions">
          {!isAudio && <>
            <button onClick={() => onInsert("V1", inFrame, outFrame, false)} title="Sobrescribir en la pista B destino y añadir su sonido enlazado">Colocar video</button>
            <button draggable onDragStart={(e) => onDragStart(e, inFrame, outFrame, "video")} onClick={() => onInsert("V1", inFrame, outFrame, true)} title="Arrastra a una pista B; clic para sobrescribir en la pista destino sin sonido">Solo video ↗</button>
            <button draggable onDragStart={(e) => onDragStart(e, inFrame, outFrame, "audio")} onClick={() => onInsert("A0", inFrame, outFrame, false)} title="Arrastra a una pista Audio; clic para sobrescribir en la pista Audio destino">Solo audio ↗</button>
          </>}
          {isAudio && <button draggable onDragStart={(e) => onDragStart(e, inFrame, outFrame, "audio")} onClick={() => onInsert("A0", inFrame, outFrame, false)}>Insertar audio ↗</button>}
        </div>
      </>}
    </div>
  );
}
