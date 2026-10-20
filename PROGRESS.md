# Progreso

## Estado actual
Fase 2 (chat con IA) construida. Usuario: Windows 11, Ryzen 7 7700X, 32 GB RAM → recomendado
Ollama con qwen3:30b-a3b (MoE, corre bien en CPU) o qwen3:8b.

Fase 0 completa. Fase 1 casi completa: subtítulos, quitar silencios, audio (música/SFX), Foley,
tipografías y V2 para B-roll. Falta: panel de transcripción, waveform y miniaturas.

## Registro

### 2026-10-19 — Fase 0 (Claude)
- Proyecto creado: Vite + React + TypeScript + Remotion 4.0.536 + servidor Express.
- Probado: subida de archivo, cortes, texto, export H.264 1080×1920 correcto, UI en navegador.
- Decisión: por ahora es app web local (navegador + servidor Node). Se empaquetará como app
  de escritorio en la Fase 5; así avanzamos más rápido.
- Nota: el export usa Chrome Headless de Remotion (se descarga solo la primera vez). Para usar
  otro navegador: variable de entorno `REMOTION_BROWSER=/ruta/al/chrome`.

### 2026-10-19 — Lanzadores (Claude)
- Agregados `Abrir UGC Studio (Windows).bat` y `Abrir UGC Studio (Mac).command`: el usuario no
  programa, así que abre la app con doble clic (instalan dependencias la primera vez).

### 2026-10-19 — Fase 1, parte 1 (Claude)
- Transcripción con `@remotion/whisper-web` (Whisper en WASM dentro del navegador): gratis, sin
  claves, el modelo se descarga una vez desde huggingface.co. Requiere cross-origin isolation:
  `vite.config.ts` envía cabeceras COOP/COEP. Código en `src/app/transcribe.ts`.
- Modelo: `Project.transcripts[src]` guarda palabras en frames del archivo original. Nueva pista
  `S1` (SUB) con `CaptionClip` (bloques de 2–3 palabras, tiempos relativos al bloque).
- Ops nuevas en `ops.ts`: `setTranscript`, `generateCaptions`, `styleAllCaptions`,
  `setCaptionText`, `removeSilences`. Probadas con transcripción simulada + render real.
- UI: panel "Herramientas IA" (izquierda) e inspector de subtítulos (derecha).
- Pendiente de probar: la transcripción real en el computador del usuario (en la nube de Claude
  no hay acceso a huggingface.co).
- Limitación: "Quitar silencios" no mueve textos/subtítulos ya creados; generar subtítulos después.

### 2026-10-19 — Reproducción fluida (Claude)
- Problema reportado: la vista previa se trababa y repetía partes, sobre todo en los cortes.
- Solución: **proxies** como en Premiere. Al importar, el servidor crea una copia liviana
  (lado corto 540 px, keyframe cada 15 frames) con el ffmpeg que trae Remotion
  (`RenderInternals.callFf`), en `media/proxies/`. `VideoClip.proxySrc` la guarda; el Player usa
  `preview: true` → proxy; la exportación usa siempre el original (probado borrando el proxy).
- Además: `premountFor` (carga el siguiente clip 1 s antes), `pauseWhenBuffering` y
  `acceptableTimeShiftInSeconds` en el video. Proyectos viejos piden su proxy a `/api/proxy`.

### 2026-10-19 — Pantalla negra al reproducir (Claude)
- Causa probable: el usuario descargó el ZIP nuevo en otra carpeta; el proyecto (guardado en el
  navegador) apuntaba a videos que estaban en `media/` de la carpeta vieja → 404 → negro.
- Arreglos: datos fuera del programa en `~/UGC Studio/`; aviso "Archivo no encontrado" en el panel
  y en el monitor; al importar un archivo con el mismo nombre se reconecta solo (`relinkMedia`);
  si el proxy falla se usa el original (onError solo en preview; el export sigue fallando fuerte).
- Probado en navegador: aviso, reconexión y reproducción con fallback.

### 2026-10-19 — Audio, Foley y tipografías (Claude)
- `AudioClip` (volumen, fadeIn/fadeOut en frames) y pistas A1 "Música" / A2 "SFX".
  `normalizeProject()` agrega pistas faltantes a proyectos viejos (se llama al cargar/abrir).
- La duración del video la marcan video/textos/subtítulos; una canción más larga no alarga el
  export y su fade out ocurre donde termina el video (`useVideoConfig` en `AudioLayer`).
- `moveClip(p, id, from, trackId)`: arrastre vertical entre pistas del mismo tipo.
- Foley: carpetas en `~/UGC Studio/Foley/<categoría>`; `GET /api/library`, servidas en `/library`.
  Pestaña "Foley": clic = escuchar, doble clic = agrega en A2 en el cabezal.
  `POST /api/open-folder` abre la carpeta en Explorador/Finder.
- Tipografías: se probó @remotion/google-fonts pero el export falla sin internet; se cambió a
  archivos locales `@fontsource/*` + `@remotion/fonts` (`src/remotion/fonts.ts`, generado con
  pesos 400/700/900 del subset latin). `fontWeightFor` evita negritas falsas (Anton solo 400).
