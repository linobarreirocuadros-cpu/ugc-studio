# Prompt de traspaso: UGC Studio

> Copia todo lo que está debajo de la línea y pégalo como primer mensaje en ChatGPT (o en Codex).

---

Hola. Vas a continuar el desarrollo de un proyecto de software que empecé con otra IA (Claude). Te voy a dar todo el contexto: quién soy, qué quiero construir, qué está hecho, cómo está construido, qué decisiones se tomaron y qué sigue. Léelo completo antes de responder. Al final hay reglas de trabajo que debes seguir siempre.

## 1. Quién soy

- Me llamo Lino. Trabajo como **editor de videos UGC** para una empresa de Estados Unidos llamada **Growth Assistant**. Edito anuncios UGC (videos verticales 9:16 de creadores de contenido) para distintas marcas, por ejemplo **Dermaflash**, una marca femenina de skincare de Estados Unidos.
- Mi flujo de trabajo es con **Premiere Pro** y la suite de Adobe (After Effects, etc.). Estoy acostumbrado a sus atajos y su forma de trabajar.
- Estoy aprendiendo a editar con **Remotion** (video con código React) usando IAs.
- **No sé programar.** Necesito que me expliques todo paso a paso, en lenguaje simple, en español. Si tengo que hacer algo en mi computador (instalar algo, abrir una terminal, copiar un archivo), dime exactamente dónde hacer clic y qué escribir.
- Mi computador: **Windows 11 Home**, procesador **AMD Ryzen 7 7700X** (8 núcleos), **32 GB de RAM**, placa ASUS TUF Gaming B850M-Plus WiFi. No he confirmado qué tarjeta gráfica tengo.
- Este proyecto es para mí, lo construyo poco a poco, sin apuro.

## 2. La visión: qué quiero construir

Un **editor de video "todo en uno" para UGC**, mío, que combine el mundo de Premiere con Remotion y la IA:

1. **Flujo de trabajo parecido a Premiere Pro**: panel de proyecto, monitor, línea de tiempo con pistas, cortes con atajos, propiedades del clip, exportación profesional.
2. **Línea de tiempo manual** para hacer cambios a mano, y **un chat de IA integrado** que también edite el mismo proyecto en tiempo real (con Remotion por debajo). Ambos trabajan sobre lo mismo y todo se puede deshacer.
3. **Elegir el motor de IA** del chat: modelos gratuitos y buenos (prioridad), y también la opción de usar ChatGPT o Claude.
4. **Comandos de voz** por micrófono, además de texto.
5. **Transcripción con IA** y **generador de subtítulos** con estilos (karaoke, palabra por palabra, etc.).
6. **Carpetas de Foley / efectos de sonido** para usar rápido (whoosh, pops, impactos, risers…).
7. **Perfiles de marca ("Brand Kits")**: por cada marca (ej. Dermaflash), el editor ya sabe cómo se editan sus videos: tipografía, colores, estilo de subtítulos, qué hooks funcionan, qué funciona mejor según las **métricas de Meta Ads**. Que aprenda y ejecute ediciones buenas visualmente y en rendimiento.
8. **Textos animados y motion graphics** (como un mini After Effects), incluyendo **animaciones vectoriales generadas por texto**.
9. **Efectos**: poder agregar efectos, guardar efectos y presets ya hechos.
10. **Exportación de calidad profesional** (como Premiere).
11. **Integraciones**: Higgsfield (generación de video/imagen con IA), ElevenLabs (voces), y herramientas open source de IA útiles para editar.
12. **Acceso a YouTube dentro del programa** para descargar canciones (ojo con el tema de derechos de autor: ver sección 9).
13. **HyperFrames** (de HeyGen, open source) como opción además de Remotion para motion graphics. También me interesa "Hypermotion", pero no se encontró ninguna herramienta con ese nombre; tengo que mandar el link de donde la vi.

### Principio más importante: TODO GRATIS

