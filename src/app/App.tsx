import {EffectControls} from "./EffectControls";
import {EffectsPanel} from "./EffectsPanel";
import {AudioTrackMixer} from "./AudioTrackMixer";
import {TextPanel} from "./TextPanel";
import {SearchPanel} from "./SearchPanel";
import {CommittedNumber} from "./CommittedNumber";
import {presetById,type ClipEffects} from "../project/effects";
import {PANEL_LABEL} from "./workspaceLayout";
import {editAvailable} from "./editAvailability";
import { type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import * as ops from "../project/ops";
import {
  createEmptyProject,
  getProjectDuration,
  destinationTrack,
  clipAtPlayhead,
  type AudioClip,
  type GraphicClip,
  sourceFrame,
  type CaptionClip,
  type CaptionStyle,
  type Project,
  type TextClip,
  type VideoClip,
} from "../project/types";
import { AIPanel, CAPTION_PRESETS } from "./AIPanel";
import { FoleyPanel, openFolder } from "./FoleyPanel";
import { ChatPanel, type ChatActivity } from "./chat/ChatPanel";
import { Mascot } from "./Mascot";
import { AssistantLauncher } from "./AssistantLauncher";
import { FONT_FAMILIES, primaryFamily } from "../remotion/fonts";
import { ProgramMonitor } from "./ProgramMonitor";
import { SourceMonitor, type SourceHandle } from "./SourceMonitor";
import { MEDIA_DRAG_TYPE, Timeline, formatTimecode, type MediaDrag } from "./Timeline";
import {useDocuments} from "./useDocuments";
import {DocumentBank,type TimelineView} from "./documentBank";
import { LocalAssistantPanel } from "./LocalAssistantPanel";
import type { AssistantContext, VisualResult } from "./localAssistant";
import { ProjectPanel, type ProjectPanelHandle } from "./ProjectPanel";
import {UiDocument} from "./UiDocument";
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
import { EditContextMenu, EditingDialog, type EditDialogKind } from "./EditingActions";
import { ActionDialog } from "./ActionDialog";
import { useShuttle } from "./useShuttle";
import type { Panel } from "./workspaceLayout";
import { updateMonitorRange, sourceRange, type MonitorDragMode } from "./monitorRange";
import { assertProject, parseProjectFile, type ProjectMedia } from "../project/projectFile";
import { exportProject } from "./exportJob";
import { guardAssistantSession } from "./assistantSession";
import {timelineExtent,timelineScale} from "./timelineViewport";
import {placeMedia,previewMedia,placedMediaIds,dropDuration} from "./mediaPlacement";
import { useMonitorDrag } from "./useMonitorDrag";

type MediaItem = ProjectMedia;
type Preset = "h264-high" | "h264-draft" | "prores-hq";

const STORAGE_KEY = "ugc-studio:autosave";
const DOCUMENTS_KEY="ugc-studio:documents:v1";

const loadSaved = () => {
  let raw:string|null=null;
  try {
    raw=localStorage.getItem(DOCUMENTS_KEY);
    if(raw){const session=DocumentBank.parse(raw);return {session,data:{project:session.current.present,media:session.current.present.library?.media??[]},raw,error:""};}
    raw = localStorage.getItem(STORAGE_KEY);
    return {session:null,data:raw?parseProjectFile(raw):null,raw,error:""};
  } catch(error) {
    return {session:null,data:null,raw,error:`No se pudo recuperar el autoguardado. ${error instanceof Error?error.message:String(error)}`};
  }
};
const downloadText=(text:string,name:string)=>{
  const a=document.createElement("a"),url=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

const readDurationInFrames = (src: string, fps: number) =>
  new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const finish=(error?:Error)=>{clearTimeout(timer);const duration=v.duration;v.onloadedmetadata=null;v.onerror=null;v.removeAttribute("src");v.load();if(error)reject(error);else resolve(Math.max(1,Math.floor(duration*fps)));};
    const timer=setTimeout(()=>finish(new Error("El archivo no respondió al leer su duración.")),20000);
    v.onloadedmetadata = () => finish(!Number.isFinite(v.duration)||v.duration<=0?new Error("El archivo no tiene una duración válida."):undefined);
    v.onerror = () => finish(new Error("No se pudo leer el archivo"));
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
  const previousZoom=useRef<{scale:number;left:number}|null>(null);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(""),4500);return()=>clearTimeout(timer);},[feedback]);
  const saved = useMemo(loadSaved, []);
  const [storageIssue,setStorageIssue]=useState(saved.error),[autosaveBlocked,setAutosaveBlocked]=useState(Boolean(saved.error));
  const rootHistory = useDocuments(() => saved.session??new DocumentBank(ops.ensureProjectLibrary(saved.data?.project ?? createEmptyProject(),saved.data?.media??[])));
  const [editingSequenceId, setEditingSequenceId] = useState<string | null>(null);
  const documentEpoch=useRef(0),restoreSerial=useRef(0),navigationSelection=useRef<{epoch:number;frame:number;ids:string[]}|null>(null);
  const projectView = useCallback((root: Project): Project => editingSequenceId && root.sequences?.[editingSequenceId] ? { ...root.sequences[editingSequenceId], sequences: root.sequences, library: root.library } : root, [editingSequenceId]);
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
  const [effectDraft,setEffectDraft]=useState<{ids:string[];patch:ClipEffects}|null>(null),[mixDraft,setMixDraft]=useState<{id:string|null;volume:number}|null>(null),[effectTarget,setEffectTarget]=useState<string|null>(null);
  const renderProject=useMemo(()=>{let p=project;if(effectDraft)p=ops.setClipEffects(p,effectDraft.ids,effectDraft.patch);if(mixDraft)p=mixDraft.id?ops.setTrackMix(p,mixDraft.id,{volume:mixDraft.volume}):ops.setMasterVolume(p,mixDraft.volume);return p;},[project,effectDraft,mixDraft]);
  const gainSelection=useRef<{ids:string[];epoch:number}>({ids:[],epoch:0});
  const [contextMenu,setContextMenu]=useState<{x:number;y:number;ids:string[];at:number;epoch:number;trackId?:string}|null>(null);
  const [editingDialog,setEditingDialog]=useState<{kind:EditDialogKind;ids:string[];at:number;epoch:number;trackId?:string;rangeDuration?:number}|null>(null);
  const media=rootHistory.value.library!.media;
  const setMedia=useCallback((change:SetStateAction<MediaItem[]>)=>rootHistory.apply(p=>ops.setLibraryMedia(p,typeof change==="function"?change(p.library?.media??[]):change)),[rootHistory.apply]);
  const projectPanelRef=useRef<ProjectPanelHandle>(null),importFolder=useRef<string|undefined>(undefined);
  const [waveforms, setWaveforms] = useState<Record<string, string>>({});
  const [selectedIds, rawSetSelectedIds] = useState<string[]>([]);
  const [isolatedSelection, setIsolatedSelection] = useState(false);
  const setSelectedIds: typeof rawSetSelectedIds = useCallback((ids) => { if(typeof ids !== "function") setIsolatedSelection(false); rawSetSelectedIds(ids); },[]);
  const [revealTrackId, setRevealTrackId] = useState<string | null>(null);
  const migratedAudio = useRef(new Set<string>());
  const mediaInfo = useRef(new Map<string, Promise<boolean>>());
  const selectionPanel = useRef<"timeline" | "bin">("timeline");
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
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
  const [chatActivity,setChatActivity]=useState<ChatActivity>("idle");
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
  useEffect(()=>{if(editingSequenceId&&!rootHistory.value.sequences?.[editingSequenceId]){documentEpoch.current++;recording.cancel();setEditingSequenceId(null);setSelectedIds([]);setMarkRange({start:null,end:null});playerRef.current?.pause();setFrame(0);}},[editingSequenceId,rootHistory.value]);
  useEffect(() => {
    const valid = new Set(project.tracks.flatMap((t) => t.clips).map((c) => c.id));
    setSelectedIds((ids) => ids.every((id) => valid.has(id)) ? ids : ids.filter((id) => valid.has(id)));
  }, [project]);

  // Autoguardado en el navegador
  useEffect(() => {
    if(autosaveBlocked)return;
    try {
      localStorage.setItem(DOCUMENTS_KEY,rootHistory.bank.serialize());
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: rootHistory.value, media }));
      setStorageIssue("");
    } catch {
      setStorageIssue("No se pudo autoguardar en el navegador. Descarga una copia con Guardar para conservar tu trabajo.");
    }
  }, [rootHistory.revision, autosaveBlocked]);
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
    const epoch=documentEpoch.current;
    for (const m of media) {
      if (m.kind==="audio" || m.proxySrc || missing.has(m.src) || proxyRequested.current.has(m.src)) continue;
      proxyRequested.current.add(m.src);
      fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: m.src }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.proxySrc||documentEpoch.current!==epoch) return;
          rootHistory.annotate(p=>ops.annotateProjectProxy(p,m.src,data.proxySrc));
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
  }, [timelinePreferences.selectionFollowsPlayhead,currentProject]);

  // Sincroniza el cabezal con el reproductor; selección automática solo al buscar, no al reproducir.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onSeek = (e: { detail: { frame: number } }) => { setFrame(e.detail.frame);const nav=navigationSelection.current;if(nav&&nav.epoch===documentEpoch.current&&nav.frame===e.detail.frame){setSelectedIds(nav.ids);navigationSelection.current=null;}else selectAtPlayhead(e.detail.frame); };
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onSeek);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("seeked", onSeek);
    };
  }, [selectAtPlayhead,rootHistory.bank.active,editingSequenceId]);

  const seek = useCallback((f: number) => {
    restoreSerial.current++;navigationSelection.current=null;
    const at = Math.max(0, Math.min(getProjectDuration(history.current()) - 1, Math.round(f)));
    playerRef.current?.seekTo(at); setFrame(at); selectAtPlayhead(at);
  }, [selectAtPlayhead, history.current]);

  const assistantContext = (): AssistantContext => {
    const epoch=documentEpoch.current;
    return guardAssistantSession({
    getProject: history.current,
    commit: (next) => history.apply(() => next),
    selectedClipId: selectedId,
    selectedClipIds: selectedIds,
    currentFrame: frame,
    currentSequenceId: editingSequenceId,
    nestSequences: timelinePreferences.nestSequences,
    onSeek: seek,
    showPanel:panel=>workspace.showPanel(panel),
    showVisualResult: setVisualResult,
    registerMedia: (items) => setMedia((list) => [...list, ...items.filter((item) => !list.some((m) => m.src === item.src))]),
    },()=>documentEpoch.current===epoch);
  };
  const applyForSession=()=>{
    const epoch=documentEpoch.current;
    return guardAssistantSession({apply:history.apply},()=>documentEpoch.current===epoch).apply;
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const epoch=documentEpoch.current,folderId=importFolder.current;
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
        if(documentEpoch.current!==epoch)throw new Error("Cambiaste de proyecto durante la importación. Vuelve a importar el archivo en el montaje actual.");
        // Si es el mismo video que faltaba (mismo nombre), se reconecta en vez de duplicarse.
        const lost = media.find((m) => (m.originalName??m.name) === name && missing.has(m.src));
        if (lost) {
          history.apply((p) => ops.relinkMedia(p, lost.src, src, proxySrc));
          setMedia((list) => list.map((x) => (x.src === lost.src ? { ...x,src, originalName:name, durationInFrames, proxySrc, kind, hasAudio } : x)));
        } else {
          setMedia((m) => [...m, { src, name, originalName:name, durationInFrames, proxySrc, kind, hasAudio,folderId:rootHistory.current().library?.folders.some(f=>f.id===folderId)?folderId:undefined }]);
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
    if(dragged.documentEpoch!==undefined&&dragged.documentEpoch!==documentEpoch.current){setFeedback("El documento cambió desde que empezaste a arrastrar.");return;}
    if(dragged.timelineRange){
      try{if(dragged.timelineRange.documentEpoch!==documentEpoch.current)throw new Error("El documento cambió desde que empezaste a arrastrar.");assertProject(dragged.timelineRange.project);}catch(error){setFeedback(error instanceof Error?error.message:String(error));return;}
    }
    const items=dragged.items??[dragged];
    if(!dragged.timelineRange&&items.some(item=>!item.sequenceId&&!item.elementId&&(missing.has(item.src)||!media.some(m=>m.src===item.src))))return;
    const before=history.current(),next=placeMedia(before,dragged,trackId,at,{media,hostId:editingSequenceId??undefined,nested:timelinePreferences.nestSequences});
    if(next===before)setFeedback("No se puede colocar aquí: revisa el tipo de contenido y los candados de destino.");else{const shapes=previewMedia(before,dragged,trackId,at,{media,hostId:editingSequenceId??undefined,nested:timelinePreferences.nestSequences});history.apply(()=>next);setSelectedIds(placedMediaIds(before,next,shapes));setIsolatedSelection(dragged.mode!=="auto");}
  };

  const startMediaDrag = (e: React.DragEvent, m: MediaItem, inFrame = 0, outFrame = m.durationInFrames, mode: MediaDrag["mode"] = "auto") => {
    const payload: MediaDrag = { documentEpoch:documentEpoch.current,src: m.src, kind: m.kind ?? "video", inFrame, outFrame, mode };
    rangeDrag.beginNative(payload);e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };
  const programRangeDrag=(mode:MonitorDragMode):MediaDrag=>{
    const {inFrame,outFrame}=sourceRange(markRange,duration);
    return {src:"",kind:mode==="audio"?"audio":"video",mode,inFrame:0,outFrame:outFrame-inFrame,timelineRange:{project:ops.copyTimelineRange(project,inFrame,outFrame,mode),documentEpoch:documentEpoch.current}};
  };
  const startProgramRangeDrag=(e:React.DragEvent,mode:MonitorDragMode)=>{
    const payload=programRangeDrag(mode);
    if(!payload.timelineRange!.project.tracks.some(t=>t.clips.length)){e.preventDefault();setFeedback("El rango no contiene ese tipo de contenido.");return;}
    transport("stop");sourceRef.current?.command("stop");rangeDrag.beginNative(payload);e.dataTransfer.setData(MEDIA_DRAG_TYPE,JSON.stringify(payload));e.dataTransfer.effectAllowed="copy";
  };
  const placeProgramRange=(mode:MonitorDragMode)=>{const target=destinationTrack(project,mode==="audio"?"audio":"video");if(target)dropMedia(programRangeDrag(mode),target,frame);else setFeedback("Desbloquea una pista destino para colocar el rango.");};
  const rangeDrag=useMonitorDrag({gestures:shortcuts.settings.gestures,project,snapping:timelinePreferences.snapping,playhead:frame,pxPerFrame,session:documentEpoch.current,root:()=>workspace.find(".timeline-area")??null,onDrop:dropMedia,onActivate:element=>{workspace.activatePanel(element);activeScope.current="timeline";selectionPanel.current="timeline";element.closest<HTMLElement>("[data-shortcut-scope]")?.focus({preventScroll:true});}});
  const startRangePointer=(e:React.PointerEvent,payload:MediaDrag,clickToPlace=false)=>{
    transport("stop");sourceRef.current?.command("stop");
    if(workspace.find(".timeline-scroll")?.ownerDocument!==e.currentTarget.ownerDocument)return false;
    rangeDrag.start(e,payload,clickToPlace?()=>{const target=destinationTrack(history.current(),payload.mode==="audio"?"audio":"video");if(target)dropMedia(payload,target,frame);else setFeedback("Desbloquea una pista destino para colocar el rango.");}:undefined);
  };

  const addFoley = async (file: { name: string; src: string }) => {
    const apply=applyForSession();
    const durationInFrames = await readDurationInFrames(file.src, project.fps).catch(() => project.fps);
    apply((p) => ops.addAudioClip(p, { src: file.src, name: file.name, durationInFrames }, "A2", frame));
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
    const before=history.current(),next=ops.editSelection(before,selectedIds,linkedSelection,current=>ops.deleteClips(current,selectedIds,ripple));
    history.apply(()=>next);
    const remaining=selectedIds.filter(id=>ops.findClip(next,id));
    setSelectedIds(remaining);
    if(remaining.length)setFeedback("La selección contiene pistas bloqueadas. Desbloquea la pista y su pareja de audio/video para borrarlas.");
  };

  const exportController=useRef<AbortController|null>(null);
  useEffect(()=>()=>exportController.current?.abort(),[]);
  const startRender = async () => {
    if(exportController.current)return;
    const controller=new AbortController();exportController.current=controller;
    setRender({ progress: 0 });
    try{await exportProject(project,preset,setRender,{signal:controller.signal});}
    catch(error){if(!controller.signal.aborted)setRender({progress:0,error:error instanceof Error?error.message:String(error)});}
    finally{exportController.current=null;}
  };

  const saveProjectFile = () => {
    downloadText(JSON.stringify({project:rootHistory.current(),media},null,2),`${project.name}.ugcproj.json`);
  };

  const openProjectFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try{
    const data = parseProjectFile(await file.text());
    openDocument(ops.ensureProjectLibrary(data.project,data.media));
    setAutosaveBlocked(false);setStorageIssue("");
    }catch(error){setFeedback(`No se abrió el archivo. ${error instanceof Error?error.message:String(error)} Se conserva el montaje actual.`);}
    finally{if(openInput.current)openInput.current.value="";}
  };

  const transport=useShuttle({current:()=>playerRef.current?.getCurrentFrame()??frame,seek,play:()=>playerRef.current?.play(),pause:()=>playerRef.current?.pause(),toggle:()=>playerRef.current?.toggle(),rate:setPlaybackRate,fps:project.fps,end:duration});
  const focusPanel=(scope:CommandScope, panel:Panel)=>{workspace.showPanel(panel);activeScope.current=scope;selectionPanel.current=scope==="bin"?"bin":"timeline";requestAnimationFrame(()=>workspace.find(`[data-shortcut-scope="${scope}"]`)?.focus());};
  const timelineViewport=()=>workspace.find(".timeline-scroll");
  useEffect(()=>{workspace.find(".timeline-document-tabs button[aria-selected=true]")?.scrollIntoView({block:"nearest",inline:"nearest"});},[rootHistory.bank.active,editingSequenceId]);
  const changeZoom=(factor:number)=>{previousZoom.current=null;const extent=timelineExtent(project.fps,duration,rangeDrag.hover?rangeDrag.hover.at+dropDuration(rangeDrag.hover.payload):duration);setPxPerFrame(z=>timelineScale(z,factor,timelineViewport()?.clientWidth??800,extent));};
  const fitTimeline=()=>{const viewport=timelineViewport();if(previousZoom.current){setPxPerFrame(previousZoom.current.scale);const left=previousZoom.current.left;requestAnimationFrame(()=>{if(viewport)viewport.scrollLeft=left;});previousZoom.current=null;}else{previousZoom.current={scale:pxPerFrame,left:viewport?.scrollLeft??0};if(viewport)viewport.scrollLeft=0;setPxPerFrame(timelineScale(1,((viewport?.clientWidth??800)-30)/duration,viewport?.clientWidth??800,timelineExtent(project.fps,duration)));}};
  const canRun=(id:string)=>id==="reopenProject"?rootHistory.bank.closed.length>0:activeScope.current==="source"&&["marker","nextMarker","prevMarker","deleteMarker","deleteMarkers"].includes(id)?false:["bin","source"].includes(activeScope.current)&&["copy","cut","paste","duplicate","subsequence","gain","link","group","ungroup","speed","channels","nest","hold","holdTail","holdInsert"].includes(id)?false:activeScope.current==="bin"&&["delete","rippleDelete"].includes(id)?Boolean(projectPanelRef.current?.can("binDelete")):COMMANDS.find(c=>c.id===id)?.scope==="bin"?(projectPanelRef.current?.can(id)??false):id==="undo"?history.canUndo:id==="redo"?history.canRedo:["copy","cut","delete","rippleDelete","duplicate","subsequence","gain","link","group","ungroup","speed","channels","nest","hold","holdTail","holdInsert"].includes(id)?editAvailable(project,selectedIds,id):id==="paste"?Boolean(clipboard.current):["overwrite","insert"].includes(id)?Boolean(sourceMedia):id==="export"?!render||Boolean(render.url||render.error):true;
  const captureView=()=>{const v=rootHistory.bank.current.view,scroll=timelineViewport();v.active=editingSequenceId;v.timelines[editingSequenceId??"$root"]={sequenceId:editingSequenceId,frame,scale:pxPerFrame,left:scroll?.scrollLeft??0,top:scroll?.scrollTop??0,selection:[...selectedIds],marks:{...markRange},source:sourceSrc,isolated:isolatedSelection};};
  const stopDocument=()=>{documentEpoch.current++;recording.cancel();transport("stop");sourceRef.current?.command("stop");setContextMenu(null);setEditingDialog(null);setActionDialog(null);setEffectDraft(null);setMixDraft(null);setEffectTarget(null);setChatActivity("idle");migratedAudio.current.clear();proxyRequested.current.clear();previousZoom.current=null;};
  const restoreView=()=>{const request=++restoreSerial.current,epoch=documentEpoch.current;const d=rootHistory.bank.current;const id=d.view.active&&d.present.sequences?.[d.view.active]?d.view.active:null;const v=d.view.timelines[id??"$root"];const f=Math.min(v?.frame??0,getProjectDuration(id?d.present.sequences![id]:d.present)-1);setEditingSequenceId(id);setFrame(Math.max(0,f));setPxPerFrame(v?.scale??2);setSelectedIds(v?.selection??[]);setIsolatedSelection(v?.isolated===true);setSourceSrc(v?.source??null);setMarkRange(v?.marks??{start:null,end:null});setRevealTrackId(null);setVisualResult(null);setTool("select");requestAnimationFrame(()=>{if(request!==restoreSerial.current||epoch!==documentEpoch.current)return;navigationSelection.current={epoch,frame:Math.max(0,f),ids:v?.selection??[]};const el=timelineViewport();if(el){el.scrollLeft=v?.left??0;el.scrollTop=v?.top??0;}playerRef.current?.seekTo(Math.max(0,f));});};
  const switchTimeline=(documentId:string,sequenceId:string|null,locate?:{clipId:string;trackId:string})=>{if(documentId===rootHistory.bank.active&&sequenceId===editingSequenceId&&!locate)return;captureView();stopDocument();rootHistory.activate(documentId);const d=rootHistory.bank.current;d.view.active=sequenceId;if(!d.view.tabs.includes(sequenceId))d.view.tabs.push(sequenceId);if(locate){const p=sequenceId?d.present.sequences![sequenceId]:d.present,c=ops.findClip(p,locate.clipId)?.clip;if(c){const key=sequenceId??"$root",old=d.view.timelines[key],scale=old?.scale??2,el=timelineViewport(),index=[...p.tracks].reverse().findIndex(t=>t.id===locate.trackId);d.view.timelines[key]={sequenceId,frame:c.from,scale,left:Math.max(0,c.from*scale-(el?.clientWidth??800)*.2),top:Math.max(0,(index+1)*timelinePreferences.trackHeight-(el?.clientHeight??200)),selection:[c.id],isolated:true,marks:old?.marks??{start:null,end:null},source:old?.source??null};}}restoreView();};
  const openDocument=(p:Project)=>{captureView();stopDocument();rootHistory.open(p);restoreView();};
  const closeDocument=(id:string)=>{captureView();stopDocument();if(rootHistory.bank.entries.length===1)rootHistory.open(ops.ensureProjectLibrary(createEmptyProject()));rootHistory.close(id);restoreView();};
  const closeTimeline=(documentId:string,id:string|null)=>{if(id===null){closeDocument(documentId);return;}const d=rootHistory.bank.entries.find(e=>e.id===documentId);if(!d)return;if(documentId===rootHistory.bank.active&&id===editingSequenceId)switchTimeline(documentId,null);d.view.tabs=d.view.tabs.filter(t=>t!==id);rootHistory.refresh();};
  const focusAssistant=()=>requestAnimationFrame(()=>{const input=workspace.find(".chat-input textarea");if(input?.offsetParent)input.focus();else workspace.find(".assistant-header button")?.focus();});
  const openAssistant=()=>{setRightTab("chat");workspace.showPanel("inspector");focusAssistant();};
  const runCommand=(id:string,scope:CommandScope=activeScope.current)=>{
    const command=COMMANDS.find(c=>c.id===id);if(command?.pending){setFeedback(command.pending);return;}
    if(scope==="bin"&&(["selectAll","deselect","delete","rippleDelete"].includes(id)||command?.scope==="bin"&&!["binList","binGrid","binToggle"].includes(id))){projectPanelRef.current?.command(id);return;}
    if(!canRun(id))return;
    const sourceCommands=["play","stop","forwardPlay","reversePlay","markIn","markOut","goIn","goOut","clearIn","clearOut","clearMarks","markClip","markSelection","start","end",...[-1,1].flatMap(sign=>[1,5].map(n=>`step${sign<0?"Left":"Right"}${n}`))];
    if(scope==="source"&&sourceCommands.includes(id)){transport("stop");if(!sourceRef.current?.command(id))setFeedback("Selecciona un archivo en Proyecto para usar Origen.");return;}
    if(scope==="source"&&["marker","nextMarker","prevMarker","deleteMarker","deleteMarkers"].includes(id)){setFeedback("Los marcadores del archivo de origen están pendientes; los del montaje se editan desde Timeline o Programa.");return;}
    if(transport(id)){sourceRef.current?.command("stop");return;}
    if(id==="shortcuts"||id==="find"){setShortcutsOpen(true);return;}
    if(id==="help"){setActionDialog("help");return;}
    if(id==="newProject"){openDocument(ops.ensureProjectLibrary(createEmptyProject()));return;}
    if(id==="closeProject"){closeDocument(rootHistory.bank.active);return;}
    if(id==="reopenProject"){captureView();stopDocument();if(rootHistory.reopen())restoreView();return;}
    if(id==="open"){openInput.current?.click();return;}if(id==="import"){importFolder.current=projectPanelRef.current?.folder();fileInput.current?.click();return;}
    if(["save","saveAs","saveCopy"].includes(id)){saveProjectFile();return;}
    if(id==="export"){setActionDialog("export");return;}
    if(id==="undo"){history.undo();return;}if(id==="redo"){history.redo();return;}
    if(id==="maximize"||id==="maximizeFocused"){const focused=(workspace.activeDocument.activeElement as HTMLElement)?.closest<HTMLElement>("[data-workspace-panel]")?.dataset.workspacePanel as Panel|undefined;workspace.toggleMax(id==="maximize"?hoveredPanel.current:focused??(scope==="source"||scope==="program"?"monitor":scope==="bin"?"bin":"timeline"));return;}if(id==="resetWorkspace"){workspace.reset();return;}if(id==="windowPresets"){workspace.settings();return;}
    if(id==="bin"){setBinTab("proyecto");focusPanel("bin","bin");return;}
    if(id==="source"||id==="program"){setMonitorTab(id);focusPanel(id,"monitor");return;}
    if(id==="timeline"){focusPanel("timeline","timeline");return;}
    if(id==="chat"){openAssistant();return;}
    if(["properties","propertiesPanel","audioPanel","textPanel","effectsPanel","trackMixer","searchPanel"].includes(id)){const panel:Panel=id==="properties"?"effectControls":id==="propertiesPanel"?"properties":id==="audioPanel"?"essentialSound":id==="textPanel"?"text":id==="effectsPanel"?"effects":id==="trackMixer"?"mixer":"search";focusPanel(panel==="mixer"?"mixer":panel==="effects"?"effects":"effectControls",panel);return;}
    if(id==="meter"){workspace.showPanel("meter");requestAnimationFrame(()=>workspace.find(".meter-panel")?.focus());return;}
    if(id.startsWith("tool.")){setTool(id.slice(5) as TimelineTool);focusPanel("timeline","timeline");return;}
    if(id==="selectAll"){setSelectedIds(project.tracks.filter(t=>!t.locked).flatMap(t=>t.clips.map(c=>c.id)));return;}
    if(id==="deselect"){setSelectedIds([]);setTool("select");return;}
    if(id==="binList"||id==="binGrid"||id==="binToggle"){setBinView(v=>id==="binToggle"?(v==="grid"?"list":"grid"):id==="binGrid"?"grid":"list");return;}
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
    if(["group","ungroup"].includes(id)){history.apply(p=>ops.groupClips(p,selectedIds,id==="group"));return;}
    if(["newSequence","speed","channels"].includes(id)){setEditingDialog({kind:id as EditDialogKind,ids:selectedIds,at:frame,epoch:documentEpoch.current});return;}
    if(id==="gain"){gainSelection.current={ids:[...selectedIds],epoch:documentEpoch.current};setGain(0);setActionDialog("gain");return;}
    if(id==="text"){addText();return;}if(["rectangle","solid","adjustment"].includes(id)){history.apply(p=>ops.addGraphic(p,id as "rectangle"|"solid"|"adjustment",frame));return;}if(["nest","hold","holdInsert"].includes(id)){setEditingDialog({kind:id as EditDialogKind,ids:selectedIds,at:frame,epoch:documentEpoch.current});return;}if(id==="holdTail"){const video=selectedIds.map(id=>ops.findClip(project,id)?.clip).find(c=>c?.kind==="video");if(video&&frame>=video.from&&frame<video.from+video.durationInFrames)history.apply(p=>ops.holdFrame(p,video.id,frame,"tail"));else setFeedback("Coloca el cabezal dentro del clip para congelar desde ese punto.");return;}
    if(id==="link"){const linked=selectedIds.some(id=>{const clip=ops.findClip(project,id)?.clip;return clip&&(clip.kind==="video"||clip.kind==="audio")&&clip.linkedClipId;});history.apply(p=>ops.linkClips(p,linked?ops.linkedIds(p,selectedIds):selectedIds,!linked));return;}
    if(id==="subsequence"){history.apply(p=>ops.createSequence(p,selectedIds,`Secuencia ${Object.keys(p.sequences??{}).length+1}`));return;}
    if(id==="overwrite"||id==="insert"){if(sourceMedia){const target=destinationTrack(project,sourceMedia.kind==="audio"?"audio":"video"),range=sourceRef.current?.range();if(target&&range)history.apply(p=>(id==="insert"?ops.insertSourceRange:ops.addSourceRange)(p,sourceMedia,target,frame,range.inFrame,range.outFrame));}return;}
    if(id==="matchFrame"){
      const clip=selected??clipAtPlayhead(project,frame);if(clip&&(clip.kind==="video"||clip.kind==="audio")&&!clip.sequenceId){const m=media.find(m=>m.src===clip.src);if(m){setSourceSrc(m.src);setMonitorTab("source");focusPanel("source","monitor");requestAnimationFrame(()=>sourceRef.current?.seek(sourceFrame(clip,Math.max(0,frame-clip.from))));}}return;
    }
    if(id==="snap"){setSnapping(v=>!v);return;}if(id==="linkedSelection"){setIsolatedSelection(false);updateTimelinePreferences({linkedSelection:!timelinePreferences.linkedSelection});return;}if(id==="followPlayhead"){updateTimelinePreferences({selectionFollowsPlayhead:!timelinePreferences.selectionFollowsPlayhead});return;}
    if(id==="selectAtPlayhead"){const clip=clipAtPlayhead(project,frame);setSelectedIds(clip?(linkedSelection?ops.linkedIds(project,[clip.id]):[clip.id]):[]);return;}
    if(id==="expandTracks"||id==="minimizeTracks"){updateTimelinePreferences({trackHeight:id==="expandTracks"?120:36});return;}
    if(id==="zoomIn"||id==="zoomOut"){changeZoom(id==="zoomIn"?1.25:.8);return;}if(id==="fit"){fitTimeline();return;}
    if(id==="pageNext"||id==="pagePrev"){const viewport=timelineViewport();if(viewport)viewport.scrollLeft+=(id==="pageNext"?1:-1)*viewport.clientWidth*.9;return;}
    if(/^(nudge|slip)(Left|Right)[15]$/.test(id)){const delta=(id.includes("Left")?-1:1)*Number(id.at(-1));history.apply(p=>ops.editSelection(p,selectedIds,linkedSelection,current=>{if(id.startsWith("nudge"))return ops.moveClips(current,selectedIds,delta);const done=new Set<string>();return selectedIds.reduce((next,clipId)=>{if(done.has(clipId))return next;ops.linkedIds(current,[clipId]).forEach(key=>done.add(key));return ops.slipClip(next,clipId,delta);},current);}));return;}
    if(/^step(Left|Right)[15]$/.test(id)){transport("stop");seek(frame+(id.includes("Left")?-1:1)*Number(id.at(-1)));return;}
    if(id==="start"||id==="end"){seek(id==="start"?0:duration-1);return;}
    if(["nextEdit","prevEdit","nextEditAll","prevEditAll","nextCaption","prevCaption"].includes(id)){const forward=id.startsWith("next"),captions=id.includes("Caption"),targets=[destinationTrack(project,"video"),destinationTrack(project,"audio")],points=[...new Set(project.tracks.filter(t=>captions||id.endsWith("All")||targets.includes(t.id)).flatMap(t=>t.clips.flatMap(c=>captions?(c.kind==="caption"?[c.from]:[]):[c.from,c.from+c.durationInFrames])))].sort((a,b)=>a-b);const point=forward?points.find(p=>p>frame):points.reverse().find(p=>p<frame);if(point!==undefined)seek(point);return;}
    if(["markIn","markOut","clearIn","clearOut","clearMarks"].includes(id)){setMarkRange(r=>updateMonitorRange(r,id,frame,duration));return;}
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
      if(e.defaultPrevented||e.isComposing||(target as Element).closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[data-command-ui],.timeline-popover,.timeline-tool-menu,[role=separator]'))return;
      const scopeNode=target.closest<HTMLElement>("[data-shortcut-scope]")??(target.ownerDocument!==document?[...target.ownerDocument.querySelectorAll<HTMLElement>("[data-shortcut-scope]")].find(n=>n.getClientRects().length):undefined);
      if(scopeNode)activeScope.current=scopeNode.dataset.shortcutScope as CommandScope;else if(target.closest("[data-workspace-panel]"))activeScope.current="app";
      const chord=eventChord(e);if(!chord)return;
      const command=resolveCommand(shortcuts.settings.bindings,chord,activeScope.current);if(!command)return;
      e.preventDefault();if(e.repeat&&!command.repeat)return;
      runCommand(command.id);
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  });
  const captureScope=(target:EventTarget|null)=>{
    workspace.activatePanel(target);
    const el=target as HTMLElement;if(el.closest("[data-command-ui],dialog"))return;
    const scope=el.closest<HTMLElement>("[data-shortcut-scope]")?.dataset.shortcutScope as CommandScope|undefined;
    if(scope){activeScope.current=scope;if(scope==="timeline"||scope==="bin")selectionPanel.current=scope;}else if(el.closest("[data-workspace-panel]"))activeScope.current="app";
  };
  const focusClickedPanel=(target:EventTarget|null)=>{
    captureScope(target);
    if(!(target as Element|null)?.closest)return;
    // Los clips y los recuadros cancelan mousedown para arrastrar: hay que trasladar
    // el foco explícitamente, sin robarlo a campos, botones o controles accesibles.
    if((target as Element).closest('input,textarea,select,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role=slider],[role=separator],[data-command-ui],dialog'))return;
    (target as Element).closest<HTMLElement>('[data-shortcut-scope]')?.focus({preventScroll:true});
  };

  useEffect(()=>{restoreView();},[]);
  const captureSession=useRef<()=>void>(()=>{});captureSession.current=()=>{captureView();if(!autosaveBlocked)try{localStorage.setItem(DOCUMENTS_KEY,rootHistory.bank.serialize());}catch{}};
  useEffect(()=>{const save=()=>captureSession.current();window.addEventListener("pagehide",save);return()=>window.removeEventListener("pagehide",save);},[]);
  const applyPreset=(id:string,clipId?:string,edge:"start"|"end"="start",seconds=.5)=>{try{const before=history.current(),next=ops.applyEffectPreset(before,clipId?[clipId]:selectedIds,id,Math.max(1,Math.round(seconds*before.fps)),edge);if(next===before)return;history.apply(()=>next);const changed=next.tracks.flatMap(t=>t.clips).filter(c=>c!==ops.findClip(before,c.id)?.clip).map(c=>c.id);setSelectedIds(changed);setIsolatedSelection(true);workspace.showPanel(presetById(id)?.audio?"essentialSound":changed.some(id=>{const c=ops.findClip(next,id)?.clip;return c?.kind==="graphic"&&c.shape==="adjustment";})?"properties":"effectControls");setFeedback(`Aplicado: ${presetById(id)?.name}`);}catch(error){setFeedback(error instanceof Error?error.message:String(error));}};
  const visualControls=<EffectControls key={`${documentEpoch.current}:${selectedId}`} project={project} clip={selected} locked={Boolean(selectedId&&ops.findClip(project,selectedId)?.track.locked)} onPreview={patch=>setEffectDraft(patch&&selectedId?{ids:[selectedId],patch}:null)} onChange={patch=>{if(selectedId)history.apply(p=>ops.setClipEffects(p,[selectedId],patch));}} onReset={()=>{if(selectedId)history.apply(p=>ops.resetClipEffects(p,[selectedId]));}} onTransition={(edge,value)=>{if(selectedId)history.apply(p=>ops.updateClip(p,selectedId,edge==="start"?{transitionIn:value??undefined}:{transitionOut:value??undefined}));}}/>;
  const utility=(id:Panel,scope:CommandScope,children:React.ReactNode)=>workspace.renderPanel(id,<section className={`dock-panel utility-panel utility-${id}`} {...workspace.panelProps(id)} data-shortcut-scope={scope} tabIndex={-1}><header className="workspace-panel-title"><strong>{PANEL_LABEL[id]}</strong>{workspace.handle(id)}</header><div className="utility-body">{children}</div></section>);
  const selectResult=(id:string,at:number)=>{seek(at);setSelectedIds([id]);setIsolatedSelection(true);setRevealTrackId(ops.findClip(project,id)?.track.id??null);};
  const propertiesContent=<fieldset className="utility-fields" disabled={Boolean(selectedId&&ops.findClip(project,selectedId)?.track.locked)}>
        {!selected && <p className="hint">{selectedIds.length > 1 ? `${selectedIds.length} clips seleccionados. Arrastra para moverlos juntos; ${shortcuts.hint("delete")} los borra. ${shortcuts.hint("undo")} deshace la operación.` : "Selecciona un clip en la línea de tiempo."}</p>}
        {selected?.kind === "graphic" && <GraphicInspector clip={selected} onChange={patch=>history.apply(p=>ops.updateClip(p,selected.id,patch))}/>}
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
        {visualControls}</fieldset>;
  const selectedAudio=selected?.kind==="audio"?selected:selected?.kind==="video"&&selected.linkedClipId?ops.findClip(project,selected.linkedClipId)?.clip:null;
  return (
    <UiDocument.Provider value={workspace.activeDocument}><div ref={workspace.appRef} className={`app ${workspace.dragged ? "docking-panel" : ""}`} style={workspace.style} onDragEndCapture={()=>rangeDrag.cancel()} onPointerDownCapture={e=>focusClickedPanel(e.target)} onFocusCapture={e=>captureScope(e.target)} onPointerOver={e=>{const panel=(e.target as HTMLElement).closest<HTMLElement>("[data-workspace-panel]")?.dataset.workspacePanel as Panel|undefined;if(panel)hoveredPanel.current=panel;}}>
      <div className="app-chrome">
      <MenuBar run={runCommand} hint={shortcuts.hint} enabled={canRun}/>
      <header className="topbar">
        <div className="studio-brand" aria-label="UGC Studio"><button className="studio-mark" aria-label="Abrir asistente" title="Abrir asistente" onClick={openAssistant}><Mascot/></button><span>UGC <b>Studio</b></span></div>
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
      {storageIssue&&<div className="storage-warning" role="alert">{storageIssue}{autosaveBlocked&&<> El original se conserva sin sobrescribir. Abre una copia válida para continuar el autoguardado. {saved.raw&&<button onClick={()=>downloadText(saved.raw!,"Recuperacion-autoguardado.json")}>Descargar copia de recuperación</button>}</>}</div>}
      {contextMenu&&<EditContextMenu {...contextMenu} project={project} onClose={()=>setContextMenu(null)} onLabel={color=>{if(contextMenu.epoch===documentEpoch.current)history.apply(p=>ops.labelClips(p,contextMenu.ids,color));}} onAction={action=>{
        if(contextMenu.epoch!==documentEpoch.current)return;
        const {ids,at,epoch,trackId}=contextMenu;
        if(["add","newSequence","nest","speed","channels","hold","holdInsert"].includes(action)){setEditingDialog({kind:action as EditDialogKind,ids,at,epoch,trackId});return;}
        if(action==="holdTail"||action==="unfreeze"){const c=ids.map(id=>ops.findClip(project,id)?.clip).find(c=>c?.kind==="video");if(c){if(action==="holdTail"&&(at<c.from||at>=c.from+c.durationInFrames)){setFeedback("Coloca el cabezal dentro del clip para congelar desde ese punto.");return;}history.apply(p=>action==="holdTail"?ops.holdFrame(p,c.id,at,"tail"):ops.updateClip(p,c.id,{freezeFrame:undefined}));}return;}
        if(action==="gain"){gainSelection.current={ids:[...ids],epoch};setGain(0);setActionDialog("gain");return;}
        runCommand(action,"timeline");
      }}/> }
      {editingDialog&&<EditingDialog key={`${editingDialog.kind}-${editingDialog.epoch}`} {...editingDialog} project={project} hostId={editingSequenceId??undefined} onClose={()=>setEditingDialog(null)} onApply={fn=>{if(editingDialog.epoch!==documentEpoch.current){setFeedback("El documento cambió; se descartó la operación.");return;}history.apply(p=>{const next=fn(p);if(next===p)setFeedback(editingDialog.kind==="nest"?"No se pudo anidar: revisa candados y selecciona también las capas intercaladas.":"No se aplicó el cambio. Revisa selección, pistas bloqueadas o referencias de secuencia.");else if(editingDialog.kind==="nest"){const old=new Set(p.tracks.flatMap(t=>t.clips.map(c=>c.id)));setSelectedIds(next.tracks.flatMap(t=>t.clips).filter(c=>(c.kind==="video"||c.kind==="audio")&&c.sequenceId&&!old.has(c.id)).map(c=>c.id));}return next;});}}/>}
      {actionDialog&&<ActionDialog title={actionDialog==="export"?"Exportar medios":actionDialog==="gain"?"Ganancia de audio":"Atajos y compatibilidad"} onClose={()=>setActionDialog(null)}>
        {actionDialog==="export"?<><p>{project.name} · {formatTimecode(duration,project.fps)} · {project.width}×{project.height}</p><label>Formato<select aria-label="Formato de exportación" value={preset} onChange={e=>setPreset(e.target.value as Preset)}><option value="h264-high">MP4 H.264 · Alta calidad</option><option value="h264-draft">MP4 H.264 · Borrador rápido</option><option value="prores-hq">MOV ProRes 422 HQ</option></select></label><p>Se guarda localmente en UGC Studio/Exportaciones.</p><footer><button onClick={()=>setActionDialog(null)}>Cancelar</button><button className="primary" onClick={()=>{setActionDialog(null);void startRender();}}>Iniciar exportación</button></footer></>:
        actionDialog==="gain"?<><label>Ajustar ganancia (dB)<input aria-label="Ajustar ganancia en decibelios" type="number" min={-60} max={12} step={1} value={gain} onChange={e=>setGain(Number(e.target.value))}/></label><p>Se aplica a la selección y a su audio enlazado. El máximo es +12 dB (400 %). El medidor puede indicar saturación.</p><footer><button onClick={()=>setActionDialog(null)}>Cancelar</button><button onClick={()=>{if(!Number.isFinite(gain))return;if(gainSelection.current.epoch!==documentEpoch.current){setFeedback("El documento cambió; no se aplicó la ganancia.");setActionDialog(null);return;}history.apply(p=>ops.setClipVolume(p,gainSelection.current.ids,10**(Math.max(-60,Math.min(12,gain))/20),true));setActionDialog(null);}}>Aplicar</button></footer></>:
        <><p>Base de atajos Windows/QWERTY contrastada con la <a href="https://helpx.adobe.com/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html" target="_blank" rel="noreferrer">documentación de Adobe</a>. La tabla oficial no enumera todos los comandos internos de Premiere.</p><p>Azul indica comandos disponibles; ámbar, funciones pendientes. No se simulan efectos, keyframes o herramientas que todavía no existen. Shift+5 abre los Controles de efectos disponibles. Los controles actuales son constantes; no hay automatización por keyframes.</p><p>El navegador puede reservar Ctrl+W, Ctrl+N, Ctrl+T y otras combinaciones. Puedes usar los menús o cambiarlas. Los rótulos US/ES cambian la vista; las asignaciones guardan posiciones físicas.</p><p>J revisa hacia atrás por fotogramas sin audio; K detiene y L reproduce adelante. I/O de Programa son marcas de sesión, no un rango de exportación. Los presets JSON de UGC Studio no son archivos .kys de Premiere.</p><footer><button onClick={()=>{setActionDialog(null);setShortcutsOpen(true);}}>Editar atajos</button><button onClick={()=>setActionDialog(null)}>Cerrar</button></footer></>}
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
          <button aria-label="Cerrar estado de exportación" disabled={!render.url&&!render.error} title={!render.url&&!render.error?"Espera a que termine la exportación":"Cerrar"} onClick={() => setRender(null)}>×</button>
        </div>
      )}

      <div className="workspace-canvas" ref={workspace.canvasRef}>
      {workspace.renderPanel("bin",<aside className="panel bin dock-panel" {...workspace.panelProps("bin")} data-shortcut-scope="bin" tabIndex={-1}>
        <div className="panel-title">
          <div className="tabs">
            <button className={binTab === "proyecto" ? "active" : ""} onClick={() => setBinTab("proyecto")}>Proyecto</button>
            <button className={binTab === "foley" ? "active" : ""} onClick={() => setBinTab("foley")}>Foley</button>
          </div>
          {workspace.handle("bin")}
          <input ref={fileInput} type="file" accept="video/*,audio/*" multiple hidden onChange={(e) => {void importFiles(e.currentTarget.files);e.currentTarget.value="";}} />
        </div>
        <div className="document-tabs" role="tablist" aria-label="Proyectos abiertos">{rootHistory.bank.entries.map(d=><button role="tab" aria-selected={d.id===rootHistory.bank.active} key={d.id} onClick={()=>switchTimeline(d.id,d.view.active)}>{d.present.name}</button>)}</div>
        {binTab === "foley" && <FoleyPanel onAdd={addFoley} />}
        {binTab === "proyecto" && <ProjectPanel onPointerMediaDrag={(e,payload,outside,onMoved,onClick)=>{if(workspace.find(".timeline-scroll")?.ownerDocument!==e.currentTarget.ownerDocument)return false;transport("stop");sourceRef.current?.command("stop");rangeDrag.start(e,payload,onClick,outside,onMoved);return true;}} onMediaDrag={payload=>{transport("stop");rangeDrag.beginNative(payload);}} ref={projectPanelRef} project={rootHistory.value} epoch={documentEpoch.current} editingSequenceId={editingSequenceId} missing={missing} view={binView} onView={setBinView} uploading={uploading} hint={shortcuts.hint}
          onApply={fn=>{const epoch=documentEpoch.current;rootHistory.apply(p=>{if(epoch!==documentEpoch.current)throw new Error("El documento cambió. Repite la operación.");return fn(p);});}}
          onImport={folder=>{importFolder.current=folder;fileInput.current?.click();}} onImportFiles={(files,folder)=>{importFolder.current=folder;void importFiles(files);}}
          onOpenMedia={(src,focus)=>{setSourceSrc(src);if(focus){setMonitorTab("source");focusPanel("source","monitor");}}}
          onPlaceItems={keys=>history.apply(p=>{const next=ops.placeProjectItems(p,keys,frame,editingSequenceId??undefined,timelinePreferences.nestSequences);if(next===p)setFeedback("No se pudo colocar la selección. Revisa destinos, candados y secuencias compatibles.");return next;})}
          onOpenSequence={id=>switchTimeline(rootHistory.bank.active,id)}
          onLocate={use=>{switchTimeline(rootHistory.bank.active,use.sequenceId??null,{clipId:use.clipId,trackId:use.trackId});workspace.showPanel("properties");focusPanel("timeline","timeline");}}
        />}

      </aside>)}

      {workspace.renderPanel("monitor",<main className="monitor dock-panel" {...workspace.panelProps("monitor")}>
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
              key={`${rootHistory.bank.active}:${sourceMedia?.src??"empty"}`}
              media={sourceMedia}
              fps={project.fps}
              onInsert={(trackId, inFrame, outFrame, videoOnly) => { const target = destinationTrack(project, trackId === "A0" ? "audio" : "video"); if (sourceMedia && target) addSource(sourceMedia, target, frame, inFrame, outFrame, videoOnly); }}
              onDragStart={(e, inFrame, outFrame, mode) => sourceMedia && startMediaDrag(e, sourceMedia, inFrame, outFrame, mode)}
              onRangePointerDown={(e,inFrame,outFrame,mode,click)=>{if(sourceMedia)return startRangePointer(e,{src:sourceMedia.src,kind:sourceMedia.kind??"video",inFrame,outFrame,mode},click);return false;}}
            />
          </div>
          <div className="program-pane" data-shortcut-scope="program" tabIndex={-1} style={{ display: monitorLayout === "tabs" && monitorTab !== "program" ? "none" : undefined }}>
            <div className="monitor-label" title={project.name}>Programa · {project.name}</div>
            <ProgramMonitor key={`${rootHistory.bank.active}:${editingSequenceId??"root"}`} project={renderProject} duration={duration} frame={frame} playerRef={playerRef} programRef={programRef} playbackRate={playbackRate} onSeek={seek} onCommand={id=>runCommand(id,"program")} hint={shortcuts.hint} marks={markRange} onRangeDrag={startProgramRangeDrag} onRangePlace={placeProgramRange} onRangePointerDown={(e,mode,click)=>startRangePointer(e,programRangeDrag(mode),click)}/>
          </div>
        </div>
      </main>)}

      {workspace.renderPanel("inspector",<aside className="panel inspector dock-panel" {...workspace.panelProps("inspector")} data-shortcut-scope="app" tabIndex={-1}>
        <div className="panel-title">
          <div className="tabs">
            <button className={rightTab === "chat" ? "active" : ""} onClick={() => setRightTab("chat")}>Chat IA</button>
            <button className={rightTab === "vision" ? "active" : ""} onClick={() => setRightTab("vision")}>Visión</button>
          </div>
          {workspace.handle("inspector")}
        </div>
        {/* El chat queda montado al cambiar de pestaña para no perder la conversación */}
        <div id="ugc-assistant" className="assistant-chat-host" style={{ display: rightTab === "chat" ? "flex" : "none" }}>
          {rootHistory.bank.entries.map(d=><div key={d.id} className="document-chat" style={{display:d.id===rootHistory.bank.active?"flex":"none"}}>          <ChatPanel key={d.id}
            onActivity={activity=>{if(rootHistory.bank.active===d.id)setChatActivity(activity);}}
            ctx={() => {const epoch=documentEpoch.current;return guardAssistantSession({
              ...assistantContext(),
              undo: history.undo,
              media,
              fetchFoley: () => fetch("/api/library").then((r) => r.json()).then((d) => d.folders ?? []),
              readDuration: (src:string) => readDurationInFrames(src, project.fps),
            },()=>documentEpoch.current===epoch);}}
          /></div>)}
        </div>
        <div style={{ display: rightTab === "vision" ? "contents" : "none" }}>
          <LocalAssistantPanel mode="vision" ctx={assistantContext} project={project} result={visualResult} />
        </div>
        {rightTab==="propiedades"&&<div className="utility-body"><p className="hint">El asistente está oculto.</p><button onClick={()=>workspace.showPanel("properties")}>Abrir Propiedades</button></div>}
        <AssistantLauncher open={rightTab==="chat"} activity={chatActivity} onToggle={()=>{if(rightTab==="chat"){setRightTab("propiedades");workspace.showPanel("properties");}else openAssistant();}}/>
      </aside>)}

      {workspace.renderPanel("timeline",<section className="timeline-area dock-panel" {...workspace.panelProps("timeline")} data-shortcut-scope="timeline" tabIndex={-1} onMouseDownCapture={() => { selectionPanel.current = "timeline"; }}>
        <div className="document-tabs timeline-document-tabs" role="tablist" aria-label="Proyectos y secuencias abiertos" data-command-ui>{rootHistory.bank.entries.flatMap(d=>d.view.tabs.filter(id=>id===null||d.present.sequences?.[id]).map(id=><span key={`${d.id}:${id??"root"}`} className="document-tab"><button role="tab" aria-selected={d.id===rootHistory.bank.active&&id===editingSequenceId} title={`${d.present.name}${id?" / "+d.present.sequences![id].name:""}`} onClick={()=>switchTimeline(d.id,id)}>{id?"▤ "+d.present.sequences![id].name:d.present.name}</button><button aria-label={`Cerrar ${id?d.present.sequences![id].name:d.present.name}`} onClick={()=>closeTimeline(d.id,id)}>×</button></span>))}<button aria-label="Nuevo proyecto en pestaña" onClick={()=>openDocument(ops.ensureProjectLibrary(createEmptyProject()))}>+</button></div>
        <div className="timeline-panel-header"><strong>Timeline</strong>{workspace.handle("timeline")}<div className="track-add-controls"><button aria-label="Añadir pista de video" title="Añadir otra pista B" onClick={() => addTrack("video")}>+ B</button><button aria-label="Añadir pista de audio" title="Añadir otra pista Audio" onClick={() => addTrack("audio")}>+ Audio</button></div><span className="timeline-selection-status" role="status">{TIMELINE_TOOLS.find((item) => item.id === tool)?.label} · {selectedIds.length ? `${selectedIds.length} clip${selectedIds.length === 1 ? "" : "s"} seleccionado${selectedIds.length === 1 ? "" : "s"}` : "Sin selección"}</span></div>
        <TimelineToolbar hint={shortcuts.hint} project={project} frame={frame} preferences={timelinePreferences} onPreferences={updateTimelinePreferences} onSeek={seek} onMarker={(marker) => history.apply((p) => ops.setMarker(p, marker))} onDeleteMarker={(id) => history.apply((p) => ops.deleteMarker(p, id))} onLink={(linked) => history.apply((p) => ops.linkClips(p, linked ? selectedIds : ops.linkedIds(p, selectedIds), linked))} canLink={selectedIds.length === 2 && selectedIds.some((id) => ops.findClip(project, id)?.clip.kind === "video") && selectedIds.some((id) => ops.findClip(project, id)?.clip.kind === "audio")} canUnlink={selectedIds.some((id) => { const clip = ops.findClip(project, id)?.clip; return clip && (clip.kind === "video" || clip.kind === "audio") && clip.linkedClipId; })} hasSelection={selectedIds.length > 0} onCreateSequence={(name) => history.apply((p) => ops.createSequence(p, selectedIds, name))}/>
        {(recording.state || recording.error) && <div className="recording-status" role="status">
          {recording.state ? <><span>{recording.state.phase === "permission" ? "Permite el micrófono en el navegador" : recording.state.phase === "saving" ? "Guardando voz localmente…" : `● Grabando ${recording.state.seconds} s`}</span>{recording.state.phase === "recording" && <button onClick={recording.stop}>Detener y añadir</button>}<button onClick={recording.cancel}>Cancelar</button></> : <span>{recording.error}</span>}
          {recording.recovery && <a href={recording.recovery} download="Grabacion-recuperada.webm">Descargar grabación</a>}
        </div>}
        <div className="timeline-workspace">
        <TimelineTools hint={shortcuts.hint} tool={tool} onTool={setTool} onFit={fitTimeline} onZoom={changeZoom} />
        <div className="timeline-main">
        <Timeline key={`${rootHistory.bank.active}:${editingSequenceId??"root"}`}
          effectTarget={effectTarget}
          dragWheel={rangeDrag.wheelHandler}
          onAddRange={(at,rangeDuration,trackId)=>{rawSetSelectedIds([]);setIsolatedSelection(false);activeScope.current="timeline";setContextMenu(null);setEditingDialog({kind:"add",ids:[],at,rangeDuration,trackId,epoch:documentEpoch.current});}}
          onContextMenu={(x,y,ids,at,trackId,isolated=false)=>{rawSetSelectedIds(ids);setIsolatedSelection(isolated);activeScope.current="timeline";setContextMenu({x,y,ids,at,trackId,epoch:documentEpoch.current});}}
          onOpenSequence={id=>switchTimeline(rootHistory.bank.active,id)}
          onVolume={(id,value)=>history.apply(p=>ops.setClipVolume(p,[id],value))}
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
          onScrubStart={()=>{transport("stop");sourceRef.current?.command("stop");}}
          isolatedSelection={isolatedSelection}
          onSelect={(ids,isolated=false)=>{setSelectedIds(ids);setIsolatedSelection(isolated);}}
          onDuplicate={(ids,delta,offset,follow)=>{const before=history.current(),result=ops.duplicateClipsWithSelection(before,ids,delta,offset,follow);if(result.project===before)return;history.apply(()=>result.project);setSelectedIds(result.ids);setIsolatedSelection(!follow);}}
          onMove={(ids, delta, offset, follow) => history.apply((p) => ops.editSelection(p, ids, follow, (current) => ops.moveClips(current, ids, delta, offset)))}
          onTrim={(id, edge, delta, ripple, follow) => history.apply((p) => ops.editSelection(p, [id], follow, (current) => (ripple ? ops.rippleTrimClip : ops.trimClip)(current, id, edge, delta)))}
          onSlip={(id, delta, follow) => history.apply((p) => ops.editSelection(p, [id], follow, (current) => ops.slipClip(current, id, delta)))}
          onSplit={(id, at) => history.apply((p) => ops.editSelection(p, id ? [id] : p.tracks.flatMap((t) => t.clips.map((c) => c.id)), linkedSelection, (current) => ops.splitAt(current, at, id)))}
          onAddText={addText}
          onZoom={changeZoom}
          onDropMedia={(payload,track,at,bypass)=>rangeDrag.dropNative(payload,track,at,bypass)}
          mediaDrag={rangeDrag.active} mediaHover={rangeDrag.hover} onMediaHover={rangeDrag.update} onMediaLeave={rangeDrag.clearHover}
          placementOptions={{media,hostId:editingSequenceId??undefined,nested:timelinePreferences.nestSequences}}
          waveforms={waveforms}
        />
        </div></div>
      </section>)}
      {workspace.renderPanel("meter",<section className="meter-panel dock-panel" {...workspace.panelProps("meter")} data-shortcut-scope="mixer" aria-label="Panel de audio · dBFS" tabIndex={-1}>
        <div className="workspace-panel-title"><strong>dBFS</strong>{workspace.handle("meter")}</div>
        <AudioMeter programRef={programRef} />
      </section>)}
      {utility("properties","effectControls",propertiesContent)}
      {utility("effectControls","effectControls",visualControls)}
      {utility("effects","effects",<EffectsPanel key={`${rootHistory.bank.active}:${editingSequenceId}`} onTarget={setEffectTarget} onApply={applyPreset} onAI={openAssistant}/>)}
      {utility("essentialSound","effectControls",<>
        {selectedAudio?.kind==="audio"?<fieldset className="utility-fields" disabled={Boolean(ops.findClip(project,selectedAudio.id)?.track.locked)}><strong>{selectedAudio.name}</strong><label>Tipo de sonido<select aria-label="Tipo de sonido" value={selectedAudio.audioRole??""} disabled={Boolean(ops.findClip(project,selectedAudio.id)?.track.locked)} onChange={e=>history.apply(p=>ops.setAudioRole(p,[selectedAudio.id],e.target.value as "dialogue"|"music"|"sfx"|"ambience"))}><option value="" disabled>Sin clasificar</option><option value="dialogue">Diálogo</option><option value="music">Música</option><option value="sfx">Efectos</option><option value="ambience">Ambiente</option></select></label><AudioInspector clip={selectedAudio} fps={project.fps} onChange={patch=>history.apply(p=>ops.updateClip(p,selectedAudio.id,patch))}/><CommittedNumber key={`${documentEpoch.current}:${selectedAudio.id}:pan`} label="Panorama del clip" min={-1} max={1} step={.05} value={selectedAudio.pan??0} disabled={Boolean(ops.findClip(project,selectedAudio.id)?.track.locked)} onCommit={pan=>history.apply(p=>ops.setClipPan(p,[selectedAudio.id],pan))}/>{selectedAudio.crossfadeIn&&<><p>Crossfade {selectedAudio.crossfadeIn.curve==="equalPower"?"de potencia constante":"de ganancia constante"}</p><CommittedNumber label="Duración crossfade (frames)" value={selectedAudio.crossfadeIn.frames} min={1} max={project.fps*10} onCommit={frames=>{try{history.apply(p=>ops.applyEffectPreset(p,[selectedAudio.id],selectedAudio.crossfadeIn?.curve==="equalPower"?"constant-power":"constant-gain",frames));}catch(error){setFeedback(error instanceof Error?error.message:String(error));}}}/><button onClick={()=>history.apply(p=>ops.updateClip(p,selectedAudio.id,{crossfadeIn:undefined}))}>Quitar crossfade</button></> }</fieldset>:<p className="hint">Selecciona audio o un video enlazado para ajustar su sonido.</p>}
        <details open><summary>Limpieza local de audio</summary><LocalAssistantPanel key={rootHistory.bank.active} mode="audio" ctx={assistantContext} project={project} result={visualResult}/></details>
      </>)}
      {utility("text","effectControls",<TextPanel key={`${rootHistory.bank.active}:${editingSequenceId}`} project={project} frame={frame} apply={applyForSession()} onSelect={selectResult} onAddText={addText} onProperties={()=>workspace.showPanel("properties")}/>)}
      {utility("search","effectControls",<SearchPanel project={project} root={rootHistory.value} onClip={selectResult} onItem={key=>{if(key.startsWith("sequence:")){switchTimeline(rootHistory.bank.active,key.slice(9));return;}workspace.showPanel("bin");requestAnimationFrame(()=>projectPanelRef.current?.reveal(key));}}/>)}
      {utility("mixer","mixer",<AudioTrackMixer key={`${rootHistory.bank.active}:${editingSequenceId}`} project={project} programRef={programRef} onPreview={(id,volume)=>setMixDraft(volume===null?null:{id,volume})} onMix={(id,patch)=>history.apply(p=>id?ops.setTrackMix(p,id,patch):ops.setMasterVolume(p,patch.volume??1))} onState={(id,patch)=>history.apply(p=>ops.setTrackState(p,id,patch))} onRecord={id=>{if(recording.state?.track===id)recording.stop();else void recording.start(id,frame,project.fps);}} recordingTrack={recording.state?.track??null}/>)}
      {workspace.overlays}
      </div>
    </div></UiDocument.Provider>
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