- "+ Texto" deja el texto seleccionado. Timeline: nombres de pista se desplazan con las pistas.
- Probado en navegador: importar video+mp3, Foley a A2, mover A1→A2, fuente Anton, export con
  audio (6 s aunque la canción dura 20 s).

### 2026-10-19 — V2 B-roll + investigación de herramientas (Claude)
- Pista `V2` (video, encima de V1). `addVideoClip(p, media, trackId, from?)`: en V2 entra en el
  cabezal y con volumen 0. Botón "+ B-roll" al pasar el mouse por un video del panel.
- Probado export: V2 tapa a V1 solo durante su clip.
- El usuario preguntó por HyperFrames (HeyGen, github.com/heygen-com/hyperframes, Apache-2.0,
  HTML+GSAP → MP4 con Chrome headless + FFmpeg). Decisión: Remotion sigue siendo la base; HyperFrames
  se integra en la Fase 4 como generador de clips de motion graphics que entran en V2.
  "Hypermotion" no se encontró; pendiente que el usuario mande link.

### 2026-10-19 — Fase 2: chat con IA (Claude)
- Principio "todo gratis" en AGENTS.md. Motor por defecto: Ollama local.
- Flujo: el navegador envía el texto a `/api/chat`; el servidor guarda la conversación (en
  memoria, por `conversationId`) en el formato nativo de cada proveedor y devuelve
  `{text, toolCalls}`; el navegador ejecuta cada herramienta con `executeTool` y devuelve los
  resultados; se repite hasta 12 vueltas. Cambiar motor/modelo inicia conversación nueva.
- Adaptadores: OpenAI-compatible por `fetch` (Ollama, Gemini, Groq, OpenRouter, OpenAI; quita
  `<think>…</think>`), y Claude con el SDK oficial `@anthropic-ai/sdk` (beta messages, effort
  medium, `fallbacks: "default"` salvo Haiku, guarda `response.content` completo).
- `useHistory` ahora guarda el estado en un ref y expone `current()` para que varias
  herramientas seguidas vean el proyecto actualizado. Cada herramienta = un paso de deshacer.
- Voz: MediaRecorder → `transcribeVoice` (Whisper web, idioma "voice-lang", por defecto es).
- Ollama en `127.0.0.1` (no `localhost`: en Windows puede resolver a IPv6 y fallar).
- Probado con un servidor simulado tipo Ollama: lista de modelos, herramientas, errores,
  `<think>` oculto y Ctrl+Z. NO probado con un modelo real (sin red/sin Ollama en la nube).

### 2026-10-19 — Traspaso a ChatGPT (Claude)
- El usuario quiere seguir el proyecto en ChatGPT. Se creó `PROMPT_PARA_CHATGPT.md` con todo el
  contexto (visión, stack, arquitectura, historial, decisiones, pendientes y reglas de trabajo).
  Mantenerlo actualizado si cambia algo importante.

### 2026-10-19 — Primera prueba local del chat con Ollama (Codex)
- Se actualizó la copia local al `main` de GitHub antes de probar. Se instaló Ollama 0.40.5
  y se descargó `qwen3:8b`. PC: RTX 5070 con 12 GB de VRAM, 32 GB de RAM.
- Prueba real en el navegador con un video sintético de 4 s: el chat agregó `PRUEBA IA`
  en T1 desde el frame 0 durante 90 frames (3 s a 30 fps), arriba (`y: 0.18`). Se verificó
  en monitor, línea de tiempo y archivo `.ugcproj.json` guardado. Deshacer quitó el texto,
  Rehacer lo restauró y el autoguardado lo conservó tras recargar la página.
- Se descargó y probó también `qwen3:30b-a3b` (18 GB). Su primera petición, incluida la
  carga del modelo, tardó aproximadamente 69 s. Agregó `MODELO 30B` abajo (`y: 0.72`),
  desde el frame 0 durante 60 frames (2 s). Se verificó en el monitor, la línea de tiempo
  y el proyecto guardado. El PC tiene una RTX 5070 con 12 GB de VRAM; parte del modelo
  se cargó en RAM. Una segunda petición, con el modelo ya cargado, leyó y resumió el proyecto
  sin editarlo en unos 28 s. Quedó seleccionado el modelo de 30B en el editor.
- `npm install` y `npm run typecheck` completados. `npm audit --omit=dev` reportó tres
  avisos de severidad alta en la cadena `multer` → `busboy` → `dicer`; la corrección
  automática propone un cambio mayor de `multer` y no se aplicó en esta prueba.
- Pendiente: probar con un video UGC real y ajustar el prompt si las ediciones lo requieren.
  Tampoco se probó Whisper real en este PC.

## Siguiente paso sugerido
Probar el chat con un video UGC real; ajustar el prompt según resultados y revisar la
actualización de `multer` sin romper la importación de medios.
Luego: HyperFrames (Fase 4) o Brand Kits (Fase 3).
