import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Clip, Project, Track } from "../project/types";
import { clipLabel, getProjectDuration, destinationTrack, trackOutputEnabled, trackFamily } from "../project/types";
import {snapTimeline,type SnapHit} from "./timelineSnap";
import {previewMedia,type PlacementOptions} from "./mediaPlacement";
import type {MediaHover} from "./useMonitorDrag";
import { VolumeRubberBand } from "./VolumeRubberBand";
import { TrackControls } from "./TrackControls";
import { toggleSelection, useMarqueeSelection } from "./useMarqueeSelection";
import type { TimelineTool } from "./TimelineTools";
import { findClip as projectClip, rippleTrimClip, slipClip, trimClip, groupedIds, linkedIds, clipsEditable, editSelection } from "../project/ops";
import type { TimelinePreferences } from "./timelinePreferences";
import { useTimelinePanelWidth } from "./useTimelinePanelWidth";
import { bypassSnap, wheelModifier, wheelPixels, type GesturePreferences } from "./gesturePreferences";

type Drag = {
  clipId: string;
  clipIds: string[];
  explicitIds?: string[];
  collapseOnClick?: boolean;
  restoreLinksOnClick?: boolean;
  followLinks?: boolean;
  duplicate?: boolean;
  bypass?: boolean;
  mode: "move" | "trim-start" | "trim-end" | "slip";
  ripple?: boolean;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
};

export type MediaDrag = {
  documentEpoch?: number;
  src: string;
  kind: "video" | "audio";
  inFrame: number;
  outFrame: number;
  mode: "auto" | "video" | "audio";
  sequenceId?: string;
  elementId?: string;
  items?: Omit<MediaDrag, "items">[];
  timelineRange?: { project: Project; documentEpoch: number };
};
export const MEDIA_DRAG_TYPE = "application/x-ugc-source";

type Props = {
  project: Project;
  onContextMenu:(x:number,y:number,ids:string[],at:number,trackId?:string,isolated?:boolean)=>void;
  onVolume:(id:string,value:number)=>void;
  onOpenSequence:(id:string)=>void;
  revealTrackId: string | null;
  frame: number;
  selectedIds: string[];
  pxPerFrame: number;
  tool: TimelineTool;
  snapping: boolean;
  preferences: TimelinePreferences;
  gestures: GesturePreferences;
  markRange: {start:number|null;end:number|null};
  onTrackHeight:(height:number)=>void;
  onSeek: (frame: number) => void;
  onScrubStart: () => void;
  isolatedSelection: boolean;
  onSelect: (clipIds: string[], isolated?: boolean) => void;
  onDuplicate: (clipIds: string[], deltaFrames: number, trackOffset: number, followLinks: boolean) => void;
  onMove: (clipIds: string[], deltaFrames: number, trackOffset: number, followLinks: boolean) => void;
  onTrim: (clipId: string, edge: "start" | "end", delta: number, ripple: boolean, followLinks: boolean) => void;
  onSlip: (clipId: string, delta: number, followLinks: boolean) => void;
  onSplit: (clipId: string | undefined, frame: number) => void;
  onAddText: (frame: number) => void;
  onZoom: (factor: number) => void;
  onDropMedia: (media: MediaDrag, trackId: string, from: number,bypass?:boolean) => void;
  mediaDrag:MediaDrag|null;mediaHover:MediaHover|null;onMediaHover:(payload:MediaDrag,track:string,raw:number,bypass?:boolean)=>void;onMediaLeave:()=>void;placementOptions:PlacementOptions;
  onTrackChange: (id: string, patch: Partial<Pick<Track, "locked" | "hidden" | "muted" | "solo" | "targeted" | "syncLock">>) => void;
  onRecord: (id: string) => void;
  recordingTrack: string | null;
  waveforms: Record<string, string>;
};

const SNAP_PX = 8;

