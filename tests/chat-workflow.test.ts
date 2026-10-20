import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import express from "express";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createEmptyProject, getProjectDuration, type AudioClip, type CaptionClip, type VideoClip } from "../src/project/types";
import * as ops from "../src/project/ops";
import { createEditPlan, applyEditPlan } from "../src/app/editPlan";
import { readResponsesStream, stepResponses, type ResponsesConversation } from "../server/responses";
import { registerChatGPT } from "../server/chatgpt";
import { wordsFromWhisperTokens } from "../src/project/transcript";

test("los subtokens de Whisper conservan apóstrofes, palabras y puntuación sin espacios artificiales", () => {
  const tokens = ["You", " don", "'t", " make", " rem", "ixes", ".", " [MUSIC]"];
  const words = wordsFromWhisperTokens(tokens.map((text, i) => ({ text, startMs: i * 100, endMs: (i + 1) * 100 })), 30);
  assert.deepEqual(words.map((w) => w.text), ["You", "don't", "make", "remixes."]);
  assert.deepEqual([words[3].start, words[3].end], [12, 21]);
});

function montage() {
  let project = ops.addSourceRange(createEmptyProject(), { src: "/media/source.mp4", name: "Video", durationInFrames: 900 }, "V1", 0, 90, 990);
  const video = project.tracks.find((t) => t.id === "V1")!.clips[0] as VideoClip;
  project = ops.applyProcessedAudio(project, video.id, [{ role: "voice", src: "/media/voice.wav", name: "Voz" }], "clean");
  project = ops.addAudioClip(project, { src: "/media/music.wav", name: "Música", durationInFrames: 900 }, "A1", 0);
  project = ops.setTranscript(project, video.src, [{ text: "Hola", start: 90, end: 120 }, { text: "mundo", start: 300, end: 330 }]);
  project.tracks.find((t) => t.id === "S1")!.clips = [{ id: "caption", kind: "caption", from: 0, durationInFrames: 270, words: [{ text: "Hola", start: 0, end: 30 }, { text: "mundo", start: 210, end: 240 }], style: { fontFamily: "Inter", fontSize: 64, color: "white", background: null, y: 0.7, preset: "karaoke", highlightColor: "yellow", uppercase: false, stroke: true } }];
  return { project, video };
}

test("un resumen mantiene video, voz, música y subtítulos en el mismo tiempo y conserva offsets", () => {
  const { project } = montage(), before = JSON.stringify(project);
  const plan = createEditPlan(project, 15, [{ start_s: 0, end_s: 5, reason: "Gancho" }, { start_s: 7, end_s: 17, reason: "Argumento y cierre" }], "Conservar el relato");
  const next = applyEditPlan(project, plan);
  assert.equal(JSON.stringify(project), before);
  assert.equal(getProjectDuration(next), 450);
  const videos = next.tracks.find((t) => t.id === "V1")!.clips as VideoClip[];
  assert.deepEqual(videos.map((c) => [c.from, c.durationInFrames, c.trimStart]), [[0, 150, 90], [150, 300, 300]]);
  const voices = next.tracks.flatMap((t) => t.clips).filter((c): c is AudioClip => c.kind === "audio" && Boolean(c.derivedFrom));
  assert.deepEqual(voices.map((c) => [c.from, c.durationInFrames, c.trimStart]), [[0, 150, 0], [150, 300, 210]]);
  assert.deepEqual(voices.map((c) => c.derivedFrom!.clipId), videos.map((c) => c.id));
  const captions = next.tracks.find((t) => t.id === "S1")!.clips as CaptionClip[];
  assert.deepEqual(captions.map((c) => [c.from, c.words.map((w) => [w.text, w.start, w.end])]), [[0, [["Hola", 0, 30]]], [150, [["mundo", 0, 30]]]]);
  const music = next.tracks.find((t) => t.id === "A1")!.clips as AudioClip[];
  assert.deepEqual(music.map((c) => [c.from, c.trimStart, c.durationInFrames]), [[0, 0, 150], [150, 210, 300]]);
  assert.equal(new Set(next.tracks.flatMap((t) => t.clips).map((c) => c.id)).size, next.tracks.flatMap((t) => t.clips).length);
});

test("el plan rechaza duración incorrecta, palabras partidas y cambios posteriores del proyecto", () => {
  const { project, video } = montage();
  assert.throws(() => createEditPlan(project, 15, [{ start_s: 0, end_s: 10, reason: "" }], ""), /suman/);
  assert.throws(() => createEditPlan(project, 15, [{ start_s: 0.5, end_s: 15.5, reason: "" }], ""), /atraviesa una palabra/);
  const plan = createEditPlan(project, 15, [{ start_s: 0, end_s: 15, reason: "" }], "" );
  assert.throws(() => applyEditPlan(ops.moveClip(project, video.id, 30), plan), /proyecto cambió/);
});

