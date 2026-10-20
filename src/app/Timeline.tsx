import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Clip, Project, Track } from "../project/types";
import { clipLabel, getProjectDuration, destinationTrack, trackOutputEnabled } from "../project/types";
import { TrackControls } from "./TrackControls";
import { toggleSelection, useMarqueeSelection } from "./useMarqueeSelection";
import type { TimelineTool } from "./TimelineTools";
import { findClip as projectClip, rippleTrimClip, slipClip, trimClip, linkedIds, clipsEditable, editSelection } from "../project/ops";
import type { TimelinePreferences } from "./timelinePreferences";
import { useTimelinePanelWidth } from "./useTimelinePanelWidth";

type Drag = {
  clipId: string;
  clipIds: string[];
  explicitIds?: string[];
  collapseOnClick?: boolean;
  mode: "move" | "trim-start" | "trim-end" | "slip";
  ripple?: boolean;
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
  sequenceId?: string;
  items?: Omit<MediaDrag, "items">[];
};
export const MEDIA_DRAG_TYPE = "application/x-ugc-source";

type Props = {
  project: Project;
  revealTrackId: string | null;
  frame: number;
  selectedIds: string[];
  pxPerFrame: number;
  tool: TimelineTool;
  snapping: boolean;
  preferences: TimelinePreferences;
  onSeek: (frame: number) => void;
  onSelect: (clipIds: string[]) => void;
  onMove: (clipIds: string[], deltaFrames: number, trackOffset: number) => void;
  onTrim: (clipId: string, edge: "start" | "end", delta: number, ripple: boolean) => void;
  onSlip: (clipId: string, delta: number) => void;
  onSplit: (clipId: string | undefined, frame: number) => void;
  onAddText: (frame: number) => void;
  onZoom: (factor: number) => void;
  onDropMedia: (media: MediaDrag, trackId: string, from: number) => void;
  onTrackChange: (id: string, patch: Partial<Pick<Track, "locked" | "hidden" | "muted" | "solo" | "targeted" | "syncLock">>) => void;
  onRecord: (id: string) => void;
  recordingTrack: string | null;
  waveforms: Record<string, string>;
};

const SNAP_PX = 8;

