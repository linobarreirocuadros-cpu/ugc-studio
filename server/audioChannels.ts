import type { Express } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { RenderInternals } from "@remotion/renderer";
import { localMedia } from "./localTasks";

/** Copia completa PCM para que preview, onda y export usen el mismo mapa de canales. */
export function registerAudioChannels(app: Express, dataDir: string) {
  let queue: Promise<unknown> = Promise.resolve();
  app.post("/api/audio-channels", async (req, res) => {
    try {
      const mode = String(req.body.mode);
      if (!["mono", "left", "right"].includes(mode)) throw new Error("Mapa de canales incorrecto.");
      const file = localMedia(dataDir, req.body.src), stat = await fs.stat(file);
      const key = createHash("sha256").update(`${file}:${stat.size}:${stat.mtimeMs}:${mode}:v1`).digest("hex").slice(0, 24);
      const name = `channels-${key}.wav`, out = path.join(dataDir, "media", name);
      const job = queue.catch(() => {}).then(async () => {
        try { await fs.access(out); return; } catch { /* crear caché */ }
        const temp = out + ".tmp.wav";
        try {
          // -ac 2 normaliza también originales mono antes de elegir L/R.
          const filter = `aformat=channel_layouts=stereo,${mode === "mono" ? "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1" : mode === "left" ? "pan=stereo|c0=c0|c1=c0" : "pan=stereo|c0=c1|c1=c1"}`;
          await RenderInternals.callFf({ bin: "ffmpeg", args: ["-y", "-i", file, "-map", "0:a:0", "-vn", "-af", filter, "-ar", "48000", "-c:a", "pcm_s16le", temp], indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined });
          await fs.rename(temp, out);
        } finally { await fs.rm(temp, { force: true }); }
      });
      queue = job; await job;
      res.json({ src: `/media/${name}`, mode });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
}
