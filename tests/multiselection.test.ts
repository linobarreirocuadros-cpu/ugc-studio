import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject } from "../src/project/types";
import * as ops from "../src/project/ops";
import { sourceClip } from "../src/app/localAssistant";

test("mover selección conserva distancias entre pistas y limita el grupo completo al frame cero", () => {
  let project = ops.addTextClip(createEmptyProject(), { id: "title", text: "Título", from: 60, durationInFrames: 30 });
  project = ops.addVideoClip(project, { src: "video", name: "Plano", durationInFrames: 90 }, "V1", 30);
  const video = project.tracks.find((t) => t.id === "V1")!.clips[0];
  const before = JSON.stringify(project);
  assert.throws(() => sourceClip({ getProject: () => project, commit: () => {}, selectedClipIds: [video.id, "title"] }), /varios clips/);
  const moved = ops.moveClips(project, [video.id, "title"], -100, 1); // el título no tiene pista compatible arriba
  assert.equal(ops.findClip(moved, video.id)!.clip.from, 0);
  assert.equal(ops.findClip(moved, "title")!.clip.from, 30);
  assert.equal(ops.findClip(moved, video.id)!.track.id, "V1");
  assert.equal(ops.findClip(moved, "title")!.track.id, "T1");
  assert.equal(JSON.stringify(project), before);
  const broll = ops.moveClips(project, [video.id], 10, 1);
  assert.equal(ops.findClip(broll, video.id)!.track.id, "V2");
  assert.equal(ops.findClip(broll, video.id)!.clip.from, 40);
  assert.equal(broll.tracks.flatMap((t) => t.clips).filter((c) => c.id === video.id).length, 1);
});

test("borrar selección ripple cuenta huecos solapados una sola vez y respeta las otras pistas", () => {
  let project = createEmptyProject();
  for (const [id, from, durationInFrames] of [["a", 0, 90], ["b", 60, 90], ["c", 180, 30], ["after", 240, 30]] as const) {
    project = ops.addTextClip(project, { id, text: id, from, durationInFrames });
  }
  project = ops.addVideoClip(project, { src: "video", name: "Plano", durationInFrames: 300 }, "V1", 0);
  const removed = ops.deleteClips(project, ["a", "b", "c"], true);
  assert.equal(ops.findClip(removed, "after")!.clip.from, 60); // unión [0,150] + [180,210]
  assert.equal(removed.tracks.find((t) => t.id === "V1")!.clips[0].durationInFrames, 300);
  assert.equal(project.tracks.find((t) => t.id === "T1")!.clips.length, 4);
  const ordinary = ops.deleteClips(project, ["a", "b", "c"]);
  assert.equal(ops.findClip(ordinary, "after")!.clip.from, 240);
});