Quiero poder hacer trabajos UGC **de principio a fin de forma totalmente gratuita**. Toda herramienta, modelo o servicio que se conecte debe ser **gratuito y, de preferencia, open source y local**. Los servicios de pago (API de Claude, API de OpenAI, ElevenLabs, Higgsfield) solo pueden ser **opciones extra**, nunca requisito. Si algo no tiene alternativa gratis, **avísame antes** de integrarlo. Esta regla está escrita en `AGENTS.md` del repositorio.

## 3. Dónde está el proyecto y cómo trabajamos

- **Repositorio en GitHub**: https://github.com/linobarreirocuadros-cpu/ugc-studio (rama `main`). Por ahora es **público**; quiero pasarlo a privado (Settings → Danger Zone → Change visibility).
- En el repositorio hay archivos de "memoria" del proyecto que **debes leer primero y mantener actualizados**:
  - `AGENTS.md`: reglas del proyecto para cualquier IA (Codex lo lee automáticamente). `CLAUDE.md` solo importa a `AGENTS.md`.
  - `ROADMAP.md`: las fases y tareas, marcadas con [x] cuando se terminan.
  - `PROGRESS.md`: bitácora de lo que se hizo en cada sesión, decisiones tomadas y siguiente paso.
  - `README.md`: instrucciones para el usuario.
