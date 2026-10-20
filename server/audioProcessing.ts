import type { Express } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cacheKey, ffmpeg, fingerprint, localMedia, mediaDuration, runProcess, sourceRange, type TaskContext } from "./localTasks";

type Enqueue = (run: (ctx: TaskContext) => Promise<unknown>) => { id: string };
const MODES = ["clean", "separate", "separate-clean"];
const runtime = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local"), "UGC Studio", "runtime", "audio");
const python = () => process.env.UGC_AUDIO_PYTHON || path.join(runtime(), process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const modelPath = () => process.env.UGC_AUDIO_MODEL || path.join(runtime(), "models", "resemble-denoiser.onnx");
const script = fileURLToPath(new URL("../scripts/separate_audio.py", import.meta.url));

export function registerAudioProcessing(app: Express, dataDir: string, enqueue: Enqueue) {
  const mediaDir = path.join(dataDir, "media"), cacheDir = path.join(dataDir, "audio-procesado");
  fs.mkdirSync(cacheDir, { recursive: true });
  app.get("/api/audio/status", async (_req, res) => {
    const py = python();
    let separator = false, cleaner = false;
    try { await runProcess(py, ["-c", "import onnxruntime,numpy,soundfile"]); separator = fs.existsSync(modelPath()); } catch { /* optional runtime */ }
    try {
      const { stdout } = await ffmpeg(["-filters"]);
      cleaner = stdout.includes("afftdn") && stdout.includes("loudnorm");
    } catch { /* missing ffmpeg */ }
    res.json({ separator, cleaner, separatorName: "Resemble Denoiser ONNX", cleanerName: "FFmpeg: reducción de ruido y nivelación" });
  });
  app.post("/api/audio/process", (req, res) => {
    try {
      const file = localMedia(dataDir, req.body.src), range = sourceRange(req.body.start, req.body.duration);
      const mode = String(req.body.mode);
      if (!MODES.includes(mode)) throw new Error("Elige limpiar, separar o separar y limpiar.");
      if (range.duration > 180) throw new Error("Procesa clips de hasta 3 minutos por tarea en esta versión.");
      res.json(enqueue(async ({ signal, report }) => {
        report(2, "Preparando audio del original…");
        const fullDuration = await mediaDuration(file);
        const duration = Math.min(range.duration, fullDuration - range.start);
        if (duration <= 0) throw new Error("El rango queda fuera del archivo original.");
        const key = cacheKey({ schema: 3, hash: await fingerprint(file), start: range.start, duration, mode, model: "resemble-denoiser-490640369540d1b0" });
        const dir = path.join(cacheDir, key), manifest = path.join(dir, "result.json");
        if (fs.existsSync(manifest)) {
          const previous = JSON.parse(fs.readFileSync(manifest, "utf8"));
          try { if (previous.stems.every((s: { src: string }) => Boolean(localMedia(dataDir, s.src)))) return previous; }
          catch { /* un derivado fue retirado: volver a generarlo */ }
        }
        fs.mkdirSync(dir, { recursive: true });
        const input = path.join(dir, "input.wav"), rawVoice = path.join(dir, "voice.wav"), rawBackground = path.join(dir, "background.wav");
        await ffmpeg(["-y", "-ss", String(range.start), "-i", file, "-t", String(duration), "-vn", "-ar", "44100", "-ac", "2", "-c:a", "pcm_f32le", input], signal);
        if (mode !== "clean") {
          if (!fs.existsSync(python()) && !process.env.UGC_AUDIO_PYTHON) throw new Error("Prepara el separador local con Preparar audio local (Windows).bat y vuelve a intentarlo.");
          if (!fs.existsSync(modelPath())) throw new Error("Falta el modelo de audio. Ejecuta Preparar audio local (Windows).bat.");
          report(15, "Extrayendo voz con Resemble Denoiser local…");
          await runProcess(python(), [script, input, rawVoice, rawBackground, "--model", modelPath()], signal);
        }
        report(80, mode === "separate" ? "Guardando pistas separadas…" : "Reduciendo ruido y nivelando voz…");
        const stems: { role: "voice" | "background"; src: string; name: string }[] = [];
        const voiceName = `audio_${key}_voz.wav`, voicePath = path.join(mediaDir, voiceName);
        const filters = mode === "separate" ? [] : ["highpass=f=70", "afftdn=nr=10:nf=-30:tn=1", "loudnorm=I=-16:TP=-1.5:LRA=9"];
        filters.push("aresample=44100", "apad", `atrim=duration=${duration}`);
        try {
          await ffmpeg(["-y", "-i", mode === "clean" ? input : rawVoice, "-af", filters.join(","), "-ar", "44100", "-ac", "2", "-c:a", "pcm_f32le", voicePath], signal);
        } catch (error) {
          if (String(error).includes("No such filter")) throw new Error("La limpieza necesita FFmpeg completo en PATH (o UGC_FFMPEG). El FFmpeg reducido del render no trae esos filtros.");
          throw error;
        }
        stems.push({ role: "voice", src: `/media/${voiceName}`, name: mode === "separate" ? "Voz separada" : "Voz limpia" });
        if (mode !== "clean") {
          const backgroundName = `audio_${key}_fondo.wav`;
          await ffmpeg(["-y", "-i", rawBackground, "-af", `apad,atrim=duration=${duration}`, "-c:a", "pcm_f32le", path.join(mediaDir, backgroundName)], signal);
          stems.push({ role: "background", src: `/media/${backgroundName}`, name: "Fondo y música" });
        }
        signal.throwIfAborted();
        const result = { mode, duration, stems, engine: mode === "clean" ? "FFmpeg" : "Resemble Denoiser ONNX + FFmpeg" };
        fs.writeFileSync(manifest, JSON.stringify(result, null, 2));
        return result;
      }));
    } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : String(err) }); }
  });
}
