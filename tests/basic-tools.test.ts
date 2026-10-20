import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, type CaptionClip } from "../src/project/types";
import * as ops from "../src/project/ops";
import { samplePeakDb, meterPercent } from "../src/app/programMeter";

test("recorte ripple conserva offsets y mueve solo los clips posteriores de su pista", () => {
  const media = { src: "video", name: "Video", durationInFrames: 900 };
  let project = ops.addSourceRange(createEmptyProject(), media, "V1", 30, 60, 180);
  project = ops.addSourceRange(project, media, "V1", 180, 200, 320);
  project = ops.addSourceRange(project, media, "V2", 180, 200, 320);
  const [first, second] = project.tracks.find((t) => t.id === "V1")!.clips;
  const before = JSON.stringify(project);
  const trimmed = ops.rippleTrimClip(project, first.id, "start", 30);
  const clip = ops.findClip(trimmed, first.id)!.clip;
  assert.equal(clip.from, 30); assert.equal(clip.durationInFrames, 90);
  assert.equal(clip.kind === "video" && clip.trimStart, 90);
  assert.equal(ops.findClip(trimmed, second.id)!.clip.from, 150);
  assert.equal(trimmed.tracks.find((t) => t.id === "V2")!.clips[0].from, 180);
  assert.equal(JSON.stringify(project), before);
  const extended = ops.rippleTrimClip(project, first.id, "end", 1000);
  assert.equal(ops.findClip(extended, first.id)!.clip.durationInFrames, 840);
  assert.equal(ops.findClip(extended, second.id)!.clip.from, 900);
});

test("slip respeta el archivo y mantiene posición, duración y otras pistas", () => {
  const project = ops.addSourceRange(createEmptyProject(), { src: "video", name: "Video", durationInFrames: 900 }, "V1", 30, 60, 180);
  const clip = project.tracks.find((t) => t.id === "V1")!.clips[0];
  for (const [delta, expected] of [[-1000, 0], [1000, 780]]) {
    const moved = ops.findClip(ops.slipClip(project, clip.id, delta), clip.id)!.clip;
    assert.equal(moved.kind === "video" && moved.trimStart, expected);
    assert.equal(moved.from, 30); assert.equal(moved.durationInFrames, 120);
  }
});

test("cortar un subtítulo conserva los tiempos relativos de las palabras de cada mitad", () => {
  let project = ops.setTranscript(ops.addSourceRange(createEmptyProject(), { src: "video", name: "Video", durationInFrames: 180 }, "V1", 0), "video", [{ text: "Hola", start: 0, end: 30 }, { text: "mundo", start: 40, end: 80 }]);
  project = ops.generateCaptions(project, { ...ops.DEFAULT_CAPTION_OPTIONS, style: { preset: "bloque" } });
  const caption = project.tracks.find((t) => t.id === "S1")!.clips[0] as CaptionClip;
  const next = ops.splitAt(project, caption.from + 35, caption.id);
  const halves = next.tracks.find((t) => t.id === "S1")!.clips as CaptionClip[];
  assert.equal(halves[0].words[0].start, 0);
  assert.equal(halves[1].words[0].start, 5);
  assert.equal(halves[1].words[0].text, "mundo");
});

test("picos de muestras convierten amplitud a dBFS y admiten saturación por suma", () => {
  assert.equal(samplePeakDb(new Float32Array(1024)), -Infinity);
  assert.ok(Math.abs(samplePeakDb(new Float32Array([0, -0.5, 0.25])) + 6.0206) < 0.001);
  assert.ok(Math.abs(samplePeakDb(new Float32Array([1.5])) - 3.5218) < 0.001);
  assert.equal(meterPercent(-Infinity), 0); assert.equal(meterPercent(3), 100);
});
