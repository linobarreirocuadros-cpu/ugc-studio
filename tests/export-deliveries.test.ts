import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyProject,
  DEFAULT_TEXT_STYLE,
  DEFAULT_CAPTION_STYLE,
  getProjectDuration,
  type Project,
} from "../src/project/types";
import * as ops from "../src/project/ops";
import { assertProject, parseProjectFile } from "../src/project/projectFile";
import { retimeProject } from "../src/project/sequenceSettings";
import {
  deliverySrt,
  deliveryJobs,
  deliveryProject,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_VARIANTS,
  validateExportRequest,
  wholeRange,
  type ExportRequest,
  type DeliveryFormat,
} from "../src/project/exportPlan";
import { placeMedia } from "../src/app/mediaPlacement";
import { exportDirectory } from "../server/exportQueue";
const format: DeliveryFormat = {
  id: "social",
  name: "4x5",
  width: 1080,
  height: 1350,
  smart: true,
  fit: "cover",
  focusX: 0.5,
  focusY: 0.5,
};
function fixture(): Project {
  const p = createEmptyProject();
  return {
    ...p,
    width: 1080,
    height: 1920,
    tracks: [
      {
        id: "v",
        name: "v",
        kind: "video",
        clips: [
          {
            id: "v1",
            kind: "video",
            src: "/media/example.mp4",
            name: "Plano",
            from: 0,
            durationInFrames: 180,
            trimStart: 0,
            sourceDurationInFrames: 180,
            volume: 0,
            audioMode: "separate",
            linkedClipId: "a1",
          },
        ],
      },
      {
        id: "a",
        name: "a",
        kind: "audio",
        clips: [
          {
            id: "a1",
            kind: "audio",
            src: "/media/example.mp4",
            name: "Plano",
            from: 0,
            durationInFrames: 180,
            trimStart: 0,
            sourceDurationInFrames: 180,
            volume: 1,
            fadeIn: 0,
            fadeOut: 30,
            linkedClipId: "v1",
          },
        ],
      },
      {
        id: "g",
        name: "g",
        kind: "graphic",
        clips: [
          {
            id: "g1",
            kind: "graphic",
            name: "Forma",
            shape: "rectangle",
            from: 0,
            durationInFrames: 180,
            color: "#224466",
            x: 0.5,
            y: 0.5,
            width: 0.4,
            height: 0.4,
            opacity: 1,
            brightness: 1,
            contrast: 1,
            saturation: 1,
          },
        ],
      },
      {
        id: "text",
        name: "text",
        kind: "text",
        clips: [
          {
            id: "t1",
            kind: "text",
            text: "Oferta",
            from: 0,
            durationInFrames: 180,
            style: { ...DEFAULT_TEXT_STYLE, fontSize: 80, y: 0.95 },
          },
        ],
      },
      {
        id: "captions",
        name: "captions",
        kind: "caption",
        clips: [
          {
            id: "c1",
            kind: "caption",
            from: 0,
            durationInFrames: 180,
            words: [
              { text: "Hola", start: 0, end: 60 },
              { text: "mundo", start: 60, end: 180 },
            ],
            style: { ...DEFAULT_CAPTION_STYLE, y: 0.95 },
          },
        ],
      },
    ],
  };
}
function request(p = fixture()): ExportRequest {
  return {
    project: p,
    name: "Marca",
    directory: "Campaña",
    ranges: [wholeRange(p)],
    variants: DEFAULT_VARIANTS,
    formats: [
      format,
      { ...format, id: "vertical", name: "9x16", height: 1920 },
    ],
    settings: { ...DEFAULT_EXPORT_SETTINGS },
  };
}
test("matriz de rangos × versiones × formatos genera archivos distintos sin modificar el documento", () => {
  let p = fixture();
  p = ops.setExportRange(p, { id: "r1", name: "V1", start: 0, end: 60 });
  p = ops.setExportRange(p, { id: "r2", name: "V2", start: 90, end: 150 });
  const r = { ...request(p), ranges: p.exportRanges! },
    before = JSON.stringify(p);
  validateExportRequest(r);
  assert.equal(deliveryJobs(r).length, 12);
  assert.equal(new Set(deliveryJobs(r).map((j) => j.name)).size, 12);
  assert.equal(JSON.stringify(p), before);
  const parsed = parseProjectFile(JSON.stringify({ project: p }));
  assert.deepEqual(parsed.project.exportRanges, p.exportRanges);
  assert.equal(ops.deleteExportRange(p, "r1").exportRanges?.length, 1);
  assert.equal(p.exportRanges!.length, 2);
});
test("versiones filtran captions y overlays también dentro de anidaciones; conservan cortes y audio", () => {
  const p = fixture(),
    nested = { ...p, id: "s", durationInFrames: 180 };
  const root = { ...p, sequences: { s: nested } };
  const full = deliveryProject(
      root,
      DEFAULT_VARIANTS[0],
      format,
      DEFAULT_EXPORT_SETTINGS,
    ),
    raw = deliveryProject(
      root,
      DEFAULT_VARIANTS[1],
      format,
      DEFAULT_EXPORT_SETTINGS,
    ),
    overlay = deliveryProject(
      root,
      DEFAULT_VARIANTS[2],
      format,
      DEFAULT_EXPORT_SETTINGS,
    );
  assert.equal(full.tracks.flatMap((t) => t.clips).length, 5);
  for (const q of [raw, raw.sequences!.s])
    assert.deepEqual(
      q.tracks.flatMap((t) => t.clips.map((c) => c.kind)),
      ["video", "audio"],
    );
  assert.equal(
    overlay.tracks.flatMap((t) => t.clips).some((c) => c.kind === "caption"),
    false,
  );
  assert.equal(
    overlay.tracks.flatMap((t) => t.clips).some((c) => c.kind === "text"),
    true,
  );
  assert.equal(getProjectDuration(raw), 180);
  assertProject(full);
  assertProject(raw);
  assertProject(overlay);
});
test("adaptación 9:16 a 4:5 limita textos al área segura y admite un foco por clip", () => {
  const p = fixture(),
    before = structuredClone(p),
    q = deliveryProject(
      p,
      DEFAULT_VARIANTS[0],
      { ...format, focusByClip: { v1: { x: 0.3, y: 0.7 } } },
      DEFAULT_EXPORT_SETTINGS,
    );
  assert.equal(q.width, 1080);
  assert.equal(q.height, 1350);
  for (const c of q.tracks.flatMap((t) => t.clips))
    if (c.kind === "caption" || c.kind === "text") assert.ok(c.style.y <= 0.88);
  const v = q.tracks[0].clips[0];
  assert.equal(v.kind, "video");
  if (v.kind === "video") assert.deepEqual(v.reframeFocus, { x: 0.3, y: 0.7 });
  assert.deepEqual(p, before);
});
test("FPS fraccionarios conservan segundos, trim, audio enlazado y palabras enteras", () => {
  const p = fixture(),
    q = retimeProject(p, 24000 / 1001);
  assertProject(q);
  assert.ok(
    Math.abs(getProjectDuration(q) / q.fps - getProjectDuration(p) / p.fps) <
      1 / q.fps,
  );
  assert.equal(
    q.tracks[0].clips[0].durationInFrames,
    q.tracks[1].clips[0].durationInFrames,
  );
  for (const t of q.tracks)
    for (const c of t.clips) {
      assert.ok(Number.isInteger(c.from));
      assert.ok(Number.isInteger(c.durationInFrames));
    }
  assert.equal(p.fps, 30);
  const changed = ops.setSequenceSettings(
    ops.ensureProjectLibrary(p, [
      { src: "x", name: "x", durationInFrames: 180 },
    ]),
    { fps: 24, width: 1920, height: 1080 },
  );
  assert.equal(changed.library?.media[0].frameBase, 30);
});
test("secuencias con parámetros propios se colocan a otra base temporal, con duración correcta", () => {
  let p = ops.ensureProjectLibrary(fixture());
  p = ops.createEmptySequence(p, "24 fps", {
    width: 1920,
    height: 1080,
    fps: 24,
    audioSampleRate: 44100,
  });
  const id = Object.keys(p.sequences!)[0],
    s = retimeProject(fixture(), 24);
  p = ops.updateSequence(p, id, { ...s, name: "24 fps" });
  const q = ops.placeSequence(p, id, "v", 210, true),
    c = q.tracks[0].clips.find((c) => c.from === 210);
  assert.ok(c);
  assert.equal(c.durationInFrames, 180);
  assert.equal(p.sequences![id].fps, 24);
  assertProject(q);
});
test("video de biblioteca y su silueta convierten correctamente frames de 30 a 24 fps", () => {
  const original = fixture(),
    media = {
      src: "/media/new.mp4",
      name: "Medio",
      durationInFrames: 300,
      frameBase: 30,
    };
  const p = {
    ...retimeProject(original, 24),
    tracks: original.tracks.map((t) => ({ ...t, clips: [] })),
  };
  const q = placeMedia(
    p,
    {
      src: media.src,
      kind: "video",
      mode: "video",
      inFrame: 30,
      outFrame: 150,
      frameBase: 30,
    },
    "v",
    0,
    { media: [media], nested: true },
  );
  const c = q.tracks[0].clips[0];
  assert.equal(c.kind, "video");
  assert.equal(c.durationInFrames, 96);
  if (c.kind === "video") {
    assert.equal(c.trimStart, 24);
    assert.equal(c.sourceDurationInFrames, 240);
  }
  assertProject(q);
});
test("rangos y parámetros inválidos se rechazan antes de crear una salida", () => {
  const r = request();
  for (const invalid of [
    { ...r, ranges: [{ id: "x", name: "x", start: 90, end: 50 }] },
    { ...r, formats: [{ ...format, width: 1079 }] },
    { ...r, settings: { ...r.settings, audioDepth: 24 as const } },
    { ...r, formats: [{ ...format, focusByClip: { x: { x: NaN, y: 0.5 } } }] },
    { ...r, variants: [DEFAULT_VARIANTS[0], DEFAULT_VARIANTS[0]] },
  ])
    assert.throws(() => validateExportRequest(invalid));
  const p = fixture();
  assert.throws(() =>
    assertProject({
      ...p,
      exportRanges: [{ id: "x", name: "x", start: 0, end: -1 }],
    }),
  );
  assert.throws(() =>
    ops.createEmptySequence(p, "Malo", { width: 0, height: 100, fps: 24 }),
  );
});
test("salidas permanecen dentro de Exportaciones y no aceptan rutas relativas externas", () => {
  assert.ok(
    exportDirectory("C:/datos", "Campaña/Marca", "Entrega_123").endsWith(
      "Entrega_123",
    ),
  );
  for (const folder of ["../secret", "C:/otra", "../../", "CON"])
    assert.throws(() => exportDirectory("C:/datos", folder, "id"));
});
test("una versión sin sonido también silencia video antiguo con audio embebido", () => {
  const p = fixture();
  p.tracks[0].clips[0] = {
    ...p.tracks[0].clips[0],
    volume: 1,
    audioMode: "embedded",
  } as (typeof p.tracks)[0]["clips"][number];
  const q = deliveryProject(
    p,
    { ...DEFAULT_VARIANTS[0], audio: false },
    format,
    DEFAULT_EXPORT_SETTINGS,
  );
  const v = q.tracks[0].clips[0];
  assert.equal(v.kind, "video");
  if (v.kind === "video") {
    assert.equal(v.volume, 0);
    assert.equal(v.audioMode, "none");
  }
  assert.equal(q.tracks[1].clips.length, 0);
});

