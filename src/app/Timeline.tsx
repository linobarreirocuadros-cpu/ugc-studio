import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { Clip, Project, Track } from "../project/types";
import {
  clipLabel,
  getProjectDuration,
  destinationTrack,
  trackOutputEnabled,
  trackFamily,
} from "../project/types";
import { adjacentNext } from "../project/effects";
import { trackZone, trackHeight, type TrackZone } from "./timelineTracks";
import {
  timelineExtent,
  timelineScale,
  timelineRulerTicks,
} from "./timelineViewport";
import { labelStyle } from "./labels";
import { useAddRange } from "./useAddRange";
import { snapTimeline, type SnapHit } from "./timelineSnap";
import { previewMedia, type PlacementOptions } from "./mediaPlacement";
import type { MediaHover } from "./useMonitorDrag";
import { VolumeRubberBand } from "./VolumeRubberBand";
import { TrackControls } from "./TrackControls";
import { toggleSelection, useMarqueeSelection } from "./useMarqueeSelection";
import type { TimelineTool } from "./TimelineTools";
import {
  findClip as projectClip,
  rippleTrimClip,
  slipClip,
  trimClip,
  groupedIds,
  linkedIds,
  clipsEditable,
  editSelection,
} from "../project/ops";
import type { TimelinePreferences } from "./timelinePreferences";
import { useTimelinePanelWidth } from "./useTimelinePanelWidth";
import {
  bypassSnap,
  wheelModifier,
  timelineWheelAction,
  wheelPixels,
  type GesturePreferences,
} from "./gesturePreferences";

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
  frameBase?: number;
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
  onExportRanges?: (ids: string[]) => void;
  project: Project;
  onContextMenu: (
    x: number,
    y: number,
    ids: string[],
    at: number,
    trackId?: string,
    isolated?: boolean,
  ) => void;
  onAddRange: (start: number, duration: number, trackId: string) => void;
  onVolume: (id: string, value: number) => void;
  onOpenSequence: (id: string) => void;
  revealTrackId: string | null;
  frame: number;
  selectedIds: string[];
  pxPerFrame: number;
  tool: TimelineTool;
  snapping: boolean;
  preferences: TimelinePreferences;
  gestures: GesturePreferences;
  markRange: { start: number | null; end: number | null };
  heightContext: string;
  onTrackResize: (id: string, height: number) => void;
  onTransition: (id: string, edge: "start" | "end", frames: number) => void;
  onTrackHeight: (height: number) => void;
  onSeek: (frame: number) => void;
  onScrubStart: () => void;
  isolatedSelection: boolean;
  onSelect: (clipIds: string[], isolated?: boolean) => void;
  onDuplicate: (
    clipIds: string[],
    deltaFrames: number,
    trackOffset: number,
    followLinks: boolean,
  ) => void;
  onMove: (
    clipIds: string[],
    deltaFrames: number,
    trackOffset: number,
    followLinks: boolean,
  ) => void;
  onTrim: (
    clipId: string,
    edge: "start" | "end",
    delta: number,
    ripple: boolean,
    followLinks: boolean,
  ) => void;
  onSlip: (clipId: string, delta: number, followLinks: boolean) => void;
  onSplit: (clipId: string | undefined, frame: number) => void;
  onAddText: (frame: number) => void;
  onZoom: (factor: number) => void;
  onDropMedia: (
    media: MediaDrag,
    trackId: string,
    from: number,
    bypass?: boolean,
  ) => void;
  effectTarget: string | null;
  dragWheel: { current: ((event: WheelEvent, x: number) => void) | null };
  mediaDrag: MediaDrag | null;
  mediaHover: MediaHover | null;
  onMediaHover: (
    payload: MediaDrag,
    track: string,
    raw: number,
    bypass?: boolean,
  ) => void;
  onMediaLeave: () => void;
  placementOptions: PlacementOptions;
  onTrackChange: (
    id: string,
    patch: Partial<
      Pick<
        Track,
        "locked" | "hidden" | "muted" | "solo" | "targeted" | "syncLock"
      >
    >,
  ) => void;
  onRecord: (id: string) => void;
  recordingTrack: string | null;
  waveforms: Record<string, string>;
};

const SNAP_PX = 8;