export function Timeline({ project, revealTrackId, frame, selectedIds, pxPerFrame, tool, snapping, preferences, onSeek, onSelect, onMove, onTrim, onSlip, onSplit, onAddText, onZoom, onDropMedia, onTrackChange, onRecord, recordingTrack, waveforms }: Props) {
  const headerPane = useTimelinePanelWidth<HTMLDivElement>("headers", "Ancho de cabeceras de pistas");
  const TRACK_H = preferences.trackHeight;
  const selectionIds = (ids: string[]) => preferences.linkedSelection ? linkedIds(project, ids) : ids;
  const editable = (id: string) => preferences.linkedSelection ? clipsEditable(project, [id]) : !projectClip(project, id)?.track.locked;
  const [drag, setDragState] = useState<Drag | null>(null);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const displaySelected = selectionIds(selectedIds);
  const hasLinkedAudio = project.tracks.some((t) => t.clips.some((c) => c.kind === "audio" && c.linkedClipId));
  useLayoutEffect(() => {
    const viewport = scrollRef.current?.parentElement;
    if (!viewport) return;
    const reversed = [...project.tracks].reverse();
    const index = revealTrackId ? reversed.findIndex((t) => t.id === revealTrackId) : reversed.findIndex((t) => t.clips.some((c) => c.kind === "audio" && c.linkedClipId));
    if (index >= 0) viewport.scrollTop = Math.max(0, 24 + (index + 1) * TRACK_H - viewport.clientHeight);
  }, [hasLinkedAudio, revealTrackId, TRACK_H]);
  const [cutFrame, setCutFrame] = useState<number | null>(null);
  const zoomAnchor = useRef<{ frame: number; x: number } | null>(null);
  const panCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => panCleanup.current?.(), []);
  useLayoutEffect(() => { if (zoomAnchor.current && scrollRef.current) { scrollRef.current.scrollLeft = zoomAnchor.current.frame * pxPerFrame - zoomAnchor.current.x; zoomAnchor.current = null; } }, [pxPerFrame]);
  const marquee = useMarqueeSelection({ selected: selectedIds, onSelect, onEmptyClick: (clientX) => seekFromX(clientX) });
  const duration = getProjectDuration(project);
  // Ancho: hasta el último clip (aunque sea una canción más larga que el video) + 10 s de margen
  const lastEnd = project.tracks.flatMap((t) => t.clips).reduce((end, c) => Math.max(end, c.from + c.durationInFrames), duration);
  const width = (lastEnd + project.fps * 10) * pxPerFrame;

  // Puntos de "imán": bordes de todos los clips y el cabezal de reproducción.
  const snapPoints = (excludeIds: string[]) => {
    const pts = [0, frame, ...(project.markers ?? []).map((m) => m.frame)];
    for (const t of project.tracks)
      for (const c of t.clips) if (!excludeIds.includes(c.id)) pts.push(c.from, c.from + c.durationInFrames);
    return pts;
  };
  const snap = (value: number, excludeIds: string[]) => {
    if (!snapping) return value;
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
    const verticalIds = d.explicitIds ?? d.clipIds;
    if (!verticalIds.includes(clipId)) return displayed[idx];
    const offset = Math.round(d.dy / TRACK_H);
    const valid = displayed.every((t, i) => !t.clips.some((c) => verticalIds.includes(c.id)) || displayed[i + offset]?.kind === t.kind);
    return displayed[valid ? idx + offset : idx];
  };

  const moveDelta = (d: Drag) => {
    const anchor = findClip(d.clipId)!;
    const earliest = Math.min(...project.tracks.flatMap((t) => t.clips).filter((c) => d.clipIds.includes(c.id)).map((c) => c.from));
    return Math.max(-earliest, Math.round(snap(anchor.from + d.dx / pxPerFrame, d.clipIds) - anchor.from));
  };

  const projectForDrag = (d: Drag | null) => {
    if (!d || d.mode === "move") return project;
    const clip = findClip(d.clipId); if (!clip) return project;
    if (d.mode === "slip") return editSelection(project, [clip.id], preferences.linkedSelection, (p) => slipClip(p, clip.id, d.dx / pxPerFrame));
    const edge = d.mode === "trim-start" ? "start" : "end";
    const endpoint = edge === "start" ? clip.from : clip.from + clip.durationInFrames;
    const delta = snap(endpoint + d.dx / pxPerFrame, selectionIds([clip.id])) - endpoint;
    return editSelection(project, [clip.id], preferences.linkedSelection, (p) => (d.ripple ? rippleTrimClip : trimClip)(p, clip.id, edge, delta));
  };
  const previewProject = projectForDrag(drag);

  const dragPreview = (clip: Clip, d: Drag) => {
    if (d.mode === "move") return { from: clip.from + moveDelta(d), dur: clip.durationInFrames };
    const preview = projectClip(projectForDrag(d), clip.id)?.clip ?? clip;
    return { from: preview.from, dur: preview.durationInFrames };
  };

  const commitDrag = (d: Drag) => {
    const clip = findClip(d.clipId);
    if (!clip) return;
    if (Math.abs(d.dx) < 2 && Math.abs(d.dy) < TRACK_H / 2) {
      if (d.collapseOnClick) onSelect([clip.id]);
      return;
    }
    const p = dragPreview(clip, d);
    if (d.mode === "move") onMove(d.explicitIds ?? d.clipIds, moveDelta(d), displayed.findIndex((t) => t.clips.some((c) => c.id === clip.id)) - displayed.indexOf(dragTargetTrack(clip.id, d)));
    else if (d.mode === "slip") onSlip(clip.id, d.dx / pxPerFrame);
    else if (d.mode === "trim-end") onTrim(clip.id, "end", p.dur - clip.durationInFrames, Boolean(d.ripple));
    else onTrim(clip.id, "start", d.ripple ? clip.durationInFrames - p.dur : p.from - clip.from, Boolean(d.ripple));
  };

  const seekFromX = (clientX: number) => {
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollRef.current!.scrollLeft;
    onSeek(Math.max(0, Math.min(duration - 1, Math.round(x / pxPerFrame))));
  };
  const frameFromX = (clientX: number) => Math.max(0, Math.round((clientX - scrollRef.current!.getBoundingClientRect().left + scrollRef.current!.scrollLeft) / pxPerFrame));
  const captureTool = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (tool === "hand") {
      event.preventDefault(); event.stopPropagation();
      const horizontal = scrollRef.current!, vertical = horizontal.parentElement!, x = event.clientX, y = event.clientY, left = horizontal.scrollLeft, top = vertical.scrollTop;
      panCleanup.current?.();
      const move = (e: MouseEvent) => { horizontal.scrollLeft = left - (e.clientX - x); vertical.scrollTop = top - (e.clientY - y); };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); window.removeEventListener("blur", up); panCleanup.current = null; };
      panCleanup.current = up; window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); window.addEventListener("blur", up); return;
    }
    if ((event.target as HTMLElement).closest(".ruler")) return;
    const at = frameFromX(event.clientX);
    if (tool === "zoom") { event.preventDefault(); event.stopPropagation(); zoomAnchor.current = { frame: at, x: event.clientX - scrollRef.current!.getBoundingClientRect().left }; onZoom(event.shiftKey ? 0.8 : 1.25); }
    else if (tool === "text") { event.preventDefault(); event.stopPropagation(); onAddText(at); }
    else if (tool === "razor") {
      event.preventDefault(); event.stopPropagation();
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-selection-id]")?.dataset.selectionId;
      if (id) onSplit(event.shiftKey ? undefined : id, at);
    } else if (tool === "track" && !(event.target as HTMLElement).closest("[data-selection-id]")) {
      event.preventDefault(); event.stopPropagation();
      const trackIndex = Number((event.target as HTMLElement).closest<HTMLElement>("[data-track-index]")?.dataset.trackIndex);
      onSelect(displayed.flatMap((track, i) => event.shiftKey && i !== trackIndex ? [] : track.clips.filter((c) => c.from >= at).map((c) => c.id)));
    }
  };

  // Marcas de la regla: cada segundo, con etiqueta según el zoom.
  const secondPx = project.fps * pxPerFrame;
  const labelEvery = secondPx < 30 ? 5 : secondPx < 60 ? 2 : 1;
  const totalSeconds = Math.ceil(width / secondPx);

  return (
    <div className={`timeline tool-${tool}`} style={{ "--track-height": `${TRACK_H}px` } as CSSProperties}>
      <div ref={headerPane.ref} className="timeline-headers" style={headerPane.style}>
        <div className="ruler-spacer" />
        {displayed.map((t) => (
          <div key={t.id} className={`track-header ${t.locked ? "locked" : ""}`} style={{ height: TRACK_H }}>
            <TrackControls track={t} targeted={(t.kind === "video" || t.kind === "audio") && destinationTrack(project, t.kind) === t.id} onChange={(patch) => onTrackChange(t.id, patch)} onRecord={() => onRecord(t.id)} recording={recordingTrack === t.id} recordingBusy={recordingTrack !== null}/>
          </div>
        ))}
      </div>
      {headerPane.separator}
      <div className="timeline-scroll" ref={scrollRef}>
        <div ref={marquee.ref} onMouseDownCapture={captureTool} onMouseDown={marquee.onMouseDown} onMouseMove={(e) => { if (tool === "razor") setCutFrame(frameFromX(e.clientX)); }} onMouseLeave={() => setCutFrame(null)} role="listbox" aria-label="Clips de la línea de tiempo" aria-multiselectable style={{ width, position: "relative" }}>
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
            {preferences.showMarkers && (project.markers ?? []).map((marker) => <button key={marker.id} className="timeline-marker" style={{ left: marker.frame * pxPerFrame, color: marker.color }} title={`${marker.label} · ${formatTimecode(marker.frame, project.fps)}`} aria-label={`Ir al marcador ${marker.label}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => onSeek(marker.frame)}>◆</button>)}
          </div>
          {displayed.map((track, trackIndex) => (
            <div
              key={track.id}
              data-track-index={trackIndex}
              className={`track track-${track.kind} ${track.locked ? "locked" : ""} ${!trackOutputEnabled(project, track) ? "output-off" : ""} ${dropTrackId === track.id ? "drop-target" : ""}`}
              style={{ height: TRACK_H }}
              onDragOver={(e) => {
                if (track.locked || !e.dataTransfer.types.includes(MEDIA_DRAG_TYPE) || (track.kind !== "video" && track.kind !== "audio")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setDropTrackId(track.id);
              }}
              onDragLeave={() => setDropTrackId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTrackId(null);
                if (track.locked) return;
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
                const preview = projectClip(previewProject, clip.id)?.clip ?? clip;
                const p = dragging && drag ? dragPreview(clip, drag) : { from: preview.from, dur: preview.durationInFrames };
                const shiftY =
                  dragging && drag?.mode === "move"
                    ? (displayed.indexOf(dragTargetTrack(clip.id, drag)) - trackIndex) * TRACK_H
                    : 0;
                return (
                  <div
                    key={clip.id}
                    className={`clip clip-${clip.kind} ${(clip.kind === "video" || clip.kind === "audio") && clip.sequenceId ? "clip-sequence" : ""} ${displaySelected.includes(clip.id) ? "selected" : ""}`}
                    data-selection-id={clip.id}
                    data-selection-disabled={track.locked || undefined}
                    role="option"
                    aria-selected={displaySelected.includes(clip.id)}
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
                      if (!editable(clip.id)) { onSelect([clip.id]); return; }
                      if (tool === "track") {
                        const ids = displayed.flatMap((t) => e.shiftKey && t.id !== track.id ? [] : t.clips.filter((c) => c.from >= clip.from).map((c) => c.id));
                        onSelect(ids); setDrag({ clipId: clip.id, clipIds: selectionIds(ids), explicitIds: ids, mode: "move", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 }); return;
                      }
                      if (e.shiftKey || e.ctrlKey || e.metaKey) { onSelect(toggleSelection(selectedIds, clip.id)); return; }
                      if (tool === "slip") { onSelect([clip.id]); setDrag({ clipId: clip.id, clipIds: [clip.id], mode: "slip", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 }); return; }
                      const ids = selectedIds.includes(clip.id) ? selectedIds : [clip.id];
                      onSelect(ids);
                      setDrag({ clipId: clip.id, clipIds: selectionIds(ids), explicitIds: ids, collapseOnClick: ids.length > 1, mode: "move", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                    }}
                    title={`${clipLabel(clip)}${(clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId ? " · Video/audio enlazados" : ""}`}
                  >
                    <div
                      className="trim-handle left"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        if (!editable(clip.id)) return;
                        onSelect([clip.id]);
                        setDrag({ clipId: clip.id, clipIds: [clip.id], mode: "trim-start", ripple: tool === "ripple", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                      }}
                    />
                    {preferences.showWaveforms && clip.kind === "audio" && waveforms[clip.src] && (
                      <img
                        className="clip-waveform"
                        src={waveforms[clip.src]}
                        alt=""
                        draggable={false}
                        style={{ width: clip.sourceDurationInFrames * pxPerFrame, left: -(preview.kind === "audio" ? preview.trimStart : clip.trimStart) * pxPerFrame }}
                      />
                    )}
                    {preferences.showNames && <span className="clip-label">{(clip.kind === "video" || clip.kind === "audio") && clip.sequenceId ? "▤ " : ""}{clipLabel(clip)}{dragging && drag?.mode === "slip" && (preview.kind === "video" || preview.kind === "audio") ? ` · Origen ${(preview.trimStart / project.fps).toFixed(2)} s` : ""}</span>}
                    {(() => { if ((clip.kind !== "video" && clip.kind !== "audio") || !clip.linkedClipId) return null; const mate = projectClip(project, clip.linkedClipId)?.clip; if (!mate || (mate.kind !== "video" && mate.kind !== "audio")) return null; const offset = clip.from - clip.trimStart - mate.from + mate.trimStart; return offset ? <span className="clip-sync-warning" title="Diferencia de sincronía con su pareja">{offset > 0 ? "+" : ""}{offset} f</span> : null; })()}
                    <div
                      className="trim-handle right"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        if (!editable(clip.id)) return;
                        onSelect([clip.id]);
                        setDrag({ clipId: clip.id, clipIds: [clip.id], mode: "trim-end", ripple: tool === "ripple", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <div className="playhead" style={{ left: frame * pxPerFrame }} />
          {tool === "razor" && cutFrame !== null && <div className="razor-guide" style={{ left: cutFrame * pxPerFrame }} />}
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