export function Timeline({ mediaDrag,mediaHover,onMediaHover,onMediaLeave,placementOptions,project, onContextMenu, onVolume, onOpenSequence, revealTrackId, frame, selectedIds, pxPerFrame, tool, snapping, preferences, gestures, markRange, onTrackHeight, onSeek, onScrubStart, isolatedSelection, onSelect, onDuplicate, onMove, onTrim, onSlip, onSplit, onAddText, onZoom, onDropMedia, onTrackChange, onRecord, recordingTrack, waveforms }: Props) {
  const headerPane = useTimelinePanelWidth<HTMLDivElement>("headers", "Ancho de cabeceras de pistas");
  const TRACK_H = preferences.trackHeight;
  const [volumePreview,setVolumePreview]=useState<Record<string,number>>({});
  const selectionIds = (ids: string[], follow = preferences.linkedSelection) => follow ? groupedIds(project, ids) : ids;
  const editable = (id: string, follow = preferences.linkedSelection) => follow ? clipsEditable(project, [id]) : !projectClip(project, id)?.track.locked;
  const [drag, setDragState] = useState<Drag | null>(null);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef=useRef<HTMLDivElement>(null),rulerRef=useRef<HTMLDivElement>(null),headersRef=useRef<HTMLDivElement>(null);
  const [scrollbars,setScrollbars]=useState({x:0,y:0});
  const syncScroll=()=>{const scroll=scrollRef.current;if(!scroll)return;if(rulerRef.current)rulerRef.current.scrollLeft=scroll.scrollLeft;if(headersRef.current)headersRef.current.scrollTop=scroll.scrollTop;};
  useLayoutEffect(()=>{const scroll=scrollRef.current;if(!scroll)return;const sync=()=>{syncScroll();const x=scroll.offsetHeight-scroll.clientHeight,y=scroll.offsetWidth-scroll.clientWidth;setScrollbars(p=>p.x===x&&p.y===y?p:{x,y});};const observer=new ResizeObserver(sync);observer.observe(scroll);sync();return()=>observer.disconnect();},[project,pxPerFrame]);
  const displaySelected = selectionIds(selectedIds, preferences.linkedSelection && !isolatedSelection);
  const hasLinkedAudio = project.tracks.some((t) => t.clips.some((c) => c.kind === "audio" && c.linkedClipId));
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const reversed = [...project.tracks].reverse();
    const index = revealTrackId ? reversed.findIndex((t) => t.id === revealTrackId) : reversed.findIndex((t) => t.clips.some((c) => c.kind === "audio" && c.linkedClipId));
    if (index >= 0) viewport.scrollTop = Math.max(0, (index + 1) * TRACK_H - viewport.clientHeight);
  }, [hasLinkedAudio, revealTrackId, TRACK_H]);
  const [scrubSnap,setScrubSnap]=useState<SnapHit|null>(null),scrubSnapRef=useRef<SnapHit|null>(null),snapTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [cutFrame, setCutFrame] = useState<number | null>(null);
  const zoomAnchor = useRef<{ frame: number; x: number } | null>(null);
  useEffect(()=>{
    const horizontal=scrollRef.current,vertical=horizontal,root=timelineRef.current;if(!horizontal||!vertical||!root)return;
    const wheel=(e:WheelEvent)=>{
      if((e.target as HTMLElement).closest("input,select,textarea,[role=separator]"))return;
      const action=gestures[wheelModifier(e)];if(action==="none")return;
      e.preventDefault();const delta=wheelPixels(e.deltaY||e.deltaX,e.deltaMode,vertical.clientHeight||300);
      if(action==="horizontal")horizontal.scrollLeft+=e.deltaX||delta;
      else if(action==="vertical")vertical.scrollTop+=delta;
      else if(action==="zoom") {const factor=Math.exp(-delta*.006);if(Math.max(.02,Math.min(20,pxPerFrame*factor))===pxPerFrame)return;const x=Math.max(0,Math.min(horizontal.clientWidth,e.clientX-horizontal.getBoundingClientRect().left));zoomAnchor.current={frame:(horizontal.scrollLeft+x)/pxPerFrame,x};onZoom(factor);}
      else if(action==="height")onTrackHeight(preferences.trackHeight+(delta<0?4:-4));
      else {onSeek(frame+Math.sign(delta)*(action==="fiveFrames"?5:1));}
    };
    root.addEventListener("wheel",wheel,{passive:false});return()=>root.removeEventListener("wheel",wheel);
  },[gestures,pxPerFrame,frame,onZoom,onSeek,onTrackHeight,preferences.trackHeight]);
  const panCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => {panCleanup.current?.();if(snapTimer.current)clearTimeout(snapTimer.current);}, []);
  useLayoutEffect(() => { if (zoomAnchor.current && scrollRef.current) { scrollRef.current.scrollLeft = zoomAnchor.current.frame * pxPerFrame - zoomAnchor.current.x; zoomAnchor.current = null; } }, [pxPerFrame]);
  const marquee = useMarqueeSelection({ selected: selectedIds, onSelect, onEmptyClick: (clientX) => seekFromX(clientX) });
  const duration = getProjectDuration(project);
  // Ancho: hasta el último clip (aunque sea una canción más larga que el video) + 10 s de margen
  const lastEnd = project.tracks.flatMap((t) => t.clips).reduce((end, c) => Math.max(end, c.from + c.durationInFrames), duration);
  const shapes=mediaHover?previewMedia(project,mediaHover.payload,mediaHover.trackId,mediaHover.at,placementOptions):[];
  const incomingEnd=shapes.reduce((end,{clip})=>Math.max(end,clip.from+clip.durationInFrames),lastEnd);
  const width = (incomingEnd + project.fps * 10) * pxPerFrame;

  // Puntos de "imán": bordes de todos los clips y el cabezal de reproducción.
  const snapPoints = (excludeIds: string[]) => {
    const pts = [0, frame, ...(project.markers ?? []).map((m) => m.frame)];
    for (const t of project.tracks)
      for (const c of t.clips) if (!excludeIds.includes(c.id)) pts.push(c.from, c.from + c.durationInFrames);
    return pts;
  };
  const snap = (value: number, excludeIds: string[]) => {
    if (!snapping||dragRef.current?.bypass) return value;
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
      if (d) setDrag({ ...d, dx: e.clientX - d.startX, dy: e.clientY - d.startY,bypass:bypassSnap(e,gestures) });
    };
    const onUp = (e:MouseEvent) => {
      if (dragRef.current){dragRef.current={...dragRef.current,bypass:bypassSnap(e,gestures)};commitDrag(dragRef.current); }
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
  const newTracks=new Set(shapes.filter(s=>!project.tracks.some(t=>t.id===s.trackId)).map(s=>s.trackId)).size;
  const snapCue=mediaHover&&shapes.length?mediaHover.snap:scrubSnap;
  const displayed = [...project.tracks].reverse(); // pila visual arriba; audio abajo

  /** Pista destino al arrastrar verticalmente: solo entre pistas del mismo tipo. */
  const dragTargetTrack = (clipId: string, d: Drag) => {
    const idx = displayed.findIndex((t) => t.clips.some((c) => c.id === clipId));
    const verticalIds = d.explicitIds ?? d.clipIds;
    if (!verticalIds.includes(clipId)) return displayed[idx];
    const offset = Math.round(d.dy / TRACK_H);
    const valid = displayed.every((t, i) => !t.clips.some((c) => verticalIds.includes(c.id)) || displayed[i + offset] && trackFamily(displayed[i + offset].kind) === trackFamily(t.kind));
    return displayed[valid ? idx + offset : idx];
  };

  const moveDelta = (d: Drag) => {
    const anchor = findClip(d.clipId)!;
    const earliest = Math.min(...project.tracks.flatMap((t) => t.clips).filter((c) => d.clipIds.includes(c.id)).map((c) => c.from));
    return Math.max(-earliest, Math.round(snap(anchor.from + d.dx / pxPerFrame, d.duplicate ? [] : d.clipIds) - anchor.from));
  };

  const projectForDrag = (d: Drag | null) => {
    if (!d || d.mode === "move") return project;
    const clip = findClip(d.clipId); if (!clip) return project;
    if (d.mode === "slip") return editSelection(project, [clip.id], d.followLinks ?? preferences.linkedSelection, (p) => slipClip(p, clip.id, d.dx / pxPerFrame));
    const edge = d.mode === "trim-start" ? "start" : "end";
    const endpoint = edge === "start" ? clip.from : clip.from + clip.durationInFrames;
    const delta = snap(endpoint + d.dx / pxPerFrame, selectionIds([clip.id],d.followLinks)) - endpoint;
    return editSelection(project, [clip.id], d.followLinks ?? preferences.linkedSelection, (p) => (d.ripple ? rippleTrimClip : trimClip)(p, clip.id, edge, delta));
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
      if (d.duplicate) onSelect([clip.id],true);
      else if (d.restoreLinksOnClick) onSelect([clip.id]);
      else if (d.collapseOnClick) onSelect([clip.id],d.followLinks === false);
      return;
    }
    const p = dragPreview(clip, d);
    if (d.mode === "move") (d.duplicate ? onDuplicate : onMove)(d.explicitIds ?? d.clipIds, moveDelta(d), displayed.findIndex((t) => t.clips.some((c) => c.id === clip.id)) - displayed.indexOf(dragTargetTrack(clip.id, d)),d.followLinks ?? preferences.linkedSelection);
    else if (d.mode === "slip") onSlip(clip.id, d.dx / pxPerFrame,d.followLinks ?? preferences.linkedSelection);
    else if (d.mode === "trim-end") onTrim(clip.id, "end", p.dur - clip.durationInFrames, Boolean(d.ripple),d.followLinks ?? preferences.linkedSelection);
    else onTrim(clip.id, "start", d.ripple ? clip.durationInFrames - p.dur : p.from - clip.from, Boolean(d.ripple),d.followLinks ?? preferences.linkedSelection);
  };

  const seekFromX = (clientX: number,magnet=false,bypass=false) => {
    if(snapTimer.current)clearTimeout(snapTimer.current);
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollRef.current!.scrollLeft;
    const hit=snapTimeline(project,x/pxPerFrame,pxPerFrame,magnet&&snapping&&!bypass,{previous:scrubSnapRef.current,maximum:duration-1});
    scrubSnapRef.current=hit;setScrubSnap(hit.point===null?null:hit);onSeek(hit.frame);
  };
  const frameFromX = (clientX: number) => Math.max(0, Math.round((clientX - scrollRef.current!.getBoundingClientRect().left + scrollRef.current!.scrollLeft) / pxPerFrame));
  const captureTool = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (tool === "hand") {
      event.preventDefault(); event.stopPropagation();
      const horizontal = scrollRef.current!, vertical = horizontal, x = event.clientX, y = event.clientY, left = horizontal.scrollLeft, top = vertical.scrollTop;
      panCleanup.current?.();
      const move = (e: MouseEvent) => { horizontal.scrollLeft = left - (e.clientX - x); vertical.scrollTop = top - (e.clientY - y); };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); window.removeEventListener("blur", up); panCleanup.current = null; };
      panCleanup.current = up; window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); window.addEventListener("blur", up); return;
    }
    if ((event.target as HTMLElement).closest(".ruler")) return;
    const at = frameFromX(event.clientX);
    if (tool === "zoom") { event.preventDefault(); event.stopPropagation(); const factor=event.altKey ? 0.8 : 1.25; if(Math.max(.02,Math.min(20,pxPerFrame*factor))===pxPerFrame)return; zoomAnchor.current = { frame: at, x: event.clientX - scrollRef.current!.getBoundingClientRect().left }; onZoom(factor); }
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
  const scrubStart=(e:PointerEvent<HTMLDivElement>)=>{if(e.button!==0||(e.target as Element).closest("button"))return;e.preventDefault();e.stopPropagation();onScrubStart();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);seekFromX(e.clientX,true,bypassSnap(e,gestures));};
  const scrubMove=(e:PointerEvent<HTMLDivElement>)=>{if(e.currentTarget.hasPointerCapture(e.pointerId))seekFromX(e.clientX,true,bypassSnap(e,gestures));};
  const scrubEnd=(e:PointerEvent<HTMLDivElement>)=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);scrubSnapRef.current=null;snapTimer.current=setTimeout(()=>setScrubSnap(null),800);};

  return (
    <div ref={timelineRef} onContextMenu={e=>{e.preventDefault();const viewport=scrollRef.current;if(!viewport)return;const rect=viewport.getBoundingClientRect(),at=frameFromX(e.clientX),track=e.clientX>=rect.left&&e.clientY>=rect.top?displayed[Math.floor((e.clientY-rect.top+viewport.scrollTop)/TRACK_H)]:undefined;const clip=track?.clips.find(c=>c.from<=at&&c.from+c.durationInFrames>at);onContextMenu(e.clientX,e.clientY,clip?selectionIds(selectedIds.includes(clip.id)?selectedIds:[clip.id],!isolatedSelection&&preferences.linkedSelection):[],clip?frame:at,track?.id,Boolean(clip&&isolatedSelection&&selectedIds.includes(clip.id)));}} className={`timeline tool-${tool}`} style={{ "--track-height": `${TRACK_H}px`,"--timeline-scrollbar":`${scrollbars.x}px`,"--timeline-vertical-scrollbar":`${scrollbars.y}px` } as CSSProperties}>
      <div ref={headerPane.ref} className="timeline-headers" style={headerPane.style}>
        <div className="ruler-spacer" />
        <div className="track-headers-scroll" ref={headersRef}>{displayed.map((t) => (
          <div key={t.id} className={`track-header ${t.locked ? "locked" : ""}`} style={{ height: TRACK_H }}>
            <TrackControls track={t} targeted={destinationTrack(project, trackFamily(t.kind)) === t.id} onChange={(patch) => onTrackChange(t.id, patch)} onRecord={() => onRecord(t.id)} recording={recordingTrack === t.id} recordingBusy={recordingTrack !== null}/>
          </div>
        ))}</div>
      </div>
      {headerPane.separator}
      <div className="timeline-content">
        <div className="timeline-ruler-viewport" ref={rulerRef}>
          <div
            className="ruler"
            style={{width}}
            role="slider" tabIndex={0} aria-label="Regla del timeline" aria-valuemin={0} aria-valuemax={duration-1} aria-valuenow={frame} aria-valuetext={formatTimecode(frame,project.fps)}
            data-no-marquee
            onPointerDown={scrubStart} onPointerMove={scrubMove} onPointerUp={scrubEnd} onPointerCancel={scrubEnd}
          >
            {(markRange.start!==null||markRange.end!==null)&&<span className="timeline-mark-range" aria-label="Rango de entrada y salida" style={{left:(markRange.start??0)*pxPerFrame,width:Math.max(0,(markRange.end??duration)-(markRange.start??0))*pxPerFrame}}/>}
            {Array.from({ length: totalSeconds }, (_, s) =>
              s % labelEvery === 0 ? (
                <span key={s} className="tick" style={{ left: s * secondPx }}>
                  {formatTime(s)}
                </span>
              ) : null,
            )}
            {preferences.showMarkers && (project.markers ?? []).map((marker) => <button key={marker.id} className="timeline-marker" style={{ left: marker.frame * pxPerFrame, color: marker.color }} title={`${marker.label} · ${formatTimecode(marker.frame, project.fps)}`} aria-label={`Ir al marcador ${marker.label}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => onSeek(marker.frame)}>◆</button>)}
            {snapCue?.point!==null&&snapCue?.point!==undefined&&<i className="ruler-snap" style={{left:snapCue.point*pxPerFrame}}/>}
            <i className="ruler-playhead" aria-hidden style={{left:frame*pxPerFrame}}/>
          </div>
        </div>
      <div className="timeline-scroll" ref={scrollRef} onScroll={()=>{syncScroll();}}>
        <div ref={marquee.ref} onMouseDownCapture={captureTool} onMouseDown={marquee.onMouseDown} onMouseMove={(e) => { if (tool === "razor") setCutFrame(frameFromX(e.clientX)); }} onMouseLeave={() => setCutFrame(null)} role="listbox" aria-label="Clips de la línea de tiempo" aria-multiselectable style={{ width, position: "relative", minHeight:"100%" }}>
          {displayed.map((track, trackIndex) => (
            <div
              key={track.id}
              data-track-index={trackIndex} data-track-id={track.id} data-track-kind={track.kind}
              className={`track track-${track.kind} ${track.locked ? "locked" : ""} ${!trackOutputEnabled(project, track) ? "output-off" : ""} ${dropTrackId === track.id ? "drop-target" : ""}`}
              style={{ height: TRACK_H }}
              onContextMenu={e=>{e.preventDefault();e.stopPropagation();onContextMenu(e.clientX,e.clientY,[],frameFromX(e.clientX),track.id);}}
              onDragOver={(e) => {
                if (track.locked || !e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setDropTrackId(track.id);if(mediaDrag)onMediaHover(mediaDrag,track.id,(e.clientX-scrollRef.current!.getBoundingClientRect().left+scrollRef.current!.scrollLeft)/pxPerFrame,bypassSnap(e,gestures));
              }}
              onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null)){setDropTrackId(null);onMediaLeave();}}}
              onDrop={(e) => {
                e.preventDefault();
                setDropTrackId(null);
                if (track.locked) return;
                try {
                  const source = JSON.parse(e.dataTransfer.getData(MEDIA_DRAG_TYPE)) as MediaDrag;
                  if (!source.items?.length && track.kind !== "audio" && (source.kind === "audio" || source.mode === "audio")) return;
                  if (track.kind === "audio" && source.mode === "video") return;
                  const rect = scrollRef.current!.getBoundingClientRect();
                  const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
                  onDropMedia(source, track.id, Math.max(0, x / pxPerFrame),bypassSnap(e,gestures));
                } catch { /* otros tipos de arrastre no son medios del proyecto */ }
              }}
            >
              {drag?.duplicate && drag.mode === "move" && Math.abs(drag.dx)+Math.abs(drag.dy)>2 && project.tracks.flatMap(t=>t.clips).filter(c=>drag.clipIds.includes(c.id) && dragTargetTrack(c.id,drag)?.id===track.id).map(c=><div key={`copy-${c.id}`} className={`clip clip-${c.kind} clip-copy-preview`} aria-hidden style={{left:(c.from+moveDelta(drag))*pxPerFrame,width:Math.max(4,c.durationInFrames*pxPerFrame)}}><span className="clip-label">+ {clipLabel(c)}</span></div>)}
              {shapes.filter(s=>s.trackId===track.id).map(({clip},i)=><div key={`ghost-${i}`} className={`media-drop-ghost ghost-${clip.kind} ${mediaHover?.snap.point!==null?"snapped":""}`} aria-label={`Vista previa: ${clipLabel(clip)}`} style={{left:clip.from*pxPerFrame,width:Math.max(3,clip.durationInFrames*pxPerFrame)}}><span>{clipLabel(clip)}</span><small>{formatTimecode(clip.durationInFrames,project.fps)}{newTracks>0?` · +${newTracks} pistas`:""}</small></div>)}
              {track.clips.map((clip) => {
                const dragging = Boolean(drag && !drag.duplicate && (drag.mode === "move" ? drag.clipIds.includes(clip.id) : drag.clipId === clip.id));
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
                      ...(clip.labelColor?{background:clip.labelColor,borderColor:clip.labelColor}:{}),
                      left: p.from * pxPerFrame,
                      width: Math.max(4, p.dur * pxPerFrame),
                      transform: shiftY ? `translateY(${shiftY}px)` : undefined,
                      zIndex: dragging ? 3 : undefined,
                    }}
                    onDoubleClick={()=>{if((clip.kind==="video"||clip.kind==="audio")&&clip.sequenceId)onOpenSequence(clip.sequenceId);}}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();const ids=selectedIds.includes(clip.id)?selectionIds(selectedIds,!isolatedSelection&&preferences.linkedSelection):selectionIds([clip.id]);onContextMenu(e.clientX,e.clientY,ids,frame,track.id,isolatedSelection&&selectedIds.includes(clip.id));}}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      e.preventDefault();
                      const follow = preferences.linkedSelection && !(isolatedSelection && selectedIds.includes(clip.id));
                      if (!editable(clip.id, e.altKey ? false : follow)) { onSelect([clip.id],e.altKey); return; }
                      if (tool === "track") {
                        const ids = displayed.flatMap((t) => e.shiftKey && t.id !== track.id ? [] : t.clips.filter((c) => c.from >= clip.from).map((c) => c.id));
                        onSelect(ids); setDrag({ clipId: clip.id, clipIds: selectionIds(ids), explicitIds: ids, mode: "move", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0,bypass:bypassSnap(e,gestures) }); return;
                      }
                      if (e.shiftKey || e.ctrlKey || e.metaKey) { onSelect(toggleSelection(selectedIds, clip.id),e.altKey || isolatedSelection); return; }
                      if (tool === "slip") { onSelect([clip.id], !follow || e.altKey); setDrag({ followLinks:follow && !e.altKey, clipId: clip.id, clipIds: [clip.id], mode: "slip", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0,bypass:bypassSnap(e,gestures) }); return; }
                      const ids = selectedIds.includes(clip.id) ? selectedIds : clip.groupId&&!e.altKey?selectionIds([clip.id]):[clip.id];
                      onSelect(e.altKey ? [clip.id] : ids, !follow || e.altKey);
                      setDrag({ clipId: clip.id, clipIds: selectionIds(ids,follow), explicitIds: ids, followLinks:follow, duplicate:e.altKey, restoreLinksOnClick:isolatedSelection&&!e.altKey, collapseOnClick: ids.length > 1, mode: "move", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0,bypass:bypassSnap(e,gestures) });
                    }}
                    title={`${clipLabel(clip)}${clip.groupId ? " · Grupo" : ""}${(clip.kind==="video"||clip.kind==="audio")&&(clip.playbackRate??1)!==1?` · ${(clip.playbackRate??1)*100}%`:""}${clip.kind==="video"&&clip.freezeFrame!==undefined?" · Congelado":""}${(clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId ? " · Video/audio enlazados · Alt+clic: seleccionar solo esta parte" : ""} · Alt+arrastrar: duplicar`}
                  >
                    <div
                      className="trim-handle left"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        const follow = preferences.linkedSelection && !e.altKey && !(isolatedSelection && selectedIds.includes(clip.id));
                        if (!editable(clip.id,follow)) return;
                        onSelect([clip.id],!follow);
                        setDrag({ followLinks:follow, clipId: clip.id, clipIds: [clip.id], mode: "trim-start", ripple: tool === "ripple", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0,bypass:bypassSnap(e,gestures) });
                      }}
                    />
                    {preferences.showWaveforms && clip.kind === "audio" && waveforms[clip.src] && (
                      <img
                        className="clip-waveform"
                        src={waveforms[clip.src]}
                        alt=""
                        draggable={false}
                        style={{transform:`scaleY(${volumePreview[clip.id]??clip.volume})`,transformOrigin:"center center",width: clip.sourceDurationInFrames * pxPerFrame / (clip.playbackRate??1), left: -(preview.kind === "audio" ? preview.trimStart : clip.trimStart) * pxPerFrame / (clip.playbackRate??1) }}
                      />
                    )}
                    {clip.kind==="audio"&&<VolumeRubberBand name={clip.name} volume={clip.volume} height={TRACK_H-8} disabled={Boolean(track.locked)} onChange={v=>onVolume(clip.id,v)} onPreview={v=>setVolumePreview(s=>{const next={...s};if(v===null)delete next[clip.id];else next[clip.id]=v;return next;})}/>}
                    {preferences.showNames && <span className="clip-label">{(clip.kind === "video" || clip.kind === "audio") && clip.sequenceId ? "▤ " : ""}{clipLabel(clip)}{dragging && drag?.mode === "slip" && (preview.kind === "video" || preview.kind === "audio") ? ` · Origen ${(preview.trimStart / project.fps).toFixed(2)} s` : ""}</span>}
                    {(() => { if ((clip.kind !== "video" && clip.kind !== "audio") || !clip.linkedClipId) return null; const mate = projectClip(project, clip.linkedClipId)?.clip; if (!mate || (mate.kind !== "video" && mate.kind !== "audio")) return null; const offset = clip.from - clip.trimStart - mate.from + mate.trimStart; return offset ? <span className="clip-sync-warning" title="Diferencia de sincronía con su pareja">{offset > 0 ? "+" : ""}{offset} f</span> : null; })()}
                    <div
                      className="trim-handle right"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        const follow = preferences.linkedSelection && !e.altKey && !(isolatedSelection && selectedIds.includes(clip.id));
                        if (!editable(clip.id,follow)) return;
                        onSelect([clip.id],!follow);
                        setDrag({ followLinks:follow, clipId: clip.id, clipIds: [clip.id], mode: "trim-end", ripple: tool === "ripple", startX: e.clientX, startY: e.clientY, dx: 0, dy: 0,bypass:bypassSnap(e,gestures) });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          {snapCue?.point!==null&&snapCue?.point!==undefined&&<div className="timeline-snap-guide" aria-label="Punto de imán" style={{left:snapCue.point*pxPerFrame}}><span>Imán · {formatTimecode(snapCue.point,project.fps)}</span></div>}
          <div className="playhead" role="slider" tabIndex={0} data-no-marquee aria-label="Cabezal del timeline" aria-valuemin={0} aria-valuemax={duration-1} aria-valuenow={frame} aria-valuetext={formatTimecode(frame,project.fps)} title="Arrastra el cabezal desde cualquier altura" style={{left:frame*pxPerFrame}} onPointerDown={scrubStart} onPointerMove={scrubMove} onPointerUp={scrubEnd} onPointerCancel={scrubEnd}/>
          {tool === "razor" && cutFrame !== null && <div className="razor-guide" style={{ left: cutFrame * pxPerFrame }} />}
          {marquee.box && <div className="selection-marquee" aria-hidden style={{ left: marquee.box.x, top: marquee.box.y, width: marquee.box.width, height: marquee.box.height }} />}
        </div>
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