- **Así uso el programa hoy**: descargo el ZIP desde GitHub (botón verde Code → Download ZIP), lo descomprimo y hago doble clic en `Abrir UGC Studio (Windows).bat`. Ese archivo instala dependencias la primera vez (`npm install`), abre el navegador en http://localhost:5173 y ejecuta `npm run dev`. Ya tengo Node.js instalado. La ventana negra debe quedar abierta mientras uso el editor.
- **Mis videos y exportaciones no viven en la carpeta del programa**, sino en `C:\Users\<usuario>\UGC Studio\` (subcarpetas `media`, `media/proxies`, `Exportaciones`, `Foley`, y el archivo `config.json` con la configuración del chat y las claves API). Así, al bajar una versión nueva del ZIP no pierdo nada.
- El proyecto se guarda solo en el navegador (localStorage) y también se puede Guardar/Abrir como archivo `.ugcproj.json`.

## 4. Stack técnico

- **Frontend**: Vite 6 + React 19 + TypeScript estricto. App web local (todavía no es app de escritorio; se planea Electron o Tauri en la Fase 5).
- **Video**: Remotion **4.0.536**. Todos los paquetes `remotion` y `@remotion/*` deben tener **exactamente la misma versión** (sin `^`). Se usan: `remotion`, `@remotion/player` (vista previa), `@remotion/bundler` + `@remotion/renderer` (exportación en el servidor), `@remotion/whisper-web` (transcripción en el navegador), `@remotion/captions`, `@remotion/fonts`.
- **Servidor local**: Express 4 en el puerto **3001** (`server/index.ts`), ejecutado con `tsx`. Vite en el **5173** hace proxy de `/api`, `/media`, `/out` al 3001.
- **Vite envía cabeceras COOP/COEP** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) porque Whisper en el navegador necesita `crossOriginIsolated` (SharedArrayBuffer). `@remotion/whisper-web` está en `optimizeDeps.exclude`.
- **FFmpeg**: se usa el que trae Remotion (`RenderInternals.callFf` de `@remotion/renderer`), así no hay que instalar nada aparte.
- **Tipografías**: 13 fuentes incluidas localmente con paquetes `@fontsource/*` (Montserrat, Inter, Poppins, DM Sans, Roboto, Lato, Raleway, Oswald, Anton, Bebas Neue, Archivo Black, Playfair Display, DM Serif Display), cargadas con `@remotion/fonts`. Funcionan sin internet.
- **Chat IA**: `@anthropic-ai/sdk` (para Claude) y `fetch` a APIs compatibles con OpenAI (para Ollama, Gemini, Groq, OpenRouter, OpenAI).
- Comandos: `npm install`, `npm run dev` (web + servidor juntos con `concurrently`), `npm run typecheck`.

## 5. Arquitectura (regla de oro)

**El proyecto de edición es un JSON** (`src/project/types.ts`). **Todo cambio pasa por funciones puras** en `src/project/ops.ts` (reciben un `Project` y devuelven uno nuevo). La línea de tiempo usa esas funciones, y el chat de IA también (como "herramientas"). **Nunca hacer que la IA genere código Remotion para editar**: la IA modifica el JSON y `src/remotion/ProjectComposition.tsx` lo dibuja. Así la edición manual y la IA trabajan sobre lo mismo, y todo se puede deshacer.

### Modelo de datos (`src/project/types.ts`)

- Todos los tiempos internos van **en frames** (30 fps), no en segundos. Lienzo por defecto: **1080×1920**.
- `Project`: `{ version: 1, name, fps, width, height, tracks: Track[], transcripts?: Record<src, Word[]> }`.
- `Track`: `{ id, kind: "video" | "audio" | "text" | "caption", name, clips }`.
- Pistas por defecto, en orden de dibujo (de abajo hacia arriba): `A2` "A2 SFX" (audio), `A1` "A1 Música" (audio), `V1` (video principal), `V2` "V2 B-roll" (video encima de V1), `T1` (textos), `S1` "SUB" (subtítulos). La línea de tiempo las muestra al revés (SUB arriba, A2 abajo). `normalizeProject()` agrega las pistas que falten en proyectos viejos.
- Tipos de clip:
  - `VideoClip`: `src` (original, para exportar), `proxySrc?` (copia liviana para la vista previa), `name`, `from`, `durationInFrames`, `trimStart`, `sourceDurationInFrames`, `volume`.
  - `AudioClip`: igual que video más `fadeIn` y `fadeOut` (en frames).
  - `TextClip`: `text` + `style: TextStyle` (`fontFamily`, `fontSize`, `color`, `background | null`, `y` de 0 a 1).
  - `CaptionClip`: bloque de subtítulo con `words: Word[]` (tiempos relativos al inicio del bloque) y `style: CaptionStyle` (TextStyle más `preset: "karaoke" | "palabra" | "bloque"`, `highlightColor`, `uppercase`, `stroke`).
  - `Word`: `{ text, start, end }` en frames. En `transcripts` se guardan relativos al archivo original.
- `getProjectDuration()`: la duración la marcan video, textos y subtítulos. Una canción más larga **no** alarga el video (salvo que el proyecto solo tenga audio).

### Operaciones (`src/project/ops.ts`)

`newId`, `findClip`, `addVideoClip(p, media, trackId="V1", from?)` (en V1 se agrega al final; en V2 entra en el cabezal con volumen 0), `addAudioClip` (A1 música entra al 25% con fade out de 15 frames; A2 al 80%), `addTextClip`, `updateClip`, `moveClip(p, id, from, toTrackId?)` (solo entre pistas del mismo tipo), `deleteClip`, `rippleDeleteClip`, `splitAt` (como la cuchilla / Ctrl+K), `trimClip`, `setProxy`, `relinkMedia` (reconectar un archivo perdido, como "Link Media" de Premiere), `setTranscript`, `wordsOnTimeline`, `generateCaptions` (bloques de 2–3 palabras, corta en pausas y puntuación), `styleAllCaptions`, `setCaptionText`, `removeSilences` (jump cuts usando la transcripción).

### Composición Remotion (`src/remotion/`)

- `ProjectComposition.tsx` dibuja cada clip dentro de un `<Sequence>`. Video con `OffthreadVideo` (`pauseWhenBuffering`, `acceptableTimeShiftInSeconds={0.3}`, `premountFor` de 1 s para que los cortes no se traben). Audio con `<Audio>` y volumen con fades (si la canción dura más que el video, el fade out ocurre donde termina el video).
- Prop `preview: true` (solo en el Player de la app) → usa `proxySrc`. La exportación usa siempre el original. En la vista previa, si el proxy falla se usa el original; si también falla, se muestra un aviso rojo "No se puede reproducir" en vez de pantalla negra.
- Subtítulos: estilo karaoke (la palabra que se dice se pinta del color resaltado), palabra por palabra, o bloque con fondo; pequeño "pop" al aparecer, contorno negro opcional, mayúsculas.
- `fonts.ts`: `ensureFont` carga solo las fuentes usadas; `fontWeightFor` evita negritas falsas (Anton solo tiene 400).
- `Root.tsx` / `index.ts`: composición `"Project"` con `calculateMetadata` para el render del servidor.

### Interfaz (`src/app/`)

- `App.tsx`: layout tipo Premiere. Arriba: nombre del proyecto, deshacer/rehacer, Cortar, + Texto, Guardar, Abrir, selector de calidad de exportación y Exportar. Izquierda: pestañas **Proyecto** (archivos importados, botón Importar video/audio; doble clic agrega; botón "+ B-roll") y **Foley**; debajo, panel **Herramientas IA** (idioma del video, modelo de transcripción, estilo, "Generar subtítulos", "Quitar silencios"). Centro: monitor (Remotion Player) y timecode. Derecha: pestañas **Chat IA** y **Propiedades** (inspector de texto, subtítulos, video y audio). Abajo: línea de tiempo.
- `Timeline.tsx`: regla, pistas, arrastrar clips (con imán a bordes y cabezal), arrastrar verticalmente entre pistas del mismo tipo, recortar desde los bordes, zoom. Los nombres de pista se desplazan junto con las pistas.
- Atajos: Espacio (reproducir), Ctrl/Cmd+K (cortar en el cabezal), Supr (borrar), Shift+Supr (ripple delete), ← → (frame a frame; con Shift de 5 en 5), + / − (zoom), Ctrl+Z / Ctrl+Shift+Z.
- `useHistory.ts`: deshacer/rehacer. El estado vive en un `ref` y expone `current()` para que varias herramientas seguidas del chat vean siempre la versión más reciente.
- Se detectan archivos faltantes (petición HEAD); se muestra un aviso, y si importo un archivo con el mismo nombre se reconecta solo.
- `transcribe.ts`: Whisper en el navegador (`@remotion/whisper-web`), modelos tiny/base/small, idioma inglés/español/automático. `transcribeMissing` (videos de V1 sin transcribir) y `transcribeVoice` (comandos por micrófono; idioma propio `voice-lang`, por defecto español). El modelo se descarga una vez desde huggingface.co y queda guardado en el navegador.
- `AIPanel.tsx`: botones de subtítulos y silencios. `FoleyPanel.tsx`: biblioteca de sonidos (clic escucha, doble clic agrega en A2 en el cabezal, botón "Abrir carpeta").
- `chat/ChatPanel.tsx`: el chat (mensajes, ejemplos, micrófono, configuración ⚙ del motor). `chat/executeTool.ts`: ejecuta en el navegador las herramientas que pide la IA.

### Servidor (`server/`)

- `index.ts`: `POST /api/upload` (guarda el archivo y crea el proxy), `POST /api/proxy` (proxy para proyectos viejos), `GET /api/library` (lista Foley), `POST /api/open-folder` (abre carpetas en el Explorador de Windows o Finder), `POST /api/render` + `GET /api/render/:id` (exportar con progreso), estáticos `/media`, `/out`, `/library`. Variables de entorno opcionales: `UGC_DATA_DIR`, `REMOTION_BROWSER`, `PORT`.
- **Proxies**: lado corto 540 px, H.264 CRF 26, keyframe cada 15 frames, AAC, en `media/proxies/`.
- **Exportación**: MP4 H.264 alta calidad (CRF 16), MP4 borrador (CRF 28), MOV ProRes 422 HQ. La primera vez Remotion descarga su Chrome Headless.
- `llm.ts`: el chat. `GET/POST /api/settings` (las claves nunca se envían al navegador), `GET /api/models` (en Ollama lista los modelos instalados; en la nube, la lista del proveedor), `POST /api/chat`, `POST /api/chat/reset`.

### Cómo funciona el chat de IA

1. El navegador manda el texto a `/api/chat` con un `conversationId`.
2. El servidor guarda la conversación en memoria, en el formato nativo de cada proveedor, y llama al modelo con el `SYSTEM_PROMPT` y las 14 herramientas de `src/ai/tools.ts`.
3. Devuelve `{ text, toolCalls }`. El navegador ejecuta cada herramienta con `executeTool` (usando `ops.ts`) y manda los resultados de vuelta.
4. Se repite hasta que el modelo termina (máximo 12 vueltas por mensaje). Cambiar de motor o modelo inicia una conversación nueva.

**Las 14 herramientas** (los tiempos para la IA van en segundos y se convierten a frames): `get_project_state`, `remove_silences`, `generate_captions`, `style_captions`, `add_text`, `update_text`, `split_at`, `delete_clip`, `move_clip`, `trim_clip`, `set_volume`, `add_media`, `add_sound_effect`, `undo`.

**Motores**:
- **Ollama** (local, gratis, sin internet). Es el motor por defecto, en `http://127.0.0.1:11434` (no `localhost`: en Windows puede resolverse a IPv6 y fallar). Modelo recomendado para mi PC: **qwen3:30b-a3b**; más liviano: **qwen3:8b**. También `gpt-oss:20b` y `llama3.1:8b`. Se quitan las etiquetas `<think>…</think>` de la respuesta.
- **Google Gemini**, **Groq** y **OpenRouter** (modelos `:free`): gratis con límite diario, necesitan clave gratis.
- **Claude** (SDK oficial; `claude-opus-5-5` por defecto, también `claude-sonnet-5-5` y `claude-haiku-5-5`; `output_config.effort: "medium"`; fallback de servidor ante rechazos) y **OpenAI**: de pago y opcionales.

## 6. Historial: qué se hizo y qué se aprendió

1. **Fase 0**: editor base, línea de tiempo, preview y export. Probado.
2. **Lanzadores con doble clic** para Windows y Mac (el de Mac no se ha probado en un Mac real).
3. **Fase 1**: transcripción con Whisper, subtítulos automáticos y quitar silencios. Se probó con transcripciones simuladas porque la red de la sesión de Claude no podía descargar el modelo. **No está confirmado que yo haya probado la transcripción real en mi PC.**
4. **Reproducción entrecortada**: le dije a Claude que la vista previa se trababa y repetía partes en bucle. Se solucionó con proxies, precarga de clips y pausa al bufferear en lugar de retroceder.
5. **Pantalla negra**: después de actualizar, los videos no se veían (la línea de tiempo avanzaba con pantalla negra). La causa fue que descargué el ZIP nuevo en otra carpeta y los videos estaban en la carpeta vieja. Se solucionó moviendo los datos a `~/UGC Studio`, con avisos de archivos faltantes, reconexión automática y fallback del proxy al original.
6. **Audio**: pistas A1/A2, volumen, fades, arrastrar entre pistas; biblioteca de Foley; 13 tipografías. Primero se usó `@remotion/google-fonts`, pero la exportación fallaba sin acceso a Google Fonts, así que se cambió a fuentes locales `@fontsource`.
7. **Pista V2 para B-roll.**
8. **Fase 2**: chat con IA multi-motor y comandos de voz. Se probó con un servidor simulado tipo Ollama (herramientas, errores, deshacer). **No se ha probado con un modelo real todavía.**

En general me gusta cómo va quedando.

## 7. Qué sigue (en orden sugerido)

1. **Probar el chat de verdad** en mi PC: instalar Ollama (ollama.com/download), ejecutar `ollama pull qwen3:30b-a3b` en PowerShell y probar pedidos reales. Ajustar el `SYSTEM_PROMPT` y las descripciones de las herramientas según cómo responda.
2. **Fase 3, Brand Kits**: perfiles por marca (tipografía, colores, estilo de subtítulos, posición, reglas, hooks que funcionan, ejemplos de referencia) que el chat use al editar. Botón "aplicar estilo de marca". Más adelante, conectar métricas de Meta Ads (API o reportes CSV) para aprender qué hooks y estilos rinden mejor por marca.
3. **Fase 4, Motion graphics**:
   - **HyperFrames** (https://github.com/heygen-com/hyperframes, Apache-2.0, de HeyGen): la IA escribe escenas HTML + CSS + GSAP, se renderizan a video (Chrome headless + FFmpeg) y entran como clip en V2. Remotion sigue siendo la base del editor.
   - **Lottie** (`@remotion/lottie`) con animaciones gratis de LottieFiles.
   - Plantillas de textos animados parametrizables, transiciones y efectos (zoom, shake, blur, color), y guardar presets de efectos.
4. **Pendientes de Fase 1**: forma de onda (waveform) y miniaturas en la línea de tiempo; panel de transcripción (leer el texto y borrar frases para cortar el video, tipo "edición por texto"); posición y escala para el B-roll (picture-in-picture).
5. **Mejoras del chat**: respuestas en streaming, recordar conversación, más herramientas (brand kits, motion graphics, exportar).
6. **Fase 5, integraciones**, priorizando las gratis:
   - Limpieza de voz: DeepFilterNet o RNNoise.
   - Separar voz y música: Demucs.
   - Quitar fondo sin pantalla verde: RobustVideoMatting o rembg.
   - Voces gratis como alternativa a ElevenLabs (investigar opciones open source actuales).
   - ElevenLabs y Higgsfield solo como extras de pago.
   - Muchas de estas herramientas son de Python y requieren instalar más cosas; hay que buscar la forma más simple para mí.
7. **Empaquetar como app de escritorio** (Electron o Tauri) para no depender del ZIP ni de la ventana negra.

## 8. Reglas de trabajo para ti (ChatGPT)

1. **Responde siempre en español**, claro y simple. Soy editor, no programador.
2. **Lee `AGENTS.md`, `ROADMAP.md` y `PROGRESS.md`** del repositorio antes de cambiar nada, y respeta la arquitectura: el proyecto es JSON, los cambios pasan por funciones puras en `ops.ts`, y la IA nunca genera código Remotion para editar.
3. **Todo gratis** (sección 2). Avísame antes de cualquier cosa de pago.
4. Mantén las versiones de `remotion` y `@remotion/*` **idénticas y fijas**.
5. Textos de la interfaz en español. Tiempos internos en frames.
6. Antes de cada commit: `npm run typecheck`. Al terminar cada sesión: **actualiza `PROGRESS.md`** (qué hiciste, qué quedó pendiente, decisiones) y **marca `ROADMAP.md`**. Así cualquier IA (tú o Claude) puede continuar donde quedó la otra.
7. **Sé honesto sobre qué probaste y qué no.** No digas que algo funciona si no lo verificaste; dime exactamente qué debo probar yo.
8. No rompas lo que ya funciona: proxies, reconexión de archivos, fuentes locales, export, chat.
9. **Si tienes acceso al repositorio** (por ejemplo, con Codex conectado a GitHub), haz los cambios ahí, en commits claros. **Si no tienes acceso** y yo tengo que copiar código a mano, dame **archivos completos** (no fragmentos sueltos), indicando la ruta exacta de cada uno, porque no sé combinar cambios parciales.
10. Cuando yo tenga que probar algo, dame los pasos numerados: qué descargar, qué abrir y qué hacer clic.

## 9. Notas legales e importantes

- **Remotion** no es open source en sentido estricto: es gratis para personas y empresas de hasta 3 personas; empresas más grandes pagan licencia. Como lo uso yo como editor, es gratis. HyperFrames es Apache-2.0 (gratis).
- **Música de YouTube**: descargarla es técnicamente posible (yt-dlp, open source), pero usarla en anuncios de marcas puede traer problemas de copyright y bloqueos en Meta. Preferir música libre de derechos o con licencia, y avisarme del riesgo.
- Los modelos gratis en la nube (Gemini, OpenRouter) pueden usar mis mensajes para entrenar o registrarlos; Ollama local es 100% privado.

---

**Tu primera tarea**: confirma que entendiste el proyecto con un resumen corto. Revisa `PROGRESS.md` y `ROADMAP.md` del repositorio si tienes acceso. Luego dime qué propones hacer primero, y guíame para probar el chat con Ollama en mi PC si todavía no lo he hecho.
