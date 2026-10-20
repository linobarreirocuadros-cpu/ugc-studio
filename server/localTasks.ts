import type { Express } from "express";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RenderInternals } from "@remotion/renderer";

type Task = {
  id: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
};
export type TaskContext = { signal: AbortSignal; report: (progress: number, message: string) => void };

/** Una sola tarea pesada local a la vez; el polling no mantiene una petición larga abierta. */
export function createLocalTasks(app: Express) {
  const tasks = new Map<string, { view: Task; controller: AbortController }>();
  let tail: Promise<void> = Promise.resolve();
  app.get("/api/local-tasks/:id", (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: "La tarea ya no está disponible. Vuelve a iniciarla." });
    res.json(task.view);
  });
  app.post("/api/local-tasks/:id/cancel", (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: "Tarea no encontrada." });
    if (task.view.status === "queued" || task.view.status === "running") {
      task.controller.abort();
      task.view.status = "cancelled";
      task.view.message = "Cancelado";
    }
    res.json(task.view);
  });
  return (run: (ctx: TaskContext) => Promise<unknown>) => {
    for (const [id, task] of tasks) {
      if (tasks.size < 100) break;
      if (!["running", "queued"].includes(task.view.status)) tasks.delete(id);
    }
    const view: Task = { id: randomUUID(), status: "queued", progress: 0, message: "En cola local…" };
    const controller = new AbortController();
    tasks.set(view.id, { view, controller });
    tail = tail.then(async () => {
      if (controller.signal.aborted) return;
      view.status = "running";
      try {
        const result = await run({
          signal: controller.signal,
          report: (progress, message) => {
            if (!controller.signal.aborted) Object.assign(view, { progress: Math.max(0, Math.min(100, progress)), message });
          },
        });
        if (controller.signal.aborted) return;
        Object.assign(view, { status: "done", progress: 100, message: "Listo", result });
      } catch (err) {
        if (controller.signal.aborted) return;
        view.status = "error";
        const raw = err instanceof Error ? err.message : String(err);
        view.error = /spawn .*ENOENT/.test(raw) ? "No se encontró una herramienta local. Revisa la preparación de audio/FFmpeg en README." : raw.slice(-1200);
      }
    });
    return { id: view.id };
  };
}

export function localMedia(dataDir: string, src: unknown) {
  if (typeof src !== "string" || !/^\/media\/[^/\\?#]+$/.test(src)) throw new Error("Selecciona un archivo importado en Proyecto.");
  const name = decodeURIComponent(src.slice("/media/".length));
  if (path.basename(name) !== name || /[/\\\0]/.test(name)) throw new Error("Ruta de medio no válida.");
  const file = path.join(dataDir, "media", name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("No se encontró el archivo original. Vuelve a importarlo.");
  return file;
}

export async function fingerprint(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export const cacheKey = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function runProcess(command: string, args: string[], signal?: AbortSignal) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, { windowsHide: true, signal, timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}\n${stderr.slice(-1800)}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function ffmpeg(args: string[], signal?: AbortSignal) {
  try {
    return await runProcess(process.env.UGC_FFMPEG || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], signal);
  } catch (err) {
    if (process.env.UGC_FFMPEG || !(err instanceof Error) || !err.message.includes("ENOENT")) throw err;
    // El binario de render cubre extracción/miniaturas; sus filtros de audio son limitados.
    const child = RenderInternals.callFf({ bin: "ffmpeg", args: ["-hide_banner", "-loglevel", "error", ...args], indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined });
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    try { return await child; } finally { signal?.removeEventListener("abort", abort); }
  }
}

export async function mediaDuration(file: string) {
  const result = await RenderInternals.callFf({ bin: "ffprobe", args: ["-v", "error", "-show_entries", "format=duration", "-of", "json", file], indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined });
  const duration = Number(JSON.parse(result.stdout).format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("El medio no tiene una duración válida.");
  return duration;
}

export function sourceRange(start: unknown, duration: unknown) {
  if (typeof start !== "number" || !Number.isFinite(start) || start < 0 || typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) throw new Error("Rango de origen no válido.");
  return { start, duration };
}
