import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, type VideoClip } from "../src/project/types";
import * as ops from "../src/project/ops";
import { assertProject, parseProjectFile } from "../src/project/projectFile";
import {
  transcriptGroups,
  transcriptDrag,
} from "../src/app/transcriptSelection";
import { timelineRulerTicks } from "../src/app/timelineViewport";
import { normalizeTimelinePreferences } from "../src/app/timelinePreferences";
import { trackZone, trackHeight, trackAtY } from "../src/app/timelineTracks";
import { placeMedia, previewMedia } from "../src/app/mediaPlacement";
import {
  timelineWheelAction,
  normalizeGestures,
} from "../src/app/gesturePreferences";

const media = {
  src: "/media/qa.mp4",
  name: "QA",
  kind: "video" as const,
  hasAudio: true,
  durationInFrames: 600,
};
function fixture() {
  let p = ops.ensureProjectLibrary(createEmptyProject(), [media]);
  p = ops.addSourceRange(p, media, "V1", 30, 60, 240);
  p = ops.setTranscript(p, media.src, [
    { text: "borde", start: 50, end: 70 },
    { text: "primero", start: 75, end: 100 },
    { text: "segundo", start: 105, end: 135 },
    { text: "fuera", start: 250, end: 270 },
  ]);
  return p;
}

test("la transcripción recortada incluye una palabra parcialmente visible, con tiempo acotado", () => {
  const p = fixture(),
    groups = transcriptGroups(p, "V1"),
    words = groups.flatMap((g) => g.words);
  assert.deepEqual(
    words.map((w) => [w.text, w.frame, w.end]),
    [
      ["borde", 30, 40],
      ["primero", 45, 70],
      ["segundo", 75, 105],
    ],
  );
  const clip = p.tracks.find((t) => t.id === "V1")!.clips[0];
  const fast = ops.setClipSpeed(p, [clip.id], 2);
  assert.deepEqual(
    transcriptGroups(fast, "V1")
      .flatMap((g) => g.words)
      .map((w) => [w.frame, w.end]),
    [
      [30, 35],
      [38, 50],
      [53, 68],
    ],
  );
});

test("arrastrar una frase conserva imagen/audio enlazados sin overlays ajenos ni cambios previos", () => {
  const p = ops.addTextClip(
      fixture(),
      { text: "No copiar", from: 45, durationInFrames: 60 },
      "V2",
    ),
    before = JSON.stringify(p),
    words = transcriptGroups(p, "V1")
      .flatMap((g) => g.words)
      .slice(1);
  const drag = transcriptDrag(p, words, 7)!;
  assert.equal(drag.outFrame, 60);
  assert.equal(drag.timelineRange!.documentEpoch, 7);
  assert.equal(JSON.stringify(p), before);
  const clips = drag.timelineRange!.project.tracks.flatMap((t) => t.clips);
  assert.equal(clips.length, 2);
  assert.ok(clips.every((c) => c.from === 0 && c.durationInFrames === 60));
  const v = clips.find((c) => c.kind === "video") as VideoClip;
  assert.equal(v.trimStart, 75);
  assert.ok(clips.some((c) => c.id === v.linkedClipId));
  assertProject(drag.timelineRange!.project);
  const shapes = previewMedia(p, drag, "V2", 300, {
    media: [media],
    nested: true,
  });
  assert.deepEqual(shapes.map((s) => s.clip.kind).sort(), ["audio", "video"]);
  const placed = placeMedia(p, drag, "V2", 300, {
    media: [media],
    nested: true,
  });
  assertProject(placed);
  assert.ok(
    placed.tracks.some((t) =>
      t.clips.some((c) => c.from === 300 && c.kind === "audio"),
    ),
  );
});

test("selección de diálogo entre cortes conserva huecos, mezcla y fuentes al copiar/guardar", () => {
  let p = fixture();
  p = ops.splitAt(p, 75);
  p = ops.generateCaptions(p);
  const words = transcriptGroups(p, "V1").flatMap((g) => g.words),
    drag = transcriptDrag(p, words, 1)!;
  const restored = parseProjectFile(
    JSON.stringify({ project: drag.timelineRange!.project }),
  ).project;
  assertProject(restored);
  assert.ok(
    restored.tracks
      .flatMap((t) => t.clips)
      .every((c) => c.kind === "audio" || c.kind === "video"),
  );
  assert.equal(transcriptDrag(p, [], 1), null);
});

test("diálogo de audio independiente no inventa video ni admite un destino visual", () => {
  let p = ops.addSourceRange(
    createEmptyProject(),
    { ...media, kind: "audio" },
    "A1",
    0,
    0,
    90,
  );
  p = ops.setTranscript(p, media.src, [{ text: "voz", start: 0, end: 30 }]);
  const drag = transcriptDrag(
    p,
    transcriptGroups(p, "A1").flatMap((g) => g.words),
    1,
  )!;
  assert.equal(drag.kind, "audio");
  assert.ok(
    drag
      .timelineRange!.project.tracks.flatMap((t) => t.clips)
      .every((c) => c.kind === "audio"),
  );
  assert.equal(
    placeMedia(p, drag, "V1", 90, { media: [media], nested: true }),
    p,
  );
});