function events(...values: unknown[]) {
  const bytes = new TextEncoder().encode(values.map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`).join(""));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }));
}

test("Responses no entrega herramientas de una respuesta fallida o interrumpida", async () => {
  await assert.rejects(readResponsesStream(events({ type: "response.output_item.done", item: { type: "function_call", name: "apply_edit_plan" } }, { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } })), /subscription_sharing_usage_limit_exceeded/);
  await assert.rejects(readResponsesStream(events({ type: "response.output_text.delta", delta: "incompleto" })), /interrumpió/);
});

test("Responses reconstruye items del flujo cuando el evento completed trae output vacío", async () => {
  const item = { type: "function_call", name: "get_project_state", call_id: "call", arguments: "{}" };
  const output = await readResponsesStream(events({ type: "response.output_item.done", output_index: 0, item }, { type: "response.completed", response: { output: [] } }));
  assert.deepEqual(output, [item]);
  await assert.rejects(readResponsesStream(events({ type: "response.output_item.done", output_index: 0, item })), /interrumpió/);
});

test("ChatGPT envía historial y resultados de herramientas por Responses con store false y namespace", async () => {
  const original = globalThis.fetch;
  const conversation: ResponsesConversation = { kind: "responses", provider: "chatgpt", model: "modelo-de-prueba", input: [] };
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return events({ type: "response.completed", response: { output: bodies.length === 1
      ? [{ type: "function_call", name: "ugc.get_project_state", call_id: "call-1", arguments: "{}" }]
      : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Edición preparada." }] }] } });
  };
  try {
    const first = await stepResponses(conversation, "credencial-sintética", "Resume a 15 s");
    assert.equal(first.toolCalls[0].name, "get_project_state");
    const second = await stepResponses(conversation, "credencial-sintética", undefined, [{ id: "call-1", content: "Proyecto" }]);
    assert.equal(second.text, "Edición preparada.");
    assert.equal(bodies[0].store, false); assert.equal(bodies[0].stream, true);
    assert.equal((bodies[0].tools as { type: string }[])[0].type, "namespace");
    assert.equal("temperature" in bodies[0], false);
    assert.equal("previous_response_id" in bodies[1], false);
    assert.ok((bodies[1].input as { type: string }[]).some((i) => i.type === "function_call_output"));
  } finally { globalThis.fetch = original; }
});

test("OAuth valida state/PKCE/identidad, guarda solo credenciales cifradas y no las expone al navegador", { skip: process.platform !== "win32" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-siwc-test-"));
  const app = express(); app.use(express.json());
  const client = registerChatGPT(app, root), server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`, original = globalThis.fetch;
  let nonce = "", challenge = "";
  const { privateKey, publicKey } = await generateKeyPair("RS256"), jwk = { ...await exportJWK(publicKey), kid: "test-key" };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://auth.openai.com/.well-known/openid-configuration") return Response.json({ issuer: "https://auth.openai.com", jwks_uri: "https://auth.openai.com/test-jwks" });
    if (url === "https://auth.openai.com/test-jwks") return Response.json({ keys: [jwk] });
    if (url === "https://auth.openai.com/api/accounts/oauth/token") {
      const body = init?.body as URLSearchParams;
      assert.equal(createHash("sha256").update(body.get("code_verifier")!).digest("base64url"), challenge);
      const idToken = await new SignJWT({ nonce, email: "prueba@example.invalid" }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer("https://auth.openai.com").setAudience("oaiapp_synthetic").setSubject("synthetic-user").setExpirationTime("5m").sign(privateKey);
      return Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", id_token: idToken, expires_in: 3600, scope: "openid chatgpt.tokens.use.direct" });
    }
    assert.ok(url.startsWith("http://127.0.0.1:"), "la prueba no debe contactar servicios externos");
    return original(input, init);
  };
  try {
    const blocked = await fetch(base + "/api/chatgpt/connect", { method: "POST", headers: { Origin: "https://example.invalid" } }); assert.equal(blocked.status, 400);
    const begin = await fetch(base + "/api/chatgpt/connect", { method: "POST" }).then((r) => r.json());
    const url = new URL(begin.url); nonce = url.searchParams.get("nonce")!; challenge = url.searchParams.get("code_challenge")!;
    assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
    assert.equal(url.searchParams.get("agent_name_hint"), "UGC Studio");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    assert.equal(callback.hostname, "127.0.0.1");
    assert.equal((await fetch(callback + "?state=incorrecto&code=falso")).status, 400);
    callback.search = new URLSearchParams({ state: url.searchParams.get("state")!, code: "synthetic-code", client_id: "oaiapp_synthetic" }).toString();
    const result = await fetch(callback); assert.equal(result.status, 200, await result.text());
    const state = await fetch(base + "/api/chatgpt/status").then((r) => r.json());
    assert.equal(state.connected, true); assert.equal(state.sharing, true);
    assert.equal(JSON.stringify(state).includes("synthetic-access"), false);
    assert.equal(fs.readFileSync(path.join(root, "chatgpt", "account.dpapi"), "utf8").includes("synthetic-access"), false);
    assert.equal(await client.getToken(), "synthetic-access");
  } finally {
    await fetch(base + "/api/chatgpt/cancel", { method: "POST" });
    globalThis.fetch = original;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + "ugc-siwc-test-"));
    fs.rmSync(root, { recursive: true });
  }
});
