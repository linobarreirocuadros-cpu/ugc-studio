# Progreso

## Estado actual
Fase 2 (chat con IA) construida. Usuario: Windows 11, Ryzen 7 7700X, 32 GB RAM → recomendado
Ollama con qwen3:30b-a3b (MoE, corre bien en CPU) o qwen3:8b.

Fase 0 completa. Fase 1 casi completa: subtítulos, quitar silencios, audio (música/SFX/voz), Foley,
tipografías, V2 para B-roll y ondas de audio. Falta: panel de transcripción y miniaturas.

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

### 2026-10-19 — Reproducción, conexión de Ollama y flujo de medios (Codex)
- Lino reportó saltos/bucles visuales en distintos videos y un mensaje de desconexión al escribir
  al chat. Se encontró un video UGC suyo ya importado (23.976 fps; proyecto a 30 fps).
- Reproducción: `App` actualizaba el cabezal en cada frame y reconstruía `inputProps` del
  `Player` en cada actualización. Se aisló el reproductor con `React.memo` y se memoizaron
  `inputProps`, siguiendo la guía oficial de Remotion y un reporte de saltos similares.
  Ese video avanzó hasta el final en la prueba local; **Lino debe confirmar** que
  desapareció el bucle visual en sus casos concretos. No se modificaron los originales ni proxies.
- Chat: el registro mostró `UND_ERR_HEADERS_TIMEOUT` con Ollama 30B; se confundía con
  desconexión. Ahora el servidor recibe la respuesta de Ollama por SSE y reconstruye texto y
  llamadas a herramientas. En la interfaz aparece el estado de conexión y un contador de espera.
  **Probado con Ollama real**: respuesta simple, `get_project_state` y respuesta posterior al
  resultado de la herramienta. No se ha probado aún una edición del video UGC real mediante IA.
- Proyecto: lista/cuadrícula, monitor de Origen junto a Programa por defecto y opción de pestañas
  (preferencia explícita de Lino). Se pueden marcar entrada/salida y colocar el rango como video,
  solo video o solo audio; se añadió A0 Voz a proyectos nuevos y antiguos. Los medios tienen
  arrastre HTML hacia pistas compatibles. El arrastre **requiere validación manual** en el
  navegador de Lino; la prueba automatizada de arrastre no produjo un drop verificable.
- Ondas: el FFmpeg incluido con Remotion no trae `showwavespic`; se decodifica a WAV mono y
  se crea un SVG local. Probado con el audio del video UGC: la onda apareció en A0,
  y Deshacer restauró el proyecto. Se comprobó con una operación pura que un rango marcado
  conserva inicio, duración y volumen correctos en V2/A0. Se exportó un proyecto de prueba de
  1 s con solo audio extraído del video: el MP4 contenía una pista AAC de 1.003 s;
  se retiró el archivo exportado de prueba. `npm run typecheck` y `npm run build` pasaron.
- Pendiente: validación visual por Lino de la reproducción y del arrastre; miniaturas de video;
  clips de video/audio vinculados; probar una edición real por chat y revisar avisos de `multer`.

### 2026-10-19 — Diagnóstico del archivo UGC original (Codex)
- Lino proporcionó el archivo fuente que asocia con el bucle. Se inspeccionó sin modificarlo:
  H.264, 1080 × 1920, 24000/1001 fps, 626 fotogramas y 26.109 s. Los 626 tiempos de
  fotograma crecen de forma regular (~41.708 ms); FFmpeg lo decodificó sin avisos.
- La copia previamente importada tiene igual duración y número de fotogramas, pero distinto
  hash y diferente texto incrustado en al menos un fotograma. Es otra versión del montaje:
  reproducirla en el proyecto no equivale a probar exactamente el archivo recién enviado.
- En UGC Studio se reprodujo la copia importada de principio a fin. Se observaron el cabezal
  y el reloj interno del elemento de video a ~2.5, 5.4 y 8 s: avanzaron sincronizados. En
  capturas de ~4, 15, 18 y 24 s cambiaron imagen y texto. No se reprodujo un retroceso del
  cabezal ni un bucle visual en esos puntos; esto no descarta saltos breves entre muestras.
