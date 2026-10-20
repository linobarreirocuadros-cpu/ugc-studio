import { useEffect, useRef, useState } from "react";
import { executeTool, type ToolContext } from "./executeTool";
import { loadPref, savePref, transcribeVoice } from "../transcribe";

type ProviderId = "ollama" | "gemini" | "groq" | "openrouter" | "anthropic" | "openai";
type ProviderInfo = { label: string; free: boolean; needsKey: boolean; keyUrl?: string; suggested: string[] };
type SettingsView = {
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  ollamaUrl: string;
  hasKey: Record<ProviderId, boolean>;
  providers: Record<ProviderId, ProviderInfo>;
};

type UiMessage = { role: "user" | "assistant" | "action" | "failed" | "error" | "status"; text: string };
type ChatReply = { text: string; toolCalls: { id: string; name: string; input: Record<string, unknown> }[]; error?: string };
type OllamaStatus = { state: "checking" | "ready" | "offline" | "missing"; detail?: string };

const TOOL_LABEL: Record<string, string> = {
  get_project_state: "Revisando el proyecto",
  remove_silences: "Quitando silencios",
  generate_captions: "Generando subtítulos",
  style_captions: "Cambiando estilo de subtítulos",
  add_text: "Agregando texto",
  update_text: "Editando texto",
  split_at: "Cortando",
  delete_clip: "Borrando clip",
  move_clip: "Moviendo clip",
  trim_clip: "Recortando clip",
  set_volume: "Ajustando volumen",
  add_media: "Agregando archivo",
  add_sound_effect: "Agregando efecto de sonido",
  undo: "Deshaciendo",
};

const MAX_STEPS = 12; // límite de vueltas herramienta → modelo por cada mensaje

const newConversationId = () => Math.random().toString(36).slice(2);

const post = async <T,>(url: string, body: unknown): Promise<T> => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
  return data as T;
};

