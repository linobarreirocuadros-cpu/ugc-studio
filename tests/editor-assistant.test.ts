import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, type AudioClip, type VideoClip } from "../src/project/types";
import * as ops from "../src/project/ops";
import { processAudio } from "../src/app/localAssistant";
import { localMedia, sourceRange } from "../server/localTasks";

function fixture() {
  const project = ops.addSourceRange(createEmptyProject(), { src: "/media/source.mp4", name: "Video", durationInFrames: 900 }, "V1", 90, 120, 270);
  const clip = project.tracks.find((t) => t.id === "V1")!.clips[0] as VideoClip;
  return { project, clip };
}
const stems: ops.ProcessedStem[] = [{ role: "voice", src: "/media/voice.wav", name: "Voz limpia" }, { role: "background", src: "/media/background.wav", name: "Fondo y música" }];

test("audio procesado de un clip recortado conserva posición/duración y no reproduce el original dos veces", () => {
  const { project, clip } = fixture();
  const snapshot = JSON.stringify(project);
  const next = ops.applyProcessedAudio(project, clip.id, stems, "separate-clean");
  assert.equal(JSON.stringify(project), snapshot, "la operación debe ser pura");
  assert.equal((ops.findClip(next, clip.id)!.clip as VideoClip).volume, 0);
  const audio = next.tracks.flatMap((t) => t.clips).filter((c): c is AudioClip => c.kind === "audio");
  assert.equal(audio.length, 2);
  for (const stem of audio) {
    assert.equal(stem.from, 90);
    assert.equal(stem.durationInFrames, 150);
    assert.equal(stem.trimStart, 0, "el WAV ya contiene solo el rango procesado");
    assert.equal(stem.volume, stem.derivedFrom?.mode === "separate-clean" && stem.name === "Fondo y música" ? 0 : 1);
  }
  assert.equal((ops.findClip(next, clip.id)!.clip as VideoClip).trimStart, 120);
  assert.deepEqual(ops.restoreOriginalAudio(next, clip.id), project);
});

test("reprocesar sustituye derivados y mantiene el volumen original para restaurar", () => {
  const { project, clip } = fixture();
  const quiet = ops.updateClip(project, clip.id, { volume: 0.37 });
  const first = ops.applyProcessedAudio(quiet, clip.id, stems, "separate");
  const second = ops.applyProcessedAudio(first, clip.id, [stems[0]], "clean");
  const audio = second.tracks.flatMap((t) => t.clips).filter((c): c is AudioClip => c.kind === "audio");
  assert.equal(audio.length, 1);
  assert.equal(audio[0].volume, 0.37);
  assert.deepEqual(ops.restoreOriginalAudio(second, clip.id), quiet);
});

test("procesar una pista de voz conserva sus fades y deja el fondo aislado en silencio al limpiar", () => {
  const initial = ops.addAudioClip(createEmptyProject(), { src: "/media/dialogue.wav", name: "Diálogo", durationInFrames: 150 }, "A0", 30);
  const id = initial.tracks.find((t) => t.id === "A0")!.clips[0].id;
  const project = ops.updateClip(initial, id, { volume: 0.6, fadeIn: 12, fadeOut: 18 });
  const next = ops.applyProcessedAudio(project, id, stems, "separate-clean");
  const generated = next.tracks.flatMap((t) => t.clips).filter((c): c is AudioClip => c.kind === "audio" && Boolean(c.derivedFrom));
  assert.equal(generated.find((c) => c.name === "Fondo y música")!.volume, 0);
  assert.equal(generated.find((c) => c.name === "Voz limpia")!.volume, 0.6);
  for (const c of generated) assert.deepEqual([c.fadeIn, c.fadeOut], [12, 18]);
  assert.deepEqual(ops.restoreOriginalAudio(next, id), project);
});

test("cortar un rango visual mantiene offsets del original y otras pistas intactas", () => {
  const { project, clip } = fixture();
  const withMusic = ops.addAudioClip(project, { src: "/media/music.wav", name: "Música", durationInFrames: 300 }, "A1", 0);
  const next = ops.splitClipRange(withMusic, clip.id, 120, 180);
  const videos = next.tracks.find((t) => t.id === "V1")!.clips as VideoClip[];
  assert.deepEqual(videos.map((v) => [v.from, v.durationInFrames, v.trimStart]), [[90, 30, 120], [120, 60, 150], [180, 60, 210]]);
  assert.deepEqual(next.tracks.find((t) => t.id === "A1"), withMusic.tracks.find((t) => t.id === "A1"));
  assert.equal(videos.reduce((sum, v) => sum + v.durationInFrames, 0), clip.durationInFrames);
});

test("un trabajo asíncrono no aplica audio a un clip movido mientras se procesa", async () => {
  const { project, clip } = fixture();
  let current = project, commits = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/audio/process") {
      current = ops.moveClip(current, clip.id, 200);
      return Response.json({ id: "task" });
    }
    return Response.json({ status: "done", message: "Listo", progress: 100, result: { duration: 5, engine: "test", stems } });
  };
  try {
    await assert.rejects(processAudio({ getProject: () => current, commit: () => { commits++; }, selectedClipId: clip.id }, "clean", undefined, () => {}), /clip cambió/);
    assert.equal(commits, 0);
    assert.equal(ops.findClip(current, clip.id)!.clip.from, 200);
  } finally { globalThis.fetch = originalFetch; }
});

test("los procesadores rechazan rutas ajenas a medios y rangos no finitos", () => {
  for (const src of ["https://example.com/video.mp4", "/media/%2e%2e%2fconfig.json", "/media/..\\config.json", "/media/video.mp4?x=1"]) assert.throws(() => localMedia(".", src));
  for (const [start, duration] of [[NaN, 5], [-1, 5], [0, Infinity], [0, 0]]) assert.throws(() => sourceRange(start, duration));
});

test("cancelar una tarea de audio no modifica el proyecto y cancela el trabajo del servidor", async () => {
  const { project, clip } = fixture();
  const controller = new AbortController();
  let commits = 0, cancelled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/cancel")) { cancelled = true; return Response.json({}); }
    controller.abort();
    return Response.json({ id: "cancel-task" });
  };
  try {
    await assert.rejects(processAudio({ getProject: () => project, commit: () => { commits++; }, selectedClipId: clip.id }, "clean", undefined, () => {}, controller.signal), { name: "AbortError" });
    assert.equal(commits, 0);
    assert.equal(cancelled, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("reprocesar una pista derivada pide el original para no crear grupos de restauración anidados", async () => {
  const { project, clip } = fixture();
  const next = ops.applyProcessedAudio(project, clip.id, stems, "separate-clean");
  const derived = next.tracks.flatMap((t) => t.clips).find((c) => c.kind === "audio")!;
  await assert.rejects(processAudio({ getProject: () => next, commit: () => assert.fail("no debe editar"), selectedClipId: derived.id }, "clean", undefined, () => {}), /clip original/);
});
