import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, normalizeProject, getProjectDuration, type Project, type AudioClip, type VideoClip } from "../src/project/types";
import * as ops from "../src/project/ops";

const media = { src: "/media/video.mp4", name: "Video", durationInFrames: 900, hasAudio: true };
function fixture() {
  const project = ops.addSourceRange(createEmptyProject(), media, "V1", 30, 90, 390);
  const video = project.tracks.find((t) => t.id === "V1")!.clips[0] as VideoClip;
  return { project, video };
}
function pairs(project: Project) {
  for (const video of project.tracks.flatMap((t) => t.clips).filter((c): c is VideoClip => c.kind === "video" && Boolean(c.linkedClipId))) {
    const audio = ops.findClip(project, video.linkedClipId!)!.clip as AudioClip;
    assert.equal(audio.linkedClipId, video.id);
    assert.deepEqual([audio.from, audio.durationInFrames, audio.trimStart], [video.from, video.durationInFrames, video.trimStart]);
    assert.equal(video.volume, 0);
  }
}

test("pistas genéricas consecutivas conservan IDs antiguos y aceptan añadir más", () => {
  let project = createEmptyProject();
  for (let i = 0; i < 3; i++) { project = ops.addTrack(project, "video"); project = ops.addTrack(project, "audio"); }
  assert.deepEqual(project.tracks.filter((t) => t.kind === "video").map((t) => t.name), ["B1", "B2", "B3", "B4", "B5"]);
  assert.deepEqual([...project.tracks].reverse().filter((t) => t.kind === "audio").map((t) => t.name), ["Audio 1", "Audio 2", "Audio 3", "Audio 4", "Audio 5", "Audio 6"]);
  assert.equal(ops.resolveTrackId(project, "B4"), "V4"); assert.equal(ops.resolveTrackId(project, "Audio 4"), "A3");
  const legacy = { ...project, tracks: project.tracks.map((t) => t.id === "V2" ? { ...t, name: "V2 B-roll" } : t) };
  assert.equal(normalizeProject(legacy).tracks.find((t) => t.id === "V2")!.name, "B2");
  assert.equal(new Set(normalizeProject(legacy).tracks.map((t) => t.id)).size, project.tracks.length);
});

test("audio visible se crea una sola vez, conserva nivel y no inventa sonido para solo video", () => {
  const { project, video } = fixture(); pairs(project);
  assert.equal(ops.effectiveVolume(project, video), 1);
  assert.equal(ops.exposeEmbeddedAudio(project, [video.id]), project);
  const quiet = ops.updateClip(project, video.id, { volume: 0.4 });
  assert.equal((ops.findClip(quiet, video.id)!.clip as VideoClip).volume, 0);
  assert.equal(ops.effectiveVolume(quiet, ops.findClip(quiet, video.id)!.clip as VideoClip), 0.4);
  for (const [hasAudio, videoOnly] of [[false, false], [true, true]]) {
    const silent = ops.addSourceRange(createEmptyProject(), { ...media, hasAudio }, "V1", 0, 0, 90, videoOnly);
    assert.equal(silent.tracks.flatMap((t) => t.clips).filter((c) => c.kind === "audio").length, 0);
  }
});

test("mover, recortar, slip y cortar mantienen pares en sincronía; borrar elimina las dos partes", () => {
  const { project, video } = fixture(); const snapshot = JSON.stringify(project);
  let next = ops.moveClip(project, video.id, 60, "V2"); pairs(next);
  assert.equal(ops.findClip(next, video.id)!.track.id, "V2");
  assert.equal(ops.findClip(next, video.linkedClipId!)!.track.id, "A0");
  next = ops.trimClip(next, video.id, "start", 30); pairs(next);
  next = ops.slipClip(next, video.id, -30); pairs(next);
  next = ops.splitAt(next, 180, video.id); pairs(next);
  const fragments = next.tracks.flatMap((t) => t.clips).filter((c) => c.kind === "video");
  assert.equal(fragments.length, 2);
  next = ops.deleteClip(next, fragments[1].id); pairs(next);
  assert.equal(next.tracks.flatMap((t) => t.clips).length, 2);
  assert.equal(JSON.stringify(project), snapshot);
});

test("resumen y quitar silencios mantienen referencias y offsets de cada pareja", () => {
  const { project, video } = fixture();
  const summarized = ops.keepTimelineRanges(project, [{ start: 30, end: 90 }, { start: 150, end: 240 }]); pairs(summarized);
  assert.equal(getProjectDuration(summarized), 150);
  const transcript = ops.setTranscript(project, video.src, [{ text: "Hola", start: 100, end: 140 }, { text: "mundo", start: 250, end: 290 }]);
  const next = ops.removeSilences(transcript, { minSilenceFrames: 15, padFrames: 0 }); pairs(next);
  assert.equal(next.tracks.flatMap((t) => t.clips).filter((c) => c.kind === "audio").length, 2);
});

test("ripple conserva parejas y procesar/restaurar no reactiva sonido duplicado", () => {
  const { project, video } = fixture();
  const shortened = ops.rippleTrimClip(project, video.id, "end", -30); pairs(shortened);
  const processed = ops.applyProcessedAudio(project, video.id, [{ role: "voice", src: "/media/clean.wav", name: "Limpio" }], "clean");
  assert.equal(ops.effectiveVolume(processed, ops.findClip(processed, video.id)!.clip as VideoClip), 0);
  assert.deepEqual(ops.restoreOriginalAudio(processed, video.id), project);
});

test("ripple sincroniza también parejas posteriores cuyo audio está en otra pista", () => {
  const { project, video } = fixture();
  let next = ops.moveClip(project, video.linkedClipId!, 30, "A1");
  next = ops.addSourceRange(next, media, "V1", 360, 90, 390);
  next = ops.rippleTrimClip(next, video.id, "end", -30); pairs(next);
  const second = next.tracks.find((t) => t.id === "V1")!.clips[1] as VideoClip;
  assert.equal(second.from, 330);
  const relinked = ops.relinkMedia(next, media.src, "/media/reconnected.mp4"); pairs(relinked);
  assert.ok(relinked.tracks.flatMap((t) => t.clips).filter((c) => c.kind === "video" || c.kind === "audio").every((c) => c.src === "/media/reconnected.mp4"));
});
