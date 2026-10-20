import { useEffect, useRef, useState } from "react";
import { executeTool, type ToolContext } from "./executeTool";
import { loadPref, savePref, transcribeVoice } from "../transcribe";
import { ChatEnginePicker, type ProviderId, type SettingsView, type ChatConnection } from "./ChatEnginePicker";
import { applyEditPlan, type EditPlan } from "../editPlan";
import { Mascot } from "../Mascot";
import { ChatMessages, type UiMessage } from "./ChatMessages";

export type ChatActivity="idle"|"working"|"recording";
type ChatReply = { text: string; toolCalls: { id: string; name: string; input: Record<string, unknown> }[]; error?: string };
type OllamaStatus = { state: "checking" | "ready" | "offline" | "missing"; detail?: string };

const TOOL_LABEL: Record<string, string> = {
  read_transcript: "Leyendo la transcripción",
  create_edit_plan: "Preparando propuesta de montaje",
  apply_edit_plan: "Aplicando cortes del resumen",
  search_visual: "Buscando en las imágenes del video",
  split_clip_range: "Cortando los bordes del rango",
  process_audio: "Procesando audio local",
  restore_original_audio: "Restaurando sonido original",
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

export function ChatPanel({ ctx,onActivity }: { ctx: () => Omit<ToolContext, "onStatus">;onActivity?:(activity:ChatActivity)=>void }) {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [settingsError,setSettingsError]=useState(""),[settingsLoading,setSettingsLoading]=useState(true);
  const [screen,setScreen]=useState<"conversation"|"engine"|"settings">("conversation");
  const [connection,setConnection]=useState<ChatConnection|null>(null);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ state: "checking" });
  const [connectionCheck, setConnectionCheck] = useState(0);
  const [recording, setRecording] = useState(false);
  const [editPlan, setEditPlan] = useState<EditPlan | null>(null);
  const editPlanRef = useRef<EditPlan | null>(null);
  const updatePlan = (plan: EditPlan | null) => { editPlanRef.current = plan; setEditPlan(plan); };
  const conversationId = useRef(newConversationId());
  const recorder = useRef<MediaRecorder | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const rootRef=useRef<HTMLElement>(null),previousScreen=useRef(screen);
  const followLatest=useRef(true);
  const [moreIdeas,setMoreIdeas]=useState(false);
  const activity:ChatActivity=recording?"recording":busy||voiceBusy?"working":"idle";
  useEffect(()=>{onActivity?.(activity);},[activity,onActivity]);

  const loadSettings = async () => {
    setSettingsLoading(true);setSettingsError("");
    try {const r=await fetch("/api/settings"),data=await r.json();if(!r.ok||!data.providers||!data.models)throw new Error("El servidor local no responde.");setSettings(data);}
    catch {setSettings(null);setSettingsError("El servidor local no responde.");}
    finally {setSettingsLoading(false);}
  };

  useEffect(() => {
    loadSettings();
  }, []);
  useEffect(()=>{if(previousScreen.current===screen)return;previousScreen.current=screen;requestAnimationFrame(()=>{if(screen==="conversation")inputRef.current?.focus();else rootRef.current?.querySelector<HTMLButtonElement>(".assistant-header button")?.focus();});},[screen]);

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
    if(followLatest.current)listRef.current?.scrollTo({ top: messages.length?listRef.current.scrollHeight:0 });
  }, [messages,screen]);

  const push = (m: UiMessage) =>
    // Un solo mensaje de estado a la vez (se reemplaza en vez de acumularse)
    setMessages((list) => [...list.filter((x) => x.role !== "status"), m]);

  const send = async (text: string) => {
    if (!text.trim() || busy || !settings) return;
    const engine = { provider: settings.provider, model: settings.models[settings.provider] };
    const requestContext=ctx();
    followLatest.current=true;
    setInput("");
    setBusy(true);
    push({ role: "user", text });
    try {
      let reply = await post<ChatReply>("/api/chat", { conversationId: conversationId.current, userText: text, ...engine });
      requestContext.getProject();
      if (settings?.provider === "ollama") setOllamaStatus({ state: "ready" });
      for (let step = 0; step < MAX_STEPS; step++) {
        if (reply.text) push({ role: "assistant", text: reply.text });
        if (reply.toolCalls.length === 0) break;
        const results = [];
        for (const call of reply.toolCalls) {
          requestContext.getProject();
          push({ role: "status", text: `${TOOL_LABEL[call.name] ?? call.name}…` });
          try {
            const content = await executeTool(call.name, call.input, {
              ...requestContext,
              getEditPlan: () => editPlanRef.current,
              setEditPlan: plan=>{requestContext.getProject();updatePlan(plan);},
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
        reply = await post<ChatReply>("/api/chat", { conversationId: conversationId.current, toolResults: results, ...engine });
        requestContext.getProject();
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
    followLatest.current=true;
    post("/api/chat/reset", { conversationId: conversationId.current }).catch(() => {});
    conversationId.current = newConversationId();
    setMessages([]);
    updatePlan(null);
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
        setVoiceBusy(true);
        push({ role: "status", text: "Entendiendo tu voz…" });
        try {
          const text = await transcribeVoice(new Blob(chunks, { type: rec.mimeType }));
          setMessages((list) => list.filter((x) => x.role !== "status"));
          if (text) await send(text);
        } catch (e) {
          push({ role: "error", text: "No pude transcribir la voz: " + (e instanceof Error ? e.message : String(e)) });
        } finally { setVoiceBusy(false); }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      push({ role: "error", text: "No hay permiso para usar el micrófono." });
    }
  };

  const provider = settings ? settings.providers[settings.provider] : null;

  const locked=activity!=="idle";
  const label=provider?.label.split(" (")[0]??"Elegir IA";
  const model=settings?.models[settings.provider]??"";
  const paid=provider&&!provider.free&&settings?.provider!=="chatgpt";
  const connectionState=!settings?(settingsError?"offline":"checking"):settings.provider==="ollama"?ollamaStatus.state:settings.provider==="chatgpt"?(!connection?"checking":connection.connected&&connection.sharing&&!connection.error?"ready":"offline"):provider?.needsKey&&!settings.hasKey[settings.provider]?"missing":"configured";
  const problem=["offline","missing"].includes(connectionState);
  const connectionHint=connectionState==="ready"?"Conectado":connectionState==="configured"?"Proveedor configurado; conexión se comprueba al enviar":connectionState==="checking"?"Comprobando conexión":"Revisar conexión";
  const draft=(text:string)=>{setInput(text);setMoreIdeas(false);requestAnimationFrame(()=>inputRef.current?.focus());};
  const statusText=[...messages].reverse().find(m=>m.role==="status")?.text;
  const examples=[
    {label:"Resumir a 15 s",text:"Resume el video coherentemente a 15 segundos y aplica los cortes"},
    {label:"Añadir subtítulos",text:"Quita los silencios y pon subtítulos karaoke en amarillo"},
    {label:"Crear un hook",text:"Pon un hook arriba en los primeros 3 segundos que diga 'Esto cambió mi piel'"},
  ];
  const icon=(path:React.ReactNode)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{path}</svg>;
  return <section ref={rootRef} className="chat assistant-chat" aria-label="Asistente de edición">
    <header className="assistant-header">
      {screen!=="conversation"&&<button className="assistant-icon" aria-label="Volver al chat" title="Volver al chat" onClick={()=>setScreen("conversation")}>{icon(<path d="m14 5-7 7 7 7"/>)}</button>}
      {screen==="conversation"&&<Mascot/>}
      <strong>{screen==="conversation"?"Asistente":screen==="engine"?"IA y cuenta":"Ajustes"}</strong>
      {screen==="conversation"&&<>
        <button className="assistant-icon" onClick={()=>{newChat();inputRef.current?.focus();}} disabled={locked} title="Nueva conversación" aria-label="Nueva conversación">{icon(<path d="M12 5v14M5 12h14"/>)}</button>
        <button className="assistant-icon" onClick={()=>setScreen("settings")} disabled={locked} title="Ajustes del asistente" aria-label="Ajustes del asistente">{icon(<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>)}</button>
      </>}
    </header>
    <div className="assistant-config-screen" style={{display:screen==="engine"?"flex":"none"}} aria-label="Motor, modelo y cuenta">
      {settings?<ChatEnginePicker settings={settings} disabled={locked} onConnection={setConnection} onConfigure={()=>setScreen("settings")} onSelect={async(provider,model)=>{await post("/api/settings",{provider,model});newChat();await loadSettings();}}/>:<p role="status">{settingsLoading?"Cargando…":settingsError} {!settingsLoading&&<button onClick={()=>void loadSettings()}>Reintentar</button>}</p>}
      {settings?.provider==="ollama"&&<div className="assistant-connection-detail" role="status">
        <p>{ollamaStatus.state==="ready"?"Ollama conectado en este equipo.":ollamaStatus.state==="checking"?"Comprobando Ollama…":ollamaStatus.state==="missing"?"El modelo seleccionado no está descargado.":"Ollama no responde. Ábrelo desde Inicio."}</p>
        {ollamaStatus.detail&&ollamaStatus.state!=="ready"&&<details><summary>Ver detalle</summary><p>{ollamaStatus.detail}</p></details>}
        <button disabled={locked} onClick={()=>setConnectionCheck(n=>n+1)}>Comprobar conexión</button>
      </div>}
    </div>
    {screen==="settings"&&<div className="assistant-config-screen" aria-label="Ajustes del asistente">
      {settings?<ChatSettings settings={settings} onSaved={(changed)=>{if(changed)newChat();void loadSettings();setScreen("conversation");}}/>:<p>{settingsLoading?"Cargando…":settingsError} {!settingsLoading&&<button onClick={()=>void loadSettings()}>Reintentar</button>}</p>}
    </div>}
    <div className="assistant-conversation" style={{display:screen==="conversation"?"flex":"none"}}>
      {problem&&<div className="assistant-notice" role="status"><span>{settingsError|| (settings?.provider==="chatgpt"?"Conecta tu cuenta para empezar.":settings?.provider==="ollama"?"Revisa la conexión de Ollama.":"Configura tu IA para empezar.")}</span><button onClick={()=>settingsError?void loadSettings():setScreen("engine")}>{settingsError?"Reintentar":"Revisar"}</button></div>}
      <div className="chat-messages" ref={listRef} role="log" aria-label="Conversación" aria-live="polite" onScroll={e=>{const n=e.currentTarget;followLatest.current=n.scrollHeight-n.scrollTop-n.clientHeight<40;}}>
        {!messages.length&&<div className="assistant-welcome">
          <Mascot className="assistant-portrait"/>
          <h2>¿Qué editamos hoy?</h2>
          <p>Cuéntame el cambio.<br/>Lo llevamos al timeline.</p>
          <div className="assistant-suggestions">{examples.slice(0,2).map(ex=><button key={ex.label} onClick={()=>draft(ex.text)} disabled={locked}>{ex.label}<span aria-hidden>↗</span></button>)}</div>
          <button className="assistant-more" aria-expanded={moreIdeas} onClick={()=>setMoreIdeas(v=>!v)}>{moreIdeas?"Menos ideas":"Más ideas"}</button>
          {moreIdeas&&<div className="assistant-extra-ideas">{examples.slice(2).map(ex=><button key={ex.label} onClick={()=>draft(ex.text)}>{ex.label}</button>)}<span>También puedes pedir cortes, textos, Foley, cambios de audio o deshacer.</span></div>}
        </div>}
        <ChatMessages messages={messages}/>
        {editPlan&&<div className="chat-edit-plan">
          <b>Propuesta · {(editPlan.durationFrames/ctx().getProject().fps).toFixed(2)} s</b><p>{editPlan.summary}</p>
          <details><summary>Ver cortes ({editPlan.ranges.length})</summary><ol>{editPlan.ranges.map((r,i)=><li key={i}>{(r.start/ctx().getProject().fps).toFixed(2)}–{(r.end/ctx().getProject().fps).toFixed(2)} s · {r.reason}</li>)}</ol></details>
          <div className="assistant-plan-actions"><button disabled={locked} className="primary" onClick={()=>{try{ctx().commit(applyEditPlan(ctx().getProject(),editPlan));updatePlan(null);ctx().onSeek?.(0);push({role:"action",text:"✓ Resumen aplicado. Un paso de Deshacer recupera el montaje anterior."});}catch(e){push({role:"error",text:String(e)});}}}>Aplicar cortes</button><button disabled={locked} onClick={()=>updatePlan(null)}>Descartar</button></div>
        </div>}
      </div>
      {locked&&<div className="assistant-progress" role="status"><span className={"assistant-status-dot "+(recording?"recording":"working")}/><span>{recording?"Te escucho…":statusText||"Pensando…"}{busy&&" · "+waitSeconds+" s"}</span></div>}
      <form className="chat-input" onSubmit={e=>{e.preventDefault();void send(input);}}>
        <textarea ref={inputRef} value={input} aria-label="Mensaje para el asistente" placeholder={recording?"Escuchando…":"¿Qué quieres cambiar?"} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(input);}}} disabled={locked}/>
        <div className="assistant-composer-footer">
          <button type="button" className="assistant-engine-chip" aria-label="Elegir motor y modelo de IA" title={label+" · "+model+" · "+connectionHint+(paid?" · Servicio de pago":settings?.provider==="chatgpt"?" · Tu plan elegible":"")} onClick={()=>setScreen("engine")} disabled={locked}>
            <span className={"assistant-status-dot "+connectionState}/><span>{label}</span><span className="assistant-model-name">{model}</span>{paid&&<small>Pago</small>}<span aria-hidden>⌄</span>
          </button>
          <div className="chat-buttons">
            <button type="button" className={"assistant-icon "+(recording?"recording":"")} onClick={()=>void toggleVoice()} disabled={busy||voiceBusy||!settings} title={recording?"Detener grabación":"Hablar"} aria-label={recording?"Detener grabación":"Hablar al asistente"}>{recording?icon(<rect x="6" y="6" width="12" height="12"/>):icon(<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/></>)}</button>
            <button type="submit" className="primary assistant-send" disabled={locked||!settings||!input.trim()} title="Enviar · Enter" aria-label="Enviar mensaje">{icon(<path d="m5 12 7-7 7 7M12 5v15"/>)}</button>
          </div>
        </div>
      </form>
    </div>
  </section>;
}

function ChatSettings({ settings, onSaved }: { settings: SettingsView; onSaved: (changed:boolean) => void }) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [model, setModel] = useState(settings.models[settings.provider] ?? "");
  const [key, setKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl);
  const [available, setAvailable] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [voiceLang, setVoiceLang] = useState<string>(() => loadPref("voice-lang", "es"));
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState("");
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
    if(saving)return;setSaving(true);setSaveError("");
    try {
    // Primero el motor (y la clave), así la lista de modelos usa la clave nueva
    await post("/api/settings", { provider, model, ...(key ? { key } : {}), ollamaUrl });
    savePref("voice-lang", voiceLang);
    onSaved(provider!==settings.provider||model!==(settings.models[settings.provider]??""));
    } catch(error) {setSaveError(error instanceof Error?error.message:String(error));}
    finally {setSaving(false);}
  };

  const options = [...new Set([...info.suggested, ...available])];

  return (
    <div className="chat-settings fields">
      <label>
        Motor de IA
        <select disabled={saving} value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {(Object.keys(settings.providers) as ProviderId[]).map((p) => (
            <option key={p} value={p}>
              {settings.providers[p].label}
            </option>
          ))}
        </select>
      </label>

      {provider === "ollama" && (
        <details className="hint"><summary>Ayuda para conectar Ollama</summary>
          1. Instala Ollama gratis desde <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com</a>.
          <br />
          2. Abre "Terminal" o "PowerShell" y escribe: <code>ollama pull qwen3:30b-a3b</code>
          <br />
          Recomendado con 32 GB de RAM: <b>qwen3:30b-a3b</b>. Con 16 GB: <b>qwen3:8b</b>.
        </details>
      )}
      {!info.free&&provider!=="chatgpt"&&<p className="assistant-cost-note">Servicio opcional de pago. La API se cobra aparte de las suscripciones de chat.</p>}

      {info.needsKey && (
        <label>
          Clave API {settings.hasKey[provider] ? "(ya guardada; escribe otra para cambiarla)" : ""}
          <input disabled={saving} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Pega tu clave aquí" />
          {info.keyUrl && (
            <a href={info.keyUrl} target="_blank" rel="noreferrer">
              {info.free ? "Conseguir clave gratis" : "Conseguir clave"}
            </a>
          )}
        </label>
      )}

      <label>
        Modelo
        <input disabled={saving} list="chat-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Elige o escribe un modelo" />
        <datalist id="chat-models">
          {options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="hint">
          {available.length > 0 ? `${available.length} modelos disponibles` : listError ?? (provider==="chatgpt"?"Elige los modelos de tu plan en IA y cuenta.":info.needsKey?"Guarda la clave para ver los modelos.":"No se encontraron modelos; actualiza la lista.")}{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); refreshModels(provider); }}>actualizar</a>
        </span>
      </label>

      {provider === "ollama" && (
        <label>
          Dirección de Ollama
          <input disabled={saving} value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
        </label>
      )}

      <label>
        Idioma en que hablas al micrófono
        <select disabled={saving} value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)}>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
        </select>
      </label>

      {saveError&&<p role="alert" className="local-error">{saveError}</p>}
      <button disabled={saving} className="primary" onClick={()=>void save()}>{saving?"Guardando…":"Guardar ajustes"}</button>
    </div>
  );
}
