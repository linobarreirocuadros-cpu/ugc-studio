import { useEffect, useRef, useState } from "react";
import type { Clip, Project } from "../project/types";
import { clipLabel, getProjectDuration } from "../project/types";
import { toggleSelection, useMarqueeSelection } from "./useMarqueeSelection";

type Drag = {
  clipId: string;
  clipIds: string[];
  collapseOnClick?: boolean;
  mode: "move" | "trim-start" | "trim-end";
  startX: number;
  startY: number;
  dx: number;
  dy: number;
};

export type MediaDrag = {
  src: string;
  kind: "video" | "audio";
  inFrame: number;
  outFrame: number;
  mode: "auto" | "video" | "audio";
  items?: Omit<MediaDrag, "items">[];
};
export const MEDIA_DRAG_TYPE = "application/x-ugc-source";

type Props = {
  project: Project;
  frame: number;
  selectedIds: string[];
  pxPerFrame: number;
  onSeek: (frame: number) => void;
  onSelect: (clipIds: string[]) => void;
  onMove: (clipIds: string[], deltaFrames: number, trackOffset: number) => void;
  onTrim: (clipId: string, edge: "start" | "end", delta: number) => void;
  onDropMedia: (media: MediaDrag, trackId: string, from: number) => void;
  waveforms: Record<string, string>;
};

const HEADER_W = 76;
const TRACK_H = 56;
const SNAP_PX = 8;

