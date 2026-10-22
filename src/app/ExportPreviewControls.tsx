import { useEffect, useState, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import { formatTimecode } from "./Timeline";
/** El transporte queda fuera de la imagen; su reloj no repinta todo el formulario. */
export function ExportPreviewControls({
  player,
  start,
  end,
  fps,
  resetKey,
  muted,
  onMute,
}: {
  player: RefObject<PlayerRef | null>;
  start: number;
  end: number;
  fps: number;
  resetKey: string;
  muted: boolean;
  onMute: (v: boolean) => void;
}) {
  const [frame, setFrame] = useState(start),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const update = (e: { detail: { frame: number } }) =>
        setFrame(e.detail.frame),
      play = () => setPlaying(true),
      pause = () => setPlaying(false);
    p.addEventListener("frameupdate", update);
    p.addEventListener("play", play);
    p.addEventListener("pause", pause);
    p.pause();
    p.seekTo(start);
    setFrame(start);
    setPlaying(false);
    return () => {
      p.removeEventListener("frameupdate", update);
      p.removeEventListener("play", play);
      p.removeEventListener("pause", pause);
    };
  }, [player, start, end, resetKey]);
  return (
    <div className="delivery-preview-controls">
      <button
        aria-label={playing ? "Pausar vista previa" : "Reproducir vista previa"}
        onClick={() => {
          const p = player.current;
          if (playing) p?.pause();
          else void p?.play();
        }}
      >
        {playing ? "Ⅱ" : "▶"}
      </button>
      <button
        aria-label="Silenciar vista previa"
        aria-pressed={muted}
        onClick={() => onMute(!muted)}
      >
        {muted ? "Silencio" : "Sonido"}
      </button>
      <input
        aria-label="Cabezal de vista previa de exportación"
        type="range"
        min={start}
        max={end}
        step={1}
        value={Math.max(start, Math.min(end, frame))}
        onChange={(e) => player.current?.seekTo(Number(e.target.value))}
      />
      <span>
        {formatTimecode(frame, fps)} / {formatTimecode(end + 1, fps)}
      </span>
      <button
        aria-label="Ampliar vista previa"
        title="Salir con Escape"
        onClick={() => player.current?.requestFullscreen()}
      >
        ⛶
      </button>
    </div>
  );
}
