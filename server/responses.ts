import { TOOLS, SYSTEM_PROMPT } from "../src/ai/tools";
import type { ChatReply } from "./llm";

export type ResponseItem = Record<string, unknown>;
export type ResponsesConversation = { kind: "responses"; provider: "chatgpt" | "openai"; model: string; input: ResponseItem[] };

export async function readResponsesStream(response: Response): Promise<ResponseItem[]> {
  if (!response.body) throw new Error("El proveedor no abrió el flujo de respuesta.");
  let buffer = "", completed: ResponseItem[] | null = null;
  const finishedItems = new Map<number, ResponseItem>();
  const decoder = new TextDecoder(), reader = response.body.getReader();
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (["response.failed", "response.incomplete", "error"].includes(event.type)) {
      const error = event.response?.error ?? event.error ?? event;
      throw new Error(`ChatGPT: ${error.code || event.type}. ${error.message || "La respuesta quedó incompleta; revisa el acceso y los límites de tu cuenta."}`);
    }
    if (event.type === "response.output_item.done" && event.item) finishedItems.set(event.output_index, event.item);
    // En SIWC el evento final puede omitir los items ya enviados por el flujo.
    if (event.type === "response.completed") completed = event.response?.output?.length ? event.response.output : [...finishedItems.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop()!; lines.forEach(consume);
    }
    buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const output = completed as ResponseItem[] | null;
  if (!Array.isArray(output) || !output.length) throw new Error("Se interrumpió la respuesta o quedó vacía. No se ejecutaron herramientas de ese mensaje.");
  return output;
}

export async function stepResponses(conv: ResponsesConversation, token: string, userText?: string, results?: { id: string; content: string }[]): Promise<ChatReply> {
  const pending: ResponseItem[] = (results ?? []).map((r) => ({ type: "function_call_output", call_id: r.id, output: r.content }));
  if (userText) pending.push({ role: "user", content: userText });
  const functions = TOOLS.map((t) => ({ type: "function", ...t, strict: false }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: conv.model, instructions: SYSTEM_PROMPT, input: [...conv.input, ...pending], store: false, stream: true, include: ["reasoning.encrypted_content"],
      tools: conv.provider === "chatgpt" ? [{ type: "namespace", name: "ugc", description: "Operaciones del editor de video UGC Studio", tools: functions }] : functions }),
  });
  if (!response.ok) throw new Error(`OpenAI (${response.status}): ${(await response.text()).slice(0, 350)}`);
  const output = await readResponsesStream(response);
  const toolCalls = output.filter((item) => item.type === "function_call").map((item) => {
    const raw = JSON.parse(String(item.arguments));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("El modelo envió argumentos de herramienta no válidos.");
    const name = String(item.name).replace(/^ugc\./, "");
    if (!TOOLS.some((tool) => tool.name === name)) throw new Error("El modelo pidió una herramienta desconocida.");
    return { id: String(item.call_id), name, input: raw as Record<string, unknown> };
  });
  const text = output.filter((item) => item.type === "message").flatMap((item) => Array.isArray(item.content) ? item.content : []).filter((part) => part.type === "output_text").map((part) => part.text).join("\n");
  conv.input.push(...pending, ...output);
  return { text, toolCalls };
}
