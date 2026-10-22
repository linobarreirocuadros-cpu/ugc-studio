import { useEffect, useState } from "react";
import type { Project } from "../project/types";
import * as ops from "../project/ops";
import { ActionDialog } from "./ActionDialog";
import { formatTimecode } from "./Timeline";
export function ExportRangeControls({
  project,
  frame,
  marks,
  onMarks,
  onApply,
  onExport,
  onSeek,
}: {
  project: Project;
  frame: number;
  marks: { start: number | null; end: number | null };
  onMarks: (r: { start: number | null; end: number | null }) => void;
  onApply: (fn: (p: Project) => Project) => void;
  onExport: (ids?: string[]) => void;
  onSeek: (n: number) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [edit, setEdit] = useState<string | null>(null),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  useEffect(
    () =>
      setSelected((ids) =>
        ids.filter((id) => project.exportRanges?.some((r) => r.id === id)),
      ),
    [project.exportRanges],
  );
  const save = () => {
    const start = marks.start ?? 0,
      end = marks.end ?? frame + 1;
    if (end <= start) {
      setError("Coloca Fin después de Inicio.");
      return;
    }
    setError("");
    const id = ops.newId();
    onApply((p) =>
      ops.setExportRange(p, {
        id,
        name: `Versión ${(p.exportRanges?.length ?? 0) + 1}`,
        start,
        end,
      }),
    );
    setSelected([id]);
  };
  return (
    <div className="export-range-controls">
      <span>Entregas</span>
      <button
        title="Marcar inicio en el cabezal"
        onClick={() => onMarks({ ...marks, start: frame })}
      >
        {"{ Inicio"}
      </button>
      <button
        title="Marcar fin en el cabezal, incluido ese fotograma"
        onClick={() => onMarks({ ...marks, end: frame + 1 })}
      >
        {"Fin }"}
      </button>
      <button onClick={save}>Guardar rango I/O</button>
      {project.exportRanges?.map((r) => (
        <span
          key={r.id}
          className={`export-range-chip ${selected.includes(r.id) ? "range-selected" : ""}`}
        >
          <input
            aria-label={`Seleccionar rango ${r.name}`}
            type="checkbox"
            checked={selected.includes(r.id)}
            onChange={() =>
              setSelected((ids) =>
                ids.includes(r.id)
                  ? ids.filter((id) => id !== r.id)
                  : [...ids, r.id],
              )
            }
          />
          <button
            title={`${formatTimecode(r.start, project.fps)} → ${formatTimecode(r.end, project.fps)} · Clic derecho para exportar`}
            onClick={() => {
              onMarks({ start: r.start, end: r.end });
              onSeek(r.start);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onExport(selected.includes(r.id) ? selected : [r.id]);
            }}
          >{`{ ${r.name} }`}</button>
          <button
            aria-label={`Editar rango ${r.name}`}
            onClick={() => {
              setEdit(r.id);
              setName(r.name);
            }}
          >
            ⋯
          </button>
        </span>
      ))}
      {Boolean(project.exportRanges?.length) && (
        <button
          onClick={() =>
            onExport(
              selected.length
                ? selected
                : project.exportRanges!.map((r) => r.id),
            )
          }
        >
          Exportar rangos
        </button>
      )}
      {error && <span role="alert">{error}</span>}
      {edit && (
        <ActionDialog title="Rango de entrega" onClose={() => setEdit(null)}>
          <label>
            Nombre
            <input
              aria-label="Nombre del rango"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <footer>
            <button
              onClick={() => {
                onApply((p) => ops.deleteExportRange(p, edit));
                setEdit(null);
              }}
            >
              Eliminar rango
            </button>
            <button
              onClick={() => {
                onApply((p) => {
                  const r = p.exportRanges?.find((r) => r.id === edit);
                  return r ? ops.setExportRange(p, { ...r, name }) : p;
                });
                setEdit(null);
              }}
            >
              Guardar nombre
            </button>
            <button
              onClick={() => {
                onExport([edit]);
                setEdit(null);
              }}
            >
              Exportar
            </button>
          </footer>
        </ActionDialog>
      )}
    </div>
  );
}
