import { type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ops from "../project/ops";
import {
  createEmptyProject,
  getProjectDuration,
  normalizeProject,
  destinationTrack,
  clipAtPlayhead,
  type AudioClip,
  type CaptionClip,
  type CaptionStyle,
  type Project,
  type TextClip,
  type VideoClip,
} from "../project/types";
import { AIPanel, CAPTION_PRESETS } from "./AIPanel";
import { FoleyPanel, openFolder } from "./FoleyPanel";
import { ChatPanel } from "./chat/ChatPanel";
import { FONT_FAMILIES, primaryFamily } from "../remotion/fonts";
import { ProgramMonitor } from "./ProgramMonitor";
import { SourceMonitor, type SourceHandle } from "./SourceMonitor";
import { MEDIA_DRAG_TYPE, Timeline, formatTimecode, type MediaDrag } from "./Timeline";
import { useHistory } from "./useHistory";
import { LocalAssistantPanel } from "./LocalAssistantPanel";
import type { AssistantContext, VisualResult } from "./localAssistant";
import { toggleSelection, useMarqueeSelection } from "./useMarqueeSelection";
import { TimelineTools, TIMELINE_TOOLS, type TimelineTool } from "./TimelineTools";
import { AudioMeter } from "./AudioMeter";
import { useWorkspace } from "./workspace";
import { useVoiceRecording } from "./useVoiceRecording";
import { TimelineToolbar } from "./TimelineToolbar";
import { normalizeTimelinePreferences, type TimelinePreferences } from "./timelinePreferences";
import { COMMANDS, eventChord, resolveCommand, type CommandScope } from "./commands";
import { useShortcuts } from "./useShortcuts";
import { ShortcutEditor } from "./ShortcutEditor";
import { MenuBar } from "./MenuBar";
import { ActionDialog } from "./ActionDialog";
import { useShuttle } from "./useShuttle";
import type { Panel } from "./workspaceLayout";

type MediaItem = { src: string; name: string; durationInFrames: number; proxySrc?: string; kind?: "video" | "audio"; hasAudio?: boolean };
type Preset = "h264-high" | "h264-draft" | "prores-hq";

const STORAGE_KEY = "ugc-studio:autosave";

const loadSaved = (): { project: Project; media: MediaItem[] } | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const readDurationInFrames = (src: string, fps: number) =>
  new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Math.max(1, Math.floor(v.duration * fps)));
    v.onerror = () => reject(new Error("No se pudo leer el archivo"));
    v.src = src;
  });

const readHasAudio = async (src: string) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch("/api/media-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      return Boolean(data.hasAudio);
    } catch (error) { if (attempt >= 3) throw error; await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
};