function AudioInspector({clip,fps,onChange}:{clip:AudioClip;fps:number;onChange:(patch:Partial<AudioClip>)=>void}) {
  return <div className="fields"><div className="bin-name">♪ {clip.name}</div><div className="bin-dur">Duración: {formatTimecode(clip.durationInFrames,fps)}</div>
    <CommittedNumber key={`${clip.id}:volume`} label="Volumen del clip (%)" min={0} max={400} step={1} value={clip.volume*100} onCommit={v=>onChange({volume:v/100})}/>
    <CommittedNumber key={`${clip.id}:in`} label="Fundido entrada (s)" min={0} max={clip.durationInFrames/fps} step={.1} value={clip.fadeIn/fps} onCommit={v=>onChange({fadeIn:Math.round(v*fps)})}/>
    <CommittedNumber key={`${clip.id}:out`} label="Fundido salida (s)" min={0} max={clip.durationInFrames/fps} step={.1} value={clip.fadeOut/fps} onCommit={v=>onChange({fadeOut:Math.round(v*fps)})}/>
    {clip.mix&&<div className="hint">Incluye mezcla heredada de una secuencia. <button onClick={()=>onChange({mix:undefined})}>Restablecer mezcla heredada</button></div>}
    <div className="hint">Se aplica al confirmar o soltar. Una pareja de video/audio conserva su sincronía.</div></div>;
}

