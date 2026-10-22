import {registerExportQueue} from "./exportQueue";
import {registerAudioMix,prepareAudioMix} from "./audioMix";
// Servidor local: guarda los archivos importados y renderiza la exportación con Remotion.
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { RenderInternals, renderMedia, selectComposition } from "@remotion/renderer";
import type { Project } from "../src/project/types";
import { assertProject } from "../src/project/projectFile";
import { registerChatRoutes } from "./llm";
import { createLocalTasks } from "./localTasks";
import { registerVision } from "./vision";
import { registerAudioProcessing } from "./audioProcessing";
import { registerTranscription } from "./transcription";
import { localMedia } from "./localTasks";
import { registerMediaMetadata } from "./mediaMetadata";
import { registerAudioChannels } from "./audioChannels";
import { registerPreviewQuality } from "./previewQuality";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Los videos y exportaciones viven fuera de la carpeta del programa, para que al actualizarlo
// (descargar un ZIP nuevo) no se pierdan. Por defecto: <carpeta de usuario>/UGC Studio
const DATA_DIR = process.env.UGC_DATA_DIR ?? path.join(os.homedir(), "UGC Studio");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const PROXY_DIR = path.join(MEDIA_DIR, "proxies");
const OUT_DIR = path.join(DATA_DIR, "Exportaciones");
const FOLEY_DIR = path.join(DATA_DIR, "Foley");
const FOLEY_FOLDERS = ["Whoosh", "Impactos", "Pops y clicks", "Risers", "Transiciones", "Ambiente", "Música"];
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i;
const PORT = Number(process.env.PORT ?? 3001);
const BASE_URL = `http://localhost:${PORT}`;

fs.mkdirSync(PROXY_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of FOLEY_FOLDERS) fs.mkdirSync(path.join(FOLEY_DIR, f), { recursive: true });

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use("/media", express.static(MEDIA_DIR));
app.use("/out", express.static(OUT_DIR));
app.use("/library", express.static(FOLEY_DIR));
registerPreviewQuality(app, DATA_DIR);
registerAudioMix(app,DATA_DIR);
registerAudioChannels(app, DATA_DIR);
registerMediaMetadata(app, DATA_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
});
const receiveFile:express.RequestHandler=(req,res,next)=>{
  upload.single("file")(req,res,(error:unknown)=>{
    if(error){res.status(400).json({error:"No se pudo recibir el archivo. Comprueba el formato de la solicitud y vuelve a importarlo."});return;}
    next();
  });
};

// --- Proxies --------------------------------------------------------------------
// Copia liviana (lado corto 540 px, keyframe cada 0,5 s) para que la vista previa sea fluida
// y los saltos entre cortes sean instantáneos. La exportación siempre usa el archivo original.
// Usa el ffmpeg que trae Remotion, así no hay que instalar nada.