export function Timeline({
  heightContext,
  onTrackResize,
  onTransition,
  onExportRanges,
  effectTarget,
  dragWheel,
  mediaDrag,
  mediaHover,
  onMediaHover,
  onMediaLeave,
  placementOptions,
  project,
  onContextMenu,
  onAddRange,
  onVolume,
  onOpenSequence,
  revealTrackId,
  frame,
  selectedIds,
  pxPerFrame,
  tool,
  snapping,
  preferences,
  gestures,
  markRange,
  onTrackHeight,
  onSeek,
  onScrubStart,
  isolatedSelection,
  onSelect,
  onDuplicate,
  onMove,
  onTrim,
  onSlip,
  onSplit,
  onAddText,
  onZoom,
  onDropMedia,
  onTrackChange,
  onRecord,
  recordingTrack,
  waveforms,
}: Props) {
  const headerPane = useTimelinePanelWidth<HTMLDivElement>(
    "headers",
    "Ancho de cabeceras de pistas",
  );
  const TRACK_H = preferences.trackHeight;
  const heightOf = (track: Track) =>
    trackHeight(preferences, heightContext, track.id);
  const [volumePreview, setVolumePreview] = useState<Record<string, number>>(
    {},
  );
  const selectionIds = (ids: string[], follow = preferences.linkedSelection) =>
    follow ? groupedIds(project, ids) : ids;
  const editable = (id: string, follow = preferences.linkedSelection) =>
    follow
      ? clipsEditable(project, [id])
      : !projectClip(project, id)?.track.locked;
  const [drag, setDragState] = useState<Drag | null>(null);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const addGesture = useAddRange({
    project,
    scale: pxPerFrame,
    snapping,
    bypass: (e) => bypassSnap(e, gestures),
    viewport: scrollRef,
    onAdd: onAddRange,
    onMenu: (x, y, at, trackId) => onContextMenu(x, y, [], at, trackId),
  });
  const timelineRef = useRef<HTMLDivElement>(null),
    rulerRef = useRef<HTMLDivElement>(null),
    horizontalRef = useRef<HTMLDivElement>(null),
    audioRef = useRef<HTMLDivElement>(null),
    captionRef = useRef<HTMLDivElement>(null);
  const [rulerViewport, setRulerViewport] = useState({ left: 0, width: 800 }),
    [bodyHeight, setBodyHeight] = useState(300);
  const [transitionPreview, setTransitionPreview] = useState<{
    id: string;
    edge: "start" | "end";
    frames: number;
  } | null>(null);
  const transitionCleanup = useRef<(() => void) | null>(null);
  const viewports = () =>
    [scrollRef.current, audioRef.current, captionRef.current].filter(
      (n): n is HTMLDivElement => Boolean(n),
    );
  const syncScroll = (source = scrollRef.current) => {
    if (!source) return;
    const left = source.scrollLeft;
    for (const node of [
      ...viewports(),
      rulerRef.current,
      horizontalRef.current,
    ])
      if (node && node.scrollLeft !== left) node.scrollLeft = left;
    const header = timelineRef.current?.querySelector<HTMLElement>(
      `[data-header-zone="${source.dataset.zone}"]`,
    );
    if (header) header.scrollTop = source.scrollTop;
    setRulerViewport((p) =>
      p.left === left && p.width === source.clientWidth
        ? p
        : { left, width: source.clientWidth },
    );
  };
  useLayoutEffect(() => {
    const root = timelineRef.current;
    if (!root) return;
    const sync = () => {
      setBodyHeight(Math.max(0, root.clientHeight - 38));
      syncScroll();
    };
    const observer = new ResizeObserver(sync);
    observer.observe(root);
    sync();
    return () => observer.disconnect();
  }, []);
  const displaySelected = selectionIds(
    selectedIds,
    preferences.linkedSelection && !isolatedSelection,
  );
  useLayoutEffect(() => {
    if (!revealTrackId) return;
    const row = timelineRef.current?.querySelector<HTMLElement>(
        `.track[data-track-id="${CSS.escape(revealTrackId)}"]`,
      ),
      viewport = row?.closest<HTMLElement>(".timeline-scroll");
    if (row && viewport)
      viewport.scrollTop = Math.max(
        0,
        row.offsetTop + row.offsetHeight - viewport.clientHeight,
      );
  }, [revealTrackId]);
  const [scrubSnap, setScrubSnap] = useState<SnapHit | null>(null),
    scrubSnapRef = useRef<SnapHit | null>(null),
    snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cutFrame, setCutFrame] = useState<number | null>(null);
  const zoomAnchor = useRef<{ frame: number; x: number } | null>(null);
  useEffect(() => {
    const horizontal = scrollRef.current,
      root = timelineRef.current;
    if (!horizontal || !root) return;
    const wheel = (e: WheelEvent, dragX?: number) => {
      const node =
          dragX === undefined
            ? (e.target as HTMLElement)
            : (root.ownerDocument.elementFromPoint(
                dragX,
                e.clientY,
              ) as HTMLElement | null),
        header = node?.closest<HTMLElement>("[data-height-track]");
      if (
        dragX === undefined &&
        !header &&
        node?.closest("input,select,textarea,[role=separator]")
      )
        return;
      const vertical =
        node?.closest<HTMLElement>(".timeline-scroll") ??
        viewports().find((v) => v.dataset.zone === header?.dataset.zone) ??
        horizontal;
      const mod = wheelModifier(e),
        action = timelineWheelAction(gestures, mod, Boolean(header)),
        resize = header && action === "individualHeight";
      if (action === "none" && !resize) return;
      e.preventDefault();
      const delta = wheelPixels(
        e.deltaY || e.deltaX,
        e.deltaMode,
        vertical.clientHeight || 300,
      );
      if (resize) {
        const t = project.tracks.find(
          (t) => t.id === header.dataset.heightTrack,
        );
        if (t) onTrackResize(t.id, heightOf(t) + (delta < 0 ? 4 : -4));
      } else if (action === "horizontal") {
        horizontal.scrollLeft += e.deltaX || delta;
        syncScroll(horizontal);
      } else if (action === "vertical") vertical.scrollTop += delta;
      else if (action === "zoom") {
        const factor = Math.exp(-delta * 0.006);
        if (
          timelineScale(
            pxPerFrame,
            factor,
            horizontal.clientWidth,
            width / pxPerFrame,
          ) === pxPerFrame
        )
          return;
        const x = Math.max(
          0,
          Math.min(
            horizontal.clientWidth,
            (dragX ?? e.clientX) - horizontal.getBoundingClientRect().left,
          ),
        );
        zoomAnchor.current = {
          frame: (horizontal.scrollLeft + x) / pxPerFrame,
          x,
        };
        onZoom(factor);
      } else if (action === "height")
        onTrackHeight(preferences.trackHeight + (delta < 0 ? 4 : -4));
      else onSeek(frame + Math.sign(delta) * (action === "fiveFrames" ? 5 : 1));
    };
    dragWheel.current = wheel;
    root.addEventListener("wheel", wheel, { passive: false });
    return () => {
      dragWheel.current = null;
      root.removeEventListener("wheel", wheel);
    };
  }, [
    gestures,
    pxPerFrame,
    frame,
    onZoom,
    onSeek,
    onTrackHeight,
    onTrackResize,
    preferences,
    project,
  ]);
  const panCleanup = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      panCleanup.current?.();
      transitionCleanup.current?.();
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    if (zoomAnchor.current && scrollRef.current) {
      scrollRef.current.scrollLeft =
        zoomAnchor.current.frame * pxPerFrame - zoomAnchor.current.x;
      zoomAnchor.current = null;
      syncScroll();
    }
  }, [pxPerFrame]);
  const duration = getProjectDuration(project);
  // Ancho: hasta el último clip (aunque sea una canción más larga que el video) + 10 s de margen
  const lastEnd = project.tracks
    .flatMap((t) => t.clips)
    .reduce((end, c) => Math.max(end, c.from + c.durationInFrames), duration);
  const shapes = useMemo(
    () =>
      mediaHover
        ? previewMedia(
            project,
            mediaHover.payload,
            mediaHover.trackId,
            mediaHover.at,
            placementOptions,
          )
        : [],
    [
      project,
      mediaHover,
      placementOptions.media,
      placementOptions.mediaFps,
      placementOptions.hostId,
      placementOptions.nested,
    ],
  );
  const incomingEnd = shapes.reduce(
    (end, { clip }) => Math.max(end, clip.from + clip.durationInFrames),
    lastEnd,
  );
  const width =
    timelineExtent(
      project.fps,
      lastEnd,
      Math.max(incomingEnd, addGesture.range?.end ?? 0),
    ) * pxPerFrame;

  // Puntos de "imán": bordes de todos los clips y el cabezal de reproducción.
  const snapPoints = (excludeIds: string[]) => {
    const pts = [0, frame, ...(project.markers ?? []).map((m) => m.frame)];
    for (const t of project.tracks)
      for (const c of t.clips)
        if (!excludeIds.includes(c.id))
          pts.push(c.from, c.from + c.durationInFrames);
    return pts;
  };
  const snap = (value: number, excludeIds: string[]) => {
    if (!snapping || dragRef.current?.bypass) return value;
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
      if (d)
        setDrag({
          ...d,
          dx: e.clientX - d.startX,
          dy: e.clientY - d.startY,
          bypass: bypassSnap(e, gestures),
        });
    };
    const onUp = (e: MouseEvent) => {
      if (dragRef.current) {
        dragRef.current = {
          ...dragRef.current,
          bypass: bypassSnap(e, gestures),
        };
        commitDrag(dragRef.current);
      }
      setDrag(null);
    };
    const cancel = () => setDrag(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    const win = timelineRef.current!.ownerDocument.defaultView!;
    win.addEventListener("mousemove", onMoveEvt);
    win.addEventListener("mouseup", onUp);
    win.addEventListener("blur", cancel);
    win.addEventListener("keydown", key);
    return () => {
      win.removeEventListener("mousemove", onMoveEvt);
      win.removeEventListener("mouseup", onUp);
      win.removeEventListener("blur", cancel);
      win.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.clipId, drag?.mode]);

  const findClip = (id: string) =>
    project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
  const newTracks = new Set(
    shapes
      .filter((s) => !project.tracks.some((t) => t.id === s.trackId))
      .map((s) => s.trackId),
  ).size;
  const snapCue = mediaHover && shapes.length ? mediaHover.snap : scrubSnap;
  const displayed = [...project.tracks].reverse(); // Conservar los índices reales para ops.
  const incomingTracks: Track[] = [];
  for (const shape of shapes)
    if (
      !project.tracks.some((t) => t.id === shape.trackId) &&
      !incomingTracks.some((t) => t.id === shape.trackId)
    )
      incomingTracks.push({
        id: shape.trackId,
        kind: shape.clip.kind === "audio" ? "audio" : "video",
        name: shape.clip.kind === "audio" ? "Audio nueva" : "B nueva",
        clips: [],
      });
  const visibleTracks = [...displayed, ...incomingTracks],
    zones: TrackZone[] = ["captions", "video", "audio"];
  const inZone = (zone: TrackZone) =>
    visibleTracks.filter((t) => trackZone(t) === zone);
  const captionHeight = Math.min(
    inZone("captions").reduce((sum, t) => sum + heightOf(t), 0),
    bodyHeight * 0.28,
  );
  useLayoutEffect(() => {
    if (!mediaHover) return;
    const ids = shapes
        .filter((s) => s.clip.kind === "audio")
        .map((s) => s.trackId),
      node = audioRef.current;
    if (!node || !ids.length) return;
    const row = [...node.querySelectorAll<HTMLElement>(".track")].find((t) =>
      ids.includes(t.dataset.trackId!),
    );
    if (
      row &&
      (row.offsetTop < node.scrollTop ||
        row.offsetTop + row.offsetHeight > node.scrollTop + node.clientHeight)
    )
      node.scrollTop = Math.max(
        0,
        row.offsetTop + row.offsetHeight - node.clientHeight,
      );
  }, [mediaHover?.trackId, shapes.map((s) => s.trackId).join("|")]);
  const displayHeight = (t: Track) =>
    trackZone(t) === "captions"
      ? Math.min(heightOf(t), Math.max(24, captionHeight))
      : heightOf(t);
  const rowAt = (y: number) =>
    [
      ...(timelineRef.current?.querySelectorAll<HTMLElement>(".track") ?? []),
    ].find((row) => {
      const viewport = row.closest<HTMLElement>(".timeline-scroll")!,
        r = row.getBoundingClientRect(),
        v = viewport.getBoundingClientRect();
      return y >= Math.max(r.top, v.top) && y < Math.min(r.bottom, v.bottom);
    });
  const rowTop = (id: string) =>
    timelineRef.current
      ?.querySelector<HTMLElement>(`.track[data-track-id="${CSS.escape(id)}"]`)
      ?.getBoundingClientRect().top ?? 0;

  /** Pista destino al arrastrar verticalmente: solo entre pistas del mismo tipo. */
  const dragTargetTrack = (clipId: string, d: Drag) => {
    const idx = displayed.findIndex((t) =>
      t.clips.some((c) => c.id === clipId),
    );
    const verticalIds = d.explicitIds ?? d.clipIds;
    if (!verticalIds.includes(clipId)) return displayed[idx];
    const targetIndex = displayed.findIndex(
      (t) => t.id === rowAt(d.startY + d.dy)?.dataset.trackId,
    );
    const offset = targetIndex < 0 ? 0 : targetIndex - idx;
    const valid = displayed.every(
      (t, i) =>
        !t.clips.some((c) => verticalIds.includes(c.id)) ||
        (displayed[i + offset] &&
          trackFamily(displayed[i + offset].kind) === trackFamily(t.kind)),
    );
    return displayed[valid ? idx + offset : idx];
  };

  const moveDelta = (d: Drag) => {
    const anchor = findClip(d.clipId)!;
    const earliest = Math.min(
      ...project.tracks
        .flatMap((t) => t.clips)
        .filter((c) => d.clipIds.includes(c.id))
        .map((c) => c.from),
    );
    return Math.max(
      -earliest,
      Math.round(
        snap(anchor.from + d.dx / pxPerFrame, d.duplicate ? [] : d.clipIds) -
          anchor.from,
      ),
    );
  };

  const projectForDrag = (d: Drag | null) => {
    if (!d || d.mode === "move") return project;
    const clip = findClip(d.clipId);
    if (!clip) return project;
    if (d.mode === "slip")
      return editSelection(
        project,
        [clip.id],
        d.followLinks ?? preferences.linkedSelection,
        (p) => slipClip(p, clip.id, d.dx / pxPerFrame),
      );
    const edge = d.mode === "trim-start" ? "start" : "end";
    const endpoint =
      edge === "start" ? clip.from : clip.from + clip.durationInFrames;
    const delta =
      snap(
        endpoint + d.dx / pxPerFrame,
        selectionIds([clip.id], d.followLinks),
      ) - endpoint;
    return editSelection(
      project,
      [clip.id],
      d.followLinks ?? preferences.linkedSelection,
      (p) => (d.ripple ? rippleTrimClip : trimClip)(p, clip.id, edge, delta),
    );
  };
  const previewProject = projectForDrag(drag);

  const dragPreview = (clip: Clip, d: Drag) => {
    if (d.mode === "move")
      return { from: clip.from + moveDelta(d), dur: clip.durationInFrames };
    const preview = projectClip(projectForDrag(d), clip.id)?.clip ?? clip;
    return { from: preview.from, dur: preview.durationInFrames };
  };

  const commitDrag = (d: Drag) => {
    const clip = findClip(d.clipId);
    if (!clip) return;
    if (Math.hypot(d.dx, d.dy) < 4) {
      if (d.duplicate) onSelect([clip.id], true);
      else if (d.restoreLinksOnClick) onSelect([clip.id]);
      else if (d.collapseOnClick) onSelect([clip.id], d.followLinks === false);
      return;
    }
    const p = dragPreview(clip, d);
    if (d.mode === "move")
      (d.duplicate ? onDuplicate : onMove)(
        d.explicitIds ?? d.clipIds,
        moveDelta(d),
        displayed.findIndex((t) => t.clips.some((c) => c.id === clip.id)) -
          displayed.indexOf(dragTargetTrack(clip.id, d)),
        d.followLinks ?? preferences.linkedSelection,
      );
    else if (d.mode === "slip")
      onSlip(
        clip.id,
        d.dx / pxPerFrame,
        d.followLinks ?? preferences.linkedSelection,
      );
    else if (d.mode === "trim-end")
      onTrim(
        clip.id,
        "end",
        p.dur - clip.durationInFrames,
        Boolean(d.ripple),
        d.followLinks ?? preferences.linkedSelection,
      );
    else
      onTrim(
        clip.id,
        "start",
        d.ripple ? clip.durationInFrames - p.dur : p.from - clip.from,
        Boolean(d.ripple),
        d.followLinks ?? preferences.linkedSelection,
      );
  };

  const seekFromX = (clientX: number, magnet = false, bypass = false) => {
    if (snapTimer.current) clearTimeout(snapTimer.current);
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + scrollRef.current!.scrollLeft;
    const hit = snapTimeline(
      project,
      x / pxPerFrame,
      pxPerFrame,
      magnet && snapping && !bypass,
      { previous: scrubSnapRef.current, maximum: duration - 1 },
    );
    scrubSnapRef.current = hit;
    setScrubSnap(hit.point === null ? null : hit);
    onSeek(hit.frame);
  };
  const frameFromX = (clientX: number) =>
    Math.max(
      0,
      Math.round(
        (clientX -
          scrollRef.current!.getBoundingClientRect().left +
          scrollRef.current!.scrollLeft) /
          pxPerFrame,
      ),
    );
  const captureTool = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button,[data-no-marquee]")
    )
      return;
    if (tool === "hand") {
      event.preventDefault();
      event.stopPropagation();
      const horizontal = scrollRef.current!,
        vertical =
          (event.target as HTMLElement).closest<HTMLElement>(
            ".timeline-scroll",
          ) ?? horizontal,
        x = event.clientX,
        y = event.clientY,
        left = horizontal.scrollLeft,
        top = vertical.scrollTop;
      panCleanup.current?.();
      const win = timelineRef.current!.ownerDocument.defaultView!;
      const move = (e: MouseEvent) => {
        horizontal.scrollLeft = left - (e.clientX - x);
        vertical.scrollTop = top - (e.clientY - y);
        syncScroll(horizontal);
      };
      const up = () => {
        win.removeEventListener("mousemove", move);
        win.removeEventListener("mouseup", up);
        win.removeEventListener("blur", up);
        panCleanup.current = null;
      };
      panCleanup.current = up;
      win.addEventListener("mousemove", move);
      win.addEventListener("mouseup", up);
      win.addEventListener("blur", up);
      return;
    }
    if ((event.target as HTMLElement).closest(".ruler")) return;
    const at = frameFromX(event.clientX);
    if (tool === "zoom") {
      event.preventDefault();
      event.stopPropagation();
      const factor = event.altKey ? 0.8 : 1.25;
      if (
        timelineScale(
          pxPerFrame,
          factor,
          scrollRef.current!.clientWidth,
          timelineExtent(
            project.fps,
            lastEnd,
            Math.max(incomingEnd, addGesture.range?.end ?? 0),
          ),
        ) === pxPerFrame
      )
        return;
      zoomAnchor.current = {
        frame: at,
        x: event.clientX - scrollRef.current!.getBoundingClientRect().left,
      };
      onZoom(factor);
    } else if (tool === "text") {
      event.preventDefault();
      event.stopPropagation();
      onAddText(at);
    } else if (tool === "razor") {
      event.preventDefault();
      event.stopPropagation();
      const id = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-selection-id]",
      )?.dataset.selectionId;
      if (id) onSplit(event.shiftKey ? undefined : id, at);
    } else if (
      tool === "track" &&
      !(event.target as HTMLElement).closest("[data-selection-id]")
    ) {
      event.preventDefault();
      event.stopPropagation();
      const trackIndex = Number(
        (event.target as HTMLElement).closest<HTMLElement>("[data-track-index]")
          ?.dataset.trackIndex,
      );
      onSelect(
        displayed.flatMap((track, i) =>
          event.shiftKey && i !== trackIndex
            ? []
            : track.clips.filter((c) => c.from >= at).map((c) => c.id),
        ),
      );
    }
  };

  const ticks = timelineRulerTicks(
    project.fps,
    pxPerFrame,
    width,
    rulerViewport.left,
    rulerViewport.width,
  );
  const detailedTicks = ticks.some(
    (tick) => tick.major && tick.frame % Math.round(project.fps) !== 0,
  );
  const scrubStart = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    onScrubStart();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromX(e.clientX, true, bypassSnap(e, gestures));
  };
  const scrubMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      seekFromX(e.clientX, true, bypassSnap(e, gestures));
  };
  const scrubEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    scrubSnapRef.current = null;
    snapTimer.current = setTimeout(() => setScrubSnap(null), 800);
  };

  const edgeTransition = (clip: Clip, edge: "start" | "end") => {
    const t = projectClip(project, clip.id)?.track,
      next = t && edge === "end" ? adjacentNext(t, clip) : undefined;
    return edge === "start"
      ? clip.transitionIn
      : (next?.transitionIn ?? clip.transitionOut);
  };
  const startTransition = (
    e: PointerEvent<HTMLButtonElement>,
    clip: Clip,
    edge: "start" | "end",
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const node = e.currentTarget,
      win = node.ownerDocument.defaultView!,
      start = e.clientX,
      initial = edgeTransition(clip, edge)?.frames ?? 0;
    let frames = initial,
      moved = false;
    transitionCleanup.current?.();
    node.setPointerCapture(e.pointerId);
    const stop = () => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", cancel, true);
      win.removeEventListener("keydown", key, true);
      win.removeEventListener("blur", cancel);
      if (node.hasPointerCapture(e.pointerId))
        node.releasePointerCapture(e.pointerId);
      setTransitionPreview(null);
      transitionCleanup.current = null;
    };
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== e.pointerId) return;
      const dx = (event.clientX - start) * (edge === "start" ? 1 : -1);
      if (Math.abs(dx) > 3) moved = true;
      if (moved) {
        frames = Math.max(
          0,
          Math.min(
            Math.floor(project.fps * 10),
            clip.durationInFrames,
            Math.round(initial + dx / pxPerFrame),
          ),
        );
        setTransitionPreview({ id: clip.id, edge, frames });
      }
    };
    const up = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== e.pointerId) return;
      move(event);
      stop();
      onTransition(
        clip.id,
        edge,
        moved
          ? frames
          : initial
            ? 0
            : Math.min(clip.durationInFrames, Math.round(project.fps * 0.5)),
      );
    };
    const cancel = () => stop();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    transitionCleanup.current = stop;
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", cancel, true);
    win.addEventListener("keydown", key, true);
    win.addEventListener("blur", cancel);
  };
  const renderTrack = (track: Track) => {
    const trackIndex = displayed.findIndex((t) => t.id === track.id);
    return (
      <div
        key={track.id}
        data-track-index={trackIndex}
        data-track-id={track.id}
        data-track-kind={track.kind}
        className={`track track-${track.kind} ${track.locked ? "locked" : ""} ${!trackOutputEnabled(project, track) ? "output-off" : ""} ${dropTrackId === track.id ? "drop-target" : ""}`}
        style={{ height: displayHeight(track), boxSizing: "border-box" }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(
            e.clientX,
            e.clientY,
            [],
            frameFromX(e.clientX),
            track.id,
          );
        }}
        onDragOver={(e) => {
          if (track.locked || !e.dataTransfer.types.includes(MEDIA_DRAG_TYPE))
            return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropTrackId(track.id);
          if (mediaDrag)
            onMediaHover(
              mediaDrag,
              track.id,
              (e.clientX -
                scrollRef.current!.getBoundingClientRect().left +
                scrollRef.current!.scrollLeft) /
                pxPerFrame,
              bypassSnap(e, gestures),
            );
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTrackId(null);
            onMediaLeave();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropTrackId(null);
          if (track.locked) return;
          try {
            const source = JSON.parse(
              e.dataTransfer.getData(MEDIA_DRAG_TYPE),
            ) as MediaDrag;
            if (
              !source.items?.length &&
              track.kind !== "audio" &&
              (source.kind === "audio" || source.mode === "audio")
            )
              return;
            if (track.kind === "audio" && source.mode === "video") return;
            const rect = scrollRef.current!.getBoundingClientRect();
            const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
            onDropMedia(
              source,
              track.id,
              Math.max(0, x / pxPerFrame),
              bypassSnap(e, gestures),
            );
          } catch {
            /* otros tipos de arrastre no son medios del proyecto */
          }
        }}
      >
        {drag &&
          drag.mode === "move" &&
          Math.abs(drag.dx) + Math.abs(drag.dy) > 2 &&
          project.tracks
            .flatMap((t) => t.clips)
            .filter(
              (c) =>
                drag.clipIds.includes(c.id) &&
                dragTargetTrack(c.id, drag)?.id === track.id &&
                (drag.duplicate ||
                  trackZone(projectClip(project, c.id)!.track) !==
                    trackZone(track)),
            )
            .map((c) => (
              <div
                key={`copy-${c.id}`}
                className={`clip clip-${c.kind} clip-copy-preview`}
                aria-hidden
                style={{
                  ...labelStyle(c.labelColor),
                  left: (c.from + moveDelta(drag)) * pxPerFrame,
                  width: Math.max(4, c.durationInFrames * pxPerFrame),
                }}
              >
                <span className="clip-label">
                  {drag.duplicate ? "+ " : ""}
                  {clipLabel(c)}
                </span>
              </div>
            ))}
        {shapes
          .filter((s) => s.trackId === track.id)
          .map(({ clip }, i) => (
            <div
              key={`ghost-${i}`}
              className={`media-drop-ghost ghost-${clip.kind} ${mediaHover?.snap.point !== null ? "snapped" : ""}`}
              aria-label={`Vista previa: ${clipLabel(clip)}`}
              style={{
                ...labelStyle(clip.labelColor),
                left: clip.from * pxPerFrame,
                width: Math.max(3, clip.durationInFrames * pxPerFrame),
              }}
            >
              <span>{clipLabel(clip)}</span>
              <small>
                {formatTimecode(clip.durationInFrames, project.fps)}
                {newTracks > 0 ? ` · +${newTracks} pistas` : ""}
              </small>
            </div>
          ))}
        {addGesture.range?.trackId === track.id && (
          <div
            className={`timeline-add-range ${addGesture.range.snap !== null ? "snapped" : ""}`}
            role="status"
            aria-label="Rango para añadir"
            style={{
              left: addGesture.range.start * pxPerFrame,
              width: Math.max(
                2,
                (addGesture.range.end - addGesture.range.start) * pxPerFrame,
              ),
            }}
          >
            <span
              style={{
                left: Math.max(
                  0,
                  rulerViewport.left - addGesture.range.start * pxPerFrame,
                ),
              }}
            >
              Añadir ·{" "}
              {formatTimecode(
                addGesture.range.end - addGesture.range.start,
                project.fps,
              )}
            </span>
          </div>
        )}
        {track.clips.map((clip) => {
          const dragging = Boolean(
            drag &&
              !drag.duplicate &&
              (drag.mode === "move"
                ? drag.clipIds.includes(clip.id)
                : drag.clipId === clip.id),
          );
          const preview = projectClip(previewProject, clip.id)?.clip ?? clip;
          const p =
            dragging && drag
              ? dragPreview(clip, drag)
              : { from: preview.from, dur: preview.durationInFrames };
          const shiftY =
            dragging && drag?.mode === "move"
              ? rowTop(dragTargetTrack(clip.id, drag).id) - rowTop(track.id)
              : 0;
          return (
            <div
              key={clip.id}
              className={`clip ${effectTarget === clip.id ? "effect-drop-target" : ""} clip-${clip.kind} ${(clip.kind === "video" || clip.kind === "audio") && clip.sequenceId ? "clip-sequence" : ""} ${displaySelected.includes(clip.id) ? "selected" : ""}`}
              data-selection-id={clip.id}
              data-selection-disabled={track.locked || undefined}
              role="option"
              aria-selected={displaySelected.includes(clip.id)}
              aria-label={clipLabel(clip)}
              style={{
                ...labelStyle(clip.labelColor),
                left: p.from * pxPerFrame,
                width: Math.max(4, p.dur * pxPerFrame),
                transform: shiftY ? `translateY(${shiftY}px)` : undefined,
                zIndex: dragging ? 3 : undefined,
                visibility:
                  dragging &&
                  drag?.mode === "move" &&
                  trackZone(dragTargetTrack(clip.id, drag)) !== trackZone(track)
                    ? "hidden"
                    : undefined,
              }}
              onDoubleClick={() => {
                if (
                  (clip.kind === "video" || clip.kind === "audio") &&
                  clip.sequenceId
                )
                  onOpenSequence(clip.sequenceId);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const ids = selectedIds.includes(clip.id)
                  ? selectionIds(
                      selectedIds,
                      !isolatedSelection && preferences.linkedSelection,
                    )
                  : selectionIds([clip.id]);
                onContextMenu(
                  e.clientX,
                  e.clientY,
                  ids,
                  frame,
                  track.id,
                  isolatedSelection && selectedIds.includes(clip.id),
                );
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                const follow =
                  preferences.linkedSelection &&
                  !(isolatedSelection && selectedIds.includes(clip.id));
                if (!editable(clip.id, e.altKey ? false : follow)) {
                  onSelect([clip.id], e.altKey);
                  return;
                }
                if (tool === "track") {
                  const ids = displayed.flatMap((t) =>
                    e.shiftKey && t.id !== track.id
                      ? []
                      : t.clips
                          .filter((c) => c.from >= clip.from)
                          .map((c) => c.id),
                  );
                  onSelect(ids);
                  setDrag({
                    clipId: clip.id,
                    clipIds: selectionIds(ids),
                    explicitIds: ids,
                    mode: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    dx: 0,
                    dy: 0,
                    bypass: bypassSnap(e, gestures),
                  });
                  return;
                }
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  onSelect(
                    toggleSelection(selectedIds, clip.id),
                    e.altKey || isolatedSelection,
                  );
                  return;
                }
                if (tool === "slip") {
                  onSelect([clip.id], !follow || e.altKey);
                  setDrag({
                    followLinks: follow && !e.altKey,
                    clipId: clip.id,
                    clipIds: [clip.id],
                    mode: "slip",
                    startX: e.clientX,
                    startY: e.clientY,
                    dx: 0,
                    dy: 0,
                    bypass: bypassSnap(e, gestures),
                  });
                  return;
                }
                const ids = selectedIds.includes(clip.id)
                  ? selectedIds
                  : clip.groupId && !e.altKey
                    ? selectionIds([clip.id])
                    : [clip.id];
                onSelect(e.altKey ? [clip.id] : ids, !follow || e.altKey);
                setDrag({
                  clipId: clip.id,
                  clipIds: selectionIds(ids, follow),
                  explicitIds: ids,
                  followLinks: follow,
                  duplicate: e.altKey,
                  restoreLinksOnClick: isolatedSelection && !e.altKey,
                  collapseOnClick: ids.length > 1,
                  mode: "move",
                  startX: e.clientX,
                  startY: e.clientY,
                  dx: 0,
                  dy: 0,
                  bypass: bypassSnap(e, gestures),
                });
              }}
              title={`${clipLabel(clip)}${clip.groupId ? " · Grupo" : ""}${(clip.kind === "video" || clip.kind === "audio") && (clip.playbackRate ?? 1) !== 1 ? ` · ${(clip.playbackRate ?? 1) * 100}%` : ""}${clip.kind === "video" && clip.freezeFrame !== undefined ? " · Congelado" : ""}${(clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId ? " · Video/audio enlazados · Alt+clic: seleccionar solo esta parte" : ""} · Alt+arrastrar: duplicar`}
            >
              <div
                className="trim-handle left"
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  const follow =
                    preferences.linkedSelection &&
                    !e.altKey &&
                    !(isolatedSelection && selectedIds.includes(clip.id));
                  if (!editable(clip.id, follow)) return;
                  onSelect([clip.id], !follow);
                  setDrag({
                    followLinks: follow,
                    clipId: clip.id,
                    clipIds: [clip.id],
                    mode: "trim-start",
                    ripple: tool === "ripple",
                    startX: e.clientX,
                    startY: e.clientY,
                    dx: 0,
                    dy: 0,
                    bypass: bypassSnap(e, gestures),
                  });
                }}
              />
              {preferences.showWaveforms &&
                clip.kind === "audio" &&
                waveforms[clip.src] && (
                  <img
                    className="clip-waveform"
                    src={waveforms[clip.src]}
                    alt=""
                    draggable={false}
                    style={{
                      transform: `scaleY(${(volumePreview[clip.id] ?? clip.volume) * (clip.mix?.gain ?? 1)})`,
                      transformOrigin: "center center",
                      width:
                        (clip.sourceDurationInFrames * pxPerFrame) /
                        (clip.playbackRate ?? 1),
                      left:
                        (-(preview.kind === "audio"
                          ? preview.trimStart
                          : clip.trimStart) *
                          pxPerFrame) /
                        (clip.playbackRate ?? 1),
                    }}
                  />
                )}
              {clip.kind === "audio" && (
                <VolumeRubberBand
                  name={clip.name}
                  volume={clip.volume}
                  height={heightOf(track) - 8}
                  disabled={Boolean(track.locked)}
                  onChange={(v) => onVolume(clip.id, v)}
                  onPreview={(v) =>
                    setVolumePreview((s) => {
                      const next = { ...s };
                      if (v === null) delete next[clip.id];
                      else next[clip.id] = v;
                      return next;
                    })
                  }
                />
              )}
              {preferences.showNames && (
                <span className="clip-label">
                  {(clip.kind === "video" || clip.kind === "audio") &&
                  clip.sequenceId
                    ? "▤ "
                    : ""}
                  {clip.renderEngine === "hyperframes" ? "HF · " : ""}
                  {clip.motion ? "◇ " : ""}
                  {clipLabel(clip)}
                  {dragging &&
                  drag?.mode === "slip" &&
                  (preview.kind === "video" || preview.kind === "audio")
                    ? ` · Origen ${(preview.trimStart / project.fps).toFixed(2)} s`
                    : ""}
                </span>
              )}
              {clip.effects && (
                <span
                  className="clip-fx"
                  aria-label={
                    clip.effects.enabled === false
                      ? "Efectos desactivados"
                      : "Efectos aplicados"
                  }
                  style={{ opacity: clip.effects.enabled === false ? 0.4 : 1 }}
                >
                  fx
                </span>
              )}
              {clip.kind !== "audio" &&
                !(clip.kind === "graphic" && clip.shape === "adjustment") &&
                (["start", "end"] as const).map((edge) => {
                  const current =
                    transitionPreview?.id === clip.id &&
                    transitionPreview.edge === edge
                      ? transitionPreview.frames
                      : (edgeTransition(clip, edge)?.frames ?? 0);
                  const next =
                      edge === "end" ? adjacentNext(track, clip) : undefined,
                    blocked =
                      Boolean(track.locked) ||
                      (next?.kind === "graphic" && next.shape === "adjustment");
                  return (
                    <button
                      key={edge}
                      className={`clip-dissolve-handle ${edge} ${current ? "applied" : ""}`}
                      data-no-marquee
                      aria-label={`Disolución ${edge === "start" ? "entrada" : "salida"} · ${clipLabel(clip)}`}
                      title={
                        blocked
                          ? "Desbloquea la pista y elige un corte entre clips visuales sin capa de ajuste."
                          : "Clic: añadir/quitar disolución · Arrastrar: duración"
                      }
                      disabled={blocked}
                      style={
                        current
                          ? {
                              width: Math.max(
                                10,
                                Math.min(p.dur, current) * pxPerFrame,
                              ),
                            }
                          : undefined
                      }
                      onPointerDown={(e) => startTransition(e, clip, edge)}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      ◩
                    </button>
                  );
                })}
              {(() => {
                if (
                  (clip.kind !== "video" && clip.kind !== "audio") ||
                  !clip.linkedClipId
                )
                  return null;
                const mate = projectClip(project, clip.linkedClipId)?.clip;
                if (!mate || (mate.kind !== "video" && mate.kind !== "audio"))
                  return null;
                const offset =
                  clip.from - clip.trimStart - mate.from + mate.trimStart;
                return offset ? (
                  <span
                    className="clip-sync-warning"
                    title="Diferencia de sincronía con su pareja"
                  >
                    {offset > 0 ? "+" : ""}
                    {offset} f
                  </span>
                ) : null;
              })()}
              <div
                className="trim-handle right"
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  const follow =
                    preferences.linkedSelection &&
                    !e.altKey &&
                    !(isolatedSelection && selectedIds.includes(clip.id));
                  if (!editable(clip.id, follow)) return;
                  onSelect([clip.id], !follow);
                  setDrag({
                    followLinks: follow,
                    clipId: clip.id,
                    clipIds: [clip.id],
                    mode: "trim-end",
                    ripple: tool === "ripple",
                    startX: e.clientX,
                    startY: e.clientY,
                    dx: 0,
                    dy: 0,
                    bypass: bypassSnap(e, gestures),
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };
  const renderGuides = () => (
    <>
      {" "}
      {snapCue?.point !== null && snapCue?.point !== undefined && (
        <div
          className="timeline-snap-guide"
          aria-label="Punto de imán"
          style={{ left: snapCue.point * pxPerFrame }}
        >
          <span>Imán · {formatTimecode(snapCue.point, project.fps)}</span>
        </div>
      )}
      <div
        className="playhead"
        role="slider"
        tabIndex={0}
        data-no-marquee
        aria-label="Cabezal del timeline"
        aria-valuemin={0}
        aria-valuemax={duration - 1}
        aria-valuenow={frame}
        aria-valuetext={formatTimecode(frame, project.fps)}
        title="Arrastra el cabezal desde cualquier altura"
        style={{ left: frame * pxPerFrame }}
        onPointerDown={scrubStart}
        onPointerMove={scrubMove}
        onPointerUp={scrubEnd}
        onPointerCancel={scrubEnd}
      />
      {tool === "razor" && cutFrame !== null && (
        <div className="razor-guide" style={{ left: cutFrame * pxPerFrame }} />
      )}
    </>
  );
  return (
    <div
      ref={timelineRef}
      onPointerDownCapture={addGesture.onPointerDown}
      onContextMenuCapture={(e) => {
        if (e.button === 2 && addGesture.suppressContextMenu()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const row = rowAt(e.clientY),
          track = project.tracks.find((t) => t.id === row?.dataset.trackId);
        onContextMenu(
          e.clientX,
          e.clientY,
          [],
          frameFromX(e.clientX),
          track?.id,
        );
      }}
      className={`timeline tool-${tool} ${addGesture.range ? "drawing-add-range" : ""}`}
      style={{ "--track-height": `${TRACK_H}px` } as CSSProperties}
    >
      <div
        ref={headerPane.ref}
        className="timeline-headers"
        style={headerPane.style}
      >
        <div className="ruler-spacer" />
        {zones.map(
          (zone) =>
            (zone === "video" || inZone(zone).length > 0) && (
              <div
                key={zone}
                className={`track-headers-scroll zone-${zone}`}
                data-header-zone={zone}
                style={
                  zone === "captions"
                    ? { flex: `0 0 ${captionHeight}px` }
                    : undefined
                }
              >
                {inZone(zone).map((t) => (
                  <div
                    key={t.id}
                    data-height-track={t.id}
                    data-zone={zone}
                    className={`track-header ${heightOf(t) < 36 ? "compact-track" : ""} ${t.locked ? "locked" : ""}`}
                    style={
                      {
                        height: displayHeight(t),
                        "--track-height": `${displayHeight(t)}px`,
                        boxSizing: "border-box",
                      } as CSSProperties
                    }
                    title={`${t.name} · ${gestures.headerHeight} + rueda: altura de esta pista`}
                  >
                    <TrackControls
                      track={t}
                      targeted={
                        destinationTrack(project, trackFamily(t.kind)) === t.id
                      }
                      onChange={(patch) => onTrackChange(t.id, patch)}
                      onRecord={() => onRecord(t.id)}
                      recording={recordingTrack === t.id}
                      recordingBusy={recordingTrack !== null}
                    />
                  </div>
                ))}
              </div>
            ),
        )}
        <div className="timeline-horizontal-spacer" />
      </div>
      {headerPane.separator}
      <div className="timeline-content">
        <div className="timeline-ruler-viewport" ref={rulerRef}>
          <div
            className="ruler"
            style={{ width }}
            role="slider"
            tabIndex={0}
            aria-label="Regla del timeline"
            aria-valuemin={0}
            aria-valuemax={duration - 1}
            aria-valuenow={frame}
            aria-valuetext={formatTimecode(frame, project.fps)}
            data-no-marquee
            onPointerDown={scrubStart}
            onPointerMove={scrubMove}
            onPointerUp={scrubEnd}
            onPointerCancel={scrubEnd}
          >
            {project.exportRanges?.map((range) => (
              <span
                key={range.id}
                className="timeline-export-band"
                title={`${range.name} · Clic derecho para exportar`}
                style={{
                  left: range.start * pxPerFrame,
                  width: Math.max(5, (range.end - range.start) * pxPerFrame),
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button === 0) onSeek(range.start);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onExportRanges?.([range.id]);
                }}
              >{`{ ${range.name} }`}</span>
            ))}
            {(markRange.start !== null || markRange.end !== null) && (
              <span
                className="timeline-mark-range"
                aria-label="Rango de entrada y salida"
                style={{
                  left: (markRange.start ?? 0) * pxPerFrame,
                  width:
                    Math.max(
                      0,
                      (markRange.end ?? duration) - (markRange.start ?? 0),
                    ) * pxPerFrame,
                }}
              />
            )}
            {ticks.map((t) => (
              <span
                key={t.frame}
                className={`tick ${t.major ? "major-tick" : "minor-tick"}`}
                aria-hidden
                style={{ left: t.x }}
              >
                {t.major
                  ? detailedTicks
                    ? formatTimecode(t.frame, project.fps).slice(3)
                    : formatTime(Math.floor(t.frame / Math.round(project.fps)))
                  : ""}
              </span>
            ))}
            {preferences.showMarkers &&
              (project.markers ?? []).map((marker) => (
                <button
                  key={marker.id}
                  className="timeline-marker"
                  style={{
                    left: marker.frame * pxPerFrame,
                    color: marker.color,
                  }}
                  title={`${marker.label} · ${formatTimecode(marker.frame, project.fps)}`}
                  aria-label={`Ir al marcador ${marker.label}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onSeek(marker.frame)}
                >
                  ◆
                </button>
              ))}
            {snapCue?.point !== null && snapCue?.point !== undefined && (
              <i
                className="ruler-snap"
                style={{ left: snapCue.point * pxPerFrame }}
              />
            )}
            <i
              className="ruler-playhead"
              aria-hidden
              style={{ left: frame * pxPerFrame }}
            />
          </div>
        </div>
        {zones.map(
          (zone) =>
            (zone === "video" || inZone(zone).length > 0) && (
              <TimelineZone
                key={zone}
                zone={zone}
                height={zone === "captions" ? captionHeight : undefined}
                viewportRef={
                  zone === "audio"
                    ? audioRef
                    : zone === "captions"
                      ? captionRef
                      : scrollRef
                }
                width={width}
                selected={selectedIds}
                onSelect={onSelect}
                onSeek={seekFromX}
                onScroll={syncScroll}
                onCapture={captureTool}
                onMouseMove={(e) => {
                  if (tool === "razor") setCutFrame(frameFromX(e.clientX));
                }}
                onMouseLeave={() => setCutFrame(null)}
              >
                {inZone(zone).map(renderTrack)}
                {renderGuides()}
              </TimelineZone>
            ),
        )}
        <div
          className="timeline-horizontal-scroll"
          ref={horizontalRef}
          aria-label="Desplazamiento horizontal del timeline"
          onScroll={(e) => syncScroll(e.currentTarget)}
        >
          <div style={{ width, height: 1 }} />
        </div>
      </div>
    </div>
  );
}

function TimelineZone({
  zone,
  height,
  viewportRef,
  width,
  selected,
  onSelect,
  onSeek,
  onScroll,
  onCapture,
  onMouseMove,
  onMouseLeave,
  children,
}: {
  zone: TrackZone;
  height?: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onSeek: (x: number) => void;
  onScroll: (node: HTMLDivElement) => void;
  onCapture: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave: () => void;
  children: React.ReactNode;
}) {
  const marquee = useMarqueeSelection({
    selected,
    onSelect,
    onEmptyClick: onSeek,
  });
  return (
    <div
      className={`timeline-scroll zone-${zone}`}
      data-zone={zone}
      aria-label={
        zone === "audio"
          ? "Pistas de audio"
          : zone === "captions"
            ? "Pistas de subtítulos fijas"
            : "Pistas de video"
      }
      ref={viewportRef}
      style={height !== undefined ? { flex: `0 0 ${height}px` } : undefined}
      onScroll={(e) => onScroll(e.currentTarget)}
    >
      <div
        ref={marquee.ref}
        role="listbox"
        aria-label={`Clips ${zone}`}
        aria-multiselectable
        onMouseDownCapture={onCapture}
        onMouseDown={marquee.onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ width, position: "relative", minHeight: "100%" }}
      >
        {children}
        {marquee.box && (
          <div
            className="selection-marquee"
            aria-hidden
            style={{
              left: marquee.box.x,
              top: marquee.box.y,
              width: marquee.box.width,
              height: marquee.box.height,
            }}
          />
        )}
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
  fps = Math.round(fps);
  const totalSeconds = Math.floor(frame / fps);
  const f = frame % fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
};