function VideoInspector({ clip, fps, onChange }: { clip: VideoClip; fps: number; onChange: (patch: Partial<VideoClip>) => void }) {
  return (
    <div className="fields">
      <div className="bin-name">{clip.name}</div>
      <div className="bin-dur">Inicio en archivo: {formatTimecode(clip.trimStart, fps)}</div>
      <div className="bin-dur">Duración: {formatTimecode(clip.durationInFrames, fps)}</div>
      <label>Volumen<input type="range" min={0} max={4} step={0.01} value={clip.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} /></label>
    </div>
  );
}

function GraphicInspector({clip,onChange}:{clip:GraphicClip;onChange:(patch:Partial<GraphicClip>)=>void}){
  return <div className="fields"><label>Nombre<input value={clip.name} onChange={e=>onChange({name:e.target.value})}/></label>{clip.shape!=="adjustment"&&<label>Color<input type="color" value={clip.color} onChange={e=>onChange({color:e.target.value})}/></label>}
  {(clip.shape==="adjustment"?[["brightness","Brillo"],["contrast","Contraste"],["saturation","Saturación"]]:clip.shape==="rectangle"?[["x","Posición X"],["y","Posición Y"],["width","Ancho"],["height","Alto"]]:[]).concat([["opacity","Opacidad"]]).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="range" min={0} max={["brightness","contrast","saturation"].includes(key)?4:1} step={.01} value={Number(clip[key as keyof GraphicClip])} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label>)}
  <p className="hint">{clip.shape==="adjustment"?"Afecta las capas visibles inferiores durante este tramo.":"Elemento gráfico editable; recorta su duración en el timeline."}</p></div>;
}