test("SRT recorta palabras a la entrega e incluye captions anidados sin duplicar la pareja de audio", () => {
  const p = fixture();
  assert.match(deliverySrt(p, 90, 150), /mundo/);
  assert.doesNotMatch(deliverySrt(p, 90, 150), /Hola/);
  let q = ops.ensureProjectLibrary(p);
  q = ops.createEmptySequence(q, "Hijo", {
    width: 1080,
    height: 1920,
    fps: 30,
  });
  const id = Object.keys(q.sequences!)[0];
  q = ops.updateSequence(q, id, { ...p, name: "Hijo" });
  q = { ...q, tracks: q.tracks.map((t) => ({ ...t, clips: [] })) };
  q = ops.placeSequence(q, id, "v", 30, true);
  const srt = deliverySrt(q, 30, 90);
  assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
  assert.match(srt, /Hola/);
  assert.equal(srt.match(/Hola/g)?.length, 1);
});
test("secuencias creadas desde selección no heredan llaves que pertenecen al padre", () => {
  const p = ops.setExportRange(fixture(), {
      id: "entrega",
      name: "Padre",
      start: 120,
      end: 180,
    }),
    q = ops.createSequence(p, ["v1"], "Corte");
  assert.equal(Object.values(q.sequences!)[0].exportRanges, undefined);
  assert.equal(q.exportRanges?.length, 1);
});

