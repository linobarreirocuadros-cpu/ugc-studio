import { useState, type DragEvent } from "react";
import { formatTimecode, type MediaDrag } from "./Timeline";

type SourceMedia = {
  src: string;
  proxySrc?: string;
  name: string;
  durationInFrames: number;
  kind?: "video" | "audio";
};

export function SourceMonitor({ media, fps, onInsert, onDragStart }: {
  media: SourceMedia | null;
  fps: number;
  onInsert: (trackId: string, inFrame: number, outFrame: number, videoOnly: boolean) => void;
  onDragStart: (event: DragEvent, inFrame: number, outFrame: number, mode: MediaDrag["mode"]) => void;
}) {
  const [position, setPosition] = useState(0);
  const [inFrame, setInFrame] = useState(0);
  const [outFrame, setOutFrame] = useState(media?.durationInFrames ?? 1);
  const isAudio = media?.kind === "audio";
  const current = Math.max(0, Math.min((media?.durationInFrames ?? 1) - 1, position));

  const markIn = () => setInFrame(Math.min(current, outFrame - 1));
  const markOut = () => setOutFrame(Math.max(inFrame + 1, current + 1));

  return (
    <div className="source-monitor">
      <div className="monitor-label">Origen{media ? ` · ${media.name}` : ""}</div>
      <div className="source-preview">
        {!media ? <p className="hint">Selecciona un archivo en Proyecto para verlo aquí.</p> :
          isAudio ? (
            <audio src={media.src} controls preload="metadata" onTimeUpdate={(e) => setPosition(Math.round(e.currentTarget.currentTime * fps))} />
          ) : (
            <video src={media.proxySrc ?? media.src} controls preload="metadata" onTimeUpdate={(e) => setPosition(Math.round(e.currentTarget.currentTime * fps))} />
          )}
      </div>
      {media && <>
        <div className="source-timecode">{formatTimecode(current, fps)} / {formatTimecode(media.durationInFrames, fps)}</div>
        <div className="source-markers">
          <button onClick={markIn} title="Marcar entrada en el fotograma actual">I · Entrada</button>
          <button onClick={markOut} title="Marcar salida después del fotograma actual">O · Salida</button>
          <button onClick={() => { setInFrame(0); setOutFrame(media.durationInFrames); }} title="Usar el archivo completo">Limpiar</button>
        </div>
        <div className="source-range">Rango: {formatTimecode(inFrame, fps)} → {formatTimecode(outFrame, fps)}</div>
        <div className="source-actions">
          {!isAudio && <>
            <button onClick={() => onInsert("V1", inFrame, outFrame, false)} title="Colocar imagen en B1 y su sonido enlazado en una pista Audio">Insertar video</button>
            <button draggable onDragStart={(e) => onDragStart(e, inFrame, outFrame, "video")} onClick={() => onInsert("V1", inFrame, outFrame, true)} title="Arrastra a una pista B; clic para insertar en B1 sin sonido">Solo video ↗</button>
            <button draggable onDragStart={(e) => onDragStart(e, inFrame, outFrame, "audio")} onClick={() => onInsert("A0", inFrame, outFrame, false)} title="Arrastra a una pista Audio; clic para insertar en Audio 1">Solo audio ↗</button>
          </>}
          {isAudio && <button draggable onDragStart={(e) => onDragStart(e, inFrame, outFrame, "audio")} onClick={() => onInsert("A0", inFrame, outFrame, false)}>Insertar audio ↗</button>}
        </div>
      </>}
    </div>
  );
}
