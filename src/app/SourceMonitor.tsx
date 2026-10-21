import { MonitorViewer, transportActions, monitorIcon } from "./MonitorViewer";
import { usePreviewQuality, type PreviewQuality } from "./usePreviewQuality";
import { useImperativeHandle, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent, type Ref } from "react";
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
  hasAudio?:boolean;
};

export function SourceMonitor({ media, fps, onInsert, onDragStart, onRangePointerDown, ref, hint, onActivate }: {
  media: SourceMedia | null;
  fps: number;
  onInsert: (trackId: string, inFrame: number, outFrame: number, videoOnly: boolean) => void;
  onDragStart: (event: DragEvent, inFrame: number, outFrame: number, mode: MediaDrag["mode"]) => void;
  onRangePointerDown:(event:PointerEvent,inFrame:number,outFrame:number,mode:MediaDrag["mode"],clickToPlace?:boolean)=>boolean|void;
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

  const currentFrame=()=>pendingRestore.current??Math.round((mediaRef.current?.currentTime??position/fps)*fps);
  const seek=(frame:number)=>{const at=Math.max(0,Math.min((media?.durationInFrames??1)-1,frame));restore.current=at;pendingRestore.current=at;if(mediaRef.current?.readyState){if(Math.abs(mediaRef.current.currentTime-at/fps)<0.0001)pendingRestore.current=null;else mediaRef.current.currentTime=at/fps;}setPosition(at);};
  const seeked=(node:HTMLMediaElement)=>{const f=Math.round(node.currentTime*fps);if(pendingRestore.current!==null&&Math.abs(f-pendingRestore.current)>1){node.currentTime=pendingRestore.current/fps;return;}pendingRestore.current=null;restore.current=f;setPosition(f);};
  const loaded=(node:HTMLMediaElement)=>{const at=pendingRestore.current??restore.current;node.currentTime=at/fps;if(at===0){pendingRestore.current=null;setPosition(0);}};
  const timed=(node:HTMLMediaElement)=>{if(pendingRestore.current!==null)return;const f=Math.round(node.currentTime*fps);setPosition(f);restore.current=f;};
  const shuttle=useShuttle({current:currentFrame,seek,play:()=>{void mediaRef.current?.play().catch(()=>{});},pause:()=>mediaRef.current?.pause(),toggle:()=>{const p=mediaRef.current;if(p){if(p.paused)void p.play().catch(()=>{});else p.pause();}},rate:rate=>{if(mediaRef.current)mediaRef.current.playbackRate=rate;},fps,end:media?.durationInFrames??1});
  const command=(id:string)=>{
    if(!media)return false;
    if(id==="mute"){if(mediaRef.current){mediaRef.current.muted=!mediaRef.current.muted;setMuted(mediaRef.current.muted);}return true;}
    if(shuttle(id))return true;
    if(["markIn","markOut","clearIn","clearOut","clearMarks"].includes(id))setMarks(range=>updateMonitorRange(range,id,currentFrame(),media.durationInFrames));
    else if(id==="markClip"||id==="markSelection")setMarks({start:0,end:media.durationInFrames});
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
        <MonitorViewer name="Origen" width={dimensions.width} height={dimensions.height} frame={current} duration={media.durationInFrames} fps={fps} playing={playing} quality={quality} onQuality={q=>{restore.current=currentFrame();mediaRef.current?.pause();setQuality(q);}} pending={preview.pending} error={preview.error} onSeek={seek} onCommand={command} actions={actions} hint={hint} marks={marks} rangeKinds={{video:!isAudio,audio:isAudio||media.hasAudio!==false}} onRangeDrag={(e,mode)=>{mediaRef.current?.pause();onDragStart(e,inFrame,outFrame,mode);}} onRangePointerDown={(e,mode,click)=>onRangePointerDown(e,inFrame,outFrame,mode,click)} onRangePlace={mode=>onInsert(mode==="audio"?"A0":"V1",inFrame,outFrame,mode==="video")}>
          {style=>isAudio?<><div className="monitor-audio-placeholder">Audio</div><audio ref={el=>{mediaRef.current=el;}} src={media.src} preload="metadata" onPlay={()=>{onActivate();setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onLoadedMetadata={e=>loaded(e.currentTarget)} onSeeked={e=>seeked(e.currentTarget)} onTimeUpdate={e=>timed(e.currentTarget)}/></>:<video ref={el=>{mediaRef.current=el;}} src={resolvedSrc} style={{...style,objectFit:"contain"}} preload="auto" playsInline onPlay={()=>{onActivate();setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onTimeUpdate={e=>timed(e.currentTarget)} onSeeked={e=>seeked(e.currentTarget)} onLoadedMetadata={e=>{const video=e.currentTarget;if(quality===1)setDimensions({width:video.videoWidth||1920,height:video.videoHeight||1080});loaded(video);}}/>}
        </MonitorViewer>}
    </div>
  );
}
