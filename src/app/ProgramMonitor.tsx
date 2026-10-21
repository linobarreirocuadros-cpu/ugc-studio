import {useAudioMix} from "./useAudioMix";
import { Player, type PlayerRef } from "@remotion/player";
import { memo, useEffect, useMemo, useState, type RefObject, type DragEvent, type PointerEvent } from "react";
import type { Project } from "../project/types";
import { trackOutputEnabled } from "../project/types";
import { ProjectComposition } from "../remotion/ProjectComposition";
import { MonitorViewer, monitorIcon, transportActions } from "./MonitorViewer";
import { usePreviewQuality, type PreviewQuality } from "./usePreviewQuality";
import type { MonitorDragMode } from "./monitorRange";

const PreviewPlayer=memo(function PreviewPlayer({playerRef,project,duration,playbackRate,sources,loop,audioSources}:{playerRef:RefObject<PlayerRef|null>;project:Project;duration:number;playbackRate:number;sources:Record<string,string>;loop:boolean;audioSources:Record<string,string>}) {
  const inputProps=useMemo(()=>({project,preview:true,previewSources:sources,audioSources}),[project,sources,audioSources]);
  return <Player ref={playerRef} component={ProjectComposition} inputProps={inputProps} bufferStateDelayInMilliseconds={300} acknowledgeRemotionLicense durationInFrames={duration} fps={project.fps} compositionWidth={project.width} compositionHeight={project.height} style={{width:"100%",height:"100%"}} controls={false} loop={loop} playbackRate={playbackRate} clickToPlay={false} doubleClickToFullscreen={false}/>;
});
const actions=[
  {id:"prevEdit",label:"Edición anterior",icon:monitorIcon(<path d="M4 4v16m16-8H7m6-6-6 6 6 6"/>)},
  ...transportActions,
  {id:"nextEdit",label:"Edición siguiente",icon:monitorIcon(<path d="M20 4v16M4 12h13m-6-6 6 6-6 6"/>)},
  {id:"marker",label:"Añadir marcador",icon:monitorIcon(<path d="M6 3h12v12l-6 6-6-6z"/>)},
  {id:"matchFrame",label:"Localizar fotograma en Origen",icon:monitorIcon(<><rect x="3" y="4" width="18" height="14"/><path d="m10 8 5 3-5 3zM8 21h8"/></>)},
  {id:"mute",label:"Silenciar / activar monitor",icon:monitorIcon(<path d="M3 9h4l5-5v16l-5-5H3zm12-1c5 0 5 8 0 8"/>)},
  {id:"loop",label:"Repetir reproducción",icon:monitorIcon(<path d="M3 8h16l-4-4m6 12H5l4 4M3 8v6m18-4v6"/>)},
];
export function ProgramMonitor({project,duration,frame,playerRef,programRef,playbackRate,onSeek,onCommand,hint,marks,onRangeDrag,onRangePlace,onRangePointerDown}:{project:Project;duration:number;frame:number;playerRef:RefObject<PlayerRef|null>;programRef:RefObject<HTMLDivElement|null>;playbackRate:number;onSeek:(f:number)=>void;onCommand:(id:string)=>void;hint:(id:string)=>string;marks:{start:number|null;end:number|null};onRangeDrag:(e:DragEvent,mode:MonitorDragMode)=>void;onRangePlace:(mode:MonitorDragMode)=>void;onRangePointerDown:(e:PointerEvent,mode:MonitorDragMode,clickToPlace?:boolean)=>void}) {
  const audioMix=useAudioMix(project);
  const [quality,setQuality]=useState<PreviewQuality>(1),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false),[muted,setMuted]=useState(false);
  // Incluye secuencias anidadas sin cambiar sus datos ni el render final.
  const sources=useMemo(()=>{
    const found=new Set<string>(),visited=new Set<string>();
    const walk=(p:Project)=>{for(const t of p.tracks.filter(t=>trackOutputEnabled(p,t)))for(const c of t.clips)if(c.kind==="video"){
      if(c.sequenceId){const nested=project.sequences?.[c.sequenceId];if(nested&&!visited.has(c.sequenceId)){visited.add(c.sequenceId);walk(nested);}}
      else found.add(c.src);
    }};walk(project);return [...found];
  },[project]);
  const preview=usePreviewQuality(sources,quality);
  const rangeClips=project.tracks.filter(t=>trackOutputEnabled(project,t)).flatMap(t=>t.clips).filter(c=>c.from<(marks.end??duration)&&c.from+c.durationInFrames>(marks.start??0));
  const rangeKinds={video:rangeClips.some(c=>c.kind!=="audio"),audio:rangeClips.some(c=>c.kind==="audio"||c.kind==="video"&&c.volume>0&&c.audioMode!=="none")};
  useEffect(()=>{const player=playerRef.current;if(!player)return;const play=()=>setPlaying(true),pause=()=>setPlaying(false),mute=()=>setMuted(player.isMuted());player.addEventListener("play",play);player.addEventListener("pause",pause);player.addEventListener("ended",pause);player.addEventListener("mutechange",mute);return()=>{player.removeEventListener("play",play);player.removeEventListener("pause",pause);player.removeEventListener("ended",pause);player.removeEventListener("mutechange",mute);};},[playerRef]);
  return <div className="program-preview" ref={programRef} data-program-muted={muted}>
    <MonitorViewer name="Programa" width={project.width} height={project.height} frame={frame} duration={duration} fps={project.fps} playing={playing} quality={quality} onQuality={q=>{playerRef.current?.pause();setQuality(q);}} pending={preview.pending} error={preview.error} onSeek={onSeek} onCommand={id=>{if(id==="mute"){const player=playerRef.current;if(player){if(player.isMuted())player.unmute();else player.mute();}}else if(id==="loop")setLoop(v=>!v);else onCommand(id);}} actions={actions.map(a=>a.id==="loop"?{...a,active:loop}:a.id==="mute"?{...a,active:muted}:a)} hint={hint} marks={marks} markers={project.markers} rangeKinds={rangeKinds} onRangeDrag={onRangeDrag} onRangePlace={onRangePlace} onRangePointerDown={onRangePointerDown}>
      {()=> <PreviewPlayer playerRef={playerRef} project={project} duration={duration} playbackRate={playbackRate} sources={preview.sources} audioSources={audioMix.sources} loop={loop}/>}
    </MonitorViewer>
    {audioMix.status&&<small className="monitor-mix-status" role="status">{audioMix.status}{audioMix.status.startsWith("No se pudo")&&<button onClick={audioMix.retry}>Reintentar</button>}</small>}
  </div>;
}
