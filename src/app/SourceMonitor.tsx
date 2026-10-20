import { useImperativeHandle, useRef, useState, type DragEvent, type Ref } from "react";
import { formatTimecode, type MediaDrag } from "./Timeline";
import { useShuttle } from "./useShuttle";

export type SourceHandle = { command:(id:string)=>boolean; range:()=>{inFrame:number;outFrame:number}; seek:(frame:number)=>void };

type SourceMedia = {
  src: string;
  proxySrc?: string;
  name: string;
  durationInFrames: number;
  kind?: "video" | "audio";
};

export function SourceMonitor({ media, fps, onInsert, onDragStart, ref, hint }: {
  media: SourceMedia | null;
  fps: number;
  onInsert: (trackId: string, inFrame: number, outFrame: number, videoOnly: boolean) => void;
  onDragStart: (event: DragEvent, inFrame: number, outFrame: number, mode: MediaDrag["mode"]) => void;
  ref?:Ref<SourceHandle>; hint:(id:string)=>string;
}) {
  const [position, setPosition] = useState(0);
  const [inFrame, setInFrame] = useState(0);
  const [outFrame, setOutFrame] = useState(media?.durationInFrames ?? 1);
  const mediaRef=useRef<HTMLMediaElement|null>(null);
  const isAudio = media?.kind === "audio";
  const current = Math.max(0, Math.min((media?.durationInFrames ?? 1) - 1, position));

  const markIn = () => setInFrame(Math.min(current, outFrame - 1));
  const markOut = () => setOutFrame(Math.max(inFrame + 1, current + 1));
  const currentFrame=()=>Math.round((mediaRef.current?.currentTime??position/fps)*fps);
  const seek=(frame:number)=>{const at=Math.max(0,Math.min((media?.durationInFrames??1)-1,frame));if(mediaRef.current)mediaRef.current.currentTime=at/fps;setPosition(at);};
  const shuttle=useShuttle({current:currentFrame,seek,play:()=>{void mediaRef.current?.play().catch(()=>{});},pause:()=>mediaRef.current?.pause(),toggle:()=>{const p=mediaRef.current;if(p){if(p.paused)void p.play().catch(()=>{});else p.pause();}},rate:rate=>{if(mediaRef.current)mediaRef.current.playbackRate=rate;},fps,end:media?.durationInFrames??1});
  useImperativeHandle(ref,()=>({range:()=>({inFrame,outFrame}),seek,command:(id)=>{
    if(!media)return false;
    if(shuttle(id))return true;
    if(id==="markIn")setInFrame(Math.min(currentFrame(),outFrame-1));
    else if(id==="markOut")setOutFrame(Math.max(inFrame+1,currentFrame()+1));
    else if(id==="clearIn")setInFrame(0);
    else if(id==="clearOut")setOutFrame(media.durationInFrames);
    else if(id==="clearMarks"||id==="markClip"){setInFrame(0);setOutFrame(media.durationInFrames);}
    else if(id==="goIn")seek(inFrame);
    else if(id==="goOut")seek(outFrame-1);
    else if(id==="start")seek(0);
    else if(id==="end")seek(media.durationInFrames-1);
    else if(/^step(Left|Right)[15]$/.test(id))seek(currentFrame()+(id.includes("Left")?-1:1)*Number(id.at(-1)));
    else return false;
    return true;
  }}));

  return (
    <div className="source-monitor">
      <div className="monitor-label">Origen{media ? ` · ${media.name}` : ""}</div>
      <div className="source-preview">
        {!media ? <p className="hint">Selecciona un archivo en Proyecto para verlo aquí.</p> :
          isAudio ? (
            <audio ref={el=>{mediaRef.current=el;}} src={media.src} controls preload="metadata" onTimeUpdate={(e) => setPosition(Math.round(e.currentTarget.currentTime * fps))} />
          ) : (
            <video ref={el=>{mediaRef.current=el;}} src={media.proxySrc ?? media.src} controls preload="metadata" onTimeUpdate={(e) => setPosition(Math.round(e.currentTarget.currentTime * fps))} />
          )}
      </div>
      {media && <>
        <div className="source-timecode">{formatTimecode(current, fps)} / {formatTimecode(media.durationInFrames, fps)}</div>
        <div className="source-markers">
          <button onClick={markIn} title={`Marcar entrada · ${hint("markIn")}`}>Entrada</button>
          <button onClick={markOut} title={`Marcar salida · ${hint("markOut")}`}>Salida</button>
          <button onClick={() => { setInFrame(0); setOutFrame(media.durationInFrames); }} title="Usar el archivo completo">Limpiar</button>
        </div>
        <div className="source-range">Rango: {formatTimecode(inFrame, fps)} → {formatTimecode(outFrame, fps)}</div>
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