export function ChatPanel({ ctx }: { ctx: () => Omit<ToolContext, "onStatus"> }) {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ state: "checking" });
  const [connectionCheck, setConnectionCheck] = useState(0);
  const [recording, setRecording] = useState(false);
  const conversationId = useRef(newConversationId());
  const recorder = useRef<MediaRecorder | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadSettings = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => setSettings(null));

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings?.provider !== "ollama") return;
    let cancelled = false;
    setOllamaStatus({ state: "checking" });
    fetch("/api/models?provider=ollama")
      .then((r) => r.json())
      .then((data: { models?: string[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) setOllamaStatus({ state: "offline", detail: data.error });
        else if (!data.models?.includes(settings.models.ollama ?? ""))
          setOllamaStatus({ state: "missing", detail: settings.models.ollama });
        else setOllamaStatus({ state: "ready" });
      })
      .catch(() => { if (!cancelled) setOllamaStatus({ state: "offline" }); });
    return () => { cancelled = true; };
  }, [settings?.provider, settings?.models.ollama, connectionCheck]);

  useEffect(() => {
    if (!busy) { setWaitSeconds(0); return; }
    const start = Date.now();
    const timer = window.setInterval(() => setWaitSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const push = (m: UiMessage) =>
    // Un solo mensaje de estado a la vez (se reemplaza en vez de acumularse)
    setMessages((list) => [...list.filter((x) => x.role !== "status"), m]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    push({ role: "user", text });
    try {
      let reply = await post<ChatReply>("/api/chat", { conversationId: conversationId.current, userText: text });
      if (settings?.provider === "ollama") setOllamaStatus({ state: "ready" });
      for (let step = 0; step < MAX_STEPS; step++) {
        if (reply.text) push({ role: "assistant", text: reply.text });
        if (reply.toolCalls.length === 0) break;
        const results = [];
        for (const call of reply.toolCalls) {
          push({ role: "status", text: `${TOOL_LABEL[call.name] ?? call.name}…` });
          try {
            const content = await executeTool(call.name, call.input, {
              ...ctx(),
              onStatus: (s) => push({ role: "status", text: s }),
            });
            if (call.name !== "get_project_state") push({ role: "action", text: `✓ ${TOOL_LABEL[call.name] ?? call.name}` });
            results.push({ id: call.id, content });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            push({ role: "failed", text: `✗ ${TOOL_LABEL[call.name] ?? call.name}: ${msg}` });
            results.push({ id: call.id, content: `Error: ${msg}`, isError: true });
          }
        }
        reply = await post<ChatReply>("/api/chat", { conversationId: conversationId.current, toolResults: results });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (settings?.provider === "ollama" && /conectar con Ollama|ECONNREFUSED|fetch failed/i.test(message)) {
        setOllamaStatus({ state: "offline", detail: message });
      }
      push({ role: "error", text: message });
    } finally {
      setMessages((list) => list.filter((x) => x.role !== "status"));
      setBusy(false);
    }
  };

  const newChat = () => {
    post("/api/chat/reset", { conversationId: conversationId.current }).catch(() => {});
    conversationId.current = newConversationId();
    setMessages([]);
  };

  // --- Voz: graba, transcribe con Whisper (gratis, en el navegador) y envía ---
  const toggleVoice = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        push({ role: "status", text: "Entendiendo tu voz…" });
        try {
          const text = await transcribeVoice(new Blob(chunks, { type: rec.mimeType }));
          setMessages((list) => list.filter((x) => x.role !== "status"));
          if (text) await send(text);
        } catch (e) {
          push({ role: "error", text: "No pude transcribir la voz: " + (e instanceof Error ? e.message : String(e)) });
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      push({ role: "error", text: "No hay permiso para usar el micrófono." });
    }
  };

  const provider = settings ? settings.providers[settings.provider] : null;

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-engine" title="Motor de IA">
          {provider ? `${provider.label.split(" (")[0]} · ${settings!.models[settings!.provider] ?? "sin modelo"}` : "Sin conexión"}
          {provider && <span className={`badge ${provider.free ? "free" : "paid"}`}>{provider.free ? "gratis" : "de pago"}</span>}
        </span>
        <button onClick={newChat} title="Nueva conversación">＋</button>
        <button onClick={() => setShowSettings((v) => !v)} title="Configuración">⚙</button>
      </div>

      {settings?.provider === "ollama" && (
        <div className={`chat-connection ${ollamaStatus.state}`} role="status">
          {ollamaStatus.state === "checking" ? "Comprobando Ollama…" :
            ollamaStatus.state === "ready" ? "● Ollama conectado en este equipo" :
            ollamaStatus.state === "missing" ? `⚠ El modelo ${ollamaStatus.detail || "seleccionado"} no está descargado. Elige uno en ⚙.` :
            "⚠ Ollama no responde. Ábrelo desde Inicio y vuelve a probar."
          }
          {ollamaStatus.state !== "ready" && ollamaStatus.state !== "checking" && (
            <button type="button" onClick={() => setConnectionCheck((n) => n + 1)}>Comprobar</button>
          )}
        </div>
      )}

      {busy && <div className="chat-wait" role="status">Pensando… {waitSeconds} s{waitSeconds >= 20 ? " · El modelo local puede tardar en cargar." : ""}</div>}

      {showSettings && settings && (
        <ChatSettings
          settings={settings}
          onSaved={() => {
            loadSettings();
            setShowSettings(false);
          }}
        />
      )}

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="hint chat-examples">
            Pídeme cambios en tu edición. Ejemplos:
            {[
              "Quita los silencios y pon subtítulos karaoke en amarillo",
              "Pon un hook arriba en los primeros 3 segundos que diga 'Esto cambió mi piel'",
              "Baja la música al 20% y agrega un whoosh en cada corte",
            ].map((ex) => (
              <button key={ex} className="chat-example" onClick={() => send(ex)} disabled={busy}>
                {ex}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          placeholder={recording ? "Escuchando… pulsa ■ para terminar" : "Escribe o habla…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={busy || recording}
        />
        <div className="chat-buttons">
          <button type="button" className={recording ? "recording" : ""} onClick={toggleVoice} disabled={busy} title="Hablar">
            {recording ? "■" : "🎙"}
          </button>
          <button type="submit" className="primary" disabled={busy || !input.trim()}>
            {busy ? "…" : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatSettings({ settings, onSaved }: { settings: SettingsView; onSaved: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [model, setModel] = useState(settings.models[settings.provider] ?? "");
  const [key, setKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl);
  const [available, setAvailable] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [voiceLang, setVoiceLang] = useState<string>(() => loadPref("voice-lang", "es"));
  const info = settings.providers[provider];

  const refreshModels = (p: ProviderId) => {
    setListError(null);
    fetch(`/api/models?provider=${p}`)
      .then((r) => r.json())
      .then((d) => {
        setAvailable(d.models ?? []);
        if (d.error) setListError(d.error);
      })
      .catch(() => setAvailable([]));
  };

  useEffect(() => {
    setModel(settings.models[provider] ?? settings.providers[provider].suggested[0] ?? "");
    setKey("");
    refreshModels(provider);
  }, [provider]);

  const save = async () => {
    // Primero el motor (y la clave), así la lista de modelos usa la clave nueva
    await post("/api/settings", { provider, model, ...(key ? { key } : {}), ollamaUrl });
    savePref("voice-lang", voiceLang);
    onSaved();
  };

  const options = [...new Set([...info.suggested, ...available])];

  return (
    <div className="chat-settings fields">
      <label>
        Motor de IA
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {(Object.keys(settings.providers) as ProviderId[]).map((p) => (
            <option key={p} value={p}>
              {settings.providers[p].label}
            </option>
          ))}
        </select>
      </label>

      {provider === "ollama" && (
        <div className="hint">
          1. Instala Ollama gratis desde <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com</a>.
          <br />
          2. Abre "Terminal" o "PowerShell" y escribe: <code>ollama pull qwen3:30b-a3b</code>
          <br />
          Recomendado con 32 GB de RAM: <b>qwen3:30b-a3b</b>. Con 16 GB: <b>qwen3:8b</b>.
        </div>
      )}

      {info.needsKey && (
        <label>
          Clave API {settings.hasKey[provider] ? "(ya guardada; escribe otra para cambiarla)" : ""}
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Pega tu clave aquí" />
          {info.keyUrl && (
            <a href={info.keyUrl} target="_blank" rel="noreferrer">
              {info.free ? "Conseguir clave gratis" : "Conseguir clave"}
            </a>
          )}
        </label>
      )}

      <label>
        Modelo
        <input list="chat-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Elige o escribe un modelo" />
        <datalist id="chat-models">
          {options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="hint">
          {available.length > 0 ? `${available.length} modelos disponibles` : listError ?? "Guarda la clave para ver la lista de modelos."}{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); refreshModels(provider); }}>actualizar</a>
        </span>
      </label>

      {provider === "ollama" && (
        <label>
          Dirección de Ollama
          <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
        </label>
      )}

      <label>
        Idioma en que hablas al micrófono
        <select value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)}>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
        </select>
      </label>

      <button className="primary" onClick={save}>Guardar</button>
    </div>
  );
}