test("gráficos conservan su proporción física al adaptar 9:16 a 4:5", () => {
  const p = fixture(),
    old = p.tracks[2].clips[0];
  assert.equal(old.kind, "graphic");
  const q = deliveryProject(
      p,
      DEFAULT_VARIANTS[0],
      format,
      DEFAULT_EXPORT_SETTINGS,
    ),
    c = q.tracks[2].clips[0];
  assert.equal(c.kind, "graphic");
  if (old.kind === "graphic" && c.kind === "graphic") {
    assert.ok(
      Math.abs(
        (old.width * p.width) / (old.height * p.height) -
          (c.width * q.width) / (c.height * q.height),
      ) < 0.00001,
    );
    assert.ok(c.y - c.height / 2 >= 0.059);
    assert.ok(c.y + c.height / 2 <= 0.881);
  }
});
test("una plantilla de cinco segundos no se estira al pasar de biblioteca de 30 fps a secuencia de 24", () => {
  let p = ops.addProjectElement(
    ops.ensureProjectLibrary(createEmptyProject()),
    "text",
    "Plantilla",
    150,
  );
  const e = p.library!.elements[0];
  assert.equal(e.frameBase, 30);
  p = ops.setSequenceSettings(p, { width: 1920, height: 1080, fps: 24 });
  const q = ops.placeProjectElement(p, e.id, 0, undefined, "V1");
  const c = q.tracks.find((t) => t.id === "V1")!.clips[0];
  assert.equal(c.durationInFrames, 120);
  assert.equal(p.library!.elements[0].clip.durationInFrames, 150);
  assertProject(q);
});