const proxyJobs = new Map<string, Promise<string>>();
const waveformJobs = new Map<string, Promise<string>>();
const audioInfo = new Map<string, Promise<boolean>>();
const hasAudio = (file: string) => {
  const key = `${file}:${fs.statSync(file).mtimeMs}`;
  if (!audioInfo.has(key)) audioInfo.set(key, RenderInternals.callFf({ bin: "ffprobe", args: ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "json", file], indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined }).then((r) => Boolean(JSON.parse(r.stdout).streams?.length)).catch((error) => { audioInfo.delete(key); throw error; }));
  return audioInfo.get(key)!;
};
app.post("/api/media-info", async (req, res) => {
  try { res.json({ hasAudio: await hasAudio(localMedia(DATA_DIR, req.body.src)) }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

const makeProxy = (filename: string) => {
  const existing = proxyJobs.get(filename);
  if (existing) return existing;
  const outName = filename.replace(/\.[^.]+$/, "") + ".proxy.mp4";
  const outPath = path.join(PROXY_DIR, outName);
  const job = (async () => {
    if (!fs.existsSync(outPath)) {
      const tmp = outPath + ".tmp.mp4";
      await RenderInternals.callFf({
        bin: "ffmpeg",
        args: [
          "-y", "-i", path.join(MEDIA_DIR, filename),
          "-vf", "scale='if(lt(iw,ih),540,-2)':'if(lt(iw,ih),-2,540)'",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "15", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
          tmp,
        ],
        indent: false,
        logLevel: "error",
        binariesDirectory: null,
        cancelSignal: undefined,
      });
      fs.renameSync(tmp, outPath);
    }
    return `/media/proxies/${outName}`;
  })();
  job.catch(() => proxyJobs.delete(filename));
  proxyJobs.set(filename, job);
  return job;
};

// Imagen de amplitud para las pistas de audio. Se calcula localmente y se guarda
// junto a los proxies; no forma parte del proyecto ni modifica el archivo original.
const makeWaveform = (filename: string) => {
  const existing = waveformJobs.get(filename);
  if (existing) return existing;
  const outName = filename.replace(/\.[^.]+$/, "") + ".waveform.svg";
  const outPath = path.join(PROXY_DIR, outName);
  const job = (async () => {
    if (!fs.existsSync(outPath)) {
      const tmp = outPath + ".tmp.wav";
      try {
        // El FFmpeg incluido con Remotion no trae showwavespic; decodificamos a WAV
        // mono y dibujamos la forma de onda nosotros, sin instalar otro programa.
        await RenderInternals.callFf({
          bin: "ffmpeg",
          args: ["-y", "-i", path.join(MEDIA_DIR, filename), "-vn", "-ac", "1", "-ar", "4000", "-c:a", "pcm_s16le", "-f", "wav", tmp],
          indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined,
        });
        const wav = fs.readFileSync(tmp);
        let dataOffset = 0;
        let dataLength = 0;
        for (let pos = 12; pos + 8 <= wav.length;) {
          const size = wav.readUInt32LE(pos + 4);
          if (wav.toString("ascii", pos, pos + 4) === "data") {
            dataOffset = pos + 8;
            dataLength = Math.min(size, wav.length - dataOffset);
            break;
          }
          pos += 8 + size + (size % 2);
        }
        if (!dataOffset || dataLength < 2) throw new Error("WAV sin muestras de audio");
        const samples = Math.floor(dataLength / 2);
        const width = 2400;
        const peaks = Array.from({ length: width }, (_, i) => {
          const start = Math.floor(i * samples / width);
          const end = Math.max(start + 1, Math.floor((i + 1) * samples / width));
          let peak = 0;
          for (let j = start; j < end && j < samples; j++)
            peak = Math.max(peak, Math.abs(wav.readInt16LE(dataOffset + j * 2)));
          return peak;
        });
        const max = Math.max(1, ...peaks);
        const bars = peaks.map((p, i) => {
          const amplitude = Math.max(1, Math.round(p / max * 29));
          return `M${i} ${32 - amplitude}v${amplitude * 2}`;
        }).join("");
        fs.writeFileSync(outPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 64" preserveAspectRatio="none"><path d="${bars}" stroke="#8ee6af" stroke-width="1"/></svg>`);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
    return `/media/proxies/${outName}`;
  })();
  job.catch(() => waveformJobs.delete(filename));
  waveformJobs.set(filename, job);
  return job;
};

app.post("/api/upload", receiveFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });
  const src = `/media/${req.file.filename}`;
  const isAudio = req.file.mimetype.startsWith("audio/") || AUDIO_EXT.test(req.file.originalname);
  let proxySrc: string | undefined;
  if (!isAudio) {
    try {
      proxySrc = await makeProxy(req.file.filename);
    } catch (err) {
      console.error("No se pudo crear el proxy:", err); // se sigue usando el original
    }
  }
  res.json({ src, proxySrc, name: req.file.originalname, kind: isAudio ? "audio" : "video", hasAudio: isAudio || await hasAudio(req.file.path).catch(() => true) });
});

// Convierte la toma del micrófono a WAV con duración fiable (WebM puede declarar Infinity).
app.post("/api/record-voice", receiveFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió la grabación" });
  try {
    if (req.file.size > 50 * 1024 * 1024 || !req.file.mimetype.startsWith("audio/")) throw new Error("Usa una toma de audio de hasta 50 MB.");
    const filename = `${req.file.filename.replace(/\.[^.]+$/, "")}.wav`, output = path.join(MEDIA_DIR, filename);
    await RenderInternals.callFf({ bin: "ffmpeg", args: ["-y", "-i", req.file.path, "-vn", "-t", "600", "-ar", "48000", "-c:a", "pcm_s16le", output], indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined });
    const info = await RenderInternals.callFf({ bin: "ffprobe", args: ["-v", "error", "-show_entries", "format=duration", "-of", "json", output], indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined });
    const durationSeconds = Number(JSON.parse(info.stdout).format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("La grabación no contiene audio válido.");
    res.json({ src: `/media/${filename}`, name: `Grabación ${new Date().toLocaleTimeString("es", { hour12: false })}.wav`, kind: "audio", hasAudio: true, durationSeconds });
  } catch (failure) { res.status(400).json({ error: failure instanceof Error ? failure.message : "No se pudo guardar la grabación" }); }
});

// Para proyectos creados antes de que existieran los proxies.
app.post("/api/proxy", async (req, res) => {
  const src = String(req.body.src ?? "");
  const filename = path.basename(src);
  if (!src.startsWith("/media/") || !fs.existsSync(path.join(MEDIA_DIR, filename))) {
    return res.status(404).json({ error: "Archivo no encontrado" });
  }
  try {
    res.json({ proxySrc: await makeProxy(filename) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/waveform", async (req, res) => {
  const src = String(req.body.src ?? "");
  const filename = path.basename(src);
  if (!src.startsWith("/media/") || !fs.existsSync(path.join(MEDIA_DIR, filename))) {
    return res.status(404).json({ error: "Archivo no encontrado" });
  }
  try {
    res.json({ waveformSrc: await makeWaveform(filename) });
  } catch (err) {
    // Algunos videos no contienen sonido; simplemente no muestran onda.
    console.error("No se pudo crear la onda de audio:", err instanceof Error ? err.message : String(err));
    res.json({ waveformSrc: null });
  }
});

// --- Biblioteca de Foley ----------------------------------------------------------
// Carpetas dentro de "UGC Studio/Foley". El usuario arrastra ahí sus sonidos y aparecen en la app.

app.get("/api/library", (_req, res) => {
  const folders = fs
    .readdirSync(FOLEY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      folder: d.name,
      files: fs
        .readdirSync(path.join(FOLEY_DIR, d.name))
        .filter((f) => AUDIO_EXT.test(f))
        .sort()
        .map((f) => ({ name: f, src: `/library/${encodeURIComponent(d.name)}/${encodeURIComponent(f)}` })),
    }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
  res.json({ folders });
});

// Abre una carpeta en el Explorador (Windows) o Finder (Mac).
app.post("/api/open-folder", (req, res) => {
  const which = req.body.which as "foley" | "exports" | "data";
  const dir = which === "foley" ? FOLEY_DIR : which === "exports" ? OUT_DIR : DATA_DIR;
  const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
  try {
    spawn(cmd, [dir], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    res.json({ ok: true, dir });
  } catch {
    res.json({ ok: false, dir });
  }
});

registerChatRoutes(app, DATA_DIR);
const enqueueLocal = createLocalTasks(app);
registerVision(app, DATA_DIR, enqueueLocal);
registerAudioProcessing(app, DATA_DIR, enqueueLocal);
registerTranscription(app, DATA_DIR, enqueueLocal);

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
let bundleKey = "";
const getBundle = () => {
  // Reutilizar el paquete solo mientras no cambien las fuentes del renderizador.
  const sourceStamp = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceStamp(file);
    const stat = fs.statSync(file); return [`${file}:${stat.mtimeMs}:${stat.size}`];
  });
  const key = [...sourceStamp(path.join(ROOT, "src/remotion")), ...sourceStamp(path.join(ROOT, "src/project")), String(fs.statSync(path.join(ROOT, "package-lock.json")).mtimeMs)].join("|");
  if (!bundlePromise || key !== bundleKey) {
    bundleKey = key;
    const pending = bundle({ entryPoint: path.join(ROOT, "src/remotion/index.ts") });
    bundlePromise = pending;
    void pending.catch(() => { if (bundlePromise === pending) bundlePromise = null; });
  }
  return bundlePromise;
};

registerExportQueue(app,DATA_DIR,BASE_URL,getBundle);

app.post("/api/render", async (req, res) => {
  const project = req.body.project as Project;
  const preset = (req.body.preset as Preset) ?? "h264-high";
  const cfg = PRESETS[preset];
  if (!project || !cfg) return res.status(400).json({ error: "Proyecto o preset inválido" });
  try{assertProject(project);}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}

  const id = Date.now().toString(36);
  const job: Job = { status: "rendering", progress: 0 };
  jobs.set(id, job);
  res.json({ id });

  try {
    const serveUrl = await getBundle();
    const inputProps = { project, mediaBaseUrl: BASE_URL, audioSources:await prepareAudioMix(project,DATA_DIR) };
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
      // Limitar lectores simultáneos cuando el mismo archivo aparece en varios cortes.
      concurrency: 2,
      offthreadVideoCacheSizeInBytes: 1024 * 1024 * 1024,
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

app.listen(PORT, () => {
  console.log(`Servidor UGC Studio en ${BASE_URL}`);
  console.log(`Tus videos y exportaciones se guardan en: ${DATA_DIR}`);
});
