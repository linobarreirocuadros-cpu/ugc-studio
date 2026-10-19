import { useEffect, useRef, useState } from "react";

type LibraryFile = { name: string; src: string };
type LibraryFolder = { folder: string; files: LibraryFile[] };

type Props = {
  /** Agrega el sonido a la pista de efectos en la posición del cabezal. */
  onAdd: (file: LibraryFile) => void;
};

export const openFolder = (which: "foley" | "exports" | "data") =>
  fetch("/api/open-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ which }),
  });

/** Biblioteca de sonidos: carpetas dentro de "UGC Studio/Foley" en el computador del usuario. */
export function FoleyPanel({ onAdd }: Props) {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const refresh = () =>
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => setFolders(d.folders ?? []))
      .catch(() => setFolders([]));

  useEffect(() => {
    refresh();
    // Al volver a la ventana (p. ej. tras copiar sonidos a la carpeta) se actualiza sola
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      audio.current?.pause();
    };
  }, []);

  const preview = (file: LibraryFile) => {
    audio.current?.pause();
    if (playing === file.src) {
      setPlaying(null);
      return;
    }
    const a = new Audio(file.src);
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
    audio.current = a;
    setPlaying(file.src);
  };

  const total = folders.reduce((n, f) => n + f.files.length, 0);

  return (
    <div className="foley">
      <div className="foley-actions">
        <button onClick={() => openFolder("foley")}>Abrir carpeta</button>
        <button onClick={refresh} title="Actualizar">↻</button>
      </div>
      {total === 0 && (
        <p className="hint">
          Copia tus sonidos (mp3, wav…) a las carpetas de <b>UGC Studio/Foley</b> en tu computador y aparecerán aquí.
        </p>
      )}
      {folders.map((f) => (
        <div key={f.folder} className="foley-folder">
          <button className="foley-folder-name" onClick={() => setOpen(open === f.folder ? null : f.folder)}>
            {open === f.folder ? "▾" : "▸"} {f.folder} <span className="hint">({f.files.length})</span>
          </button>
          {open === f.folder &&
            f.files.map((file) => (
              <div
                key={file.src}
                className={`foley-file ${playing === file.src ? "playing" : ""}`}
                onDoubleClick={() => onAdd(file)}
                title="Clic: escuchar · Doble clic: agregar en A2 donde está el cabezal"
              >
                <button className="foley-play" onClick={() => preview(file)}>
                  {playing === file.src ? "■" : "▶"}
                </button>
                <span>{file.name.replace(/\.[^.]+$/, "")}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
