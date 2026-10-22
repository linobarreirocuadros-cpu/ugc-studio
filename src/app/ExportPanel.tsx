import { ExportPreviewControls } from "./ExportPreviewControls";
import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import type { Project, VideoClip } from "../project/types";
import { getProjectDuration } from "../project/types";
import { ProjectComposition } from "../remotion/ProjectComposition";
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_VARIANTS,
  deliveryJobs,
  deliveryProject,
  wholeRange,
  validateExportRequest,
  type DeliveryFormat,
  type DeliveryVariant,
  type ExportSettings,
  type ExportRequest,
} from "../project/exportPlan";
import { FRAME_RATES } from "../project/sequenceSettings";
import { ActionDialog } from "./ActionDialog";
import { formatTimecode } from "./Timeline";
import "./export.css";
type QueueBatch = {
  id: string;
  name: string;
  status: string;
  directory: string;
  items: {
    id: string;
    name: string;
    status: string;
    progress: number;
    url?: string;
    srtUrl?: string;
    projectUrl?: string;
    error?: string;
    actual?: string;
  }[];
};
const defaults = (p: Project): DeliveryFormat[] => [
  {
    id: "vertical",
    name: "9x16",
    width: 1080,
    height: 1920,
    fit: "cover",
    smart: true,
    focusX: 0.5,
    focusY: 0.5,
  },
  {
    id: "social",
    name: "4x5",
    width: 1080,
    height: 1350,
    fit: "cover",
    smart: true,
    focusX: 0.5,
    focusY: 0.5,
  },
];
const statuses: Record<string, string> = {
  queued: "En cola",
  pending: "Pendiente",
  rendering: "Exportando",
  done: "Terminada",
  error: "Error",
  cancelled: "Cancelada",
};
export function ExportPanel({
  project,
  rangeIds,
  preset,
  onClose,
  onOpenFolder,
}: {
  project: Project;
  rangeIds?: string[];
  preset?: string;
  onClose: () => void;
  onOpenFolder?: () => void;
}) {
  const [tab, setTab] = useState("delivery"),
    [name, setName] = useState(project.name),
    [folder, setFolder] = useState(""),
    [settings, setSettings] = useState<ExportSettings>({
      ...DEFAULT_EXPORT_SETTINGS,
      fps: project.fps,
      sampleRate: (project.audioSampleRate ??
        48000) as ExportSettings["sampleRate"],
      ...(preset === "h264-draft"
        ? { crf: 28 }
        : preset === "prores-hq"
          ? { codec: "prores" as const }
          : {}),
    });
  const [formats, setFormats] = useState<DeliveryFormat[]>(() =>
      defaults(project),
    ),
    [formatIds, setFormatIds] = useState(["vertical", "social"]),
    [variants, setVariants] = useState<DeliveryVariant[]>(DEFAULT_VARIANTS),
    [variantIds, setVariantIds] = useState(["full", "raw", "overlays"]);
  const [savedRanges, setSavedRanges] = useState(project.exportRanges ?? []),
    [ranges, setRanges] = useState<string[]>(
      rangeIds?.length ? rangeIds : ["entire"],
    ),
    [viewFormat, setViewFormat] = useState("social"),
    [viewVariant, setViewVariant] = useState("full"),
    [viewRange, setViewRange] = useState(rangeIds?.[0] ?? "entire");
  const [previewMuted, setPreviewMuted] = useState(false);
  const [queue, setQueue] = useState<QueueBatch[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [suggesting, setSuggesting] = useState(false),
    [suggestion, setSuggestion] = useState(""),
    [presetName, setPresetName] = useState("Mi entrega"),
    [presets, setPresets] = useState<string[]>(() => {
      try {
        return Object.keys(
          JSON.parse(
            localStorage.getItem("ugc-studio:delivery-presets:v1") ?? "{}",
          ),
        );
      } catch {
        return [];
      }
    });
  const alive = useRef(true),
    player = useRef<PlayerRef>(null),
    suggestTask = useRef<string | null>(null),
    formatsLive = useRef(formats);
  formatsLive.current = formats;
  useEffect(
    () => () => {
      if (suggestTask.current)
        void fetch(`/api/local-tasks/${suggestTask.current}/cancel`, {
          method: "POST",
        });
    },
    [],
  );
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const r = await fetch("/api/export-queue", {
          signal: controller.signal,
        });
        if (!r.ok)
          throw new Error("No se pudo consultar la cola de exportación");
        const value = await r.json();
        if (!Array.isArray(value))
          throw new Error("Respuesta de cola inválida");
        if (alive.current) {
          setQueue(value);
          setError((previous) =>
            previous === "No se pudo consultar la cola de exportación"
              ? ""
              : previous,
          );
        }
      } catch (e) {
        if (!controller.signal.aborted && alive.current)
          setError("No se pudo consultar la cola de exportación");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1200);
    return () => {
      alive.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  const update = (s: Partial<ExportSettings>) =>
    setSettings((p) => ({ ...p, ...s }));
  const allRanges = [wholeRange(project), ...savedRanges],
    range = allRanges.find((r) => r.id === viewRange) ?? allRanges[0],
    variant = variants.find((v) => v.id === viewVariant) ?? variants[0],
    format = formats.find((f) => f.id === viewFormat) ?? formats[0];
  const patchFormat = (change: Partial<DeliveryFormat>) =>
    setFormats((p) =>
      p.map((f) => (f.id === format.id ? { ...f, ...change } : f)),
    );
  const request: ExportRequest = {
    project,
    name,
    directory: folder,
    ranges: allRanges.filter((r) => ranges.includes(r.id)),
    variants: variants.filter((v) => variantIds.includes(v.id)),
    formats: formats.filter((f) => formatIds.includes(f.id)),
    settings,
  };
  const jobs = deliveryJobs(request),
    preview = useMemo(
      () => deliveryProject(project, variant, format, settings),
      [project, variant, format, settings],
    ),
    duration = Math.max(
      getProjectDuration(preview),
      Math.round((getProjectDuration(project) * settings.fps) / project.fps),
    ),
    start = Math.max(
      0,
      Math.min(
        duration - 1,
        Math.round((range.start * settings.fps) / project.fps),
      ),
    ),
    end = Math.max(
      start,
      Math.min(
        duration - 1,
        Math.round((range.end * settings.fps) / project.fps) - 1,
      ),
    );
  const toggle = (id: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const send = async () => {
    try {
      setError("");
      validateExportRequest(request);
      setBusy(true);
      const r = await fetch("/api/export-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }),
        data = await r.json();
      if (!r.ok)
        throw new Error(data.error ?? "No se pudo iniciar la exportación");
      if (alive.current) {
        setQueue((q) => [data, ...q]);
        setTab("queue");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const queueAction = async (id: string, action: string) => {
    try {
      const r = await fetch(`/api/export-queue/${id}/${action}`, {
          method: "POST",
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (alive.current)
        setQueue((q) => q.map((b) => (b.id === id ? data : b)));
    } catch (e) {
      if (alive.current) setError(String(e));
    }
  };
  const storePreset = (load = false) => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("ugc-studio:delivery-presets:v1") ?? "{}",
      );
      if (load) {
        const p = saved[presetName];
        if (!p) throw new Error("Selecciona un preset guardado");
        validateExportRequest({
          project,
          name,
          directory: folder,
          ranges: [wholeRange(project)],
          settings: { ...DEFAULT_EXPORT_SETTINGS, ...p.settings },
          formats: p.formats?.filter((f: DeliveryFormat) =>
            p.formatIds?.includes(f.id),
          ),
          variants: p.variants?.filter((v: DeliveryVariant) =>
            p.variantIds?.includes(v.id),
          ),
        });
        setSettings({ ...DEFAULT_EXPORT_SETTINGS, ...p.settings });
        setFormats(p.formats);
        setVariants(p.variants);
        setFormatIds(p.formatIds);
        setVariantIds(p.variantIds);
      } else {
        saved[presetName.trim() || "Mi entrega"] = {
          settings,
          formats,
          variants,
          formatIds,
          variantIds,
        };
        localStorage.setItem(
          "ugc-studio:delivery-presets:v1",
          JSON.stringify(saved),
        );
        setPresets(Object.keys(saved));
      }
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const suggest = async () => {
    setSuggesting(true);
    setSuggestion("");
    try {
      const r = await fetch("/api/export-reframe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project,
            start: range.start,
            end: range.end,
            width: format.width,
            height: format.height,
          }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (!alive.current) {
        void fetch(`/api/local-tasks/${data.id}/cancel`, { method: "POST" });
        return;
      }
      suggestTask.current = data.id;
      let result = data;
      while (alive.current) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (!alive.current) return;
        const taskResponse = await fetch(`/api/local-tasks/${data.id}`);
        result = await taskResponse.json();
        if (!taskResponse.ok || ["error", "cancelled"].includes(result.status))
          throw new Error(result.error ?? "Análisis cancelado");
        setSuggestion(`${result.message} · ${Math.round(result.progress)}%`);
        if (result.status === "done") break;
      }
      suggestTask.current = null;
      if (alive.current) {
        if (formatsLive.current.find((f) => f.id === format.id) !== format) {
          setSuggestion(
            "El encuadre cambió mientras se analizaba. Se conservaron tus ajustes manuales.",
          );
          return;
        }
        setFormats((p) =>
          p.map((f) =>
            f.id === format.id
              ? {
                  ...f,
                  focusByClip: {
                    ...f.focusByClip,
                    ...result.result.focusByClip,
                  },
                }
              : f,
          ),
        );
        setSuggestion(
          "Encuadres sugeridos por visión local. Revisa los cortes y ajusta cada clip si hace falta.",
        );
      }
    } catch (e) {
      if (alive.current)
        setSuggestion(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setSuggesting(false);
      suggestTask.current = null;
    }
  };
  const videos = project.tracks
      .flatMap((t) => t.clips)
      .filter(
        (c): c is VideoClip =>
          c.kind === "video" &&
          !c.sequenceId &&
          c.from < range.end &&
          c.from + c.durationInFrames > range.start,
      ),
    [focusClip, setFocusClip] = useState("all");
  const focus = format.focusByClip?.[focusClip] ??
    videos.find((c) => c.id === focusClip)?.reframeFocus ?? {
      x: format.focusX,
      y: format.focusY,
    };
  const setFocus = (axis: "x" | "y", value: number) =>
    focusClip === "all"
      ? patchFormat({
          ...(axis === "x" ? { focusX: value } : { focusY: value }),
          focusByClip: Object.fromEntries(
            videos.map((c) => [
              c.id,
              {
                ...(format.focusByClip?.[c.id] ??
                  c.reframeFocus ?? { x: format.focusX, y: format.focusY }),
                [axis]: value,
              },
            ]),
          ),
        })
      : patchFormat({
          focusByClip: {
            ...format.focusByClip,
            [focusClip]: { ...focus, [axis]: value },
          },
        });
  return (
    <ActionDialog title="Exportar entregas" onClose={onClose}>
      <div className="export-panel" data-view={tab}>
        <nav className="delivery-nav" aria-label="Secciones de exportación">
          {[
            ["delivery", "Entregas"],
            ["encoding", "Codificación"],
            ["preview", "Vista previa"],
            [
              "queue",
              `Cola · ${queue.filter((b) => ["queued", "rendering"].includes(b.status)).length}`,
            ],
          ].map(([id, label]) => (
            <button
              key={id}
              className={id === "preview" ? "delivery-preview-nav" : undefined}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="delivery-layout">
          <section className="delivery-settings">
            {tab === "queue" ? (
              <>
                <h3>Cola local</h3>
                {onOpenFolder && (
                  <button onClick={onOpenFolder}>
                    Abrir carpeta de exportaciones
                  </button>
                )}
                <p>
                  Puedes cerrar este panel y seguir editando. Cada lote conserva
                  su propia copia del montaje.
                </p>
                {queue.length === 0 && <p>No hay entregas todavía.</p>}
                {queue.map((b) => (
                  <details
                    key={b.id}
                    open={["queued", "rendering", "error"].includes(b.status)}
                  >
                    <summary>
                      {b.name} · {statuses[b.status] ?? b.status} ·{" "}
                      {b.items.filter((i) => i.status === "done").length}/
                      {b.items.length}
                    </summary>
                    <small className="delivery-path">{b.directory}</small>
                    {b.items.map((i) => (
                      <div className="delivery-job" key={i.id}>
                        <strong>{i.name}</strong>
                        <span>
                          {statuses[i.status] ?? i.status} ·{" "}
                          {Math.round(i.progress * 100)}%
                        </span>
                        {i.actual && <small>{i.actual}</small>}
                        <progress value={i.progress} max={1} />
                        {i.error && (
                          <details>
                            <summary role="alert">
                              Esta salida falló · ver detalles
                            </summary>
                            <pre>{i.error}</pre>
                          </details>
                        )}
                        {i.url && (
                          <a href={i.url} download>
                            Descargar
                          </a>
                        )}
                        {i.srtUrl && (
                          <a href={i.srtUrl} download>
                            Subtítulos SRT
                          </a>
                        )}
                        {i.projectUrl && (
                          <a href={i.projectUrl} download>
                            Proyecto de entrega
                          </a>
                        )}
                      </div>
                    ))}
                    {["queued", "rendering"].includes(b.status) ? (
                      <button onClick={() => void queueAction(b.id, "cancel")}>
                        Cancelar lote
                      </button>
                    ) : (
                      b.items.some((i) => i.status !== "done") && (
                        <button onClick={() => void queueAction(b.id, "retry")}>
                          Reintentar salidas incompletas
                        </button>
                      )
                    )}
                  </details>
                ))}
              </>
            ) : tab === "delivery" ? (
              <>
                <h3>Una exportación, todas tus versiones</h3>
                <label>
                  Nombre base
                  <input
                    aria-label="Nombre de la entrega"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Subcarpeta en UGC Studio / Exportaciones
                  <input
                    aria-label="Subcarpeta de exportación"
                    placeholder="Marca / Campaña"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>1 · Rangos</legend>
                  <label className="delivery-check">
                    <input
                      type="checkbox"
                      checked={ranges.includes("entire")}
                      onChange={() => setRanges(["entire"])}
                    />
                    Secuencia completa ·{" "}
                    {formatTimecode(getProjectDuration(project), project.fps)}
                  </label>
                  {savedRanges.map((r) => (
                    <div className="delivery-range" key={r.id}>
                      <label className="delivery-check">
                        <input
                          type="checkbox"
                          aria-label={`Exportar rango ${r.name}`}
                          checked={ranges.includes(r.id)}
                          onChange={() =>
                            toggle(
                              r.id,
                              ranges.filter((id) => id !== "entire"),
                              setRanges,
                            )
                          }
                        />
                        <input
                          aria-label={`Nombre del rango ${r.name}`}
                          value={r.name}
                          onChange={(e) =>
                            setSavedRanges((p) =>
                              p.map((x) =>
                                x.id === r.id
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="sequence-settings-row">
                        <label>
                          Inicio (frame)
                          <input
                            type="number"
                            min={0}
                            value={r.start}
                            onChange={(e) =>
                              setSavedRanges((p) =>
                                p.map((x) =>
                                  x.id === r.id
                                    ? { ...x, start: Number(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Fin exclusivo (frame)
                          <input
                            type="number"
                            value={r.end}
                            onChange={(e) =>
                              setSavedRanges((p) =>
                                p.map((x) =>
                                  x.id === r.id
                                    ? { ...x, end: Number(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <small>
                        {formatTimecode(r.start, project.fps)} →{" "}
                        {formatTimecode(r.end, project.fps)}
                      </small>
                    </div>
                  ))}
                  {!savedRanges.length && (
                    <small>
                      En el timeline: marca Inicio y Fin y pulsa Guardar rango.
                      Puedes guardar varios pares de llaves.
                    </small>
                  )}
                </fieldset>
                <fieldset>
                  <legend>2 · Versiones</legend>
                  {variants.map((v) => (
                    <details key={v.id}>
                      <summary>
                        <label
                          className="delivery-check"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={variantIds.includes(v.id)}
                            onChange={() =>
                              toggle(v.id, variantIds, setVariantIds)
                            }
                          />
                          {v.name}
                        </label>
                        <small>
                          {v.captions ? "Con subtítulos" : "Sin subtítulos"} ·{" "}
                          {v.overlays ? "Con overlays" : "Sin overlays"}
                        </small>
                      </summary>
                      <input
                        aria-label={`Nombre de versión ${v.name}`}
                        value={v.name}
                        onChange={(e) =>
                          setVariants((p) =>
                            p.map((x) =>
                              x.id === v.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                      {(
                        [
                          ["captions", "Subtítulos"],
                          ["overlays", "Textos / overlays"],
                          ["graphics", "Formas / sólidos"],
                          ["footage", "Videos"],
                          ["audio", "Audio"],
                          ["effects", "Efectos y ajustes"],
                          [
                            "transparent",
                            "Fondo transparente · MOV ProRes 4444",
                          ],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="delivery-check">
                          <input
                            type="checkbox"
                            checked={v[key]}
                            onChange={(e) =>
                              setVariants((p) =>
                                p.map((x) =>
                                  x.id === v.id
                                    ? { ...x, [key]: e.target.checked }
                                    : x,
                                ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </details>
                  ))}
                  <button
                    onClick={() => {
                      const id = crypto.randomUUID();
                      setVariants((p) => [
                        ...p,
                        {
                          ...DEFAULT_VARIANTS[0],
                          id,
                          name: `Versión ${p.length + 1}`,
                        },
                      ]);
                      setVariantIds((p) => [...p, id]);
                    }}
                  >
                    + Versión personalizada
                  </button>
                </fieldset>
                <fieldset>
                  <legend>3 · Formatos</legend>
                  {formats.map((f) => (
                    <div className="delivery-format" key={f.id}>
                      <label className="delivery-check">
                        <input
                          type="checkbox"
                          checked={formatIds.includes(f.id)}
                          onChange={() => toggle(f.id, formatIds, setFormatIds)}
                        />
                        <strong>{f.name}</strong> · {f.width} × {f.height}
                      </label>
                      <button onClick={() => setViewFormat(f.id)}>
                        Revisar encuadre
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const id = crypto.randomUUID();
                      setFormats((p) => [
                        ...p,
                        {
                          ...defaults(project)[0],
                          id,
                          name: `Original_${p.length}`,
                          width: project.width,
                          height: project.height,
                        },
                      ]);
                      setFormatIds((p) => [...p, id]);
                      setViewFormat(id);
                    }}
                  >
                    + Otro tamaño / original
                  </button>
                </fieldset>
                <details>
                  <summary>Presets de entrega</summary>
                  <input
                    aria-label="Nombre del preset de entrega"
                    list="delivery-presets"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <datalist id="delivery-presets">
                    {presets.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </datalist>
                  <button onClick={() => storePreset()}>Guardar preset</button>
                  <button onClick={() => storePreset(true)}>
                    Cargar preset
                  </button>
                </details>
              </>
            ) : (
              <>
                <h3>Ajustes de salida</h3>
                <label>
                  Formato / códec
                  <select
                    aria-label="Códec de exportación"
                    value={settings.codec}
                    onChange={(e) =>
                      update({
                        codec: e.target.value as ExportSettings["codec"],
                        pixelFormat: "yuv420p",
                        audio: true,
                        ...(e.target.value === "vp9"
                          ? {
                              sampleRate: 48000,
                              audioBitrate: Math.min(
                                settings.audioBitrate,
                                settings.channels * 256,
                              ),
                            }
                          : {}),
                      })
                    }
                  >
                    <option value="h264">MP4 · H.264</option>
                    <option value="h265">MP4 · HEVC / H.265</option>
                    <option value="vp9">WebM · VP9</option>
                    <option value="prores">MOV · Apple ProRes</option>
                    <option value="wav">WAV · Audio PCM</option>
                  </select>
                </label>
                <label>
                  FPS de salida
                  <select
                    aria-label="FPS de exportación"
                    value={settings.fps}
                    onChange={(e) => update({ fps: Number(e.target.value) })}
                  >
                    {[...new Set([project.fps, ...FRAME_RATES])].map((f) => (
                      <option key={f} value={f}>
                        {Number(f.toFixed(3))} fps
                        {f === project.fps ? " · secuencia" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <small>
                  Cambiar FPS conserva la duración en segundos. Timecode NDF.
                  Progresivo · píxel cuadrado.
                </small>
                {settings.codec !== "wav" && (
                  <fieldset>
                    <legend>Video</legend>
                    {settings.codec === "prores" ? (
                      <label>
                        Perfil ProRes
                        <select
                          value={settings.proresProfile}
                          onChange={(e) =>
                            update({
                              proresProfile: e.target
                                .value as ExportSettings["proresProfile"],
                            })
                          }
                        >
                          {[
                            "proxy",
                            "lt",
                            "standard",
                            "hq",
                            "4444",
                            "4444-xq",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {v.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <>
                        <label>
                          Control de calidad
                          <select
                            value={settings.rateControl}
                            onChange={(e) =>
                              update({
                                rateControl: e.target
                                  .value as ExportSettings["rateControl"],
                              })
                            }
                          >
                            <option value="quality">
                              Calidad constante (CRF)
                            </option>
                            <option value="vbr">VBR · una pasada</option>
                            <option value="cbr">CBR</option>
                          </select>
                        </label>
                        {settings.rateControl === "quality" ? (
                          <label>
                            CRF · menor = más calidad
                            <input
                              aria-label="Calidad CRF"
                              type="number"
                              min={0}
                              max={51}
                              value={settings.crf}
                              onChange={(e) =>
                                update({ crf: Number(e.target.value) })
                              }
                            />
                          </label>
                        ) : (
                          <div className="sequence-settings-row">
                            <label>
                              Bitrate (Mbps)
                              <input
                                type="number"
                                min={0.1}
                                max={500}
                                step={0.5}
                                value={settings.bitrateMbps}
                                onChange={(e) =>
                                  update({
                                    bitrateMbps: Number(e.target.value),
                                    maxBitrateMbps: Math.max(
                                      settings.maxBitrateMbps,
                                      Number(e.target.value),
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Máximo (Mbps)
                              <input
                                type="number"
                                min={settings.bitrateMbps}
                                max={1000}
                                value={settings.maxBitrateMbps}
                                onChange={(e) =>
                                  update({
                                    maxBitrateMbps: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}
                        <label>
                          Formato de píxel
                          <select
                            value={settings.pixelFormat}
                            onChange={(e) =>
                              update({
                                pixelFormat: e.target
                                  .value as ExportSettings["pixelFormat"],
                              })
                            }
                          >
                            <option value="yuv420p">YUV 4:2:0 · 8 bits</option>
                            {settings.codec === "vp9" && (
                              <>
                                <option value="yuv420p10le">
                                  YUV 4:2:0 · 10 bits
                                </option>
                                <option value="yuv444p10le">
                                  YUV 4:4:4 · 10 bits
                                </option>
                              </>
                            )}
                          </select>
                        </label>
                        {settings.codec === "h264" && (
                          <label>
                            Perfil H.264
                            <select
                              value={settings.profile}
                              onChange={(e) =>
                                update({
                                  profile: e.target
                                    .value as ExportSettings["profile"],
                                })
                              }
                            >
                              {["auto", "baseline", "main", "high"].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          Intervalo de fotograma clave (frames)
                          <input
                            type="number"
                            min={1}
                            value={settings.keyframeInterval}
                            onChange={(e) =>
                              update({
                                keyframeInterval: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    <label>
                      Espacio de color
                      <select
                        value={settings.colorSpace}
                        onChange={(e) =>
                          update({
                            colorSpace: e.target
                              .value as ExportSettings["colorSpace"],
                          })
                        }
                      >
                        <option value="bt709">SDR · Rec.709</option>
                        <option value="default">
                          Predeterminado del codificador
                        </option>
                      </select>
                    </label>
                    <label>
                      Calidad de imágenes intermedias
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={settings.imageQuality}
                        onChange={(e) =>
                          update({ imageQuality: Number(e.target.value) })
                        }
                      />
                    </label>
                    <small>
                      Composición web SDR de 8 bits. H.264 y HEVC de este FFmpeg
                      codifican a 8 bits; VP9 y ProRes admiten más profundidad
                      de codificación. Codificar a 10 bits no recupera detalle
                      HDR. Alpha usa PNG intermedio y ProRes 4444 con alfa
                      recto.
                    </small>
                  </fieldset>
                )}
                <fieldset>
                  <legend>Audio</legend>
                  <label className="delivery-check">
                    <input
                      type="checkbox"
                      checked={settings.audio}
                      disabled={settings.codec === "wav"}
                      onChange={(e) => update({ audio: e.target.checked })}
                    />
                    Incluir audio
                  </label>
                  <label>
                    Frecuencia
                    <select
                      value={settings.sampleRate}
                      onChange={(e) =>
                        update({
                          sampleRate: Number(
                            e.target.value,
                          ) as ExportSettings["sampleRate"],
                        })
                      }
                    >
                      {(settings.codec === "vp9"
                        ? [48000]
                        : [44100, 48000, 96000]
                      ).map((v) => (
                        <option key={v} value={v}>
                          {v} Hz
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Canales
                    <select
                      value={settings.channels}
                      onChange={(e) =>
                        update({
                          channels: Number(e.target.value) as 1 | 2,
                          ...(settings.codec === "vp9"
                            ? {
                                audioBitrate: Math.min(
                                  settings.audioBitrate,
                                  Number(e.target.value) * 256,
                                ),
                              }
                            : {}),
                        })
                      }
                    >
                      <option value={2}>Estéreo</option>
                      <option value={1}>Mono</option>
                    </select>
                  </label>
                  {!["prores", "wav"].includes(settings.codec) ? (
                    <label>
                      Bitrate de audio (kbps)
                      <input
                        type="number"
                        min={32}
                        max={
                          settings.codec === "vp9"
                            ? settings.channels * 256
                            : 512
                        }
                        value={settings.audioBitrate}
                        onChange={(e) =>
                          update({ audioBitrate: Number(e.target.value) })
                        }
                      />
                    </label>
                  ) : (
                    <p>PCM · 16 bits reales del mezclador actual.</p>
                  )}
                </fieldset>
                <details>
                  <summary>Metadatos y archivos adicionales</summary>
                  {(["title", "author", "comment"] as const).map((k, i) => (
                    <label key={k}>
                      {["Título", "Autor", "Comentario"][i]}
                      <input
                        maxLength={1000}
                        value={settings.metadata[k]}
                        onChange={(e) =>
                          update({
                            metadata: {
                              ...settings.metadata,
                              [k]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  {(
                    [
                      ["saveProject", "Guardar copia JSON de cada entrega"],
                      ["saveSrt", "Exportar también subtítulos SRT"],
                      ["mutedTracks", "Respetar ojos, M y Solo de las pistas"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="delivery-check">
                      <input
                        type="checkbox"
                        checked={settings[k]}
                        onChange={(e) => update({ [k]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                  <label>
                    Registro
                    <select
                      value={settings.log}
                      onChange={(e) =>
                        update({ log: e.target.value as ExportSettings["log"] })
                      }
                    >
                      <option value="errors">Errores</option>
                      <option value="settings">Ajustes y resultados</option>
                      <option value="frames">
                        Detalle de render en el servidor
                      </option>
                    </select>
                  </label>
                </details>
                <details>
                  <summary>Parámetros de Adobe pendientes</summary>
                  <p>
                    Secuencias PNG/EXR, GIF, HDR/gestión ICC, composición lineal
                    de 16/32 bits, PCM 24 bits, multicanal, campos/pulldown, VBR
                    de dos pasadas, aceleración de hardware, XMP y acciones
                    posteriores todavía no están integrados. No se aplican
                    ajustes de After Effects que no tengan equivalente real en
                    este motor.
                  </p>
                  <a
                    href="https://helpx.adobe.com/after-effects/desktop/render-and-export/basics-of-rendering-and-exporting/basics-rendering-exporting.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Referencia: render y módulos de salida de Adobe
                  </a>
                </details>
              </>
            )}
          </section>
          <section className="delivery-preview">
            <div className="delivery-preview-selectors">
              <label>
                Vista
                <select
                  aria-label="Versión en vista previa"
                  value={viewVariant}
                  onChange={(e) => setViewVariant(e.target.value)}
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Formato
                <select
                  aria-label="Formato en vista previa"
                  value={viewFormat}
                  onChange={(e) => setViewFormat(e.target.value)}
                >
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rango
                <select
                  aria-label="Rango en vista previa"
                  value={viewRange}
                  onChange={(e) => setViewRange(e.target.value)}
                >
                  {allRanges.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="delivery-player">
              <Player
                key={`${viewRange}:${format.width}:${format.height}:${settings.fps}`}
                ref={player}
                component={ProjectComposition}
                inputProps={{
                  project: preview,
                  preview: true,
                  gain: previewMuted ? 0 : 1,
                  transparentBackground: variant.transparent,
                  output: settings.codec === "wav" ? "audio" : "both",
                }}
                durationInFrames={duration}
                compositionWidth={Math.max(16, format.width || 16)}
                compositionHeight={Math.max(16, format.height || 16)}
                fps={settings.fps}
                initialFrame={start}
                inFrame={start}
                outFrame={end}
                controls={false}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
            <ExportPreviewControls
              player={player}
              start={start}
              end={end}
              fps={settings.fps}
              resetKey={`${viewRange}:${format.width}:${format.height}:${settings.fps}`}
              muted={previewMuted}
              onMute={setPreviewMuted}
            />
            <details className="delivery-reframe" open={tab !== "queue"}>
              <summary>Adaptación y encuadre · {format.name}</summary>
              <div className="sequence-settings-row">
                <label>
                  Nombre de formato
                  <input
                    value={format.name}
                    onChange={(e) => patchFormat({ name: e.target.value })}
                  />
                </label>
                <label>
                  Ancho
                  <input
                    aria-label="Ancho de salida"
                    type="number"
                    step={2}
                    min={16}
                    max={8192}
                    value={format.width}
                    onChange={(e) =>
                      patchFormat({ width: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Alto
                  <input
                    aria-label="Alto de salida"
                    type="number"
                    step={2}
                    min={16}
                    max={8192}
                    value={format.height}
                    onChange={(e) =>
                      patchFormat({ height: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="delivery-check">
                <input
                  type="checkbox"
                  checked={format.smart}
                  onChange={(e) => patchFormat({ smart: e.target.checked })}
                />
                Recomponer overlays y subtítulos en márgenes seguros
              </label>
              <label>
                Imagen
                <select
                  value={format.fit}
                  onChange={(e) =>
                    patchFormat({ fit: e.target.value as "cover" | "contain" })
                  }
                >
                  <option value="cover">Rellenar · recortar al encuadre</option>
                  <option value="contain">
                    Encajar · conservar toda la imagen
                  </option>
                </select>
              </label>
              <label>
                Ajustar encuadre de
                <select
                  value={focusClip}
                  onChange={(e) => {
                    setFocusClip(e.target.value);
                    const c = videos.find((c) => c.id === e.target.value);
                    if (c)
                      player.current?.seekTo(
                        Math.round(
                          (Math.max(range.start, c.from) * settings.fps) /
                            project.fps,
                        ),
                      );
                  }}
                >
                  <option value="all">Todos los videos · foco general</option>
                  {videos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kind === "video" ? c.name : c.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sequence-settings-row">
                {(["x", "y"] as const).map((axis) => (
                  <label key={axis}>
                    Foco {axis.toUpperCase()} · {Math.round(focus[axis] * 100)}%
                    <input
                      aria-label={`Foco ${axis.toUpperCase()}`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={focus[axis]}
                      onChange={(e) => setFocus(axis, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <button
                disabled={suggesting || !videos.length}
                onClick={() => void suggest()}
              >
                {suggesting
                  ? "Analizando con visión local…"
                  : "Sugerir encuadres con IA local"}
              </button>
              {suggestion && <small role="status">{suggestion}</small>}
              <small>
                La adaptación proporcional y los márgenes son automáticos. El
                foco de cada clip es revisable; la sugerencia local no garantiza
                seguir a un sujeto en movimiento.
              </small>
            </details>
            <details className="delivery-file-list">
              <summary>
                {jobs.length} archivos · {request.ranges.length} rangos ×{" "}
                {request.variants.length} versiones × {request.formats.length}{" "}
                formatos
              </summary>
              {jobs.slice(0, 100).map((j) => (
                <div key={j.name}>{j.name}</div>
              ))}
            </details>
          </section>
        </div>
        {error && (
          <p className="delivery-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>
            {project.name} · {project.width} × {project.height} ·{" "}
            {Number(project.fps.toFixed(3))} fps
          </span>
          <button onClick={onClose}>Cerrar</button>
          <button
            className="primary"
            disabled={busy || jobs.length === 0}
            onClick={() => void send()}
          >
            {busy ? "Enviando…" : `Exportar ${jobs.length} archivos`}
          </button>
        </footer>
      </div>
    </ActionDialog>
  );
}
