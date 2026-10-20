// Cliente propio del protocolo público SIWC; no incorpora el DevKit con licencia no comercial.
import type { Express, Request } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const DIRECT = "chatgpt.tokens.use.direct";
type Account = { clientId: string; subject?: string; email?: string; access?: string; refresh?: string; idToken?: string; expires?: number; scope?: string };
export type ChatGPTState = { connected: boolean; sharing: boolean; connecting: boolean; email?: string; error?: string };

/** Los secretos pasan por stdin; nunca por argumentos, navegador, logs ni config.json. */
export function protectCredentials(input: string, decrypt = false): Promise<string> {
  if (process.platform !== "win32") return Promise.reject(new Error("La conexión ChatGPT protegida está disponible en Windows en esta versión."));
  const action = decrypt
    ? "$bytes=[Convert]::FromBase64String($inputData); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"
    : "$bytes=[Text.Encoding]::UTF8.GetBytes($inputData); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
  const script = `Add-Type -AssemblyName System.Security; $inputData=[Console]::In.ReadToEnd(); ${action}`;
  return new Promise((resolve, reject) => {
    const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error("Windows no pudo acceder a las credenciales protegidas de ChatGPT."));
      else resolve(stdout.trim());
    });
    child.stdin?.end(input);
  });
}

export function localRequest(req: Request) {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) throw new Error("Esta conexión requiere acceso desde este equipo.");
  if (req.headers.origin) {
    const origin = new URL(req.headers.origin);
    if (origin.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || !["5173", "5174", "3001"].includes(origin.port)) throw new Error("Origen de conexión no permitido.");
  }
}

