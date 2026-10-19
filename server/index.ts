// Servidor local: guarda los archivos importados y renderiza la exportación con Remotion.
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Project } from "../src/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_DIR = path.join(ROOT, "media");
const OUT_DIR = path.join(ROOT, "out");
const PORT = Number(process.env.PORT ?? 3001);
const BASE_URL = `http://localhost:${PORT}`;

fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use("/media", express.static(MEDIA_DIR));
app.use("/out", express.static(OUT_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });
  res.json({ src: `/media/${req.file.filename}`, name: req.file.originalname });
});

// --- Exportación ---------------------------------------------------------------

type Preset = "h264-high" | "h264-draft" | "prores-hq";
const PRESETS: Record<Preset, { codec: "h264" | "prores"; ext: string; crf?: number; prores?: "hq" }> = {
  "h264-high": { codec: "h264", ext: "mp4", crf: 16 },
  "h264-draft": { codec: "h264", ext: "mp4", crf: 28 },
  "prores-hq": { codec: "prores", ext: "mov", prores: "hq" },
};

type Job = { status: "rendering" | "done" | "error"; progress: number; url?: string; error?: string };
const jobs = new Map<string, Job>();

let bundlePromise: Promise<string> | null = null;
const getBundle = () => {
  // En desarrollo re-empaquetamos si cambia el código; por ahora lo cacheamos por proceso.
  bundlePromise ??= bundle({ entryPoint: path.join(ROOT, "src/remotion/index.ts") });
  return bundlePromise;
};

app.post("/api/render", async (req, res) => {
  const project = req.body.project as Project;
  const preset = (req.body.preset as Preset) ?? "h264-high";
  const cfg = PRESETS[preset];
  if (!project || !cfg) return res.status(400).json({ error: "Proyecto o preset inválido" });

  const id = Date.now().toString(36);
  const job: Job = { status: "rendering", progress: 0 };
  jobs.set(id, job);
  res.json({ id });

  try {
    const serveUrl = await getBundle();
    const inputProps = { project, mediaBaseUrl: BASE_URL };
    const browserExecutable = process.env.REMOTION_BROWSER ?? null;
    const composition = await selectComposition({ serveUrl, id: "Project", inputProps, browserExecutable });
    const fileName = `${project.name.replace(/[^\w\-]+/g, "_")}_${id}.${cfg.ext}`;
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: cfg.codec,
      crf: cfg.crf,
      proResProfile: cfg.prores,
      outputLocation: path.join(OUT_DIR, fileName),
      browserExecutable,
      onProgress: ({ progress }) => (job.progress = progress),
    });
    job.status = "done";
    job.progress = 1;
    job.url = `/out/${fileName}`;
  } catch (err) {
    console.error(err);
    job.status = "error";
    job.error = err instanceof Error ? err.message : String(err);
  }
});

app.get("/api/render/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "No existe" });
  res.json(job);
});

// Evita que un error de Remotion (ej. sin internet al descargar Chrome) tumbe el servidor.
process.on("unhandledRejection", (err) => {
  console.error("Error no manejado:", err);
  for (const job of jobs.values()) {
    if (job.status === "rendering") {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    }
  }
});

app.listen(PORT, () => console.log(`Servidor UGC Studio en ${BASE_URL}`));
