import { Player, type PlayerRef } from "@remotion/player";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as ops from "../project/ops";
import {
  createEmptyProject,
  getProjectDuration,
  normalizeProject,
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
import { ProjectComposition } from "../remotion/ProjectComposition";
import { SourceMonitor } from "./SourceMonitor";
import { MEDIA_DRAG_TYPE, Timeline, formatTimecode, type MediaDrag } from "./Timeline";
import { useHistory } from "./useHistory";
import { LocalAssistantPanel } from "./LocalAssistantPanel";
import type { AssistantContext, VisualResult } from "./localAssistant";
import { toggleSelection, useMarqueeSelection } from "./useMarqueeSelection";
import { TimelineTools, TIMELINE_TOOLS, type TimelineTool } from "./TimelineTools";
import { AudioMeter } from "./AudioMeter";
import { useWorkspace } from "./workspace";

type MediaItem = { src: string; name: string; durationInFrames: number; proxySrc?: string; kind?: "video" | "audio" };
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

// El cabezal actualiza App en cada frame. Mantener el Player aislado evita volver a
// sincronizar el elemento <video> 30 veces por segundo durante la reproducción.
const PreviewPlayer = memo(function PreviewPlayer({
  playerRef,
  project,
  duration,
}: {
  playerRef: RefObject<PlayerRef | null>;
  project: Project;
  duration: number;
}) {
  const inputProps = useMemo(() => ({ project, preview: true }), [project]);
  return (
    <Player
      ref={playerRef}
      component={ProjectComposition}
      inputProps={inputProps}
      bufferStateDelayInMilliseconds={300}
      acknowledgeRemotionLicense
      durationInFrames={duration}
      fps={project.fps}
      compositionWidth={project.width}
      compositionHeight={project.height}
      style={{ height: "100%", aspectRatio: `${project.width} / ${project.height}`, maxWidth: "100%" }}
      controls
      clickToPlay={false}
    />
  );
});

export function App() {
  const workspace = useWorkspace();
  const saved = useMemo(loadSaved, []);
  const history = useHistory<Project>(() => normalizeProject(saved?.project ?? createEmptyProject()));
  const project = history.value;
  const [media, setMedia] = useState<MediaItem[]>(saved?.media ?? []);
  const [waveforms, setWaveforms] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const selectionPanel = useRef<"timeline" | "bin">("timeline");
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
  const binSelection = useMarqueeSelection({ selected: selectedMedia, onSelect: setSelectedMedia });
  const [frame, setFrame] = useState(0);
  const [pxPerFrame, setPxPerFrame] = useState(2);
  const [tool, setTool] = useState<TimelineTool>("select");
  const [snapping, setSnapping] = useState(true);
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
  useEffect(() => {
    const valid = new Set(project.tracks.flatMap((t) => t.clips).map((c) => c.id));
    setSelectedIds((ids) => ids.every((id) => valid.has(id)) ? ids : ids.filter((id) => valid.has(id)));
  }, [project]);
  useEffect(() => { setSelectedMedia((ids) => ids.filter((id) => media.some((m) => m.src === id))); }, [media]);

  // Autoguardado en el navegador
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, media }));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [project, media]);
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

  // Sincroniza el cabezal con el reproductor
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onFrame);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("seeked", onFrame);
    };
  }, []);

  const seek = useCallback((f: number) => {
    playerRef.current?.seekTo(f);
    setFrame(f);
  }, []);

  const assistantContext = (): AssistantContext => ({
    getProject: history.current,
    commit: (next) => history.apply(() => next),
    selectedClipId: selectedId,
    selectedClipIds: selectedIds,
    currentFrame: frame,
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
        const { src, name, proxySrc, kind } = await res.json();
        const durationInFrames = await readDurationInFrames(proxySrc ?? src, project.fps).catch(() =>
          readDurationInFrames(src, project.fps),
        );
        // Si es el mismo video que faltaba (mismo nombre), se reconecta en vez de duplicarse.
        const lost = media.find((m) => m.name === name && missing.has(m.src));
        if (lost) {
          history.apply((p) => ops.relinkMedia(p, lost.src, src, proxySrc));
          setMedia((list) => list.map((x) => (x.src === lost.src ? { src, name, durationInFrames, proxySrc, kind } : x)));
        } else {
          setMedia((m) => [...m, { src, name, durationInFrames, proxySrc, kind }]);
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const addMedia = (m: MediaItem) =>
    history.apply((p) => (m.kind === "audio" ? ops.addAudioClip(p, m, "A1", frame) : ops.addVideoClip(p, m)));
  const addBroll = (m: MediaItem) => history.apply((p) => ops.addVideoClip(p, m, "V2", frame));

  const addSource = (m: MediaItem, trackId: string, at: number, inFrame = 0, outFrame = m.durationInFrames, videoOnly = false) => {
    history.apply((p) => ops.addSourceRange(p, m, trackId, at, inFrame, outFrame, videoOnly));
  };
  const dropMedia = (dragged: MediaDrag, trackId: string, at: number) => {
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

  const split = () => history.apply((p) => ops.splitAt(p, frame));
  const remove = (ripple: boolean) => {
    if (!selectedIds.length) return;
    history.apply((p) => ops.deleteClips(p, selectedIds, ripple));
    setSelectedIds([]);
  };

  // Atajos de teclado estilo Premiere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        playerRef.current?.toggle();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
      } else if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        split();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectionPanel.current === "timeline") remove(e.shiftKey);
      } else if (e.key === "Escape") {
        selectionPanel.current === "timeline" ? setSelectedIds([]) : setSelectedMedia([]);
        setTool("select");
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectionPanel.current === "timeline" ? setSelectedIds(project.tracks.flatMap((t) => t.clips).map((c) => c.id)) : setSelectedMedia(media.map((m) => m.src));
      } else if (e.key === "ArrowLeft") {
        seek(Math.max(0, frame - (e.shiftKey ? 5 : 1)));
      } else if (e.key === "ArrowRight") {
        seek(Math.min(duration - 1, frame + (e.shiftKey ? 5 : 1)));
      } else if (e.key === "=" || e.key === "+") {
        setPxPerFrame((z) => Math.min(20, z * 1.25));
      } else if (e.key === "-") {
        setPxPerFrame((z) => Math.max(0.02, z / 1.25));
      } else if (!mod && !e.altKey) {
        const next = TIMELINE_TOOLS.find((item) => item.key.toLowerCase() === e.key.toLowerCase());
        if (next) { e.preventDefault(); setTool(next.id); selectionPanel.current = "timeline"; }
        else if (e.key.toLowerCase() === "s") { e.preventDefault(); setSnapping((value) => !value); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
    const blob = new Blob([JSON.stringify({ project, media }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}.ugcproj.json`;
    a.click();
  };

  const openProjectFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    history.apply(() => normalizeProject(data.project));
    setMedia(data.media ?? []);
    setSelectedIds([]); setSelectedMedia([]); setSourceSrc(null);
    setTool("select"); seek(0);
  };

  return (
    <div ref={workspace.appRef} className={`app ${workspace.dragged ? "docking-panel" : ""}`} style={workspace.style}>
      <header className="topbar">
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => history.apply((p) => ({ ...p, name: e.target.value }))}
        />
        <div className="toolbar">
          <button onClick={history.undo} disabled={!history.canUndo} title="Ctrl/Cmd+Z">↶</button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Ctrl/Cmd+Shift+Z">↷</button>
          <button onClick={split} title="Ctrl/Cmd+K">Cortar</button>
          <button onClick={() => addText()}>+ Texto</button>
          <button onClick={saveProjectFile}>Guardar</button>
          <button onClick={() => openInput.current?.click()}>Abrir</button>
          <input ref={openInput} type="file" accept=".json" hidden onChange={(e) => openProjectFile(e.target.files)} />
        </div>
        <div className="export">
          <button onClick={workspace.reset} title="Restaurar posiciones y tamaños iniciales de los paneles">Restablecer paneles</button>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="h264-high">MP4 H.264 · Alta calidad</option>
            <option value="h264-draft">MP4 H.264 · Borrador rápido</option>
            <option value="prores-hq">MOV ProRes 422 HQ</option>
          </select>
          <button className="primary" onClick={startRender} disabled={render?.progress !== undefined && !render.url && !render.error}>
            Exportar
          </button>
        </div>
      </header>

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

      <aside className="panel bin dock-panel" {...workspace.dropProps("bin")}>
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
                  title="Agregar como B-roll en V2, donde está el cabezal (sin sonido)"
                >
                  + B-roll
                </button>
              )}
              {missing.has(m.src) && <div className="bin-missing">⚠ Archivo no encontrado. Impórtalo de nuevo y se reconecta solo.</div>}
            </div>
          </div>
        ))}{binSelection.box && <div className="selection-marquee" aria-hidden style={{ left: binSelection.box.x, top: binSelection.box.y, width: binSelection.box.width, height: binSelection.box.height }} />}</div></>}
        <AIPanel project={project} apply={history.apply} />
      </aside>

      <main className="monitor dock-panel" {...workspace.dropProps("monitor")}>
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
          <div className="source-pane" style={{ display: monitorLayout === "tabs" && monitorTab !== "source" ? "none" : undefined }}>
            <SourceMonitor
              key={sourceMedia?.src ?? "empty"}
              media={sourceMedia}
              fps={project.fps}
              onInsert={(trackId, inFrame, outFrame, videoOnly) => sourceMedia && addSource(sourceMedia, trackId, frame, inFrame, outFrame, videoOnly)}
              onDragStart={(e, inFrame, outFrame, mode) => sourceMedia && startMediaDrag(e, sourceMedia, inFrame, outFrame, mode)}
            />
          </div>
          <div className="program-pane" style={{ display: monitorLayout === "tabs" && monitorTab !== "program" ? "none" : undefined }}>
            <div className="monitor-label">Programa</div>
            <div className="program-preview" ref={programRef}><PreviewPlayer playerRef={playerRef} project={project} duration={duration} /></div>
            <div className="timecode">{formatTimecode(frame, project.fps)} / {formatTimecode(duration, project.fps)}</div>
          </div>
        </div>
      </main>

      <aside className="panel inspector dock-panel" {...workspace.dropProps("inspector")}>
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
        {selected?.kind === "video" && <VideoInspector clip={selected} fps={project.fps} onChange={(patch) => history.apply((p) => ops.updateClip(p, selected.id, patch))} />}
        <div className="shortcuts">
          <b>Atajos</b>
          <div>Espacio · reproducir</div>
          <div>Ctrl/Cmd+K · cortar en cabezal</div>
          <div>Supr · borrar · Shift+Supr · ripple</div>
          <div>← → · frame a frame</div>
          <div>+ / − · zoom línea de tiempo</div>
        </div>
        </>}
      </aside>

      <section className="timeline-area dock-panel" {...workspace.dropProps("timeline")} onMouseDownCapture={() => { selectionPanel.current = "timeline"; }}>
        <div className="timeline-panel-header"><strong>Timeline</strong>{workspace.handle("timeline")}<span className="timeline-selection-status" role="status">{TIMELINE_TOOLS.find((item) => item.id === tool)?.label} · {selectedIds.length ? `${selectedIds.length} clip${selectedIds.length === 1 ? "" : "s"} seleccionado${selectedIds.length === 1 ? "" : "s"}` : "Sin selección"}</span></div>
        <div className="timeline-workspace">
        <TimelineTools tool={tool} onTool={setTool} snapping={snapping} onSnap={() => setSnapping((value) => !value)} onFit={() => { const viewport = workspace.appRef.current?.querySelector<HTMLDivElement>(".timeline-scroll"); const width = viewport?.clientWidth ?? 800; if (viewport) viewport.scrollLeft = 0; setPxPerFrame(Math.max(0.02, Math.min(20, (width - 30) / duration))); }} onZoom={(factor) => setPxPerFrame((value) => Math.max(0.02, Math.min(20, value * factor)))} />
        <div className="timeline-main">
        <Timeline
          project={project}
          frame={frame}
          selectedIds={selectedIds}
          pxPerFrame={pxPerFrame}
          tool={tool}
          snapping={snapping}
          onSeek={seek}
          onSelect={setSelectedIds}
          onMove={(ids, delta, offset) => history.apply((p) => ops.moveClips(p, ids, delta, offset))}
          onTrim={(id, edge, delta, ripple) => history.apply((p) => (ripple ? ops.rippleTrimClip : ops.trimClip)(p, id, edge, delta))}
          onSlip={(id, delta) => history.apply((p) => ops.slipClip(p, id, delta))}
          onSplit={(id, at) => history.apply((p) => ops.splitAt(p, at, id))}
          onAddText={addText}
          onZoom={(factor) => setPxPerFrame((value) => Math.max(0.02, Math.min(20, value * factor)))}
          onDropMedia={dropMedia}
          waveforms={waveforms}
        />
        </div><AudioMeter programRef={programRef} /></div>
      </section>
      {workspace.splitters}
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
      <select value={current} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: `"${current}"` }}>
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
      <div className="hint">Arrastra el clip arriba o abajo para pasarlo entre A1 (música) y A2 (efectos).</div>
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
