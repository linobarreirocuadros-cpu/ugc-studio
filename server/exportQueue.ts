import { copyTimelineRange } from "../src/project/ops";
import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  renderMedia,
  selectComposition,
  makeCancelSignal,
  RenderInternals,
} from "@remotion/renderer";
import { assertProject } from "../src/project/projectFile";
import {
  deliverySrt,
  deliveryJobs,
  deliveryProject,
  slug,
  validateExportRequest,
  type ExportRequest,
} from "../src/project/exportPlan";
import { ffmpeg } from "./localTasks";
import { prepareAudioMix } from "./audioMix";
type Item = {
  id: string;
  name: string;
  status: "pending" | "rendering" | "done" | "error" | "cancelled";
  progress: number;
  url?: string;
  srtUrl?: string;
  projectUrl?: string;
  error?: string;
  seconds?: number;
  actual?: string;
};
type Batch = {
  id: string;
  created: string;
  name: string;
  status: "queued" | "rendering" | "done" | "error" | "cancelled";
  items: Item[];
  directory: string;
  folderKey?: string;
  request: ExportRequest;
  cancelled: boolean;
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function exportDirectory(base: string, folder: string, id: string) {
  if (
    folder.length > 180 ||
    folder
      .split(/[\\/]/)
      .some(
        (p) =>
          p === ".." ||
          /[<>:"|?*\x00-\x1f]/.test(p) ||
          /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p),
      )
  )
    throw new Error("Subcarpeta de salida inválida");
  const root = path.resolve(base, "Exportaciones"),
    target = path.resolve(root, folder, id);
  if (!target.toLowerCase().startsWith(root.toLowerCase() + path.sep))
    throw new Error("La salida debe estar dentro de Exportaciones");
  return target;
}
export function registerExportQueue(
  app: Express,
  dataDir: string,
  baseUrl: string,
  getBundle: () => Promise<string>,
) {
  const stateDir = path.join(dataDir, "export-jobs");
  fs.mkdirSync(stateDir, { recursive: true });
  const batches: Batch[] = [];
  let active = false,
    cancelCurrent: (() => void) | undefined;
  const stateFile = path.join(stateDir, "queue.json"),
    save = () => {
      const tmp = stateFile + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(batches));
      fs.renameSync(tmp, stateFile);
    };
  try {
    const saved: Batch[] = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!Array.isArray(saved)) throw new Error("Cola inválida");
    let damaged = false;
    for (const b of saved) {
      try {
        if (
          !/^[a-f0-9-]{36}$/.test(b.id) ||
          !Array.isArray(b.items) ||
          b.items.some(
            (i) =>
              !/^[a-f0-9-]{36}$/.test(i.id) ||
              !/^[-a-zA-Z0-9_]+\.(mp4|mov|webm|wav)$/.test(i.name),
          )
        )
          throw new Error("Entrada de cola inválida");
        assertProject(b.request.project);
        b.directory = exportDirectory(
          dataDir,
          b.request.directory,
          b.folderKey ?? `${slug(b.request.name)}_${b.id.slice(0, 8)}`,
        );
        for (const item of b.items)
          if (item.status === "rendering" || item.status === "pending") {
            item.status = "error";
            item.error =
              "El servidor se reinició; puedes reintentar esta salida.";
          }
        if (b.status === "rendering" || b.status === "queued")
          b.status = "error";
        batches.push(b);
      } catch {
        damaged = true;
      }
    }
    if (damaged)
      fs.copyFileSync(
        stateFile,
        path.join(stateDir, `queue-recuperacion-${Date.now()}.json`),
      );
  } catch {
    if (fs.existsSync(stateFile))
      fs.copyFileSync(
        stateFile,
        path.join(stateDir, `queue-recuperacion-${Date.now()}.json`),
      );
  }
  const publicBatch = (b: Batch) => ({
    id: b.id,
    created: b.created,
    name: b.name,
    status: b.status,
    items: b.items,
    directory: b.directory,
  });
  const writeSrt = (
    b: Batch,
    index: number,
    project: ReturnType<typeof deliveryProject>,
    start: number,
    end: number,
  ) => {
    const job = b.items[index];
    fs.writeFileSync(
      path.join(b.directory, job.name + ".srt"),
      deliverySrt(project, start, end),
    );
    job.srtUrl = `/api/export-queue/${b.id}/file/${job.id}/srt`;
  };
  const run = async () => {
    if (active) return;
    active = true;
    try {
      for (;;) {
        const b = batches.find((candidate) => candidate.status === "queued");
        if (!b) break;
        b.status = "rendering";
        save();
        for (let i = 0; i < b.items.length; i++) {
          const item = b.items[i];
          if (item.status !== "pending") continue;
          if (b.cancelled) {
            item.status = "cancelled";
            continue;
          }
          item.status = "rendering";
          save();
          const started = Date.now(),
            cancel = makeCancelSignal(),
            muxController = new AbortController();
          const stageFile = path.join(
              b.directory,
              `.${item.id}${path.extname(item.name)}`,
            ),
            audioStage = path.join(b.directory, `.${item.id}.audio.wav`);
          cancelCurrent = () => {
            cancel.cancel();
            muxController.abort();
          };
          try {
            for (const temporary of [stageFile, audioStage])
              if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            const plan = deliveryJobs(b.request)[i],
              s = b.request.settings,
              project = deliveryProject(
                b.request.project,
                plan.variant,
                plan.format,
                s,
              ),
              ratio = s.fps / b.request.project.fps;
            const start = Math.round(plan.range.start * ratio),
              end = Math.max(start + 1, Math.round(plan.range.end * ratio)),
              audioOnly = s.codec === "wav",
              alpha = plan.variant.transparent && !audioOnly,
              codec = alpha ? "prores" : s.codec;
            const serveUrl = await getBundle();
            if (b.cancelled) throw new Error("Cancelado");
            const inputProps = {
              project,
              mediaBaseUrl: baseUrl,
              audioSources: await prepareAudioMix(project, dataDir),
              output: audioOnly ? "audio" : "both",
              transparentBackground: alpha,
              durationOverride: Math.max(end, 1),
            };
            const browserExecutable = process.env.REMOTION_BROWSER ?? null,
              composition = await selectComposition({
                serveUrl,
                id: "Project",
                inputProps,
                browserExecutable,
              });
            await renderMedia({
              serveUrl,
              composition: {
                ...composition,
                durationInFrames: Math.max(end, composition.durationInFrames),
              },
              inputProps,
              codec,
              outputLocation: stageFile,
              // Separar PCM evita una segunda compresión y conserva el reloj del contenedor nativo.
              separateAudioTo:
                audioOnly || !s.audio || !plan.variant.audio
                  ? undefined
                  : audioStage,
              browserExecutable,
              concurrency: 2,
              disallowParallelEncoding: true,
              gopSize: s.keyframeInterval,
              enforceAudioTrack: audioOnly,
              offthreadVideoCacheSizeInBytes: 1024 ** 3,
              frameRange: [start, end - 1],
              cancelSignal: cancel.cancelSignal,
              crf:
                codec === "prores" || audioOnly || s.rateControl !== "quality"
                  ? undefined
                  : s.crf,
              videoBitrate:
                codec === "prores" || audioOnly || s.rateControl === "quality"
                  ? undefined
                  : `${s.bitrateMbps}M`,
              encodingMaxRate:
                codec === "prores" || audioOnly || s.rateControl === "quality"
                  ? undefined
                  : `${s.rateControl === "cbr" ? s.bitrateMbps : s.maxBitrateMbps}M`,
              encodingBufferSize:
                codec === "prores" || audioOnly || s.rateControl === "quality"
                  ? undefined
                  : `${s.maxBitrateMbps * 2}M`,
              proResProfile:
                codec === "prores"
                  ? alpha
                    ? "4444"
                    : s.proresProfile === "lt"
                      ? "light"
                      : s.proresProfile
                  : undefined,
              pixelFormat:
                codec === "prores"
                  ? alpha || s.proresProfile.startsWith("4444")
                    ? "yuva444p10le"
                    : "yuv422p10le"
                  : audioOnly
                    ? undefined
                    : s.pixelFormat,
              imageFormat: alpha ? "png" : "jpeg",
              jpegQuality: alpha ? undefined : s.imageQuality,
              audioCodec:
                audioOnly || (s.audio && plan.variant.audio)
                  ? "pcm-16"
                  : undefined,
              sampleRate: s.sampleRate,
              muted: !s.audio || !plan.variant.audio,
              colorSpace: s.colorSpace,
              metadata: s.metadata,
              logLevel: s.log === "frames" ? "verbose" : "error",
              ffmpegOverride: ({ args, type }) =>
                type !== "stitcher"
                  ? args
                  : [
                      ...args.slice(0, -1),
                      ...(!audioOnly && codec !== "prores"
                        ? ["-pix_fmt", s.pixelFormat]
                        : []),
                      ...(codec === "h264" && s.profile !== "auto"
                        ? ["-profile:v", s.profile]
                        : []),
                      ...(s.rateControl === "cbr" &&
                      !audioOnly &&
                      codec !== "prores"
                        ? [
                            "-minrate",
                            `${s.bitrateMbps}M`,
                            ...(codec === "h264"
                              ? ["-x264-params", "nal-hrd=cbr:force-cfr=1"]
                              : []),
                          ]
                        : []),
                      args[args.length - 1],
                    ],
              onProgress: ({ progress }) => {
                item.progress = progress * 0.97;
              },
            });
            if (audioOnly)
              await ffmpeg(
                [
                  "-y",
                  "-i",
                  stageFile,
                  "-c:a",
                  "pcm_s16le",
                  "-ac",
                  String(s.channels),
                  "-ar",
                  String(s.sampleRate),
                  path.join(b.directory, item.name),
                ],
                muxController.signal,
              );
            if (!audioOnly) {
              const includeAudio =
                s.audio && plan.variant.audio && fs.existsSync(audioStage);
              await ffmpeg(
                [
                  "-y",
                  "-i",
                  stageFile,
                  ...(includeAudio ? ["-i", audioStage] : []),
                  "-map",
                  "0:v:0",
                  "-c:v",
                  "copy",
                  ...(includeAudio
                    ? [
                        "-map",
                        "1:a:0",
                        "-c:a",
                        codec === "prores"
                          ? "pcm_s16le"
                          : codec === "vp9"
                            ? "libopus"
                            : "aac",
                        "-ac",
                        String(s.channels),
                        "-ar",
                        String(s.sampleRate),
                        ...(codec !== "prores"
                          ? ["-b:a", `${s.audioBitrate}k`]
                          : []),
                      ]
                    : ["-an"]),
                  ...(codec === "vp9" ? [] : ["-movflags", "+faststart"]),
                  ...(codec === "h265" ? ["-tag:v", "hvc1"] : []),
                  path.join(b.directory, item.name),
                ],
                muxController.signal,
              );
            }
            if (b.cancelled) throw new Error("Cancelado");
            const probe = await RenderInternals.callFf({
              bin: "ffprobe",
              args: [
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                path.join(b.directory, item.name),
              ],
              indent: false,
              logLevel: "error",
              binariesDirectory: null,
              cancelSignal: cancel.cancelSignal,
            });
            const data = JSON.parse(probe.stdout) as {
                streams: {
                  codec_type: string;
                  codec_name: string;
                  width?: number;
                  height?: number;
                  pix_fmt?: string;
                  r_frame_rate?: string;
                  channels?: number;
                  sample_rate?: string;
                }[];
                format: { duration?: string };
              },
              v = data.streams.find((t) => t.codec_type === "video"),
              a = data.streams.find((t) => t.codec_type === "audio");
            const rate = v?.r_frame_rate?.split("/").map(Number),
              actualFps = rate ? rate[0] / (rate[1] || 1) : s.fps;
            if (
              v &&
              (!Number.isFinite(actualFps) ||
                Math.abs(actualFps - s.fps) > 0.005)
            )
              throw new Error("El archivo no coincide con los FPS solicitados");
            if (audioOnly && !a)
              throw new Error("No se obtuvo un archivo de audio válido");
            if (
              !audioOnly &&
              (!v ||
                v.width !== plan.format.width ||
                v.height !== plan.format.height)
            )
              throw new Error(
                "El archivo no coincide con el tamaño solicitado",
              );
            if (
              a &&
              (a.channels !== s.channels ||
                Number(a.sample_rate) !== s.sampleRate)
            )
              throw new Error(
                "El archivo no coincide con los canales o frecuencia de audio solicitados",
              );
            if (
              codec === "vp9" &&
              s.pixelFormat.includes("10") &&
              !v?.pix_fmt?.includes("10")
            )
              throw new Error(
                "El codificador no conservó la profundidad de 10 bits solicitada",
              );
            item.actual = [
              v
                ? `${v.width} × ${v.height} · ${v.codec_name} · ${v.pix_fmt} · ${Number(actualFps.toFixed(3))} fps`
                : "Solo audio",
              a
                ? `${a.codec_name} · ${a.sample_rate} Hz · ${a.channels === 1 ? "mono" : "estéreo"}`
                : "Sin audio",
              `${Number(data.format.duration ?? 0).toFixed(3)} s`,
            ].join(" / ");
            item.status = "done";
            item.progress = 1;
            item.seconds = (Date.now() - started) / 1000;
            item.url = `/api/export-queue/${b.id}/file/${item.id}`;
            if (s.saveSrt && plan.variant.captions)
              writeSrt(b, i, project, start, end);
            if (s.saveProject) {
              const deliverable = {
                ...copyTimelineRange(project, start, end, "auto"),
                name: item.name.replace(/\.[^.]+$/, ""),
                exportRanges: [
                  {
                    id: plan.range.id,
                    name: plan.range.name,
                    start: 0,
                    end: end - start,
                  },
                ],
              };
              fs.writeFileSync(
                path.join(b.directory, item.name + ".json"),
                JSON.stringify({
                  project: deliverable,
                  media: project.library?.media ?? [],
                }),
              );
              item.projectUrl = `/api/export-queue/${b.id}/file/${item.id}/project`;
            }
          } catch (e) {
            item.status = b.cancelled ? "cancelled" : "error";
            item.error = message(e);
            const partial = path.join(b.directory, item.name);
            if (fs.existsSync(partial)) fs.unlinkSync(partial);
          } finally {
            for (const temporary of [stageFile, audioStage])
              if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            cancelCurrent = undefined;
            save();
          }
        }
        b.status = b.cancelled
          ? "cancelled"
          : b.items.some((j) => j.status === "error")
            ? "error"
            : "done";
        fs.writeFileSync(
          path.join(b.directory, "entrega.json"),
          JSON.stringify(
            { request: b.request, results: publicBatch(b) },
            null,
            2,
          ),
        );
        save();
      }
    } finally {
      active = false;
    }
  };
  const launch = () =>
    void run().catch((e) => {
      for (const b of batches)
        if (b.status === "rendering") {
          b.status = "error";
          for (const item of b.items)
            if (item.status === "pending" || item.status === "rendering") {
              item.status = "error";
              item.error = message(e);
            }
        }
      try {
        save();
      } catch {
        console.error("No se pudo guardar el estado de exportación");
      }
    });
  app.get("/api/export-queue", (_req, res) =>
    res.json(batches.map(publicBatch).reverse()),
  );
  app.post("/api/export-queue", (req, res) => {
    try {
      const request = req.body as ExportRequest;
      assertProject(request.project);
      validateExportRequest(request);
      const id = randomUUID(),
        folderKey = `${slug(request.name).slice(0, 24)}_${id.slice(0, 8)}`,
        directory = exportDirectory(dataDir, request.directory, folderKey);
      const b: Batch = {
        id,
        name: request.name,
        created: new Date().toISOString(),
        status: "queued",
        directory,
        folderKey,
        request: structuredClone(request),
        cancelled: false,
        items: deliveryJobs(request).map((j) => ({
          id: randomUUID(),
          name: j.name,
          status: "pending",
          progress: 0,
        })),
      };
      if (b.items.some((j) => path.join(directory, j.name).length > 245))
        throw new Error(
          "La ruta de salida es demasiado larga para Windows. Acorta nombre, rangos o subcarpeta.",
        );
      if (fs.existsSync(directory))
        throw new Error(
          "La carpeta de este lote ya existe; vuelve a enviar la exportación para obtener una nueva.",
        );
      fs.mkdirSync(directory, { recursive: true });
      batches.push(b);
      save();
      res.status(202).json(publicBatch(b));
      launch();
    } catch (e) {
      res.status(400).json({ error: message(e) });
    }
  });
  app.post("/api/export-queue/:id/cancel", (req, res) => {
    const b = batches.find((b) => b.id === req.params.id);
    if (!b) return res.status(404).json({ error: "Lote no encontrado" });
    if (!["queued", "rendering"].includes(b.status))
      return res.status(409).json({ error: "El lote ya terminó" });
    b.cancelled = true;
    if (b.status === "rendering") cancelCurrent?.();
    else b.status = "cancelled";
    for (const item of b.items)
      if (item.status === "pending") item.status = "cancelled";
    save();
    res.json(publicBatch(b));
  });
  app.post("/api/export-queue/:id/retry", (req, res) => {
    const b = batches.find((b) => b.id === req.params.id);
    if (!b) return res.status(404).json({ error: "Lote no encontrado" });
    if (b.status === "rendering" || b.status === "queued")
      return res.status(409).json({ error: "El lote sigue activo" });
    try {
      validateExportRequest(b.request);
    } catch (e) {
      return res.status(400).json({ error: message(e) });
    }
    for (const item of b.items)
      if (item.status !== "done") {
        item.status = "pending";
        item.error = undefined;
        item.progress = 0;
      }
    b.cancelled = false;
    b.status = "queued";
    save();
    res.json(publicBatch(b));
    launch();
  });
  app.get(
    [
      "/api/export-queue/:id/file/:item",
      "/api/export-queue/:id/file/:item/:sidecar",
    ],
    (req, res) => {
      const b = batches.find((b) => b.id === req.params.id),
        item = b?.items.find((i) => i.id === req.params.item),
        side = req.params.sidecar;
      if (
        !b ||
        !item ||
        item.status !== "done" ||
        (side && side !== "srt" && side !== "project") ||
        (side === "srt" && !item.srtUrl) ||
        (side === "project" && !item.projectUrl)
      )
        return res.status(404).end();
      res.download(
        path.join(
          b.directory,
          item.name +
            (side === "srt" ? ".srt" : side === "project" ? ".json" : ""),
        ),
      );
    },
  );
}
