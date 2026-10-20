import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { cacheKey, ffmpeg, fingerprint, localMedia, mediaDuration, runProcess, type TaskContext } from "./localTasks";

type Enqueue = (run: (ctx: TaskContext) => Promise<unknown>) => { id: string };
const script = fileURLToPath(new URL("../scripts/transcribe_local.py", import.meta.url));
const python = () => process.env.UGC_WHISPER_PYTHON || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local"), "UGC Studio", "runtime", "transcription", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export function registerTranscription(app: Express, dataDir: string, enqueue: Enqueue) {
  const root = path.join(dataDir, "transcripciones"); fs.mkdirSync(root, { recursive: true });
  app.get("/api/transcription/status", async (_req, res) => {
    try { await runProcess(python(), [script, "--status"]); res.json({ ready: true, model: "large-v3" }); }
    catch { res.json({ ready: false, model: "large-v3", error: "Ejecuta Preparar transcripcion local (Windows).bat una vez." }); }
  });
  app.post("/api/transcription", (req, res) => {
    try {
      const source = localMedia(dataDir, req.body.src), language = String(req.body.language || "auto"), vocabulary = String(req.body.vocabulary || "").trim(), force = Boolean(req.body.force);
      if (!["auto", "es", "en"].includes(language) || vocabulary.length > 500) throw new Error("Idioma o vocabulario de transcripción no válido.");
      res.json(enqueue(async ({ report, signal }) => {
        report(2, "Comprobando transcripción local…");
        const duration = await mediaDuration(source);
        if (duration > 1800) throw new Error("Esta versión transcribe archivos de hasta 30 minutos.");
        const weights = process.env.UGC_WHISPER_MODEL_DIR ? await fingerprint(path.join(process.env.UGC_WHISPER_MODEL_DIR, "model.bin")) : "edaa852ec7e145841d8ffdb056a99866b5f0a478";
        const key = cacheKey({ schema: 1, hash: await fingerprint(source), model: "large-v3", weights, language, vocabulary, beam: 5, vad: true });
        const dir = path.join(root, key), result = path.join(dir, "result.json"); fs.mkdirSync(dir, { recursive: true });
        if (!force && fs.existsSync(result)) return JSON.parse(fs.readFileSync(result, "utf8"));
        const wav = path.join(dir, "audio.wav"), temporary = path.join(dir, "result.tmp.json");
        report(10, "Leyendo el sonido original a 16 kHz…");
        await ffmpeg(["-y", "-i", source, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], signal);
        report(20, "Transcribiendo con Whisper large-v3 local. Puede tardar unos minutos…");
        await runProcess(python(), [script, "--input", wav, "--output", temporary, "--language", language, "--vocabulary", vocabulary], signal);
        const transcript = JSON.parse(fs.readFileSync(temporary, "utf8"));
        if (!Array.isArray(transcript.words) || transcript.words.some((w: { text: string; start: number; end: number }) => typeof w.text !== "string" || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end <= w.start || w.end > duration + 0.1)) throw new Error("La transcripción devolvió tiempos no válidos.");
        signal.throwIfAborted(); fs.renameSync(temporary, result); return transcript;
      }));
    } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
}
