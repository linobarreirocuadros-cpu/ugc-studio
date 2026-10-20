// Chat de IA: conecta el editor con distintos motores. Gratis y locales primero (Ollama),
// gratis en la nube (Gemini, Groq, OpenRouter) y de pago opcionales (Claude, OpenAI).
// La conversación vive en el servidor; el navegador ejecuta las herramientas sobre el proyecto.
import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOLS } from "../src/ai/tools";
import { registerChatGPT, localRequest } from "./chatgpt";
import { stepResponses, type ResponsesConversation } from "./responses";

export type ProviderId = "ollama" | "gemini" | "groq" | "openrouter" | "anthropic" | "openai" | "chatgpt";

type ProviderInfo = {
  label: string;
  free: boolean;
  needsKey: boolean;
  baseURL?: string; // proveedores con API compatible con OpenAI
  keyUrl?: string; // dónde conseguir la clave
  suggested: string[]; // modelos recomendados (el usuario puede escribir otro)
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  chatgpt: {
    label: "ChatGPT (tu cuenta y plan elegible)", free: false, needsKey: false, suggested: [],
  },
  ollama: {
    label: "Ollama (local, gratis, sin internet)",
    free: true,
    needsKey: false,
    baseURL: "http://127.0.0.1:11434/v1",
    suggested: ["qwen3:30b-a3b", "qwen3:8b", "gpt-oss:20b", "llama3.1:8b"],
  },
  gemini: {
    label: "Google Gemini (gratis con límite diario)",
    free: true,
    needsKey: true,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    suggested: [],
  },
  groq: {
    label: "Groq (gratis con límite diario, muy rápido)",
    free: true,
    needsKey: true,
    baseURL: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    suggested: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  openrouter: {
    label: "OpenRouter (modelos gratis ':free')",
    free: true,
    needsKey: true,
    baseURL: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    suggested: [],
  },
  anthropic: {
    label: "Claude (de pago)",
    free: false,
    needsKey: true,
    keyUrl: "https://platform.claude.com/settings/keys",
    suggested: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  openai: {
    label: "OpenAI API (cobro por uso, opcional)",
    free: false,
    needsKey: true,
    baseURL: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    suggested: [],
  },
};

// --- Configuración (se guarda en "UGC Studio/config.json", nunca en el repo) ----------------

type Settings = {
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  keys: Partial<Record<ProviderId, string>>;
  ollamaUrl: string;
};

const DEFAULT_SETTINGS: Settings = {
  provider: "ollama",
  models: { ollama: "qwen3:30b-a3b", groq: "openai/gpt-oss-120b", anthropic: "claude-opus-5-5" },
  keys: {},
  ollamaUrl: "http://127.0.0.1:11434", // 127.0.0.1 y no localhost: en Windows "localhost" puede ir por IPv6 y fallar
};

// --- Conversaciones en memoria --------------------------------------------------------------

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

type Conversation =
  | ResponsesConversation
  | { kind: "openai"; provider: ProviderId; model: string; messages: OpenAIMessage[] }
  | { kind: "anthropic"; model: string; messages: Anthropic.Beta.BetaMessageParam[] };

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ChatReply = { text: string; toolCalls: ToolCall[] };

class ChatError extends Error {}

export function registerChatRoutes(app: Express, dataDir: string) {
  const chatgpt = registerChatGPT(app, dataDir);
  const configPath = path.join(dataDir, "config.json");
  const conversations = new Map<string, Conversation>();

  const loadSettings = (): Settings => {
    try {
      const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return { ...DEFAULT_SETTINGS, ...saved, models: { ...DEFAULT_SETTINGS.models, ...saved.models } };
    } catch {
      return DEFAULT_SETTINGS;
    }
  };
  const saveSettings = (s: Settings) => fs.writeFileSync(configPath, JSON.stringify(s, null, 2));

  const baseURLFor = (provider: ProviderId, s: Settings) =>
    provider === "ollama" ? `${s.ollamaUrl.replace(/\/$/, "")}/v1` : PROVIDERS[provider].baseURL!;

  // Ajustes visibles para el navegador: las claves nunca salen del servidor, solo si existen.
  app.get("/api/settings", (_req, res) => {
    const s = loadSettings();
    res.json({
      provider: s.provider,
      models: s.models,
      ollamaUrl: s.ollamaUrl,
      hasKey: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, Boolean(s.keys[p as ProviderId])])),
      providers: PROVIDERS,
    });
  });

  app.post("/api/settings", (req, res) => {
    const s = loadSettings();
    const { provider, model, key, ollamaUrl } = req.body as {
      provider?: ProviderId;
      model?: string;
      key?: string;
      ollamaUrl?: string;
    };
    if (provider && PROVIDERS[provider]) s.provider = provider;
    if (model !== undefined) s.models[s.provider] = model.trim();
    if (key !== undefined) s.keys[s.provider] = key.trim() || undefined;
    if (ollamaUrl) s.ollamaUrl = ollamaUrl.trim();
    saveSettings(s);
    res.json({ ok: true });
  });

  // Modelos disponibles: en Ollama, los que están instalados; en la nube, la lista del proveedor.
  app.get("/api/models", async (req, res) => {
    const s = loadSettings();
    const provider = (req.query.provider as ProviderId) ?? s.provider;
    try {
      let ids: string[] = [];
      if (!PROVIDERS[provider]) throw new ChatError("Motor desconocido.");
      if (provider === "chatgpt") {
        localRequest(req);
        const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${await chatgpt.getToken()}` }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new ChatError(`ChatGPT respondió ${response.status}. Revisa tu cuenta y permisos.`);
        const catalog = await response.json();
        const models = (catalog.models ?? []).filter((m: { visibility: string }) => m.visibility === "list").map((m: { slug: string; display_name: string }) => ({ id: m.slug, label: m.display_name }));
        return res.json({ models: models.map((m: { id: string }) => m.id), choices: models });
      } else if (provider === "anthropic") {
        ids = PROVIDERS.anthropic.suggested;
      } else {
        const r = await fetch(`${baseURLFor(provider, s)}/models`, {
          headers: s.keys[provider] ? { Authorization: `Bearer ${s.keys[provider]}` } : {},
        });
        if (!r.ok) throw new ChatError(`El proveedor respondió ${r.status}`);
        const data = (await r.json()) as { data?: { id: string }[] };
        ids = (data.data ?? []).map((m) => m.id.replace(/^models\//, ""));
        if (provider === "openrouter") ids = ids.filter((id) => id.endsWith(":free"));
        if (provider === "openai") ids = ids.filter((id) => /^(gpt|o\d)/.test(id));
      }
      res.json({ models: ids.sort() });
    } catch (err) {
      res.json({ models: [], error: friendlyError(provider, err) });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const { conversationId, userText, toolResults, provider: requestedProvider, model: requestedModel } = req.body as {
      conversationId: string;
      userText?: string;
      toolResults?: { id: string; content: string; isError?: boolean }[];
      provider?: ProviderId;
      model?: string;
    };
    const s = loadSettings();
    const provider = requestedProvider ?? s.provider;
    const model = requestedModel || s.models[provider] || PROVIDERS[provider]?.suggested[0];
    try {
      if (!PROVIDERS[provider]) throw new ChatError("Motor desconocido.");
      if (provider === "chatgpt") localRequest(req);
      if (!model) throw new ChatError("Elige un modelo en la configuración del chat (⚙).");
      if (PROVIDERS[provider].needsKey && !s.keys[provider]) {
        throw new ChatError(`Falta la clave de ${PROVIDERS[provider].label.split(" (")[0]}. Agrégala en ⚙.`);
      }

      // Si cambió el motor o el modelo, se empieza una conversación nueva.
      let conv = conversations.get(conversationId);
      const sameEngine =
        conv && (conv.kind === "anthropic" ? provider === "anthropic" : conv.provider === provider) && conv.model === model;
      if (!conv || !sameEngine) {
        if (toolResults?.length) throw new ChatError("El motor cambió durante la petición. Inicia una nueva petición para continuar.");
        conv =
          provider === "chatgpt" || provider === "openai"
            ? { kind: "responses", provider, model, input: [] }
            : provider === "anthropic"
            ? { kind: "anthropic", model, messages: [] }
            : { kind: "openai", provider, model, messages: [{ role: "system", content: SYSTEM_PROMPT }] };
        conversations.set(conversationId, conv);
      }

      const reply =
        conv.kind === "responses"
          ? await stepResponses(conv, provider === "chatgpt" ? await chatgpt.getToken() : s.keys.openai!, userText, toolResults)
          : conv.kind === "anthropic"
          ? await stepAnthropic(conv, s.keys.anthropic!, userText, toolResults)
          : await stepOpenAI(conv, baseURLFor(provider, s), s.keys[provider], userText, toolResults);
      res.json({ ...reply, provider, model });
    } catch (err) {
      console.error("Chat:", err);
      res.status(400).json({ error: friendlyError(provider, err) });
    }
  });

  app.post("/api/chat/reset", (req, res) => {
    conversations.delete(String(req.body.conversationId));
    res.json({ ok: true });
  });
}

// --- Proveedores compatibles con OpenAI (Ollama, Gemini, Groq, OpenRouter, OpenAI) --------

async function stepOpenAI(
  conv: Extract<Conversation, { kind: "openai" }>,
  baseURL: string,
  key: string | undefined,
  userText?: string,
  toolResults?: { id: string; content: string }[],
): Promise<ChatReply> {
  if (conv.provider === "ollama") return stepOllama(conv, baseURL.replace(/\/v1$/, ""), userText, toolResults);
  const pending: OpenAIMessage[] = [];
  for (const r of toolResults ?? []) pending.push({ role: "tool", tool_call_id: r.id, content: r.content });
  if (userText) pending.push({ role: "user", content: userText });

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model: conv.model,
      messages: [...conv.messages, ...pending],
      tools: TOOLS.map((t) => ({ type: "function", function: t })),
      tool_choice: "auto",
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new ChatError(`(${r.status}) ${body.slice(0, 300)}`);
  }
  const msg = ((await r.json()) as { choices: { message: OpenAIMessage }[] }).choices?.[0]?.message;
  if (!msg || (!msg.content && !msg.tool_calls?.length)) throw new ChatError("El modelo no devolvió respuesta.");

  // Algunos modelos locales muestran su razonamiento entre <think>…</think>: no se muestra.
  const text = (msg.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: safeJson(tc.function.arguments),
  }));
  conv.messages.push(...pending, { role: "assistant", content: msg.content ?? "", ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
  return { text, toolCalls };
}

/** API nativa: /v1 de Ollama no permite ampliar su contexto de 4096 tokens. */
async function stepOllama(conv: Extract<Conversation, { kind: "openai" }>, base: string, userText?: string, results?: { id: string; content: string }[]): Promise<ChatReply> {
  const pending: OpenAIMessage[] = (results ?? []).map((r) => ({ role: "tool", tool_call_id: r.id, content: r.content }));
  if (userText) pending.push({ role: "user", content: userText });
  const history = [...conv.messages, ...pending];
  const messages = history.map((message) => ({ role: message.role, content: (message.content ?? "") + (message.role === "user" && /^qwen3(?::|$)/.test(conv.model) ? "\n/no_think" : ""),
    ...(message.role === "tool" ? { tool_name: history.flatMap((m) => m.tool_calls ?? []).find((call) => call.id === message.tool_call_id)?.function.name } : {}),
    ...(message.tool_calls ? { tool_calls: message.tool_calls.map((call) => ({ function: { name: call.function.name, arguments: safeJson(call.function.arguments) } })) } : {}),
  }));
  // Algunos templates Qwen3 antiguos fuerzan <think> aun con think:false.
  if (/^qwen3(?::|$)/.test(conv.model) && !conv.model.includes("instruct")) messages.push({ role: "assistant", content: "<think>\n\n</think>\n\n" });
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: conv.model, messages, tools: TOOLS.map((tool) => ({ type: "function", function: tool })), stream: true, think: false, options: { num_ctx: 16384, num_predict: 2048, temperature: 0 } }) });
  if (!response.ok || !response.body) throw new ChatError(`Ollama respondió ${response.status}. Comprueba el modelo seleccionado.`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", text = "", done = false;
  const calls: ToolCall[] = [];
  const consume = (line: string) => {
    if (!line.trim()) return;
    const part = JSON.parse(line);
    if (part.error) throw new ChatError(part.error);
    text += part.message?.content ?? "";
    for (const call of part.message?.tool_calls ?? []) calls.push({ id: `call_${randomUUID()}`, name: call.function.name, input: typeof call.function.arguments === "string" ? safeJson(call.function.arguments) : call.function.arguments });
    if (part.done) { if (part.done_reason === "length") throw new ChatError("El modelo local agotó el límite de respuesta. Prueba una petición más concreta."); done = true; }
  };
  try {
    for (;;) { const { value, done: ended } = await reader.read(); if (ended) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop()!; lines.forEach(consume); }
    buffer += decoder.decode(); consume(buffer);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!done || (!text.trim() && !calls.length)) throw new ChatError("Ollama no completó una respuesta. Prueba otro modelo o inicia una conversación nueva.");
  conv.messages.push(...pending, { role: "assistant", content: text, ...(calls.length ? { tool_calls: calls.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {}) });
  const visible = text.includes("</think>") ? text.slice(text.lastIndexOf("</think>") + "</think>".length) : text;
  return { text: visible.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), toolCalls: calls };
}

// --- Claude (SDK oficial de Anthropic) -------------------------------------------------------

async function stepAnthropic(
  conv: Extract<Conversation, { kind: "anthropic" }>,
  apiKey: string,
  userText?: string,
  toolResults?: { id: string; content: string; isError?: boolean }[],
): Promise<ChatReply> {
  const client = new Anthropic({ apiKey });
  // Todos los resultados de herramientas van juntos en un solo mensaje del usuario.
  if (toolResults?.length) {
    conv.messages.push({
      role: "user",
      content: toolResults.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
        is_error: r.isError ?? false,
      })),
    });
  }
  if (userText) conv.messages.push({ role: "user", content: userText });

  const response = await client.beta.messages.create({
    model: conv.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    output_config: { effort: "medium" },
    // Si el modelo rechaza una petición por seguridad, el servidor reintenta con otro modelo.
    ...(conv.model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    messages: conv.messages,
  });

  // Se guarda la respuesta completa (incluye bloques de razonamiento) tal cual.
  conv.messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason === "refusal") {
    return { text: "El modelo no quiso hacer esa petición. Prueba a reformularla.", toolCalls: [] };
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolCalls = response.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
  return { text, toolCalls };
}

// --- Utilidades ------------------------------------------------------------------------------

const safeJson = (s: string): Record<string, unknown> => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

function friendlyError(provider: ProviderId, err: unknown): string {
  if (err instanceof ChatError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "La clave de Claude no es válida.";
  if (err instanceof Anthropic.RateLimitError) return "Claude está limitando las peticiones. Espera un momento.";
  if (err instanceof Anthropic.APIError) return `Error de Claude (${err.status}): ${err.message}`;
  const msg = err instanceof Error ? err.message : String(err);
  const cause = String((err as { cause?: unknown })?.cause ?? "");
  if (provider === "ollama" && /HEADERS_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|HeadersTimeoutError/i.test(msg + cause)) {
    return "Ollama tardó demasiado en empezar a responder. El modelo de 30B puede ser lento con proyectos grandes; prueba qwen3:8b en ⚙.";
  }
  if (provider === "ollama" && /fetch failed|ECONNREFUSED/i.test(msg + cause)) {
    return "No pude conectar con Ollama. ¿Está instalado y abierto? (ollama.com)";
  }
  return msg;
}
