import { useEffect, useRef, useState } from "react";
import type { Clip, Project } from "../project/types";
import { clipLabel, getProjectDuration } from "../project/types";

type Drag = {
  clipId: string;
  mode: "move" | "trim-start" | "trim-end";
  startX: number;
  startY: number;
  dx: number;
  dy: number;
};

type Props = {
  project: Project;
  frame: number;
  selectedId: string | null;
  pxPerFrame: number;
  onSeek: (frame: number) => void;
  onSelect: (clipId: string | null) => void;
  onMove: (clipId: string, from: number, trackId: string) => void;
  onTrim: (clipId: string, edge: "start" | "end", delta: number) => void;
};

const HEADER_W = 76;
const TRACK_H = 56;
const SNAP_PX = 8;

export function Timeline({ project, frame, selectedId, pxPerFrame, onSeek, onSelect, onMove, onTrim }: Props) {
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const duration = getProjectDuration(project);
  // Ancho: hasta el último clip (aunque sea una canción más larga que el video) + 10 s de margen
  const lastEnd = project.tracks.flatMap((t) => t.clips).reduce((end, c) => Math.max(end, c.from + c.durationInFrames), duration);
  const width = (lastEnd + project.fps * 10) * pxPerFrame;

  // Puntos de "imán": bordes de todos los clips y el cabezal de reproducción.
  const snapPoints = (excludeId: string) => {
    const pts = [0, frame];
    for (const t of project.tracks)
      for (const c of t.clips) if (c.id !== excludeId) pts.push(c.from, c.from + c.durationInFrames);
    return pts;
  };
  const snap = (value: number, excludeId: string) => {
    let best = value;
    let bestDist = SNAP_PX / pxPerFrame;
    for (const p of snapPoints(excludeId)) {
      const d = Math.abs(p - value);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  };

  useEffect(() => {
    if (!drag) return;
    const onMoveEvt = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) setDrag({ ...d, dx: e.clientX - d.startX, dy: e.clientY - d.startY });
    };
    const onUp = () => {
      if (dragRef.current) commitDrag(dragRef.current);
      setDrag(null);
    };
    window.addEventListener("mousemove", onMoveEvt);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMoveEvt);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.clipId, drag?.mode]);

  const findClip = (id: string) => project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
  const displayed = [...project.tracks].reverse(); // arriba: subtítulos; abajo: audio

  /** Pista destino al arrastrar verticalmente: solo entre pistas del mismo tipo. */
  const dragTargetTrack = (clipId: string, d: Drag) => {
    const idx = displayed.findIndex((t) => t.clips.some((c) => c.id === clipId));
    const target = displayed[idx + Math.round(d.dy / TRACK_H)];
    return target && target.kind === displayed[idx].kind ? target : displayed[idx];
  };

  const dragPreview = (clip: Clip, d: Drag) => {
    const deltaFrames = d.dx / pxPerFrame;
    if (d.mode === "move") return { from: Math.max(0, snap(clip.from + deltaFrames, clip.id)), dur: clip.durationInFrames };
    if (d.mode === "trim-end") {
      const end = snap(clip.from + clip.durationInFrames + deltaFrames, clip.id);
      return { from: clip.from, dur: Math.max(1, end - clip.from) };
    }
    const start = snap(clip.from + deltaFrames, clip.id);
    return { from: start, dur: clip.durationInFrames - (start - clip.from) };
  };

  const commitDrag = (d: Drag) => {
    const clip = findClip(d.clipId);
    if (!clip || (Math.abs(d.dx) < 2 && Math.abs(d.dy) < TRACK_H / 2)) return;
    const p = dragPreview(clip, d);
    if (d.mode === "move") onMove(clip.id, p.from, dragTargetTrack(clip.id, d).id);
    else if (d.mode === "trim-end") onTrim(clip.id, "end", p.dur - clip.durationInFrames);
    else onTrim(clip.id, "start", p.from - clip.from);
  };

  const seekFromEvent = (e: React.MouseEvent) => {
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
    onSeek(Math.max(0, Math.min(duration - 1, Math.round(x / pxPerFrame))));
  };

  // Marcas de la regla: cada segundo, con etiqueta según el zoom.
  const secondPx = project.fps * pxPerFrame;
  const labelEvery = secondPx < 30 ? 5 : secondPx < 60 ? 2 : 1;
  const totalSeconds = Math.ceil(width / secondPx);

  return (
    <div className="timeline">
      <div className="timeline-headers" style={{ width: HEADER_W }}>
        <div className="ruler-spacer" />
        {displayed.map((t) => (
          <div key={t.id} className="track-header" style={{ height: TRACK_H }}>
            {t.name}
          </div>
        ))}
      </div>
      <div className="timeline-scroll" ref={scrollRef}>
        <div style={{ width, position: "relative" }}>
          <div
            className="ruler"
            onMouseDown={(e) => {
              seekFromEvent(e);
              const move = (ev: MouseEvent) => seekFromEvent(ev as unknown as React.MouseEvent);
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          >
            {Array.from({ length: totalSeconds }, (_, s) =>
              s % labelEvery === 0 ? (
                <span key={s} className="tick" style={{ left: s * secondPx }}>
                  {formatTime(s)}
                </span>
              ) : null,
            )}
          </div>
          {displayed.map((track, trackIndex) => (
            <div
              key={track.id}
              className={`track track-${track.kind}`}
              style={{ height: TRACK_H }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  onSelect(null);
                  seekFromEvent(e);
                }
              }}
            >
              {track.clips.map((clip) => {
                const dragging = drag?.clipId === clip.id;
                const p = dragging ? dragPreview(clip, drag) : { from: clip.from, dur: clip.durationInFrames };
                const shiftY =
                  dragging && drag.mode === "move"
                    ? (displayed.indexOf(dragTargetTrack(clip.id, drag)) - trackIndex) * TRACK_H
                    : 0;
                return (
                  <div
                    key={clip.id}
                    className={`clip clip-${clip.kind} ${selectedId === clip.id ? "selected" : ""}`}
                    style={{
                      left: p.from * pxPerFrame,
                      width: Math.max(4, p.dur * pxPerFrame),
                      transform: shiftY ? `translateY(${shiftY}px)` : undefined,
                      zIndex: dragging ? 3 : undefined,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelect(clip.id);
                      setDrag({ clipId: clip.id, mode: "move", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                    }}
                    title={clipLabel(clip)}
                  >
                    <div
                      className="trim-handle left"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSelect(clip.id);
                        setDrag({ clipId: clip.id, mode: "trim-start", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                      }}
                    />
                    <span className="clip-label">{clipLabel(clip)}</span>
                    <div
                      className="trim-handle right"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSelect(clip.id);
                        setDrag({ clipId: clip.id, mode: "trim-end", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <div className="playhead" style={{ left: frame * pxPerFrame }} />
        </div>
      </div>
    </div>
  );
}

export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const formatTimecode = (frame: number, fps: number) => {
  const totalSeconds = Math.floor(frame / fps);
  const f = frame % fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
};