test("disolución desde el borde modifica el corte correcto, se elimina y respeta candados", () => {
  let p = fixture();
  p = ops.splitAt(p, 120);
  const [left, right] = p.tracks.find((t) => t.id === "V1")!.clips,
    before = JSON.stringify(p),
    next = ops.setClipDissolve(p, left.id, "end", 24);
  assert.equal(ops.findClip(next, right.id)!.clip.transitionIn?.frames, 24);
  assert.equal(ops.findClip(next, left.id)!.clip.transitionOut, undefined);
  assert.equal(JSON.stringify(p), before);
  assertProject(next);
  const cleared = ops.setClipDissolve(next, left.id, "end", 0);
  assert.equal(ops.findClip(cleared, right.id)!.clip.transitionIn, undefined);
  assertProject(cleared);
  assert.equal(
    ops
      .setClipDissolve(
        ops.setTrackState(p, "V1", { locked: true }),
        left.id,
        "start",
        10,
      )
      .tracks.find((t) => t.id === "V1")!.clips[0].transitionIn,
    undefined,
  );
  assert.throws(() => ops.setClipDissolve(p, left.id, "start", -1));
});

test("regla subdivide hasta frames enteros, mantiene marcas alineadas y virtualiza largas duraciones", () => {
  for (const fps of [24, 30, 24000 / 1001, 120])
    for (const scale of [0.003, 0.1, 2, 20]) {
      const ticks = timelineRulerTicks(fps, scale, fps * 900 * scale, 0, 800);
      assert.ok(ticks.length < 160);
      assert.ok(
        ticks.every(
          (t) => Number.isInteger(t.frame) && t.x === t.frame * scale,
        ),
      );
      assert.ok(ticks.some((t) => !t.major));
    }
  const fine = timelineRulerTicks(30, 20, 10000, 0, 800);
  assert.equal(fine[1].frame - fine[0].frame, 1);
  assert.deepEqual(timelineRulerTicks(30, 0, 800, 0, 800), []);
});

test("alturas por pista son preferencias aisladas, limitadas y no cambian el JSON", () => {
  const p = ops.generateCaptions(fixture()),
    before = JSON.stringify(p),
    prefs = normalizeTimelinePreferences({
      trackHeight: 56,
      trackHeights: { "doc:root:V1": 12, "doc:root:A0": 999, bad: NaN },
    });
  assert.equal(trackHeight(prefs, "doc:root", "V1"), 24);
  assert.equal(trackHeight(prefs, "otro:root", "V1"), 56);
  assert.equal(trackHeight(prefs, "doc:root", "A0"), 180);
  assert.equal(prefs.trackHeights.bad, undefined);
  assert.equal(
    trackZone(p.tracks.find((t) => t.clips.some((c) => c.kind === "caption"))!),
    "captions",
  );
  assert.equal(trackZone(p.tracks.find((t) => t.id === "A0")!), "audio");
  const tracks = [{ id: "a" }, { id: "b" }];
  assert.equal(trackAtY(tracks, (t) => (t.id === "a" ? 24 : 56), 25)?.id, "b");
  assert.equal(JSON.stringify(p), before);
  assert.equal(normalizeGestures({ Alt: "zoom" }).headerHeight, "Alt");
  assert.equal(
    normalizeGestures({ headerHeight: "none" }).headerHeight,
    "none",
  );
});

test("rueda distingue cabecera, lienzo y preferencias personalizadas sin quitar el zoom durante arrastres", () => {
  const p = normalizeGestures(null);
  assert.equal(timelineWheelAction(p, "Alt", true), "individualHeight");
  assert.equal(timelineWheelAction(p, "Alt", false), "zoom");
  assert.equal(timelineWheelAction(p, "Ctrl", false), "vertical");
  assert.equal(timelineWheelAction(p, "Ctrl", true), "vertical");
  assert.equal(timelineWheelAction(p, "", false), "horizontal");
  const custom = normalizeGestures({ headerHeight: "Shift", Alt: "frame" });
  assert.equal(timelineWheelAction(custom, "Shift", true), "individualHeight");
  assert.equal(timelineWheelAction(custom, "Alt", true), "frame");
  assert.equal(
    timelineWheelAction(
      normalizeGestures({ headerHeight: "none" }),
      "Alt",
      true,
    ),
    "zoom",
  );
});

test("cambiar canales de audio no pierde la transcripción ni su rango editable", () => {
  let p = ops.addSourceRange(
    createEmptyProject(),
    { ...media, kind: "audio" },
    "A1",
    0,
    0,
    90,
  );
  p = ops.setTranscript(p, media.src, [{ text: "voz", start: 0, end: 30 }]);
  const clip = p.tracks.find((t) => t.id === "A1")!.clips[0];
  p = ops.updateClip(p, clip.id, {
    src: "/media/canales.wav",
    channelSource: media.src,
    channelMode: "left",
  });
  const words = transcriptGroups(p, "A1").flatMap((g) => g.words);
  assert.equal(words[0].src, media.src);
  assert.equal(words[0].text, "voz");
  const current = ops.findClip(p, clip.id)!.clip;
  assert.equal(current.kind, "audio");
  if (current.kind === "audio")
    assert.equal(ops.wordsOnTimeline(p, current)[0].text, "voz");
  const payload = transcriptDrag(p, words, 2)!;
  assert.equal(
    payload
      .timelineRange!.project.tracks.flatMap((t) => t.clips)
      .filter((c) => c.kind === "audio")[0].src,
    "/media/canales.wav",
  );
  assertProject(p);
});
