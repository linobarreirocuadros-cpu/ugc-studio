import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Timeline, formatTimecode } from "./Timeline";
import { useHistory } from "./useHistory";

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

export function App() {
  const saved = useMemo(loadSaved, []);
  const history = useHistory<Project>(() => normalizeProject(saved?.project ?? createEmptyProject()));
  const project = history.value;
  const [media, setMedia] = useState<MediaItem[]>(saved?.media ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [pxPerFrame, setPxPerFrame] = useState(2);
  const [uploading, setUploading] = useState(false);
  const [binTab, setBinTab] = useState<"proyecto" | "foley">("proyecto");
  const [rightTab, setRightTab] = useState<"propiedades" | "chat">("chat");
  const [preset, setPreset] = useState<Preset>("h264-high");
  const [render, setRender] = useState<{ progress: number; url?: string; error?: string } | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const openInput = useRef<HTMLInputElement>(null);

  const duration = getProjectDuration(project);
  const selected = selectedId ? ops.findClip(project, selectedId)?.clip ?? null : null;

  // Autoguardado en el navegador
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, media }));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [project, media]);

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

  const addFoley = async (file: { name: string; src: string }) => {
    const durationInFrames = await readDurationInFrames(file.src, project.fps).catch(() => project.fps);
    history.apply((p) => ops.addAudioClip(p, { src: file.src, name: file.name, durationInFrames }, "A2", frame));
  };

  const addText = () => {
    const id = ops.newId();
    history.apply((p) => ops.addTextClip(p, { id, text: "Tu hook aquí", from: frame, durationInFrames: p.fps * 3 }));
    setSelectedId(id); // queda seleccionado para editarlo de inmediato
  };

  const split = () => history.apply((p) => ops.splitAt(p, frame));
  const remove = (ripple: boolean) => {
    if (!selectedId) return;
    history.apply((p) => (ripple ? ops.rippleDeleteClip(p, selectedId) : ops.deleteClip(p, selectedId)));
    setSelectedId(null);
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
        remove(e.shiftKey);
      } else if (e.key === "ArrowLeft") {
        seek(Math.max(0, frame - (e.shiftKey ? 5 : 1)));
      } else if (e.key === "ArrowRight") {
        seek(Math.min(duration - 1, frame + (e.shiftKey ? 5 : 1)));
      } else if (e.key === "=" || e.key === "+") {
        setPxPerFrame((z) => Math.min(20, z * 1.25));
      } else if (e.key === "-") {
        setPxPerFrame((z) => Math.max(0.2, z / 1.25));
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
  };

  return (
    <div className="app">
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
          <button onClick={addText}>+ Texto</button>
          <button onClick={saveProjectFile}>Guardar</button>
          <button onClick={() => openInput.current?.click()}>Abrir</button>
          <input ref={openInput} type="file" accept=".json" hidden onChange={(e) => openProjectFile(e.target.files)} />
        </div>
        <div className="export">
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

      <aside className="panel bin">
        <div className="panel-title">
          <div className="tabs">
            <button className={binTab === "proyecto" ? "active" : ""} onClick={() => setBinTab("proyecto")}>Proyecto</button>
            <button className={binTab === "foley" ? "active" : ""} onClick={() => setBinTab("foley")}>Foley</button>
          </div>
          {binTab === "proyecto" && (
            <button onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? "Optimizando…" : "Importar"}
            </button>
          )}
          <input ref={fileInput} type="file" accept="video/*,audio/*" multiple hidden onChange={(e) => importFiles(e.target.files)} />
        </div>
        {binTab === "foley" && <FoleyPanel onAdd={addFoley} />}
        {binTab === "proyecto" && media.length === 0 && <p className="hint">Importa tus clips UGC, voces en off o música.</p>}
        {binTab === "proyecto" && media.map((m) => (
          <div
            key={m.src}
            className={`bin-item ${missing.has(m.src) ? "missing" : ""}`}
            onDoubleClick={() => addMedia(m)}
            title={m.kind === "audio" ? "Doble clic: agregar en A1 donde está el cabezal" : "Doble clic: agregar al final de V1"}
          >
            {m.kind === "audio" ? <div className="bin-audio">♪</div> : <video src={m.proxySrc ?? m.src} muted preload="metadata" />}
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
        ))}
        <AIPanel project={project} apply={history.apply} />
      </aside>

      <main className="monitor">
        <Player
          ref={playerRef}
          component={ProjectComposition}
          inputProps={{ project, preview: true }}
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
        <div className="timecode">
          {formatTimecode(frame, project.fps)} / {formatTimecode(duration, project.fps)}
        </div>
      </main>

      <aside className="panel inspector">
        <div className="panel-title">
          <div className="tabs">
            <button className={rightTab === "chat" ? "active" : ""} onClick={() => setRightTab("chat")}>Chat IA</button>
            <button className={rightTab === "propiedades" ? "active" : ""} onClick={() => setRightTab("propiedades")}>Propiedades</button>
          </div>
        </div>
        {/* El chat queda montado al cambiar de pestaña para no perder la conversación */}
        <div style={{ display: rightTab === "chat" ? "contents" : "none" }}>
          <ChatPanel
            ctx={() => ({
              getProject: history.current,
              commit: (next) => history.apply(() => next),
              undo: history.undo,
              media,
              fetchFoley: () => fetch("/api/library").then((r) => r.json()).then((d) => d.folders ?? []),
              readDuration: (src) => readDurationInFrames(src, project.fps),
            })}
          />
        </div>
        {rightTab === "propiedades" && <>
        {!selected && <p className="hint">Selecciona un clip en la línea de tiempo.</p>}
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

      <section className="timeline-area">
        <Timeline
          project={project}
          frame={frame}
          selectedId={selectedId}
          pxPerFrame={pxPerFrame}
          onSeek={seek}
          onSelect={setSelectedId}
          onMove={(id, from, trackId) => history.apply((p) => ops.moveClip(p, id, from, trackId))}
          onTrim={(id, edge, delta) => history.apply((p) => ops.trimClip(p, id, edge, delta))}
        />
      </section>
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