export function registerChatGPT(app: Express, dataDir: string) {
  const dir = path.join(dataDir, "chatgpt");
  fs.mkdirSync(dir, { recursive: true });
  const credentials = path.join(dir, "account.dpapi"), hostFile = path.join(dir, "host.json");
  let account: Account | null = null, loaded = false, loading: Promise<void> | null = null;
  let pending: { server: Server; timer: ReturnType<typeof setTimeout> } | null = null, lastError: string | undefined;
  let refreshing: Promise<void> | null = null;
  const load = async () => {
    if (loaded) return;
    loading ??= (async () => { if (fs.existsSync(credentials)) account = JSON.parse(await protectCredentials(fs.readFileSync(credentials, "utf8"), true)); loaded = true; })();
    try { await loading; } finally { loading = null; }
  };
  const save = async (next: Account) => {
    const encrypted = await protectCredentials(JSON.stringify(next));
    const temporary = credentials + ".tmp";
    fs.writeFileSync(temporary, encrypted, { mode: 0o600 }); fs.renameSync(temporary, credentials);
    account = next;
  };
  const state = (): ChatGPTState => ({ connected: Boolean(account?.access), sharing: Boolean(account?.access && account.scope?.split(" ").includes(DIRECT)), connecting: Boolean(pending), email: account?.email, error: lastError });
  const metadata = async () => {
    const response = await fetch(`${AUTH}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("No se pudo consultar el acceso oficial de ChatGPT.");
    const value = await response.json();
    if (value.issuer !== AUTH || new URL(value.jwks_uri).origin !== AUTH) throw new Error("La identidad del servicio de acceso no coincide.");
    return value as { issuer: string; jwks_uri: string; revocation_endpoint: string };
  };
  const verify = async (token: string, clientId: string, nonce?: string) => {
    const discovery = await metadata();
    const result = await jwtVerify(token, createRemoteJWKSet(new URL(discovery.jwks_uri)), { issuer: AUTH, audience: clientId });
    if (!result.payload.sub || (nonce && result.payload.nonce !== nonce)) throw new Error("No se pudo verificar la identidad de la cuenta.");
    return result.payload;
  };
  const exchange = async (parameters: Record<string, string>) => {
    const response = await fetch(`${AUTH}/api/accounts/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...parameters, resource: RESOURCE }), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`ChatGPT no pudo renovar o completar el acceso (${response.status}). Vuelve a conectar tu cuenta.`);
    const result = await response.json();
    if (typeof result.access_token !== "string" || !Number.isFinite(result.expires_in)) throw new Error("Respuesta de acceso de ChatGPT incompleta.");
    return result;
  };
  const cancel = () => { if (pending) { clearTimeout(pending.timer); pending.server.close(); pending = null; } };
  const getToken = async () => {
    await load();
    if (pending) throw new Error("Completa primero la conexión de ChatGPT.");
    if (!account?.access) throw new Error("Conecta tu cuenta con Continue with ChatGPT.");
    if ((account.expires ?? 0) <= Date.now() + 60000) {
      refreshing ??= (async () => {
        if (!account?.refresh) throw new Error("Vuelve a conectar tu cuenta ChatGPT.");
        const previous = account;
        const result = await exchange({ grant_type: "refresh_token", client_id: previous.clientId, refresh_token: previous.refresh! });
        // Guardar la rotación antes de verificar para no perder el único refresh token válido.
        const next = { ...previous, access: result.access_token, refresh: result.refresh_token ?? previous.refresh, idToken: result.id_token ?? previous.idToken, expires: Date.now() + result.expires_in * 1000, scope: result.scope ?? previous.scope };
        await save({ ...next, access: undefined });
        if (result.id_token) {
          const identity = await verify(result.id_token, previous.clientId);
          if (identity.sub !== previous.subject) throw new Error("La renovación pertenece a otra cuenta. Vuelve a conectar ChatGPT.");
        }
        await save(next);
      })();
      try { await refreshing; } finally { refreshing = null; }
    }
    if (!account?.scope?.split(" ").includes(DIRECT)) throw new Error("Tu cuenta no autorizó usar el plan ChatGPT en UGC Studio. Vuelve a conectar y revisa los permisos.");
    return account!.access!;
  };
  app.get("/api/chatgpt/status", async (req, res) => {
    try { localRequest(req); await load(); res.json(state()); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
  app.post("/api/chatgpt/connect", async (req, res) => {
    try {
      localRequest(req); await load();
      if (process.platform !== "win32") throw new Error("Esta primera conexión protegida requiere Windows.");
      if (pending) throw new Error("Hay un acceso en curso. Complétalo o cancélalo.");
      lastError = undefined;
      let hostId: string;
      if (fs.existsSync(hostFile)) hostId = JSON.parse(fs.readFileSync(hostFile, "utf8")).hostId;
      else { hostId = `urn:uuid:${randomUUID()}`; fs.writeFileSync(hostFile, JSON.stringify({ hostId })); }
      const oauthState = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
      const registered = account?.clientId, previousSubject = account?.subject;
      let used = false;
      const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/auth/callback") { response.writeHead(404).end(); return; }
        if (url.searchParams.get("state") !== oauthState || used) { response.writeHead(400).end("Acceso no reconocido. Vuelve a UGC Studio."); return; }
        used = true;
        try {
          if (url.searchParams.has("error")) throw new Error("Se canceló o denegó el acceso a ChatGPT.");
          const clientId = url.searchParams.get("client_id") || registered;
          const code = url.searchParams.get("code");
          if (!clientId || clientId === "dynamic_agent_client" || !code || (registered && clientId !== registered)) throw new Error("Registro de ChatGPT incompleto o distinto del esperado.");
          await save({ ...account, clientId });
          const result = await exchange({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: redirect });
          const identity = await verify(result.id_token, clientId, nonce);
          if (previousSubject && previousSubject !== identity.sub) throw new Error("Selecciona la cuenta ChatGPT conectada originalmente.");
          await save({ clientId, subject: identity.sub, email: typeof identity.email === "string" ? identity.email : undefined, access: result.access_token, refresh: result.refresh_token, idToken: result.id_token, expires: Date.now() + result.expires_in * 1000, scope: result.scope });
          const pageNonce = randomBytes(16).toString("base64");
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${pageNonce}'; style-src 'unsafe-inline'` }).end(`<title>ChatGPT conectado — UGC Studio</title><h1>ChatGPT conectado</h1><p>Puedes volver al editor y elegir tu modelo.</p><a href="http://localhost:5173/">Volver a UGC Studio</a><script nonce="${pageNonce}">history.replaceState(null,'','/auth/callback');</script>`);
        } catch (e) {
          lastError = e instanceof Error ? e.message : "No se pudo completar el acceso.";
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end(lastError);
        } finally { cancel(); }
      });
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No se pudo abrir el retorno de acceso.");
      const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
      pending = { server, timer: setTimeout(() => { lastError = "El acceso caducó. Vuelve a intentarlo."; cancel(); }, 10 * 60_000) };
      const query = new URLSearchParams({ client_id: registered || "dynamic_agent_client", ext_agent_host_id: hostId, response_type: "code", redirect_uri: redirect, scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", resource: RESOURCE, state: oauthState, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
      if (!registered) query.set("agent_name_hint", "UGC Studio");
      res.json({ url: `${AUTH}/api/accounts/authorize?${query}` });
    } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
  app.post("/api/chatgpt/cancel", (req, res) => { try { localRequest(req); cancel(); res.json(state()); } catch { res.sendStatus(403); } });
  app.post("/api/chatgpt/disconnect", async (req, res) => {
    try {
      localRequest(req); await load(); cancel();
      if (account?.refresh) {
        const discovery = await metadata();
        if (new URL(discovery.revocation_endpoint).origin !== AUTH) throw new Error("Dirección de revocación no válida.");
        const revoked = await fetch(discovery.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: account.refresh, client_id: account.clientId, token_type_hint: "refresh_token" }), signal: AbortSignal.timeout(15000) });
        if (!revoked.ok) throw new Error("No se pudo revocar el acceso. Prueba otra vez o retíralo desde los ajustes de ChatGPT.");
      }
      if (account) await save({ clientId: account.clientId, subject: account.subject, email: account.email });
      res.json(state());
    } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
  return { getToken, state: async () => { await load(); return state(); } };
}