export function Timeline({ project, frame, selectedIds, pxPerFrame, onSeek, onSelect, onMove, onTrim, onDropMedia, waveforms }: Props) {
  const [drag, setDragState] = useState<Drag | null>(null);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const marquee = useMarqueeSelection({ selected: selectedIds, onSelect, onEmptyClick: (clientX) => seekFromX(clientX) });
  const duration = getProjectDuration(project);
  // Ancho: hasta el último clip (aunque sea una canción más larga que el video) + 10 s de margen
  const lastEnd = project.tracks.flatMap((t) => t.clips).reduce((end, c) => Math.max(end, c.from + c.durationInFrames), duration);
  const width = (lastEnd + project.fps * 10) * pxPerFrame;

  // Puntos de "imán": bordes de todos los clips y el cabezal de reproducción.
  const snapPoints = (excludeIds: string[]) => {
    const pts = [0, frame];
    for (const t of project.tracks)
      for (const c of t.clips) if (!excludeIds.includes(c.id)) pts.push(c.from, c.from + c.durationInFrames);
    return pts;
  };
  const snap = (value: number, excludeIds: string[]) => {
    let best = value;
    let bestDist = SNAP_PX / pxPerFrame;
    for (const p of snapPoints(excludeIds)) {
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
    const cancel = () => setDrag(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("mousemove", onMoveEvt);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousemove", onMoveEvt);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.clipId, drag?.mode]);

  const findClip = (id: string) => project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
  const displayed = [...project.tracks].reverse(); // arriba: subtítulos; abajo: audio

  /** Pista destino al arrastrar verticalmente: solo entre pistas del mismo tipo. */
  const dragTargetTrack = (clipId: string, d: Drag) => {
    const idx = displayed.findIndex((t) => t.clips.some((c) => c.id === clipId));
    const offset = Math.round(d.dy / TRACK_H);
    const valid = displayed.every((t, i) => !t.clips.some((c) => d.clipIds.includes(c.id)) || displayed[i + offset]?.kind === t.kind);
    return displayed[valid ? idx + offset : idx];
  };

  const moveDelta = (d: Drag) => {
    const anchor = findClip(d.clipId)!;
    const earliest = Math.min(...project.tracks.flatMap((t) => t.clips).filter((c) => d.clipIds.includes(c.id)).map((c) => c.from));
    return Math.max(-earliest, Math.round(snap(anchor.from + d.dx / pxPerFrame, d.clipIds) - anchor.from));
  };

  const dragPreview = (clip: Clip, d: Drag) => {
    const deltaFrames = d.dx / pxPerFrame;
    if (d.mode === "move") return { from: clip.from + moveDelta(d), dur: clip.durationInFrames };
    if (d.mode === "trim-end") {
      const end = snap(clip.from + clip.durationInFrames + deltaFrames, [clip.id]);
      return { from: clip.from, dur: Math.max(1, end - clip.from) };
    }
    const start = snap(clip.from + deltaFrames, [clip.id]);
    return { from: start, dur: clip.durationInFrames - (start - clip.from) };
  };

  const commitDrag = (d: Drag) => {
    const clip = findClip(d.clipId);
    if (!clip) return;
    if (Math.abs(d.dx) < 2 && Math.abs(d.dy) < TRACK_H / 2) {
      if (d.collapseOnClick) onSelect([clip.id]);
      return;
    }
    const p = dragPreview(clip, d);
    if (d.mode === "move") onMove(d.clipIds, moveDelta(d), displayed.findIndex((t) => t.clips.some((c) => c.id === clip.id)) - displayed.indexOf(dragTargetTrack(clip.id, d)));
    else if (d.mode === "trim-end") onTrim(clip.id, "end", p.dur - clip.durationInFrames);
    else onTrim(clip.id, "start", p.from - clip.from);
  };

  const seekFromX = (clientX: number) => {
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollRef.current!.scrollLeft;
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
        <div ref={marquee.ref} onMouseDown={marquee.onMouseDown} role="listbox" aria-label="Clips de la línea de tiempo" aria-multiselectable style={{ width, position: "relative" }}>
          <div
            className="ruler"
            data-no-marquee
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              seekFromX(e.clientX);
              const move = (ev: MouseEvent) => seekFromX(ev.clientX);
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
              className={`track track-${track.kind} ${dropTrackId === track.id ? "drop-target" : ""}`}
              style={{ height: TRACK_H }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(MEDIA_DRAG_TYPE) || (track.kind !== "video" && track.kind !== "audio")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setDropTrackId(track.id);
              }}
              onDragLeave={() => setDropTrackId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTrackId(null);
                try {
                  const source = JSON.parse(e.dataTransfer.getData(MEDIA_DRAG_TYPE)) as MediaDrag;
                  if (!source.items?.length && track.kind === "video" && (source.kind === "audio" || source.mode === "audio")) return;
                  if (track.kind === "audio" && source.mode === "video") return;
                  const rect = scrollRef.current!.getBoundingClientRect();
                  const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
                  onDropMedia(source, track.id, Math.max(0, Math.round(x / pxPerFrame)));
                } catch { /* otros tipos de arrastre no son medios del proyecto */ }
              }}
            >
              {track.clips.map((clip) => {
                const dragging = Boolean(drag && (drag.mode === "move" ? drag.clipIds.includes(clip.id) : drag.clipId === clip.id));
                const p = dragging && drag ? dragPreview(clip, drag) : { from: clip.from, dur: clip.durationInFrames };
                const shiftY =
                  dragging && drag?.mode === "move"
                    ? (displayed.indexOf(dragTargetTrack(clip.id, drag)) - trackIndex) * TRACK_H
                    : 0;
                return (
                  <div
                    key={clip.id}
                    className={`clip clip-${clip.kind} ${selectedIds.includes(clip.id) ? "selected" : ""}`}
                    data-selection-id={clip.id}
                    role="option"
                    aria-selected={selectedIds.includes(clip.id)}
                    aria-label={clipLabel(clip)}
                    style={{
                      left: p.from * pxPerFrame,
                      width: Math.max(4, p.dur * pxPerFrame),
                      transform: shiftY ? `translateY(${shiftY}px)` : undefined,
                      zIndex: dragging ? 3 : undefined,
                    }}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      e.preventDefault();
                      if (e.shiftKey || e.ctrlKey || e.metaKey) { onSelect(toggleSelection(selectedIds, clip.id)); return; }
                      const ids = selectedIds.includes(clip.id) ? selectedIds : [clip.id];
                      onSelect(ids);
                      setDrag({ clipId: clip.id, clipIds: ids, collapseOnClick: ids.length > 1, mode: "move", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                    }}
                    title={clipLabel(clip)}
                  >
                    <div
                      className="trim-handle left"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        onSelect([clip.id]);
                        setDrag({ clipId: clip.id, clipIds: [clip.id], mode: "trim-start", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                      }}
                    />
                    {clip.kind === "audio" && waveforms[clip.src] && (
                      <img
                        className="clip-waveform"
                        src={waveforms[clip.src]}
                        alt=""
                        draggable={false}
                        style={{ width: clip.sourceDurationInFrames * pxPerFrame, left: -clip.trimStart * pxPerFrame }}
                      />
                    )}
                    <span className="clip-label">{clipLabel(clip)}</span>
                    <div
                      className="trim-handle right"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        onSelect([clip.id]);
                        setDrag({ clipId: clip.id, clipIds: [clip.id], mode: "trim-end", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <div className="playhead" style={{ left: frame * pxPerFrame }} />
          {marquee.box && <div className="selection-marquee" aria-hidden style={{ left: marquee.box.x, top: marquee.box.y, width: marquee.box.width, height: marquee.box.height }} />}
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
