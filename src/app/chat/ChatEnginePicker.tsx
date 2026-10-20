import { useEffect, useState } from "react";

export type ProviderId = "ollama" | "gemini" | "groq" | "openrouter" | "anthropic" | "openai" | "chatgpt";
type ProviderInfo = { label: string; free: boolean; needsKey: boolean; keyUrl?: string; suggested: string[] };
export type SettingsView = { provider: ProviderId; models: Partial<Record<ProviderId, string>>; ollamaUrl: string; hasKey: Record<ProviderId, boolean>; providers: Record<ProviderId, ProviderInfo> };
type Connection = { connected: boolean; sharing: boolean; connecting: boolean; email?: string; error?: string };

async function action(path: string) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || "No se pudo completar la conexión."); return value;
}

export function ChatEnginePicker({ settings, disabled, onSelect, onConfigure }: { settings: SettingsView; disabled: boolean; onSelect: (provider: ProviderId, model: string) => Promise<void>; onConfigure: () => void }) {
  const [models, setModels] = useState<{ id: string; label: string }[]>([]), [error, setError] = useState("");
  const [catalogProvider, setCatalogProvider] = useState<ProviderId | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null), [refresh, setRefresh] = useState(0), [saving, setSaving] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const provider = settings.provider, selected = settings.models[provider] ?? "";
  const choices = catalogProvider === provider ? models : [];
  useEffect(() => {
    const controller = new AbortController(); setModels([]); setError("");
    fetch(`/api/models?provider=${provider}`, { signal: controller.signal }).then((r) => r.json()).then((r) => {
      if (controller.signal.aborted) return;
      if (r.error) setError(r.error);
      setCatalogProvider(provider);
      setModels(r.choices ?? (r.models ?? []).map((id: string) => ({ id, label: id })));
    }).catch((e) => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [provider, refresh, connection?.connected, connection?.sharing]);
  useEffect(() => {
    if (provider !== "chatgpt") return;
    let alive = true;
    const update = () => fetch("/api/chatgpt/status").then((r) => r.json()).then((r) => { if (alive) setConnection(r); }).catch(() => {});
    void update(); const timer = window.setInterval(update, 2500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [provider]);
  const choose = async (next: ProviderId, model: string) => {
    setSaving(true); setError(""); try { await onSelect(next, model); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  const connect = async () => {
    setSaving(true); setError("");
    try {
      const result = await action("/api/chatgpt/connect");
      setAuthorizationUrl(result.url);
      setConnection((c) => ({ ...c, connected: c?.connected ?? false, sharing: c?.sharing ?? false, connecting: true }));
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  const unavailable = disabled || saving || Boolean(connection?.connecting && provider === "chatgpt");
  return <div className="chat-engine-picker fields">
    <label>Motor<select aria-label="Motor del chat" value={provider} disabled={unavailable} onChange={(e) => { const next = e.target.value as ProviderId; void choose(next, settings.models[next] ?? settings.providers[next].suggested[0] ?? ""); }}>
      {Object.entries(settings.providers).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
    </select></label>
    <label>Modelo<select aria-label="Modelo del chat" value={selected} disabled={unavailable || !choices.length} onChange={(e) => void choose(provider, e.target.value)}>
      {!choices.some((m) => m.id === selected) && <option value={selected}>{selected || "Elige un modelo disponible"}</option>}
      {choices.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
    </select></label>
    <div className="chat-engine-actions"><button disabled={unavailable} onClick={() => setRefresh((v) => v + 1)}>Actualizar modelos</button><button disabled={disabled || saving} onClick={onConfigure}>Configurar</button></div>
    {provider === "chatgpt" && <div className="chat-account">
      {connection?.connected && !connection.connecting && <>
        <p className="hint">● ChatGPT conectado · {connection.sharing ? "Plan autorizado" : "Falta autorizar uso del plan"}</p>
        <details><summary>Cuenta y uso</summary><p className="hint">{connection.email || "Cuenta conectada"}</p><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Gestionar uso en ChatGPT</a><button disabled={disabled || saving} onClick={() => void action("/api/chatgpt/disconnect").then((r) => { setConnection(r); setModels([]); }).catch((e) => setError(String(e)))}>Desconectar cuenta</button></details>
      </>}
      {connection?.connecting ? <><p role="status">Completa el acceso y los permisos en la pestaña de ChatGPT.</p>{authorizationUrl && <a href={authorizationUrl} target="_blank" rel="noreferrer">Abrir acceso de ChatGPT</a>}<button onClick={() => void action("/api/chatgpt/cancel").then(setConnection).catch((e) => setError(String(e)))}>Cancelar conexión</button></> : (!connection?.connected || !connection.sharing) && <><button disabled={disabled || saving} onClick={() => void connect()}>Continue with ChatGPT</button><p className="hint">Usa tu plan ChatGPT elegible, con sus permisos y límites.</p></>}
      {connection?.error && <p role="alert" className="local-error">{connection.error}</p>}
    </div>}
    {settings.providers[provider].needsKey && !settings.hasKey[provider] && <p className="hint">Añade la clave de este proveedor en Configurar. {provider === "openai" && "La API se cobra por uso aparte del plan ChatGPT."}</p>}
    {error && provider !== "chatgpt" && <p className="hint" role="alert">{error}</p>}
    {error && provider === "chatgpt" && !error.startsWith("Conecta tu cuenta con") && <p className="hint" role="alert">{error}</p>}
  </div>;
}