export function App() {
  const workspace = useWorkspace();
  const shortcuts=useShortcuts();
  const [shortcutsOpen,setShortcutsOpen]=useState(false),[actionDialog,setActionDialog]=useState<"export"|"gain"|"help"|null>(null),[gain,setGain]=useState(0),[feedback,setFeedback]=useState("");
  const activeScope=useRef<CommandScope>("timeline"), hoveredPanel=useRef<Panel>("timeline"), sourceRef=useRef<SourceHandle>(null), clipboard=useRef<Project|null>(null);
  const [playbackRate,setPlaybackRate]=useState(1), [markRange,setMarkRange]=useState<{start:number|null;end:number|null}>({start:null,end:null});
  const previousZoom=useRef<{scale:number;left:number}|null>(null), binAnchor=useRef<string|null>(null);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(""),4500);return()=>clearTimeout(timer);},[feedback]);
  const saved = useMemo(loadSaved, []);
  const rootHistory = useHistory<Project>(() => normalizeProject(saved?.project ?? createEmptyProject()));
  const [editingSequenceId, setEditingSequenceId] = useState<string | null>(null);
  const projectView = useCallback((root: Project): Project => editingSequenceId && root.sequences?.[editingSequenceId] ? { ...root.sequences[editingSequenceId], sequences: root.sequences } : root, [editingSequenceId]);
  const currentProject = useCallback(() => projectView(rootHistory.current()), [projectView, rootHistory.current]);
  const applyToProject = useCallback((fn: (p: Project) => Project) => rootHistory.apply((root) => {
    const view = projectView(root), next = fn(view);
    if (next === view) return root;
    if (!editingSequenceId || !root.sequences?.[editingSequenceId]) return next;
    return ops.updateSequence(root, editingSequenceId, next);
  }), [rootHistory.apply, projectView, editingSequenceId]);
  const viewedProject = useMemo(() => projectView(rootHistory.value), [projectView, rootHistory.value]);
  const history = { ...rootHistory, value: viewedProject, current: currentProject, apply: applyToProject };
  const project = history.value;
  const [media, setMedia] = useState<MediaItem[]>(saved?.media ?? []);
  const [waveforms, setWaveforms] = useState<Record<string, string>>({});
  const [selectedIds, rawSetSelectedIds] = useState<string[]>([]);
  const [isolatedSelection, setIsolatedSelection] = useState(false);
  const setSelectedIds: typeof rawSetSelectedIds = useCallback((ids) => { if(typeof ids !== "function") setIsolatedSelection(false); rawSetSelectedIds(ids); },[]);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [revealTrackId, setRevealTrackId] = useState<string | null>(null);
  const migratedAudio = useRef(new Set<string>());
  const mediaInfo = useRef(new Map<string, Promise<boolean>>());
  const selectionPanel = useRef<"timeline" | "bin">("timeline");
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
  const binSelection = useMarqueeSelection({ selected: selectedMedia, onSelect: setSelectedMedia });
  const [frame, setFrame] = useState(0);
  const [pxPerFrame, setPxPerFrame] = useState(2);
  const [tool, setTool] = useState<TimelineTool>("select");
  const [timelinePreferences, setTimelinePreferences] = useState(() => { try { return normalizeTimelinePreferences(JSON.parse(localStorage.getItem("ugc-studio:timeline") ?? "null")); } catch { return normalizeTimelinePreferences(null); } });
  const updateTimelinePreferences = (patch: Partial<TimelinePreferences>) => setTimelinePreferences((p) => normalizeTimelinePreferences({ ...p, ...patch }));
  const { snapping } = timelinePreferences;
  const linkedSelection = timelinePreferences.linkedSelection && !isolatedSelection;
  const setSnapping = (fn: (value: boolean) => boolean) => setTimelinePreferences((p) => ({ ...p, snapping: fn(p.snapping) }));
  useEffect(() => { try { localStorage.setItem("ugc-studio:timeline", JSON.stringify(timelinePreferences)); } catch { /* mantener ajustes de la sesión */ } }, [timelinePreferences]);
  const programRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [binTab, setBinTab] = useState<"proyecto" | "foley">("proyecto");
  const [binView, setBinView] = useState<"list" | "grid">(() => localStorage.getItem("ugc-studio:bin-view") === "grid" ? "grid" : "list");
  const [sourceSrc, setSourceSrc] = useState<string | null>(null);
  const [monitorLayout, setMonitorLayout] = useState<"split" | "tabs">(() => localStorage.getItem("ugc-studio:monitor-layout") === "tabs" ? "tabs" : "split");
  const [monitorTab, setMonitorTab] = useState<"source" | "program">("program");
  const [rightTab, setRightTab] = useState<"propiedades" | "chat" | "vision" | "audio">("chat");
  const [visualResult, setVisualResult] = useState<VisualResult | null>(null);
  const [preset, setPreset] = useState<Preset>("h264-high");
  const [render, setRender] = useState<{ progress: number; url?: string; error?: string } | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const openInput = useRef<HTMLInputElement>(null);

  const duration = getProjectDuration(project);
  const selected = selectedId ? ops.findClip(project, selectedId)?.clip ?? null : null;
  const sourceMedia = media.find((m) => m.src === sourceSrc) ?? null;
  const recording = useVoiceRecording((voice, trackId, at, fps) => {
    const item: MediaItem = { src: voice.src, name: voice.name, kind: "audio", hasAudio: true, durationInFrames: Math.max(1, Math.round(voice.durationSeconds * fps)) };
    setMedia((list) => [...list, item]);
    const before = history.current(), next = ops.addSourceRange(before, item, trackId, at);
    if (next === before) return false;
    history.apply(() => next); setRevealTrackId(trackId); return true;
  }, () => playerRef.current?.pause());
  useEffect(() => {
    let cancelled = false;
    const candidates = project.tracks.flatMap((t) => t.clips).filter((c): c is VideoClip => c.kind === "video" && !c.sequenceId && !c.linkedClipId && c.audioMode !== "none" && c.audioMode !== "separate" && !migratedAudio.current.has(c.id));
    void Promise.all(candidates.map(async (clip) => {
      const known = media.find((m) => m.src === clip.src)?.hasAudio;
      if (known !== undefined) return known ? clip.id : null;
      if (!mediaInfo.current.has(clip.src)) mediaInfo.current.set(clip.src, readHasAudio(clip.src).catch((error) => { mediaInfo.current.delete(clip.src); throw error; }));
      return await mediaInfo.current.get(clip.src)!.catch(() => false) ? clip.id : null;
    })).then((ids) => {
      if (cancelled) return;
      const ready = ids.filter((id): id is string => id !== null);
      ready.forEach((id) => migratedAudio.current.add(id));
      if (ready.length) history.apply((p) => ops.exposeEmbeddedAudio(p, ready));
    }).catch(() => { /* conservar el audio embebido si el medio no está disponible */ });
    return () => { cancelled = true; };
  }, [project, media, history.apply]);
  useEffect(() => {
    const valid = new Set(project.tracks.flatMap((t) => t.clips).map((c) => c.id));
    setSelectedIds((ids) => ids.every((id) => valid.has(id)) ? ids : ids.filter((id) => valid.has(id)));
  }, [project]);
  useEffect(() => { setSelectedMedia((ids) => ids.filter((id) => media.some((m) => m.src === id))); }, [media]);

  // Autoguardado en el navegador
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: rootHistory.value, media }));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [rootHistory.value, media]);
  useEffect(() => { localStorage.setItem("ugc-studio:bin-view", binView); }, [binView]);
  useEffect(() => { localStorage.setItem("ugc-studio:monitor-layout", monitorLayout); }, [monitorLayout]);

  // Detecta videos cuyo archivo ya no existe (p. ej. tras mover o actualizar el programa)
  const [missing, setMissing] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      media.map((m) =>
        fetch(m.src, { method: "HEAD" })
          .then((r) => (r.ok ? null : m.src))
          .catch(() => m.src),
      ),
    ).then((results) => {
      if (!cancelled) setMissing(new Set(results.filter((x): x is string => x !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [media]);

  // Crea proxies para videos importados antes de que existieran (una vez por archivo)
  const proxyRequested = useRef(new Set<string>());
  useEffect(() => {
    for (const m of media) {
      if (m.proxySrc || missing.has(m.src) || proxyRequested.current.has(m.src)) continue;
      proxyRequested.current.add(m.src);
      fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: m.src }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.proxySrc) return;
          setMedia((list) => list.map((x) => (x.src === m.src ? { ...x, proxySrc: data.proxySrc } : x)));
          history.apply((p) => ops.setProxy(p, m.src, data.proxySrc));
        })
        .catch(() => {});
    }
  }, [media, missing, history.apply]);

  // Ondas visibles para música, Foley y audio extraído de video.
  const waveformRequested = useRef(new Set<string>());
  useEffect(() => {
    const audioSources = project.tracks.flatMap((t) => t.clips)
      .filter((c): c is AudioClip => c.kind === "audio" && c.src.startsWith("/media/"))
      .map((c) => c.src);
    for (const src of new Set(audioSources)) {
      if (waveformRequested.current.has(src)) continue;
      waveformRequested.current.add(src);
      fetch("/api/waveform", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src }) })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.waveformSrc) setWaveforms((w) => ({ ...w, [src]: data.waveformSrc })); })
        .catch(() => {});
    }
  }, [project]);

  const selectAtPlayhead = useCallback((f: number) => {
    if (!timelinePreferences.selectionFollowsPlayhead) return;
    const clip = clipAtPlayhead(history.current(), f);
    setSelectedIds(clip ? [clip.id] : []); selectionPanel.current = "timeline";
  }, [timelinePreferences.selectionFollowsPlayhead, history.current]);

  // Sincroniza el cabezal con el reproductor; selección automática solo al buscar, no al reproducir.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onSeek = (e: { detail: { frame: number } }) => { setFrame(e.detail.frame); selectAtPlayhead(e.detail.frame); };
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onSeek);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("seeked", onSeek);
    };
  }, [selectAtPlayhead]);

  const seek = useCallback((f: number) => {
    const at = Math.max(0, Math.min(getProjectDuration(history.current()) - 1, Math.round(f)));
    playerRef.current?.seekTo(at); setFrame(at); selectAtPlayhead(at);
  }, [selectAtPlayhead, history.current]);

  const assistantContext = (): AssistantContext => ({
    getProject: history.current,
    commit: (next) => history.apply(() => next),
    selectedClipId: selectedId,
    selectedClipIds: selectedIds,
    currentFrame: frame,
    currentSequenceId: editingSequenceId,
    nestSequences: timelinePreferences.nestSequences,
    onSeek: seek,
    showVisualResult: setVisualResult,
    registerMedia: (items) => setMedia((list) => [...list, ...items.filter((item) => !list.some((m) => m.src === item.src))]),
  });

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body });
        if (!res.ok) throw new Error("Error al subir " + file.name);
        const { src, name, proxySrc, kind, hasAudio } = await res.json();
        const durationInFrames = await readDurationInFrames(proxySrc ?? src, project.fps).catch(() =>
          readDurationInFrames(src, project.fps),
        );
        // Si es el mismo video que faltaba (mismo nombre), se reconecta en vez de duplicarse.
        const lost = media.find((m) => m.name === name && missing.has(m.src));
        if (lost) {
          history.apply((p) => ops.relinkMedia(p, lost.src, src, proxySrc));
          setMedia((list) => list.map((x) => (x.src === lost.src ? { src, name, durationInFrames, proxySrc, kind, hasAudio } : x)));
        } else {
          setMedia((m) => [...m, { src, name, durationInFrames, proxySrc, kind, hasAudio }]);
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const addMedia = (m: MediaItem) => history.apply((p) => {
    const track = destinationTrack(p, m.kind === "audio" ? "audio" : "video");
    return !track ? p : m.kind === "audio" ? ops.addSourceRange(p, m, track, frame) : ops.addVideoClip(p, m, track);
  });
  const addBroll = (m: MediaItem) => history.apply((p) => ops.addVideoClip(p, m, "V2", frame, true));
  const addTrack = (kind: "video" | "audio") => history.apply((p) => {
    const next = ops.addTrack(p, kind), added = next.tracks.find((t) => !p.tracks.some((prior) => prior.id === t.id))!;
    setRevealTrackId(added.id); return next;
  });

  const addSource = (m: MediaItem, trackId: string, at: number, inFrame = 0, outFrame = m.durationInFrames, videoOnly = false) => {
    history.apply((p) => ops.addSourceRange(p, m, trackId, at, inFrame, outFrame, videoOnly));
  };
  const dropMedia = (dragged: MediaDrag, trackId: string, at: number) => {
    if (dragged.sequenceId) { history.apply((p) => ops.placeSequence(p, dragged.sequenceId!, trackId, at, timelinePreferences.nestSequences, editingSequenceId ?? undefined)); return; }
    const items = dragged.items ?? [dragged];
    const track = project.tracks.find((t) => t.id === trackId);
    if (items.some((item) => missing.has(item.src) || !media.some((m) => m.src === item.src))) return;
    if (track?.kind === "video" && items.some((item) => item.kind === "audio" || item.mode === "audio")) { alert("Para colocar la selección en una pista de video, selecciona solo videos. También puedes colocarla completa como audio en una pista de audio."); return; }
    history.apply((p) => {
      let next = p, cursor = at;
      for (const item of items) {
        const m = media.find((entry) => entry.src === item.src)!;
        next = ops.addSourceRange(next, m, trackId, cursor, item.inFrame, item.outFrame, item.mode === "video");
        cursor += item.outFrame - item.inFrame;
      }
      return next;
    });
  };
  const startMediaDrag = (e: React.DragEvent, m: MediaItem, inFrame = 0, outFrame = m.durationInFrames, mode: MediaDrag["mode"] = "auto") => {
    const payload: MediaDrag = { src: m.src, kind: m.kind ?? "video", inFrame, outFrame, mode };
    e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  const addFoley = async (file: { name: string; src: string }) => {
    const durationInFrames = await readDurationInFrames(file.src, project.fps).catch(() => project.fps);
    history.apply((p) => ops.addAudioClip(p, { src: file.src, name: file.name, durationInFrames }, "A2", frame));
  };

  const addText = (at = frame) => {
    const id = ops.newId();
    history.apply((p) => ops.addTextClip(p, { id, text: "Tu hook aquí", from: at, durationInFrames: p.fps * 3 }));
    setSelectedId(id); // queda seleccionado para editarlo de inmediato
    setRightTab("propiedades"); setTool("select"); seek(at);
  };

  const split = () => history.apply((p) => {
    const targets=selectedIds.length?selectedIds:p.tracks.filter(t=>t.id===destinationTrack(p,"video")||t.id===destinationTrack(p,"audio")).flatMap(t=>t.clips.filter(c=>c.from<frame&&c.from+c.durationInFrames>frame).map(c=>c.id));
    return ops.editSelection(p,targets,linkedSelection,current=>targets.reduce((next,id)=>ops.splitAt(next,frame,id),current));
  });
  const remove = (ripple: boolean) => {
    if (!selectedIds.length) return;
    history.apply((p) => ops.editSelection(p, selectedIds, linkedSelection, (current) => ops.deleteClips(current, selectedIds, ripple)));
    setSelectedIds([]);
  };

  const startRender = async () => {
    setRender({ progress: 0 });
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, preset }),
    });
    const { id } = await res.json();
    const poll = async () => {
      const job = await (await fetch(`/api/render/${id}`)).json();
      setRender({ progress: job.progress, url: job.url, error: job.error });
      if (job.status === "rendering") setTimeout(poll, 700);
    };
    poll();
  };

  const saveProjectFile = () => {
    const blob = new Blob([JSON.stringify({ project: rootHistory.current(), media }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}.ugcproj.json`;
    a.click();
  };

  const openProjectFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    recording.cancel();
    const data = JSON.parse(await file.text());
    setEditingSequenceId(null); rootHistory.apply(() => normalizeProject(data.project));
    setMedia(data.media ?? []);
    setSelectedIds([]); setSelectedMedia([]); setSourceSrc(null);
    migratedAudio.current.clear(); setRevealTrackId(null);
    setTool("select"); seek(0);
    setMarkRange({start:null,end:null});
  };

  const transport=useShuttle({current:()=>playerRef.current?.getCurrentFrame()??frame,seek,play:()=>playerRef.current?.play(),pause:()=>playerRef.current?.pause(),toggle:()=>playerRef.current?.toggle(),rate:setPlaybackRate,fps:project.fps,end:duration});
  const focusPanel=(scope:CommandScope, panel:Panel)=>{workspace.showPanel(panel);activeScope.current=scope;selectionPanel.current=scope==="bin"?"bin":"timeline";requestAnimationFrame(()=>workspace.appRef.current?.querySelector<HTMLElement>(`[data-shortcut-scope="${scope}"]`)?.focus());};
  const timelineViewport=()=>workspace.appRef.current?.querySelector<HTMLDivElement>(".timeline-scroll");
  const fitTimeline=()=>{const viewport=timelineViewport();if(previousZoom.current){setPxPerFrame(previousZoom.current.scale);const left=previousZoom.current.left;requestAnimationFrame(()=>{if(viewport)viewport.scrollLeft=left;});previousZoom.current=null;}else{previousZoom.current={scale:pxPerFrame,left:viewport?.scrollLeft??0};if(viewport)viewport.scrollLeft=0;setPxPerFrame(Math.max(.02,Math.min(20,((viewport?.clientWidth??800)-30)/duration)));}};
  const canRun=(id:string)=>id==="undo"?history.canUndo:id==="redo"?history.canRedo:["copy","cut","delete","rippleDelete","duplicate","subsequence","gain","link"].includes(id)?selectedIds.length>0:id==="paste"?Boolean(clipboard.current):["overwrite","insert"].includes(id)?Boolean(sourceMedia):id==="export"?!render||Boolean(render.url||render.error):true;
  const runCommand=(id:string,scope:CommandScope=activeScope.current)=>{
    const command=COMMANDS.find(c=>c.id===id);if(command?.pending){setFeedback(command.pending);return;}if(!canRun(id))return;
    const sourceCommands=["play","stop","forwardPlay","reversePlay","markIn","markOut","goIn","goOut","clearIn","clearOut","clearMarks","markClip","markSelection","start","end",...[-1,1].flatMap(sign=>[1,5].map(n=>`step${sign<0?"Left":"Right"}${n}`))];
    if(scope==="source"&&sourceCommands.includes(id)){transport("stop");if(!sourceRef.current?.command(id))setFeedback("Selecciona un archivo en Proyecto para usar Origen.");return;}
    if(scope==="source"&&["marker","nextMarker","prevMarker","deleteMarker","deleteMarkers"].includes(id)){setFeedback("Los marcadores del archivo de origen están pendientes; los del montaje se editan desde Timeline o Programa.");return;}
    if(transport(id)){sourceRef.current?.command("stop");return;}
    if(id==="shortcuts"||id==="find"){setShortcutsOpen(true);return;}
    if(id==="help"){setActionDialog("help");return;}
    if(id==="newProject"){if(window.confirm("¿Crear un proyecto nuevo? Guarda primero una copia si quieres conservar este montaje. Puedes cancelar aquí.")){recording.cancel();transport("stop");setEditingSequenceId(null);rootHistory.apply(()=>createEmptyProject());setMedia([]);setSelectedIds([]);setSelectedMedia([]);setSourceSrc(null);setMarkRange({start:null,end:null});setFrame(0);playerRef.current?.seekTo(0);}return;}
    if(id==="open"){openInput.current?.click();return;}if(id==="import"){fileInput.current?.click();return;}
    if(["save","saveAs","saveCopy"].includes(id)){saveProjectFile();return;}
    if(id==="export"){setActionDialog("export");return;}
    if(id==="undo"){history.undo();return;}if(id==="redo"){history.redo();return;}
    if(id==="maximize"||id==="maximizeFocused"){const focused=(document.activeElement as HTMLElement)?.closest<HTMLElement>("[data-workspace-panel]")?.dataset.workspacePanel as Panel|undefined;workspace.toggleMax(id==="maximize"?hoveredPanel.current:focused??(scope==="source"||scope==="program"?"monitor":scope==="bin"?"bin":"timeline"));return;}if(id==="resetWorkspace"){workspace.reset();return;}
    if(id==="bin"){setBinTab("proyecto");focusPanel("bin","bin");return;}
    if(id==="source"||id==="program"){setMonitorTab(id);focusPanel(id,"monitor");return;}
    if(id==="timeline"){focusPanel("timeline","timeline");return;}
    if(["properties","chat","audioPanel"].includes(id)){setRightTab(id==="properties"?"propiedades":id==="chat"?"chat":"audio");workspace.showPanel("inspector");requestAnimationFrame(()=>workspace.appRef.current?.querySelector<HTMLElement>(id==="chat"?".chat-input textarea":".inspector")?.focus());return;}
    if(id==="meter"){workspace.showPanel("meter");requestAnimationFrame(()=>workspace.appRef.current?.querySelector<HTMLElement>(".meter-panel")?.focus());return;}
    if(id.startsWith("tool.")){setTool(id.slice(5) as TimelineTool);focusPanel("timeline","timeline");return;}
    if(id==="selectAll"){if(scope==="bin")setSelectedMedia(media.map(m=>m.src));else setSelectedIds(project.tracks.filter(t=>!t.locked).flatMap(t=>t.clips.map(c=>c.id)));return;}
    if(id==="deselect"){scope==="bin"?setSelectedMedia([]):setSelectedIds([]);setTool("select");return;}
    if(id==="binList"||id==="binGrid"||id==="binToggle"){setBinView(v=>id==="binToggle"?(v==="grid"?"list":"grid"):id==="binGrid"?"grid":"list");return;}
    if(/^bin(move|extend)/.test(id)){
      const all=media.map(m=>m.src),current=Math.max(0,all.indexOf(selectedMedia.at(-1)??"")),direction=id.replace(/^bin(move|extend)/,""),size=binView==="grid"?Math.max(1,Math.floor((workspace.appRef.current?.querySelector(".bin-media")?.clientWidth??160)/144)):1;
      const delta=direction==="Left"?-1:direction==="Right"?1:direction==="Up"?-size:direction==="Down"?size:direction==="PageUp"?-size*3:size*3;
      const index=direction==="Home"?0:direction==="End"?all.length-1:Math.max(0,Math.min(all.length-1,current+delta));
      if(!all[index])return;const anchor=all.indexOf(binAnchor.current??all[current]);setSelectedMedia(id.startsWith("binextend")?all.slice(Math.min(anchor,index),Math.max(anchor,index)+1):[all[index]]);if(id.startsWith("binmove"))binAnchor.current=all[index];setSourceSrc(all[index]);requestAnimationFrame(()=>workspace.appRef.current?.querySelector<HTMLElement>(`.bin-item[data-selection-id="${CSS.escape(all[index])}"]`)?.scrollIntoView({block:"nearest"}));return;
    }
    if(id==="binSource"){if(selectedMedia[0]){setSourceSrc(selectedMedia[0]);setMonitorTab("source");focusPanel("source","monitor");}return;}
    if(id==="copy"||id==="cut"||id==="duplicate"){
      const copied=ops.copyClips(project,selectedIds,linkedSelection);if(!copied.tracks.some(t=>t.clips.length))return;clipboard.current=copied;
      if(id==="cut")remove(false);else if(id==="duplicate"){const end=Math.max(...copied.tracks.flatMap(t=>t.clips.map(c=>c.from+c.durationInFrames)));history.apply(p=>ops.pasteClips(p,copied,end,editingSequenceId??undefined));}else setFeedback("Selección copiada dentro de UGC Studio.");return;
    }
    if(id==="paste"){if(clipboard.current){const copy=clipboard.current;history.apply(p=>ops.pasteClips(p,copy,frame,editingSequenceId??undefined));}return;}
    if(id==="delete"||id==="rippleDelete"){remove(id==="rippleDelete");return;}
    if(id==="split"){split();return;}if(id==="splitAll"){history.apply(p=>ops.splitAt(p,frame));return;}
    if(["ripplePrevious","rippleNext","trimPrevious","trimNext"].includes(id)){
      const clip=clipAtPlayhead(project,frame);if(!clip)return;const start=id.endsWith("Previous"),ripple=id.startsWith("ripple"),delta=start?frame-clip.from:frame-(clip.from+clip.durationInFrames);if(!delta)return;
      history.apply(p=>(ripple?ops.rippleTrimClip:ops.trimClip)(p,clip.id,start?"start":"end",delta));if(start&&ripple)seek(clip.from);return;
    }
    if(id==="gain"){setGain(0);setActionDialog("gain");return;}
    if(id==="text"){addText();return;}
    if(id==="link"){const linked=selectedIds.some(id=>{const clip=ops.findClip(project,id)?.clip;return clip&&(clip.kind==="video"||clip.kind==="audio")&&clip.linkedClipId;});history.apply(p=>ops.linkClips(p,linked?ops.linkedIds(p,selectedIds):selectedIds,!linked));return;}
    if(id==="subsequence"){history.apply(p=>ops.createSequence(p,selectedIds,`Secuencia ${Object.keys(p.sequences??{}).length+1}`));return;}
    if(id==="overwrite"||id==="insert"){if(sourceMedia){const target=destinationTrack(project,sourceMedia.kind==="audio"?"audio":"video"),range=sourceRef.current?.range();if(target&&range)history.apply(p=>(id==="insert"?ops.insertSourceRange:ops.addSourceRange)(p,sourceMedia,target,frame,range.inFrame,range.outFrame));}return;}
    if(id==="matchFrame"){
      const clip=selected??clipAtPlayhead(project,frame);if(clip&&(clip.kind==="video"||clip.kind==="audio")&&!clip.sequenceId){const m=media.find(m=>m.src===clip.src);if(m){setSourceSrc(m.src);setMonitorTab("source");focusPanel("source","monitor");requestAnimationFrame(()=>sourceRef.current?.seek(clip.trimStart+Math.max(0,frame-clip.from)));}}return;
    }
    if(id==="snap"){setSnapping(v=>!v);return;}if(id==="linkedSelection"){setIsolatedSelection(false);updateTimelinePreferences({linkedSelection:!timelinePreferences.linkedSelection});return;}if(id==="followPlayhead"){updateTimelinePreferences({selectionFollowsPlayhead:!timelinePreferences.selectionFollowsPlayhead});return;}
    if(id==="selectAtPlayhead"){const clip=clipAtPlayhead(project,frame);setSelectedIds(clip?(linkedSelection?ops.linkedIds(project,[clip.id]):[clip.id]):[]);return;}
    if(id==="expandTracks"||id==="minimizeTracks"){updateTimelinePreferences({trackHeight:id==="expandTracks"?120:36});return;}
    if(id==="zoomIn"||id==="zoomOut"){previousZoom.current=null;setPxPerFrame(z=>Math.max(.02,Math.min(20,z*(id==="zoomIn"?1.25:.8))));return;}if(id==="fit"){fitTimeline();return;}
    if(id==="pageNext"||id==="pagePrev"){const viewport=timelineViewport();if(viewport)viewport.scrollLeft+=(id==="pageNext"?1:-1)*viewport.clientWidth*.9;return;}
    if(/^(nudge|slip)(Left|Right)[15]$/.test(id)){const delta=(id.includes("Left")?-1:1)*Number(id.at(-1));history.apply(p=>ops.editSelection(p,selectedIds,linkedSelection,current=>{if(id.startsWith("nudge"))return ops.moveClips(current,selectedIds,delta);const done=new Set<string>();return selectedIds.reduce((next,clipId)=>{if(done.has(clipId))return next;ops.linkedIds(current,[clipId]).forEach(key=>done.add(key));return ops.slipClip(next,clipId,delta);},current);}));return;}
    if(/^step(Left|Right)[15]$/.test(id)){transport("stop");seek(frame+(id.includes("Left")?-1:1)*Number(id.at(-1)));return;}
    if(id==="start"||id==="end"){seek(id==="start"?0:duration-1);return;}
    if(["nextEdit","prevEdit","nextEditAll","prevEditAll","nextCaption","prevCaption"].includes(id)){const forward=id.startsWith("next"),captions=id.includes("Caption"),targets=[destinationTrack(project,"video"),destinationTrack(project,"audio")],points=[...new Set(project.tracks.filter(t=>captions?t.kind==="caption":id.endsWith("All")||targets.includes(t.id)).flatMap(t=>t.clips.flatMap(c=>captions?[c.from]:[c.from,c.from+c.durationInFrames])))].sort((a,b)=>a-b);const point=forward?points.find(p=>p>frame):points.reverse().find(p=>p<frame);if(point!==undefined)seek(point);return;}
    if(id==="markIn"){setMarkRange(r=>({start:frame,end:r.end!==null&&r.end<=frame?null:r.end}));return;}if(id==="markOut"){setMarkRange(r=>({start:r.start!==null&&r.start>frame?null:r.start,end:frame+1}));return;}
    if(id==="clearIn"||id==="clearOut"||id==="clearMarks"){setMarkRange(r=>({start:id!=="clearOut"?null:r.start,end:id!=="clearIn"?null:r.end}));return;}
    if(id==="goIn"||id==="goOut"){seek(id==="goIn"?markRange.start??0:(markRange.end??duration)-1);return;}
    if(id==="markClip"||id==="markSelection"){const clips=id==="markClip"?[clipAtPlayhead(project,frame)].filter(c=>Boolean(c)):project.tracks.flatMap(t=>t.clips).filter(c=>selectedIds.includes(c.id));if(clips.length)setMarkRange({start:Math.min(...clips.map(c=>c!.from)),end:Math.max(...clips.map(c=>c!.from+c!.durationInFrames))});return;}
    const markers=project.markers??[];
    if(id==="marker"){if(!markers.some(m=>m.frame===frame))history.apply(p=>ops.setMarker(p,{id:ops.newId(),frame,label:`Marcador ${markers.length+1}`,color:"#5ab0ff"}));return;}
    if(id==="nextMarker"||id==="prevMarker"){const ordered=[...markers].sort((a,b)=>a.frame-b.frame),marker=id==="nextMarker"?ordered.find(m=>m.frame>frame):ordered.reverse().find(m=>m.frame<frame);if(marker)seek(marker.frame);return;}
    if(id==="deleteMarker"||id==="deleteMarkers"){const ids=markers.filter(m=>id==="deleteMarkers"||m.frame===frame).map(m=>m.id);history.apply(p=>ids.reduce((next,key)=>ops.deleteMarker(next,key),p));}
  };
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement;
      if(e.defaultPrevented||e.isComposing||target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[data-command-ui],.timeline-popover,.timeline-tool-menu,[role=separator]'))return;
      const chord=eventChord(e);if(!chord)return;
      const command=resolveCommand(shortcuts.settings.bindings,chord,activeScope.current);if(!command)return;
      e.preventDefault();if(e.repeat&&!command.repeat)return;
      runCommand(command.id);
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  });
  const captureScope=(target:EventTarget|null)=>{
    const el=target as HTMLElement;if(el.closest("[data-command-ui],dialog"))return;
    const scope=el.closest<HTMLElement>("[data-shortcut-scope]")?.dataset.shortcutScope as CommandScope|undefined;
    if(scope){activeScope.current=scope;if(scope==="timeline"||scope==="bin")selectionPanel.current=scope;}
  };

  return (
    <div ref={workspace.appRef} className={`app ${workspace.dragged ? "docking-panel" : ""}`} style={workspace.style} onPointerDownCapture={e=>captureScope(e.target)} onFocusCapture={e=>captureScope(e.target)} onPointerOver={e=>{const panel=(e.target as HTMLElement).closest<HTMLElement>("[data-workspace-panel]")?.dataset.workspacePanel as Panel|undefined;if(panel)hoveredPanel.current=panel;}}>
      <div className="app-chrome">
      <MenuBar run={runCommand} hint={shortcuts.hint} enabled={canRun}/>
      <header className="topbar">
        <div className="studio-brand" aria-label="UGC Studio"><span className="studio-mark" aria-hidden><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h9M5 12h14M10 17h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></span><span>UGC <b>Studio</b></span></div>
        <input
          className="project-name"
          aria-label="Nombre del proyecto"
          value={project.name}
          onChange={(e) => history.apply((p) => ({ ...p, name: e.target.value }))}
        />
        <div className="toolbar">
          <button onClick={history.undo} disabled={!history.canUndo} title={shortcuts.hint("undo")}>↶</button>
          <button onClick={history.redo} disabled={!history.canRedo} title={shortcuts.hint("redo")}>↷</button>
          <button onClick={split} title={shortcuts.hint("split")}>Cortar</button>
          <button onClick={() => addText()}>+ Texto</button>
          <button onClick={saveProjectFile}>Guardar</button>
          <button onClick={() => openInput.current?.click()}>Abrir</button>
          <input ref={openInput} type="file" accept=".json" hidden onChange={(e) => openProjectFile(e.target.files)} />
        </div>
        <div className="export">
          <button className="workspace-reset" aria-label="Restablecer paneles" onClick={workspace.reset} title="Restaurar posiciones y tamaños iniciales de los paneles"><svg viewBox="0 0 20 20" fill="none" aria-hidden><path d="M4 7a6 6 0 1 1 0 6M4 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Restablecer paneles</span></button>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="h264-high">MP4 H.264 · Alta calidad</option>
            <option value="h264-draft">MP4 H.264 · Borrador rápido</option>
            <option value="prores-hq">MOV ProRes 422 HQ</option>
          </select>
          <button className="primary" onClick={()=>runCommand("export")} disabled={render?.progress !== undefined && !render.url && !render.error}>
            Exportar <svg className="export-icon" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M6 14 14 6M6 6h8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </header>
      </div>
      {shortcutsOpen&&<ShortcutEditor settings={shortcuts.settings} onSave={shortcuts.setSettings} onClose={()=>setShortcutsOpen(false)}/>}
      {feedback&&<div className="command-feedback" role="status">{feedback}</div>}
      {actionDialog&&<ActionDialog title={actionDialog==="export"?"Exportar medios":actionDialog==="gain"?"Ganancia de audio":"Atajos y compatibilidad"} onClose={()=>setActionDialog(null)}>
        {actionDialog==="export"?<><p>{project.name} · {formatTimecode(duration,project.fps)} · {project.width}×{project.height}</p><label>Formato<select aria-label="Formato de exportación" value={preset} onChange={e=>setPreset(e.target.value as Preset)}><option value="h264-high">MP4 H.264 · Alta calidad</option><option value="h264-draft">MP4 H.264 · Borrador rápido</option><option value="prores-hq">MOV ProRes 422 HQ</option></select></label><p>Se guarda localmente en UGC Studio/Exportaciones.</p><footer><button onClick={()=>setActionDialog(null)}>Cancelar</button><button className="primary" onClick={()=>{setActionDialog(null);void startRender();}}>Iniciar exportación</button></footer></>:
        actionDialog==="gain"?<><label>Ajustar ganancia (dB)<input aria-label="Ajustar ganancia en decibelios" type="number" min={-60} max={12} step={1} value={gain} onChange={e=>setGain(Number(e.target.value))}/></label><p>Se aplica a la selección y a su audio enlazado. El control actual limita el volumen al 100%.</p><footer><button onClick={()=>setActionDialog(null)}>Cancelar</button><button onClick={()=>{if(!Number.isFinite(gain))return;const ids=ops.linkedIds(project,selectedIds);history.apply(p=>ids.reduce((next,id)=>{const c=ops.findClip(next,id)?.clip;return c&&(c.kind==="audio"||c.kind==="video"&&!c.linkedClipId)?ops.updateClip(next,id,{volume:Math.max(0,Math.min(1,c.volume*10**(Math.max(-60,Math.min(12,gain))/20)))}):next;},p));setActionDialog(null);}}>Aplicar</button></footer></>:
        <><p>Base de atajos Windows/QWERTY contrastada con la <a href="https://helpx.adobe.com/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html" target="_blank" rel="noreferrer">documentación de Adobe</a>. La tabla oficial no enumera todos los comandos internos de Premiere.</p><p>Azul indica comandos disponibles; ámbar, funciones pendientes. No se simulan efectos, keyframes o herramientas que todavía no existen. Shift+5 abre las propiedades actuales, no un panel completo de efectos.</p><p>El navegador puede reservar Ctrl+W, Ctrl+N, Ctrl+T y otras combinaciones. Puedes usar los menús o cambiarlas. Los rótulos US/ES cambian la vista; las asignaciones guardan posiciones físicas.</p><p>J revisa hacia atrás por fotogramas sin audio; K detiene y L reproduce adelante. I/O de Programa son marcas de sesión, no un rango de exportación. Los presets JSON de UGC Studio no son archivos .kys de Premiere.</p><footer><button onClick={()=>{setActionDialog(null);setShortcutsOpen(true);}}>Editar atajos</button><button onClick={()=>setActionDialog(null)}>Cerrar</button></footer></>}
      </ActionDialog>}

      {render && (
        <div className="render-status">
          {render.error ? (
            <span className="error">Error: {render.error}</span>
          ) : render.url ? (
            <span>
              ✓ Listo. Guardado en <b>UGC Studio/Exportaciones</b> ·{" "}
              <a href={render.url} target="_blank" rel="noreferrer">ver video</a> ·{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); openFolder("exports"); }}>abrir carpeta</a>
            </span>
          ) : (
            <span>Exportando… {Math.round(render.progress * 100)}%</span>
          )}
          <button onClick={() => setRender(null)}>×</button>
        </div>
      )}

      <div className="workspace-canvas" ref={workspace.canvasRef}>
      <aside className="panel bin dock-panel" {...workspace.panelProps("bin")} data-shortcut-scope="bin" tabIndex={-1}>
        <div className="panel-title">
          <div className="tabs">
            <button className={binTab === "proyecto" ? "active" : ""} onClick={() => setBinTab("proyecto")}>Proyecto</button>
            <button className={binTab === "foley" ? "active" : ""} onClick={() => setBinTab("foley")}>Foley</button>
          </div>
          {workspace.handle("bin")}
          {binTab === "proyecto" && (
            <div className="bin-controls">
              <button className={binView === "list" ? "active" : ""} onClick={() => setBinView("list")} title="Vista de lista">☰</button>
              <button className={binView === "grid" ? "active" : ""} onClick={() => setBinView("grid")} title="Vista de cuadrícula">▦</button>
              <button onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? "Optimizando…" : "Importar"}
              </button>
            </div>
          )}
          <input ref={fileInput} type="file" accept="video/*,audio/*" multiple hidden onChange={(e) => importFiles(e.target.files)} />
        </div>
        {binTab === "foley" && <FoleyPanel onAdd={addFoley} />}
        {binTab === "proyecto" && media.length === 0 && <p className="hint">Importa tus clips UGC, voces en off o música.</p>}
        {binTab === "proyecto" && <><p className="selection-hint" role="status">{selectedMedia.length ? `${selectedMedia.length} archivo${selectedMedia.length === 1 ? "" : "s"} seleccionado${selectedMedia.length === 1 ? "" : "s"}` : "Arrastra desde un espacio vacío para seleccionar"}</p><div ref={binSelection.ref} onMouseDownCapture={() => { selectionPanel.current = "bin"; }} onMouseDown={binSelection.onMouseDown} className={`bin-media ${binView}`} role="listbox" aria-label="Archivos del proyecto" aria-multiselectable>{media.map((m) => (
          <div
            key={m.src}
            className={`bin-item ${selectedMedia.includes(m.src) ? "source-selected" : ""} ${missing.has(m.src) ? "missing" : ""}`}
            data-selection-id={m.src}
            role="option"
            aria-selected={selectedMedia.includes(m.src)}
            aria-label={m.name}
            draggable={!missing.has(m.src)}
            onDragStart={(e) => {
              const ids = selectedMedia.includes(m.src) ? selectedMedia : [m.src];
              setSelectedMedia(ids);
              const items: MediaDrag[] = media.filter((item) => ids.includes(item.src)).map((item) => ({ src: item.src, kind: item.kind ?? "video", inFrame: 0, outFrame: item.durationInFrames, mode: "auto" }));
              if (items.some((item) => missing.has(item.src))) { e.preventDefault(); return; }
              e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify({ ...items[0], items }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={(e) => { setSelectedMedia(e.shiftKey || e.ctrlKey || e.metaKey ? toggleSelection(selectedMedia, m.src) : [m.src]); setSourceSrc(m.src); }}
            onDoubleClick={() => addMedia(m)}
            title="Clic: abrir en Origen · Arrastrar: colocar en la línea de tiempo · Doble clic: añadir"
          >
            {m.kind === "audio" ? <div className="bin-audio">♪</div> : <video src={m.proxySrc ?? m.src} muted preload="metadata" draggable={false} />}
            <div>
              <div className="bin-name">{m.name}</div>
              <div className="bin-dur">
                {formatTimecode(m.durationInFrames, project.fps)}
                {project.transcripts?.[m.src] ? " · transcrito" : ""}
              </div>
              {m.kind !== "audio" && !missing.has(m.src) && (
                <button
                  className="bin-broll"
                  onClick={(e) => {
                    e.stopPropagation();
                    addBroll(m);
                  }}
                  title="Añadir solo imagen en B2, donde está el cabezal (sin sonido)"
                >
                  + B2
                </button>
              )}
              {missing.has(m.src) && <div className="bin-missing">⚠ Archivo no encontrado. Impórtalo de nuevo y se reconecta solo.</div>}
            </div>
          </div>
        ))}{binSelection.box && <div className="selection-marquee" aria-hidden style={{ left: binSelection.box.x, top: binSelection.box.y, width: binSelection.box.width, height: binSelection.box.height }} />}</div></>}
        {binTab === "proyecto" && Object.values(project.sequences ?? {}).length > 0 && <section className="bin-sequences" aria-label="Secuencias del proyecto"><strong>Secuencias</strong>{Object.values(project.sequences ?? {}).map((sequence) => <div className="bin-sequence" key={sequence.id} draggable={sequence.id !== editingSequenceId} onDragStart={(e) => { e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify({ src: "", kind: "video", inFrame: 0, outFrame: sequence.durationInFrames, mode: "auto", sequenceId: sequence.id })); e.dataTransfer.effectAllowed = "copy"; }}>
          <span>▤ {sequence.name} · {formatTimecode(sequence.durationInFrames, project.fps)}</span>
          <button aria-label={`Abrir secuencia ${sequence.name}`} disabled={sequence.id === editingSequenceId} onClick={() => { recording.cancel(); setEditingSequenceId(sequence.id); setSelectedIds([]); seek(0); }}>Abrir</button>
          <button aria-label={`Colocar secuencia ${sequence.name}`} disabled={sequence.id === editingSequenceId} title={timelinePreferences.nestSequences ? "Colocar como bloque anidado" : "Colocar como clips individuales"} onClick={() => { const target = destinationTrack(project, "video"); if (target) history.apply((p) => ops.placeSequence(p, sequence.id, target, frame, timelinePreferences.nestSequences, editingSequenceId ?? undefined)); }}>Colocar</button>
        </div>)}</section>}
        <AIPanel project={project} apply={history.apply} />
      </aside>

      <main className="monitor dock-panel" {...workspace.panelProps("monitor")}>
        <div className="monitor-toolbar">
          <span>Monitores</span>
          {workspace.handle("monitor")}
          <button className={monitorLayout === "split" ? "active" : ""} onClick={() => setMonitorLayout("split")}>Dos visores</button>
          <button className={monitorLayout === "tabs" ? "active" : ""} onClick={() => setMonitorLayout("tabs")}>Pestañas</button>
          {monitorLayout === "tabs" && <>
            <button className={monitorTab === "source" ? "active" : ""} onClick={() => setMonitorTab("source")}>Origen</button>
            <button className={monitorTab === "program" ? "active" : ""} onClick={() => setMonitorTab("program")}>Programa</button>
          </>}
        </div>
        <div className={`monitor-view ${monitorLayout === "tabs" ? "tabbed" : "split"}`}>
          <div className="source-pane" data-shortcut-scope="source" tabIndex={-1} style={{ display: monitorLayout === "tabs" && monitorTab !== "source" ? "none" : undefined }}>
            <SourceMonitor
              ref={sourceRef}
              hint={shortcuts.hint}
              onActivate={()=>transport("stop")}
              key={sourceMedia?.src ?? "empty"}
              media={sourceMedia}
              fps={project.fps}
              onInsert={(trackId, inFrame, outFrame, videoOnly) => { const target = destinationTrack(project, trackId === "A0" ? "audio" : "video"); if (sourceMedia && target) addSource(sourceMedia, target, frame, inFrame, outFrame, videoOnly); }}
              onDragStart={(e, inFrame, outFrame, mode) => sourceMedia && startMediaDrag(e, sourceMedia, inFrame, outFrame, mode)}
            />
          </div>
          <div className="program-pane" data-shortcut-scope="program" tabIndex={-1} style={{ display: monitorLayout === "tabs" && monitorTab !== "program" ? "none" : undefined }}>
            <div className="monitor-label" title={project.name}>Programa · {project.name}</div>
            <ProgramMonitor project={project} duration={duration} frame={frame} playerRef={playerRef} programRef={programRef} playbackRate={playbackRate} onSeek={seek} onCommand={id=>runCommand(id,"program")} hint={shortcuts.hint} marks={markRange}/>
          </div>
        </div>
      </main>

      <aside className="panel inspector dock-panel" {...workspace.panelProps("inspector")} tabIndex={-1}>
        <div className="panel-title">
          <div className="tabs">
            <button className={rightTab === "chat" ? "active" : ""} onClick={() => setRightTab("chat")}>Chat IA</button>
            <button className={rightTab === "propiedades" ? "active" : ""} onClick={() => setRightTab("propiedades")}>Propiedades</button>
            <button className={rightTab === "vision" ? "active" : ""} onClick={() => setRightTab("vision")}>Visión</button>
            <button className={rightTab === "audio" ? "active" : ""} onClick={() => setRightTab("audio")}>Audio</button>
          </div>
          {workspace.handle("inspector")}
        </div>
        {/* El chat queda montado al cambiar de pestaña para no perder la conversación */}
        <div style={{ display: rightTab === "chat" ? "contents" : "none" }}>
          <ChatPanel
            ctx={() => ({
              ...assistantContext(),
              undo: history.undo,
              media,
              fetchFoley: () => fetch("/api/library").then((r) => r.json()).then((d) => d.folders ?? []),
              readDuration: (src) => readDurationInFrames(src, project.fps),
            })}
          />
        </div>
        <div style={{ display: rightTab === "vision" ? "contents" : "none" }}>
          <LocalAssistantPanel mode="vision" ctx={assistantContext} project={project} result={visualResult} />
        </div>
        <div style={{ display: rightTab === "audio" ? "contents" : "none" }}>
          <LocalAssistantPanel mode="audio" ctx={assistantContext} project={project} result={visualResult} />
        </div>
        {rightTab === "propiedades" && <>
        {!selected && <p className="hint">{selectedIds.length > 1 ? `${selectedIds.length} clips seleccionados. Arrastra para moverlos juntos; Supr los borra. Ctrl/Cmd+Z deshace la operación.` : "Selecciona un clip en la línea de tiempo."}</p>}
        {selected?.kind === "text" && <TextInspector clip={selected} onChange={(patch) => history.apply((p) => ops.updateClip(p, selected.id, patch))} />}
        {selected?.kind === "caption" && (
          <CaptionInspector
            clip={selected}
            onText={(text) => history.apply((p) => ops.setCaptionText(p, selected.id, text))}
            onStyle={(patch) => history.apply((p) => ops.styleAllCaptions(p, patch))}
          />
        )}
        {selected?.kind === "audio" && <AudioInspector clip={selected} fps={project.fps} onChange={(patch) => history.apply((p) => ops.updateClip(p, selected.id, patch))} />}
        {selected?.kind === "video" && <VideoInspector clip={{ ...selected, volume: ops.effectiveVolume(project, selected) }} fps={project.fps} onChange={(patch) => history.apply((p) => ops.updateClip(p, selected.id, patch))} />}
        <div className="shortcuts">
          <button onClick={()=>setShortcutsOpen(true)}>Ver y editar atajos</button>
        </div>
        </>}
      </aside>

      <section className="timeline-area dock-panel" {...workspace.panelProps("timeline")} data-shortcut-scope="timeline" tabIndex={-1} onMouseDownCapture={() => { selectionPanel.current = "timeline"; }}>
        {editingSequenceId && <div className="sequence-navigation"><span>Editando secuencia: {project.name}</span><button onClick={() => { recording.cancel(); setEditingSequenceId(null); setSelectedIds([]); seek(0); }}>Volver al montaje</button></div>}
        <div className="timeline-panel-header"><strong>Timeline</strong>{workspace.handle("timeline")}<div className="track-add-controls"><button aria-label="Añadir pista de video" title="Añadir otra pista B" onClick={() => addTrack("video")}>+ B</button><button aria-label="Añadir pista de audio" title="Añadir otra pista Audio" onClick={() => addTrack("audio")}>+ Audio</button></div><span className="timeline-selection-status" role="status">{TIMELINE_TOOLS.find((item) => item.id === tool)?.label} · {selectedIds.length ? `${selectedIds.length} clip${selectedIds.length === 1 ? "" : "s"} seleccionado${selectedIds.length === 1 ? "" : "s"}` : "Sin selección"}</span></div>
        <TimelineToolbar hint={shortcuts.hint} project={project} frame={frame} preferences={timelinePreferences} onPreferences={updateTimelinePreferences} onSeek={seek} onMarker={(marker) => history.apply((p) => ops.setMarker(p, marker))} onDeleteMarker={(id) => history.apply((p) => ops.deleteMarker(p, id))} onLink={(linked) => history.apply((p) => ops.linkClips(p, linked ? selectedIds : ops.linkedIds(p, selectedIds), linked))} canLink={selectedIds.length === 2 && selectedIds.some((id) => ops.findClip(project, id)?.clip.kind === "video") && selectedIds.some((id) => ops.findClip(project, id)?.clip.kind === "audio")} canUnlink={selectedIds.some((id) => { const clip = ops.findClip(project, id)?.clip; return clip && (clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId; })} hasSelection={selectedIds.length > 0} onCreateSequence={(name) => history.apply((p) => ops.createSequence(p, selectedIds, name))}/>
        {(recording.state || recording.error) && <div className="recording-status" role="status">
          {recording.state ? <><span>{recording.state.phase === "permission" ? "Permite el micrófono en el navegador" : recording.state.phase === "saving" ? "Guardando voz localmente…" : `● Grabando ${recording.state.seconds} s`}</span>{recording.state.phase === "recording" && <button onClick={recording.stop}>Detener y añadir</button>}<button onClick={recording.cancel}>Cancelar</button></> : <span>{recording.error}</span>}
          {recording.recovery && <a href={recording.recovery} download="Grabacion-recuperada.webm">Descargar grabación</a>}
        </div>}
        <div className="timeline-workspace">
        <TimelineTools hint={shortcuts.hint} tool={tool} onTool={setTool} onFit={fitTimeline} onZoom={(factor) => setPxPerFrame((value) => Math.max(0.02, Math.min(20, value * factor)))} />
        <div className="timeline-main">
        <Timeline
          project={project}
          revealTrackId={revealTrackId}
          onTrackChange={(id, patch) => history.apply((p) => ops.setTrackState(p, id, patch))}
          onRecord={(id) => { if (recording.state?.track === id) recording.stop(); else if (!project.tracks.find((t) => t.id === id)?.locked) void recording.start(id, frame, project.fps); }}
          recordingTrack={recording.state?.track ?? null}
          frame={frame}
          selectedIds={selectedIds}
          pxPerFrame={pxPerFrame}
          tool={tool}
          snapping={snapping}
          preferences={timelinePreferences}
          gestures={shortcuts.settings.gestures}
          markRange={markRange}
          onTrackHeight={height=>updateTimelinePreferences({trackHeight:height})}
          onSeek={seek}
          isolatedSelection={isolatedSelection}
          onSelect={(ids,isolated=false)=>{setSelectedIds(ids);setIsolatedSelection(isolated);}}
          onDuplicate={(ids,delta,offset,follow)=>{const before=history.current(),result=ops.duplicateClipsWithSelection(before,ids,delta,offset,follow);if(result.project===before)return;history.apply(()=>result.project);setSelectedIds(result.ids);setIsolatedSelection(!follow);}}
          onMove={(ids, delta, offset, follow) => history.apply((p) => ops.editSelection(p, ids, follow, (current) => ops.moveClips(current, ids, delta, offset)))}
          onTrim={(id, edge, delta, ripple, follow) => history.apply((p) => ops.editSelection(p, [id], follow, (current) => (ripple ? ops.rippleTrimClip : ops.trimClip)(current, id, edge, delta)))}
          onSlip={(id, delta, follow) => history.apply((p) => ops.editSelection(p, [id], follow, (current) => ops.slipClip(current, id, delta)))}
          onSplit={(id, at) => history.apply((p) => ops.editSelection(p, id ? [id] : p.tracks.flatMap((t) => t.clips.map((c) => c.id)), linkedSelection, (current) => ops.splitAt(current, at, id)))}
          onAddText={addText}
          onZoom={(factor) => setPxPerFrame((value) => Math.max(0.02, Math.min(20, value * factor)))}
          onDropMedia={dropMedia}
          waveforms={waveforms}
        />
        </div></div>
      </section>
      <section className="meter-panel dock-panel" {...workspace.panelProps("meter")} aria-label="Panel de audio · dBFS" tabIndex={-1}>
        <div className="workspace-panel-title"><strong>dBFS</strong>{workspace.handle("meter")}</div>
        <AudioMeter programRef={programRef} />
      </section>
      {workspace.overlays}
      </div>
    </div>
  );
}

function TextInspector({ clip, onChange }: { clip: TextClip; onChange: (patch: Partial<TextClip>) => void }) {
  const style = (patch: Partial<TextClip["style"]>) => onChange({ style: { ...clip.style, ...patch } });
  return (
    <div className="fields">
      <label>Texto<textarea value={clip.text} onChange={(e) => onChange({ text: e.target.value })} /></label>
      <label>Tamaño<input type="number" value={clip.style.fontSize} onChange={(e) => style({ fontSize: Number(e.target.value) })} /></label>
      <label>Color<input type="color" value={clip.style.color} onChange={(e) => style({ color: e.target.value })} /></label>
      <label>
        Fondo
        <input type="checkbox" checked={clip.style.background !== null} onChange={(e) => style({ background: e.target.checked ? "rgba(0,0,0,0.55)" : null })} />
      </label>
      <label>Posición vertical<input type="range" min={0.05} max={0.95} step={0.01} value={clip.style.y} onChange={(e) => style({ y: Number(e.target.value) })} /></label>
      <FontSelect value={clip.style.fontFamily} onChange={(fontFamily) => style({ fontFamily })} />
    </div>
  );
}

function CaptionInspector({
  clip,
  onText,
  onStyle,
}: {
  clip: CaptionClip;
  onText: (text: string) => void;
  onStyle: (patch: Partial<CaptionStyle>) => void;
}) {
  const s = clip.style;
  return (
    <div className="fields">
      <label>
        Texto de este bloque
        <textarea
          key={clip.id}
          defaultValue={clip.words.map((w) => w.text).join(" ")}
          onBlur={(e) => onText(e.target.value)}
        />
      </label>
      <div className="hint">El estilo se aplica a todos los subtítulos:</div>
      <label>
        Estilo
        <select value={s.preset} onChange={(e) => onStyle({ preset: e.target.value as CaptionStyle["preset"] })}>
          {CAPTION_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label>Tamaño<input type="number" value={s.fontSize} onChange={(e) => onStyle({ fontSize: Number(e.target.value) })} /></label>
      <label>Color<input type="color" value={s.color} onChange={(e) => onStyle({ color: e.target.value })} /></label>
      <label>Color resaltado<input type="color" value={s.highlightColor} onChange={(e) => onStyle({ highlightColor: e.target.value })} /></label>
      <label className="row"><input type="checkbox" checked={s.uppercase} onChange={(e) => onStyle({ uppercase: e.target.checked })} /> MAYÚSCULAS</label>
      <label className="row"><input type="checkbox" checked={s.stroke} onChange={(e) => onStyle({ stroke: e.target.checked })} /> Contorno negro</label>
      <label>Posición vertical<input type="range" min={0.05} max={0.95} step={0.01} value={s.y} onChange={(e) => onStyle({ y: Number(e.target.value) })} /></label>
      <FontSelect value={s.fontFamily} onChange={(fontFamily) => onStyle({ fontFamily })} />
    </div>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (fontFamily: string) => void }) {
  const current = primaryFamily(value);
  return (
    <label>
      Tipografía
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        {!FONT_FAMILIES.includes(current) && <option value={current}>{current}</option>}
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
    </label>
  );
}

function AudioInspector({ clip, fps, onChange }: { clip: AudioClip; fps: number; onChange: (patch: Partial<AudioClip>) => void }) {
  const seconds = (frames: number) => Math.round((frames / fps) * 10) / 10;
  return (
    <div className="fields">
      <div className="bin-name">♪ {clip.name}</div>
      <div className="bin-dur">Duración: {formatTimecode(clip.durationInFrames, fps)}</div>
      <label>
        Volumen · {Math.round(clip.volume * 100)}%
        <input type="range" min={0} max={1} step={0.01} value={clip.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
      </label>
      <label>
        Fade in (segundos)
        <input type="number" min={0} step={0.1} value={seconds(clip.fadeIn)} onChange={(e) => onChange({ fadeIn: Math.round(Number(e.target.value) * fps) })} />
      </label>
      <label>
        Fade out (segundos)
        <input type="number" min={0} step={0.1} value={seconds(clip.fadeOut)} onChange={(e) => onChange({ fadeOut: Math.round(Number(e.target.value) * fps) })} />
      </label>
      <div className="hint">Puedes moverlo entre pistas de audio. Si está enlazado con un video, ambos conservan su sincronía.</div>
    </div>
  );
}

function VideoInspector({ clip, fps, onChange }: { clip: VideoClip; fps: number; onChange: (patch: Partial<VideoClip>) => void }) {
  return (
    <div className="fields">
      <div className="bin-name">{clip.name}</div>
      <div className="bin-dur">Inicio en archivo: {formatTimecode(clip.trimStart, fps)}</div>
      <div className="bin-dur">Duración: {formatTimecode(clip.durationInFrames, fps)}</div>
      <label>Volumen<input type="range" min={0} max={1} step={0.01} value={clip.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} /></label>
    </div>
  );
}
