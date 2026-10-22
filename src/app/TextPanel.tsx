import { transcriptGroups, transcriptDrag } from "./transcriptSelection";
import { MEDIA_DRAG_TYPE, type MediaDrag } from "./Timeline";
import { NewMotionScene } from "./NewMotionScene";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioClip, Project, VideoClip } from "../project/types";
import { destinationTrack, clipLabel } from "../project/types";
import * as ops from "../project/ops";
import { AIPanel } from "./AIPanel";
import { formatTimecode } from "./Timeline";
import { formatSrt, parseSrt } from "../project/subtitles";
function download(text: string, name: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TextPanel({
  project,
  frame,
  apply,
  onSelect,
  onAddText,
  onProperties,
  epoch,
  onRangePointer,
  onRangeNative,
  onRangeEnd,
}: {
  project: Project;
  frame: number;
  apply: (fn: (p: Project) => Project) => void;
  onSelect: (id: string, frame: number) => void;
  onAddText: () => void;
  onProperties: () => void;
  epoch: number;
  onRangePointer: (
    e: React.PointerEvent,
    payload: MediaDrag,
    onClick?: () => void,
  ) => boolean | void;
  onRangeNative: (payload: MediaDrag) => void;
  onRangeEnd: () => void;
}) {
  const [newScene, setNewScene] = useState(false);
  const [tab, setTab] = useState<"transcript" | "captions" | "graphics">(
      "transcript",
    ),
    [query, setQuery] = useState(""),
    [trackId, setTrackId] = useState("auto"),
    [follow, setFollow] = useState(true),
    [edit, setEdit] = useState<{
      src: string;
      index: number;
      text: string;
    } | null>(null),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const tracks = project.tracks.filter((t) =>
      t.clips.some(
        (c) => (c.kind === "video" || c.kind === "audio") && !c.sequenceId,
      ),
    ),
    target =
      tracks.find((t) => t.id === trackId) ??
      tracks.find((t) => t.id === destinationTrack(project, "video")) ??
      tracks.find((t) => t.kind !== "audio") ??
      tracks[0];
  const groups = useMemo(
    () => transcriptGroups(project, target?.id ?? ""),
    [project, target?.id],
  );
  const words = useMemo(() => groups.flatMap((g) => g.words), [groups]);
  const [selection, setSelection] = useState<{
      anchor: number;
      focus: number;
    } | null>(null),
    [selecting, setSelecting] = useState(false);
  const selectionCleanup = useRef<(() => void) | null>(null),
    lastPress = useRef({ index: -1, time: 0 });
  useEffect(() => {
    setSelection(null);
    selectionCleanup.current?.();
  }, [target?.id, project, query]);
  useEffect(() => () => selectionCleanup.current?.(), []);
  const bounds =
    selection &&
    words.length &&
    selection.anchor < words.length &&
    selection.focus < words.length
      ? {
          start: Math.min(selection.anchor, selection.focus),
          end: Math.max(selection.anchor, selection.focus),
        }
      : null;
  const selectedWords = bounds ? words.slice(bounds.start, bounds.end + 1) : [];
  const payload = () => transcriptDrag(project, selectedWords, epoch);
  const dragSelection = (e: React.PointerEvent, onClick?: () => void) => {
    const value = payload();
    if (value) onRangePointer(e, value, onClick);
  };
  const nativeSelection = (e: React.DragEvent) => {
    const value = payload();
    if (!value) {
      e.preventDefault();
      return;
    }
    onRangeNative(value);
    e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(value));
    e.dataTransfer.effectAllowed = "copy";
  };
  const selectWord = (
    e: React.PointerEvent<HTMLSpanElement>,
    index: number,
  ) => {
    if (e.button !== 0) return;
    const word = words[index],
      now = performance.now(),
      twice =
        lastPress.current.index === index && now - lastPress.current.time < 350;
    lastPress.current = { index, time: now };
    if (twice) {
      e.preventDefault();
      cancelWordEdit.current = false;
      setEdit({ src: word.src, index: word.index, text: word.text });
      return;
    }
    if (e.shiftKey && selection) {
      setSelection({ ...selection, focus: index });
      return;
    }
    if (bounds && index >= bounds.start && index <= bounds.end) {
      dragSelection(e, () => onSelect(word.clipId, word.frame));
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const node = e.currentTarget,
      doc = node.ownerDocument,
      win = doc.defaultView!,
      pointer = e.pointerId;
    let focus = index;
    setSelection({ anchor: index, focus: index });
    setSelecting(true);
    node.focus({ preventScroll: true });
    node.setPointerCapture(pointer);
    selectionCleanup.current?.();
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const hit = doc
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-transcript-word]");
      if (hit && root.current?.contains(hit)) {
        focus = Number(hit.dataset.transcriptWord);
        setSelection({ anchor: index, focus });
      }
    };
    const stop = () => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", cancel, true);
      win.removeEventListener("blur", cancel);
      win.removeEventListener("keydown", key, true);
      if (node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
      selectionCleanup.current = null;
      setSelecting(false);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      move(event);
      stop();
      onSelect(
        words[Math.min(index, focus)].clipId,
        words[Math.min(index, focus)].frame,
      );
    };
    const cancel = () => {
      stop();
      setSelection(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    selectionCleanup.current = stop;
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", cancel, true);
    win.addEventListener("blur", cancel);
    win.addEventListener("keydown", key, true);
  };
  useEffect(() => {
    if (
      !follow ||
      selecting ||
      selectedWords.length ||
      !root.current?.offsetParent
    )
      return;
    root.current
      .querySelector<HTMLElement>(".transcript-active")
      ?.scrollIntoView({ block: "nearest" });
  }, [frame, follow, selecting, selectedWords.length]);
  const captions = project.tracks
      .flatMap((t) => t.clips)
      .filter((c) => c.kind === "caption")
      .sort((a, b) => a.from - b.from),
    graphics = project.tracks
      .flatMap((t) => t.clips)
      .filter((c) => c.kind === "text" || c.kind === "graphic")
      .sort((a, b) => a.from - b.from);
  const matches = (s: string) =>
    s.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const cancelWordEdit = useRef(false);
  const saveWord = () => {
    if (cancelWordEdit.current) {
      cancelWordEdit.current = false;
      setEdit(null);
      return;
    }
    if (edit?.text.trim())
      apply((p) => ops.setTranscriptWord(p, edit.src, edit.index, edit.text));
    setEdit(null);
  };
  return (
    <div className="text-workspace" ref={root}>
      <div
        className="tabs text-tabs"
        role="tablist"
        aria-label="Contenido de Texto"
      >
        {(
          [
            ["transcript", "Transcripción"],
            ["captions", "Subtítulos"],
            ["graphics", "Gráficos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Buscar en Texto"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar en el texto…"
      />
      {tab === "transcript" && (
        <>
          <div className="utility-actions">
            <select
              aria-label="Pista de transcripción"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
            >
              <option value="auto">Pista automática</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              disabled={!groups.length}
              onClick={() =>
                download(
                  groups
                    .map((g) => g.words.map((w) => w.text).join(" "))
                    .join("\n\n"),
                  `${project.name}.txt`,
                )
              }
            >
              Exportar TXT
            </button>
          </div>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
            />
            Seguir cabezal
          </label>
          <div className="transcript-selection-actions">
            {bounds ? (
              <>
                <span>
                  {selectedWords.length} palabras ·{" "}
                  {formatTimecode(
                    Math.max(...selectedWords.map((w) => w.end)) -
                      Math.min(...selectedWords.map((w) => w.frame)),
                    project.fps,
                  )}
                </span>
                <button
                  draggable
                  onPointerDown={(e) => dragSelection(e)}
                  onDragStart={nativeSelection}
                  onDragEnd={onRangeEnd}
                >
                  Arrastrar selección al timeline
                </button>
                <button onClick={() => setSelection(null)}>
                  Limpiar selección
                </button>
              </>
            ) : (
              <span>Selecciona una frase y arrástrala al timeline.</span>
            )}
          </div>
          <div className="transcript-segments">
            {groups
              .filter((g) => matches(g.words.map((w) => w.text).join(" ")))
              .map((g, i) => (
                <article
                  key={`${g.clipId}:${i}`}
                  className={
                    frame >= g.start && frame < g.end ? "transcript-active" : ""
                  }
                >
                  <header>
                    <button onClick={() => onSelect(g.clipId, g.start)}>
                      {formatTimecode(g.start, project.fps)}
                    </button>
                    <span>{g.name}</span>
                  </header>
                  <p>
                    {g.words.map((w) => {
                      const index = words.indexOf(w),
                        selected = Boolean(
                          bounds &&
                            index >= bounds.start &&
                            index <= bounds.end,
                        );
                      return (
                        <span
                          key={`${g.clipId}:${w.index}`}
                          role="option"
                          tabIndex={0}
                          aria-selected={selected}
                          data-command-ui
                          data-transcript-word={index}
                          className={`transcript-word ${frame >= w.frame && frame < w.end ? "word-current" : ""} ${selected ? "word-selected" : ""}`}
                          draggable={selected && !selecting}
                          onPointerDown={(e) => selectWord(e, index)}
                          onDragStart={nativeSelection}
                          onDragEnd={onRangeEnd}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setSelection({ anchor: index, focus: index });
                              onSelect(g.clipId, w.frame);
                            }
                          }}
                          title="Arrastra para seleccionar palabras; vuelve a arrastrar la selección al timeline. Doble clic: corregir."
                        >
                          {w.text + " "}
                        </span>
                      );
                    })}
                  </p>
                </article>
              ))}
            {!groups.length && (
              <p className="hint">
                Transcribe el montaje con las herramientas de abajo. Puedes
                corregir una palabra con doble clic.
              </p>
            )}
          </div>
          {edit && (
            <label>
              Corregir palabra
              <input
                autoFocus
                aria-label="Corregir palabra transcrita"
                value={edit.text}
                onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                onBlur={saveWord}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveWord();
                  if (e.key === "Escape") {
                    cancelWordEdit.current = true;
                    setEdit(null);
                  }
                }}
              />
            </label>
          )}
        </>
      )}
      {tab === "captions" && (
        <>
          <div className="utility-actions">
            <button onClick={() => setNewScene(true)}>+ Escena animada</button>
            <button onClick={() => input.current?.click()}>Importar SRT</button>
            <button
              disabled={!captions.length}
              onClick={() =>
                download(
                  formatSrt(
                    captions.map((c) => ({
                      start: c.from,
                      end: c.from + c.durationInFrames,
                      text: c.words.map((w) => w.text).join(" "),
                    })),
                    project.fps,
                  ),
                  `${project.name}.srt`,
                )
              }
            >
              Exportar SRT
            </button>
            <button
              disabled={!captions.length}
              onClick={() => {
                const c =
                  captions.find(
                    (c) =>
                      c.from <= frame && c.from + c.durationInFrames > frame,
                  ) ?? captions[0];
                if (c) {
                  onSelect(c.id, c.from);
                  onProperties();
                }
              }}
            >
              Estilo
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".srt"
            hidden
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              const commit = apply;
              try {
                const blocks = parseSrt(await file.text(), project.fps);
                commit((p) => ops.importSubtitleBlocks(p, blocks));
                setError("");
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
          {captions
            .filter((c) => matches(c.words.map((w) => w.text).join(" ")))
            .map((c) => (
              <article className="caption-edit-row" key={c.id}>
                <button onClick={() => onSelect(c.id, c.from)}>
                  {formatTimecode(c.from, project.fps)}
                </button>
                <textarea
                  key={`${c.id}:${c.words.map((w) => w.text).join(" ")}`}
                  aria-label={`Subtítulo ${formatTimecode(c.from, project.fps)}`}
                  disabled={project.tracks.some(
                    (t) => t.locked && t.clips.some((x) => x.id === c.id),
                  )}
                  defaultValue={c.words.map((w) => w.text).join(" ")}
                  onFocus={() => onSelect(c.id, c.from)}
                  onBlur={(e) => {
                    const text = e.target.value;
                    if (!text.trim()) {
                      e.target.value = c.words.map((w) => w.text).join(" ");
                      setError(
                        "El texto no puede estar vacío. Para quitar este subtítulo, elimínalo en el timeline.",
                      );
                      return;
                    }
                    setError("");
                    if (
                      text.trim() &&
                      text !== c.words.map((w) => w.text).join(" ")
                    )
                      apply((p) => ops.setCaptionText(p, c.id, text));
                  }}
                />
              </article>
            ))}
          {!captions.length && (
            <p className="hint">
              Genera subtítulos con la transcripción o importa un SRT.
            </p>
          )}
        </>
      )}
      {tab === "graphics" && (
        <>
          <button onClick={onAddText}>+ Texto</button>
          <button onClick={() => setNewScene(true)}>+ Escena animada</button>
          {graphics
            .filter((c) => matches(clipLabel(c)))
            .map((c) => (
              <button
                className="search-result"
                key={c.id}
                onClick={() => {
                  onSelect(c.id, c.from);
                  onProperties();
                }}
              >
                <b>{clipLabel(c)}</b>
                <small>{formatTimecode(c.from, project.fps)}</small>
              </button>
            ))}
        </>
      )}
      {newScene && (
        <NewMotionScene
          project={project}
          frame={frame}
          apply={apply}
          onCreated={(id, at) => {
            onSelect(id, at);
            onProperties();
          }}
          onClose={() => setNewScene(false)}
        />
      )}
      {tab !== "graphics" && (
        <details className="transcription-tools">
          <summary>Transcribir y generar subtítulos</summary>
          <AIPanel project={project} apply={apply} />
        </details>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