- Se importó el original en un proyecto aislado (otro origen del navegador, sin alterar el
  proyecto guardado de Lino). Programa avanzó de 0 a 26 s; a ~2.6, 5.1, 7.8, 10.6, 13.7,
  16.4, 19.2, 22.0 y 25.8 s el reloj interno del video coincidió con el cabezal. Las capturas
  mostraron cambios esperados de plano y texto. No se observó bucle en esos puntos, pero el
  muestreo no descarta un salto breve entre capturas. Se cerró la instancia de prueba.
- No hubo cambios de código. Pendiente: confirmar con Lino si el bucle persiste en su pantalla
  y obtener el segundo exacto o una grabación corta para registrar los fotogramas afectados.
  Quedaron una copia de prueba y su proxy en `UGC Studio/media/` porque el intento de borrarlos
  fue rechazado por la política automática del entorno; no están referenciados por su proyecto.

### 2026-10-19 — Investigación del rumbo de producto (Codex)

- Lino pidió detener el avance de funciones para investigar cómo orientar el editor. Aclaró que
  busca dirigir la edición por texto/voz y comprender imagen, sonido y gestos, con todo resultado
  reflejado en el timeline. Quiere organización por espacios con barra inferior; Premiere,
  Resolve y Descript son referencias, no productos que haya que replicar.
- Se verificaron fechas, estado de Git, `AGENTS.md`, `ROADMAP.md`, este historial, tipos del
  proyecto y herramientas del chat. Se consultaron fuentes oficiales de productos, repositorios,
  modelos y artículos de investigación; los enlaces y requisitos derivados están en `ROADMAP.md`.
- Hallazgo del código: el chat actual recibe texto/estado/transcripciones, sin enviar imagen o
  audio al modelo. Remotion compone/renderiza; HyperFrames sigue sin integrar. El modelo del
  proyecto aún no representa capas de ajuste, efectos genéricos o keyframes. El prompt actual
  propone recortar silencios y poner efectos en cortes por defecto; revisar ese criterio a la
  luz del brief y las decisiones de Lino queda como trabajo pendiente.
- Recomendación, todavía propuesta de diseño: conversación persistente, selección contextual,
  análisis audiovisual local con tiempos verificables, operaciones reversibles y variantes.
  Espacios candidatos: Medios, Edición, Audio, Crear y Exportar. Nodos como opción avanzada
  para generación/composición. Se conserva la preferencia ya aprobada de dos visores/pestañas.
- Candidatos investigados, NO instalados ni probados aquí: Qwen3-VL 4B/8B en Ollama, PySceneDetect,
  faster-whisper, CLAP, Chatterbox Multilingual, ACE-Step 1.5 y ComfyUI con video local. Probar
  trabajos pesados de uno en uno en los 12 GB de VRAM; las cifras publicadas no son benchmarks
  de la RTX 5070 de Lino. Primero localizar un plano visualmente y editarlo con Deshacer.
- Licencias: no hay `LICENSE` en la raíz. Remotion tiene condiciones de licencia empresarial;
  revisar su alcance y dependencias antes de prometer uso gratuito para cualquiera. HyperFrames
  publica Apache-2.0. MMAudio tiene código MIT pero pesos no comerciales: se excluye como
  recomendación del flujo de anuncios. No se decidió una migración ni una licencia del proyecto.
- Conexiones opcionales: la documentación actual de OpenAI describe Sign in with ChatGPT para
  planes Plus/Pro elegibles en apps locales/open source. No está implementado. La documentación
  de Anthropic no permite ofrecer login/cuotas de claude.ai a terceros sin aprobación;
  Gemini API ofrece cuota gratuita para ciertos modelos. La vía gratuita local sigue siendo base.
- Cambios de esta sesión: documentación de intención en `AGENTS.md`, investigación y propuesta
  en `ROADMAP.md`, e historial. Ninguna nueva función del programa ni cambio visual. No se
  ejecutaron pruebas audiovisuales o de IA adicionales; los resultados previos siguen separados.
  `npm run typecheck` y `git diff --check` completados sin errores.

## Siguiente paso sugerido para Codex

Revisar con Lino la dirección propuesta y la distribución de espacios antes de rediseñar.
La siguiente entrega técnica recomendada es una prueba pequeña de visión local sobre un video
UGC: encontrar un plano por lo que muestra (también sin diálogo), enseñar su rango, editarlo
mediante operaciones del proyecto y verificar Deshacer. Validar reproducción/sincronía y cerrar
el fallo de bucle si Lino aún lo observa. Después ampliar el flujo a Foley y versiones de duración.
