# UGC Studio — instrucciones para agentes de IA

Este archivo lo leen Claude Code (vía CLAUDE.md), Codex/ChatGPT y cualquier otro agente.
Es la fuente de verdad sobre cómo trabajar en este repo. Responde al usuario en español.

## Qué es
Editor de video personal para editar videos UGC (anuncios verticales para marcas), dirigido
mediante chat y voz, con una línea de tiempo editable que refleja las operaciones de la IA.
Premiere, DaVinci y Descript son referencias de flujo, no objetivos de réplica. La visión de
Lino incluye comprender imagen, acciones, gestos observables y sonido, además de transcribir.
Ya existen el chat, una primera búsqueda visual local por imágenes y procesamiento de audio
local (separación de voz/acompañamiento y reducción de ruido). La comprensión audiovisual
completa sigue en desarrollo. La vista previa y el render actuales usan Remotion.
Ver `ROADMAP.md` para las fases y `PROGRESS.md` para el estado actual.

## Dirección de producto (aclarada por Lino el 2026-10-19)
- Chat y voz como vías principales de edición, con selección visual y ajustes manuales.
- Toda edición debe verse en la línea de tiempo y poder deshacerse. No dar por implementadas
  capas de ajuste, efectos o animación hasta ampliar el modelo y sus operaciones.
- Lino quiere espacios de trabajo fáciles de cambiar desde una barra inferior, inspirados
  en la organización de Resolve. Nombres, número de espacios y diseño final requieren su criterio.
- Sigue vigente: dos visores Origen/Programa por defecto y opción de alternar por pestañas.
  `MonitorViewer.tsx` comparte zoom con rueda bajo puntero, Shift acelerado, pan central/Mano,
  Ajustar/porcentajes, regla temporal con rango visible y controles fuera de la imagen.
  Calidad Full usa originales; 1/2..1/16 genera versiones locales con FFmpeg en `previewQuality.ts`.
  Son preferencias de vista: no cambiar Project ni la resolución de exportación. Tipografía de
  overlays permanece nítida; no es un render rasterizado de toda la composición a baja resolución.
  I/O puede arrastrarse desde imagen, selección de la minirregla o iconos de video/audio/ambos.
  `useMonitorDrag.tsx` usa puntero, guía y autoscroll; clic/Enter coloca en el cabezal.
  Entre documentos se permite drag HTML5 con payload original, no puntero capturado; el
  arrastre de Origen captura epoch y Programa mantiene su guardia de documento. Validación
  física de ese arrastre OS pendiente; clic hacia Timeline separado y Deshacer comprobados. Origen
  coloca medios; Programa copia capas/cortes mediante copyTimelineRange/placeTimelineRange.
  No aplanar el Programa a un archivo ni cambiar el proyecto al iniciar/cancelar el arrastre.
- Nombres aprobados el 2026-10-20: B1, B2… y Audio 1, Audio 2…; pistas genéricas y ampliables.
  Los IDs internos V1/V2/A0/A1/A2 se conservan por compatibilidad. El audio original del video
  se representa como AudioClip enlazado, con el video silenciado para evitar duplicación.
  Mover/recortar/cortar/borrar respeta esa pareja; los stems procesados siguen independientes.
- Colocar/mover/extender video o audio en una pista ocupada sobrescribe el tramo de destino,
  conservando extremos y parejas originales. No aplicar limpieza automática al montaje antiguo.
  Controles de pista en JSON: locked, hidden, muted, solo, targeted y syncLock. Ojo/M/S afectan
  Programa y export; candados protegen también frente al chat. Seguir ripple es optativo.
- Lino pidió grabar voz desde el micrófono de cada pista Audio. Captura solo al pulsar el botón,
  guarda localmente, convierte a WAV y coloca desde el cabezal inicial; requiere permiso del navegador.
- Barra superior confirmada: secuencias anidadas/individuales, imán, selección enlazada,
  Selection Follows Playhead, marcadores y ajustes. Preferencias locales separadas del montaje.
  Marcadores y secuencias sí viven en Project JSON. `sequenceId` referencia una secuencia editable;
  renderizar sus pistas, nunca tratar `src` vacío como archivo. Abrir una secuencia es navegación;
  las ediciones se guardan en el proyecto raíz mediante ops y comparten Deshacer.
- El 2026-10-20 Lino aprobó herramientas a la izquierda del timeline y medidor a la derecha,
  y pidió paneles maleables y responsivos. El espacio usa un árbol de divisiones con cinco
  paneles: Proyecto, Monitores, Inspector, Timeline y Audio/dBFS independiente. Arrastrar el
  agarre divide en bordes o agrupa en pestañas en el centro; un borde exterior ocupa todo ese lado.
  Guía de destino, separadores por división, ampliar/restaurar y persistencia local versión 3
  con migración de versión 2 y las cuatro zonas antiguas. Medidor vertical/horizontal según su proporción.
  Pestañas separables, flotantes internos y ventanas independientes implementados el 2026-10-21.
  PanelHost conserva el mismo portal/estado al mover su DOM; UiDocument dirige diálogos, menús
  y pantalla completa al documento correcto. Las ventanas secundarias reenvían entrada global
  al mapa central de comandos y se recuperan al cerrar; pagehide cierra sus ventanas.
  Ventana → Presets de ventanas guarda árbol, flotantes y destino/rectángulo de cada ventana.
  Detectar pantallas usa permiso Window Management; identidad por etiqueta y geometría relativa,
  con fallback visible a la principal sin sobrescribir el destino del preset. Aplicar es explícito
  por restricciones del navegador; avisar si bloquea ventanas/detección. Probado destino Kamvas 13
  y retorno desde preset de un monitor; desconexión física y arrastre entre ventanas pendientes.
  Acoplamiento parcial: `dockTargets`/`dockScopes` ofrecen panel individual, conjuntos contiguos
  del árbol y todo el espacio. Durante arrastre en un borde, rueda abajo amplía el alcance y
  arriba lo reduce; la guía muestra la geometría final y el conjunto. El menú Posición ofrece
  los mismos destinos por nombre. `dockPanel` acepta `{group:splitId}` calculado tras retirar
  el origen y conserva las ramas externas. Permite timeline bajo Proyecto+Monitores, con chat
  lateral independiente. Son preferencias versión 4; no cambia el montaje ni su historial.
  Panel activo: glow azul sutil por clic/foco, fuera del JSON, sin pulso ni cambio por hover.
  Regla del timeline fuera del scroll vertical; sincronizar X con pistas e Y con cabeceras,
  compensando barras. El cabezal se puede agarrar a toda su altura y debe ganar al recuadro.
- Atajos: mapa único Windows/QWERTY en `src/app/commands.ts`, menús en español y editor visual
  en Ventana/Edición → Atajos. Preferencias locales versionadas fuera de Project JSON; rótulos
  US/ES y captura por posición física. No añadir listeners o hints con teclas fijas. Ver ATAJOS.md.
  Preset de Premiere 2026 auditado: 629 asignaciones de Edición/Color, consultables como referencia;
  solo 144 comandos adaptados están disponibles y 89 están reservados por funciones pendientes.
  Shift+L pertenece a reproducción lenta, no a selección enlazada. Rueda del timeline: horizontal,
  Ctrl vertical y Alt zoom bajo el puntero; combinaciones editables. J inversa es sin audio.
  Con Selección: Alt+clic aísla imagen/audio temporalmente, conservando su enlace; el movimiento
  posterior respeta esa selección. Alt+arrastrar duplica con IDs/enlaces nuevos, preview y una
  transacción de historial. `duplicateClipsWithSelection` devuelve solo los IDs de las copias.
- Edición contextual (2026-10-20): clic derecho en clip abre acciones, en zona vacía → Añadir
  abre búsqueda por nombre de secuencias y elementos, además de Texto/Sólido/Cuadrado/Ajuste.
  Espacio sigue reproduciendo. Secuencias vacías desde Proyecto, nombre editable, formato heredado;
  Anidar sustituye la selección por referencias editables; doble clic abre su contenido.
- Añadir por rango (2026-10-21): botón derecho + arrastre horizontal desde hueco de una pista
  abre Añadir con inicio/duración; preview/imán/autoscroll solo de vista. Clic derecho simple
  conserva menú. `addRangeGesture.ts` usa el ownerDocument de su panel, limpia captura/listeners
  y cancela en Escape/blur/salida/desmontaje. Texto/gráfico/plantilla llenan rango; secuencia se
  recorta sin estirar y Audio acepta solo sonido. Edición al elegir vía ops, nunca al dibujar.
  Prueba física right-drag pendiente; la API QA disponible no permite ese botón durante drag.
- Proyecto (2026-10-20): `ProjectPanel.tsx` unifica medios, carpetas, secuencias y plantillas
  de texto/gráficos. Biblioteca global en `Project.library`, migrada desde `ProjectFile.media`;
  no duplicarla dentro de secuencias. Renombrar/mover/etiquetar/crear/eliminar pasan por ops y
  comparten Deshacer con el montaje. Delete/Backspace, papelera y clic derecho eliminan entradas
  del proyecto, nunca archivos físicos. Si hay usos, confirmar su alcance en raíz/secuencias;
  contar parejas y derivados y respetar candados. Una eliminación es una sola transacción.
  `library.ts` consulta elementos/usos. Lista ordenable con columnas opcionales y cuadrícula;
  búsqueda por nombre/tipo/notas, carpetas, propiedades y localización de usos. Nuevo elemento
  crea secuencia/ajuste/sólido/negro/transparente/texto/cuadrado reutilizable en Proyecto.
  `mediaMetadata.ts` lee originales por ffprobe local; no presentar FPS del proxy como originales.
  Vistas/columnas/miniaturas son preferencias locales; notas y organización viven en el JSON.
  `useHistory.annotate` se reserva para metadatos derivados de proxies en todas las instantáneas;
  no crear entradas de historial asíncronas que interrumpan la recuperación de un borrado.
  Gestión avanzada (reconexión manual, multicámara, columnas reordenables, edición masiva de
  metadatos y generadores adicionales de Premiere) sigue pendiente.
- `labelColor` y `groupId` son metadatos de clips; remapear grupos al duplicar/pegar. La barra
  horizontal de cada AudioClip controla volumen constante 0..4 en una transacción al soltar,
  no automatización por keyframes. Ganancia no debe aplicarse dos veces a una pareja.
  La onda escala con volumen y muestra preview durante el arrastre; no regenerar sus tiempos
  ni crear historial por movimiento. editAvailability comparte habilitación de menús/acciones.
  Los menús de trabajo ocultan reservas pendientes; permanecen consultables en Atajos.
- `playbackRate` constante 0.25..4 en medios originales; `sourceFrame`/`availableFrames` mantienen
  recortes, cortes, ondas y transcripción. Velocidad de referencias anidadas y rampas pendientes.
  `freezeFrame` es absoluto al origen: mantener clip completo, cola desde cabezal o insertar
  hueco global sincronizado con segmento mudo. No congelar el audio de una pareja existente.
- `GraphicClip`/pistas graphic: sólido, rectángulo y ajuste editable (brillo/contraste/saturación).
  El renderer separa sonido y pila visual; un ajuste envuelve solo capas visuales inferiores.
  Mantener copia/rangos/anidación/validación de gráficos; nunca tratarlos como archivos de video.
- Canales L/R/mono: WAV derivado completo en `server/audioChannels.ts`, caché local serial,
  `channelSource` conserva original para restaurar estéreo; cancelar diálogo no aplica resultado.
  Audio amplificado en preview usa Web Audio; pasar volumen por ref al medidor, pues el pool
  de Remotion no propaga atributos data. Mutear Programa también silencia la copia de medición.
  En render no activar Web Audio ni crossOrigin anónimo: bloqueaba metadata de audio remoto
  al servidor de composición. Exportación usa la misma ganancia mediante Remotion/FFmpeg.
- La transcripción es una parte del análisis. Remotion/HyperFrames componen y renderizan;
  reconocer acciones o sonidos requiere modelos y análisis adicionales.
- La dirección explícita es open source y un flujo completo utilizable sin servicios de pago.
  Revisar licencias del código, pesos y recursos para uso comercial UGC; no equiparar
  código disponible, pesos descargables, servicio con cuota gratuita y licencia open source.
- La investigación y las propuestas del roadmap no autorizan dar por aprobado un rediseño
  visual. Consultar a Lino antes de decisiones importantes de composición, timing y estilo.
- Dirección visual vigente (última referencia de Lino, 2026-10-21): fondo degradado azul noche
  con luz azul superior y ámbar lateral, tarjetas oscuras redondeadas/translúcidas, bordes y glow
  delicados. Referencia del 2026-10-21 añade vidrio esmerilado con blur localizado, reflejo
  superior y clips con degradado/borde luminoso. `glass-ui.css` se carga al final para ese
  acabado; tokens en studio-theme.css. Nunca aplicar filter/blur a la composición o al video.
  Refino del 2026-10-21: bordes de vidrio a ~11 % alfa, activo ~24 %, hairline CSS; croma de
  fondos/glow de clips +18 % con OKLCH relativo, sin filtrar texto ni ondas ni cambiar el JSON.
  `labels.ts` ofrece Rojo/Naranja/Amarillo/Verde/Cian/Azul/Violeta; estilos por variables CSS,
  JSON labelColor hex intacto para etiquetas antiguas. Sin backdrop-filter por clip ni glow
  animado continuo. Sustituye la paleta anterior Pale Sky/Dusty Denim. UI en Poppins local (OFL),
  escala reducida de nuevo por Lino tomando la barra vertical como referencia: texto base 9 px,
  auxiliar 8 px, títulos 10 px, iconos 12 px y controles de unos 20 px. No imponer esa tipografía
  ni escala al contenido del video. El tema vive en `src/app/studio-theme.css` y la densidad en
  `src/app/compact-ui.css`, cargada después del tema base; acabado y legibilidad se afinan con Lino.
- Asistente (2026-10-20): Lino aprobó sintetizar la cara de su personaje como vector sencillo:
  sombrero, máscara oscura, ojos luminosos y barba. `Mascot.tsx` y `public/mascot.svg` comparten
  esa identidad para logo/favicon y botón de chat; adaptar a la paleta vigente, sin cambiarla.
  Clic en la mascota del inspector alterna chat/Propiedades; el logo permite abrirlo incluso
  desde otro panel ampliado. Mantener ChatPanel montado al ocultar para conservar conversación,
  borrador y tareas. La conversación es principal; IA/cuenta y ajustes son vistas secundarias.
  `assistant.css`: apertura 220 ms, saludo de sombrero 320 ms, sin bucle en reposo y con
  `prefers-reduced-motion`. Acabado del personaje/movimiento pendiente del criterio de Lino.

### Timeline: actualización 2026-10-21
- Toda pista no Audio es visual genérica B1… y acepta video/texto/caption/graphic. Mantener IDs
  y tipos heredados, usar `trackFamily`/`trackAcceptsClip` en compatibilidad y `nameTracks` en raíz
  y secuencias. El renderer decide por clip.kind. No recuperar exclusividad T/S/G por accidente.
  Generar subtítulos conserva otros tipos de clip en S1 y reutiliza salida alternativa.
- `timelineSnap.ts`: umbrales físicos 8/13 px con histéresis, bordes/cortes/marcadores; cabezal
  acotado al último frame y material entrante alineable por inicio/final. `gesturePreferences`
  guarda snapBypass (Shift por defecto), editable; usar `bypassSnap`, sin teclas fijas adicionales.
- `mediaPlacement.ts`: misma operación pura para huellas y soltar; dry run valida destino/candados,
  luego el plan vacío obtiene solo piezas entrantes. Preview nunca llama history.apply. Proyecto
  usa puntero dentro del documento, con selección simple/múltiple y salida a carpetas;
  conservar fallback HTML5 entre ventanas y payload antes de dragover. `useMonitorDrag` comparte
  snap, foco y sesión con monitores. Al capturar Project, suprimir el click generado después de
  un drag para que no robe foco al Timeline; un clic sin movimiento conserva Ctrl/Shift/doble clic. Selection Follows Playhead no debe reemplazar selección nueva por un simple edit.
  Al soltar seleccionar solo piezas nuevas, no fragmentos conservados por sobrescritura.
- Inserción explícita de una señal conserva la otra: destinationOnly corta solo destinos y
  desenlaza víctimas afectadas. La colocación normal A/V conserva la sobrescritura de parejas.
  Origen usa el seek pendiente para I/O aun antes de metadata; ignorar seeked atrasados.

## Paneles, efectos y documentos (2026-10-21)
- `PANELS` contiene 12 paneles. Proyecto/Efectos/Mezclador comparten grupo inicial;
  Inspector/Propiedades/Controles de efectos/Sonido esencial/Buscar/Texto forman otro;
  Monitores a su derecha. Timeline y dBFS abajo. Preferencias de workspace versión 4;
  migrar versiones 2/3 agregando pestañas a sus grupos sin reemplazar el árbol del usuario.
- Texto reúne transcripción por pista, corrección de palabras, subtítulos/SRT y gráficos;
  `AIPanel` está dentro de Texto. Buscar consulta biblioteca, clips y diálogo del montaje.
- `timelineViewport.ts` separa área inicial de 15 minutos de duración de contenido/exportación.
  Crece con clips y huellas entrantes; regla con etiquetas adaptativas y virtualizadas.
  Zoom bajo puntero durante arrastre interno: captura wheel → `wheelHandler` de Timeline;
  mantiene la captura del gesto y recalcula la huella con escala/scroll actuales. Entre ventanas
  sigue el fallback HTML5; no declarar verificado Alt+rueda en ese caso.
- `effects.ts`: efectos constantes y 15 presets locales. Transformación/recorte/opacidad,
  color básico, sombra y blur en `clip.effects`; entradas/salidas visuales y crossfade de audio
  son metadatos de borde. Sin keyframes, Lumetri completo ni plugins Adobe. Ajuste conserva
  sus controles existentes de brillo/contraste/saturación; rechazar otros efectos sobre ajuste.
- Disolución/barrido extienden SOLO las secuencias de render alrededor del corte, sin alterar
  `from`/duración del montaje; video sin handles repite fotogramas de borde. No extender audio
  embebido por una transición visual (`audioTransitionTiming`). Crossfade exige audio contiguo
  con handles reales; no sustituir silenciosamente por otro efecto. Cortes/rangos limpian los
  metadatos de extremos que ya no existen. Duración y parámetros usan frames dentro del JSON.
- `AudioTrackMixer`: volumen constante por pista/Master, panorama, M/S, grabación y picos L/R.
  Medidores de pista posfader y antes del Master; salida Master después. Sin automatización,
  inserts, sends/submezclas ni medición LUFS. `CommittedNumber` confirma una transacción.
- Panorama usa matrices estéreo compuestas y WAV completo local en `server/audioMix.ts`.
  El FFmpeg incluido NO codifica PCM float: usar PCM24 normalizado por `panHeadroom(matrix)`
  y recuperar ese factor exactamente una vez en preview/render/medición. Caché `pan3-pcm24`;
  nunca recortar la suma a PCM antes de aplicar ganancias. Mono se duplica sin atenuación
  implícita en pan; export prepara también mono central para coincidir con el monitor. Error breve y Reintentar visibles. En `audioSources`, cadena vacía marca video legado
  sin stream de audio: silenciar esa rama, no impedir export. AudioClip explícito sin
  stream sí debe fallar con mensaje. Distinguir esa marca de una fuente aún pendiente.
  Gain/Master/canales no se aplican doble a parejas o secuencias. `mix` conserva mezcla heredada
  al colocar individualmente una secuencia; el inspector permite restablecerla. Programa copia
  clips sin volver a incorporar su bus actual. Anidar no duplica el Master del proyecto padre.
- `DocumentBank`/`useDocuments` reemplazan historial único en App: cada proyecto conserva
  pasado/presente/futuro; sus secuencias comparten ese historial. Abrir/nuevo añade documento;
  cerrar archiva de forma recuperable. Sesión local `ugc-studio:documents:v1` guarda documentos
  abiertos/cerrados y vistas validadas; recargar recupera JSON/vistas, no la pila de Undo.
  Mantener conversación/borrador de cada documento abierto. La biblioteca sigue siendo global
  dentro de cada Project, nunca una biblioteca compartida entre proyectos distintos.
- Cambiar documento/secuencia invalida epoch, gestos y tareas; Timeline/monitores llevan key
  de contexto. Guardar selección aislada, I/O, cabezal, zoom y scroll por vista. Restauración
  pendiente comprueba versión/epoch y no activa Selection Follows Playhead sobre esa selección.
  Aplicar guardas también a `undo` del chat. `executeEditingTool.ts` prueba las nuevas tools
  sin fuentes/browser/proveedores: abrir/listar/aplicar efectos, parámetros y mezcla por ops.

## Regla de oro de la arquitectura
**El proyecto es un JSON (`src/project/types.ts`). Todo cambio pasa por funciones puras en
`src/project/ops.ts`.** La línea de tiempo usa esas funciones, y el chat de IA (Fase 2) las
llamará como tools. Nunca hagas que la IA genere código Remotion para editar un video: la IA
modifica el JSON y `src/remotion/ProjectComposition.tsx` lo dibuja.

## Motores y animación editable (2026-10-21)
- Remotion conserva el reloj, composición, audio y exportación. `@hyperframes/core@0.8.185`
  aporta el runtime oficial local para texto/captions/gráficos; no sustituye todo el compositor.
- `renderEngine` y `motion` viven en ClipMetadata; operaciones y validación en project/.
  HyperFrames recibe una plantilla HTML confiable, generada desde datos, y se busca cada frame
  con `__player.renderSeek`. No aceptar HTML/JS/GSAP de la IA ni aplanar estas escenas a MP4.
- `motion.ts`: entrada/salida, duración en frames, desplazamiento en píxeles, escala activa,
  easing y claves de posición/escala/rotación/opacidad. Cortes/rangos conservan reloj con
  offset/sourceDuration. Las claves no son automatización arbitraria de color/audio/efectos.
- `MotionControls` comparte datos entre Propiedades y Controles; Texto permite crear escenas.
  Las palabras y sus tiempos relativos al bloque son editables. Estilo por bloque por defecto;
  aplicar a todos los captions desbloqueados requiere la opción explícita.
- Nuevas herramientas del chat son declarativas y usan el mismo historial/guardas de sesión.
  Ver `MOTORES.md`, `QUALITY_AUDIT.md` y `scripts/verify-motion-render.ts` para alcance y QA.

## Sobre el usuario
Lino: motion graphics designer, video editor specialist y artista visual (storytelling visual),
editor UGC en Growth Assistant. Domina Premiere y After Effects; **no programa**. Explicar lo
técnico paso a paso y en simple; en lo visual (timing, easing, tipografía, composición) él es el
experto: pedir su criterio. Usa Windows 11, Ryzen 7 7700X, 32 GB RAM. Contexto completo en
`PROMPT_PARA_CHATGPT.md`.

## Principio: todo gratis
El usuario quiere poder hacer trabajos UGC de principio a fin **sin pagar nada**. Toda herramienta,
modelo o servicio que se integre debe ser gratuito y, de preferencia, open source y local
(ej. Whisper en el navegador, Ollama para el chat, fuentes @fontsource, HyperFrames).
Servicios de pago (Claude/OpenAI API, ElevenLabs, Higgsfield) solo como opción extra, nunca
como requisito. Si algo no tiene alternativa gratis, avisar al usuario antes de integrarlo.

## Estructura
- `src/project/` — modelo de datos (`types.ts`) y operaciones puras (`ops.ts`)
- `src/remotion/` — composición de Remotion que renderiza un `Project` (preview y export)
- `src/app/` — interfaz React (Vite): monitor, línea de tiempo, paneles
- `src/app/TimelineTools.tsx` — herramientas/atajos; `workspace.tsx` — interacción de paneles;
  `workspaceLayout.ts` — árbol/geometría/normalización puros; `workspace.css` — adaptación por tamaño
- `src/app/AudioMeter.tsx` y `programMeter.ts` — medición local de la copia silenciosa del Programa;
  no conectar esa copia con ganancia audible ni incluirla en la composición/render
- `src/ai/tools.ts` — herramientas del chat (JSON Schema, tiempos en segundos) + system prompt
- `src/app/chat/` — panel de chat y `executeTool.ts` (ejecuta herramientas en el navegador)
- `server/llm.ts` — proveedores de IA, conversación en memoria, `/api/chat`, `/api/settings`, `/api/models`
- `server/chatgpt.ts` y `server/responses.ts` — Sign in with ChatGPT oficial, credenciales DPAPI
  en Windows y herramientas mediante Responses; no hereda esta conversación de ChatGPT/Codex
- `server/transcription.ts` y `scripts/transcribe_local.py` — faster-whisper large-v3 local,
  cola/caché y marcas por palabra; Whisper del navegador sigue como alternativa ligera
- `src/app/editPlan.ts` — propuestas de resumen validadas; `keepTimelineRanges` en ops aplica
  todos los rangos del montaje en un solo paso reversible, conservando la sincronía entre pistas
- `server/vision.ts` — muestras con tiempo, caché visual y búsqueda/verificación con Ollama local
- `server/audioProcessing.ts` — FFmpeg y Resemble Denoiser ONNX (pesos MIT); resultados derivados
- `server/localTasks.ts` — cola local serial, progreso/cancelación y resolución de medios locales
- `scripts/` — preparación y separación de audio local; entornos/modelos fuera del repositorio
- `server/` — servidor Express local: subida de archivos, proxies y export. Los datos viven en
  `~/UGC Studio/` (`media/`, `media/proxies/`, `Exportaciones/`), fuera del repo; se puede
  cambiar con la variable `UGC_DATA_DIR`.

## Comandos
- `npm install` — instalar
- `npm run dev` — app en http://localhost:5173 + servidor en :3001
- `npm run typecheck` — revisar tipos (correrlo antes de cada commit)
- `npm test` — comprobar sincronía/rangos/restauración y concurrencia de las operaciones nuevas

## Convenciones
- TypeScript estricto, React con componentes funcionales.
- Todas las versiones de paquetes `remotion` y `@remotion/*` deben ser exactamente iguales.
- Textos de la interfaz en español.
- Tiempos siempre en frames (no segundos) dentro del modelo de datos.
- ChatGPT usa el plan elegible y sus límites; OpenAI API es una opción separada con cobro por uso.
  No guardar tokens de ChatGPT en config.json/frontend/logs. El DevKit SIWC tiene licencia no
  comercial: esta integración usa un cliente propio del protocolo público y jose (MIT).
- No declarar un resumen coherente o una transcripción perfecta por pasar pruebas técnicas:
  la revisión editorial, de texto y de escucha corresponde a Lino.
- Fiabilidad: `QUALITY_AUDIT.md` registra alcance y pendientes. JSON externo/autoguardado se
  valida con `projectFile.ts` antes de reemplazar el documento; no sobrescribir una copia inicial
  inválida. Abrir/crear reinicia historial. Errores de autoguardado/exportación deben ser visibles.
- Al seleccionar/arrastrar un clip hay que transferir foco al panel para los atajos, preservando
  campos y controles. No resolver Delete globalmente si el usuario está escribiendo.
- Peticiones del asistente capturan contexto al enviarse; guardas de `assistantSession.ts` invalidan
  lecturas/escrituras al cambiar documento/secuencia. Aplicar también a tareas de transcripción,
  audio, importación y otras operaciones asíncronas; no tomar selección nueva tras esperar al modelo.
- Remotion no es open source OSI: su licencia comercial/gratuidad para agencia está pendiente
  de resolver. No prometer uso profesional universal gratis por tratarse de ejecución local.

## Al terminar cada sesión de trabajo (obligatorio)
1. Actualiza `PROGRESS.md`: qué hiciste, qué quedó pendiente, decisiones tomadas.
2. Marca en `ROADMAP.md` las tareas completadas.
3. Corre `npm run typecheck` y haz commit con un mensaje claro.
Así otro agente (Claude, ChatGPT, etc.) puede continuar exactamente donde quedaste.


## Secuencias y entregas (2026-10-21)
- `SequenceSettingsFields` comparte presets/tamaño/FPS/audio entre creación y ajustes. FPS puede
  ser fraccionario; el timecode es NDF. `sequenceSettings.ts` conserva segundos al retimar.
- `LibraryMedia.frameBase` y `LibraryElement.frameBase` expresan las unidades de su duración; no es el FPS nativo del archivo.
  `ensureProjectLibrary` migra datos antiguos con FPS raíz. Normalizar al colocar en otra base,
  sin reinterpretar la duración ni cambiar velocidad; la metainformación original viene de FFprobe.
- El primer video en una secuencia sin video pregunta conservar/igualar. Capturar raíz y epoch,
  nunca comparar por identidad la vista de `history.current()` de una secuencia: se reconstruye.
- `Project.exportRanges` contiene pares persistentes start/end exclusivo, administrados por ops;
  las marcas I/O de sesión se pueden guardar como rangos. La regla sigue fuera del scroll Y.
- `exportPlan.ts` produce copias de entrega; no mutar el montaje al filtrar/retimar/reencuadrar.
  Versiones confirmadas: Completa; RAW sin captions/textos/gráficos; Overlays con video y sin
  captions. Combinar rangos × variantes × formatos; el usuario revisa nombres y encuadre.
- `ExportPanel` captura snapshot al abrir, `/api/export-queue` clona al recibir. Cola serial en
  datos locales, manifiestos y recuperación; cerrar panel no cancela. Drenar por próximo lote
  pendiente, incluyendo reintentos anteriores al cursor. Validar ajustes al encolar/reintentar,
  pero no invalidar un archivo terminado por cambios posteriores de capacidades del codificador.
- Remotion conserva composición/reloj y genera video nativo + PCM separado (`separateAudioTo`).
  FFmpeg codifica audio una vez/copia video, aplicando mono/estéreo reales. No usar MKV intermedio
  para MP4: cuantiza timestamps de segmentos cortos. No aplicar perfiles al copiar video ni dar
  por aplicados valores de la interfaz: comprobar tamaño/FPS/canales/frecuencia mediante FFprobe.
- H.264/HEVC del FFmpeg incluido son de 8 bits; VP9 soporta 10, ProRes su profundidad nativa.
  Compositor SDR 8 bits; mezcla/exportación PCM real 16 bits. No prometer HDR o PCM24 por convertir.
- Reencuadre: proporcional/márgenes y foco `VideoClip.reframeFocus`, editable en Controles de
  efectos. Sugerencia local con tres muestras por clip (máximo 20 originales del rango), cancelable
  y sin sobrescribir ajustes cambiados durante la espera. No es tracking ni validación editorial.
- `EXPORTACION.md` documenta uso y parámetros Adobe compatibles/pendientes. Mantener este alcance
  explícito; no presentar la integración como réplica de toda la cola de After Effects.

## Fiscalización de edición (2026-10-22)
- Timeline presenta tres zonas: captions fijados, video y audio. Conservar índices de proyecto
  para ops, geometría real para drag y scroll Y independiente; X/regla/cabeceras sincronizadas.
  Una pista genérica con captions se fija completa, sin duplicar clips ni cambiar su render.
  useMonitorDrag/addRangeGesture deben resolver el viewport bajo el puntero, no el primero.
- trackHeights se guarda por contexto de documento/secuencia e ID (24–180 px), fuera de JSON.
  Alt+rueda en cabeceras cambia esa altura; en lienzo sigue zoom. headerHeight es editable en
  gestos. timelineWheelAction es la decisión común; altura global restablece sobrescrituras.
- transcriptSelection crea copia del diálogo y parejas. Seleccionar primero y volver a arrastrar
  selección/botón; no iniciar HTML drag al seleccionar ni reflow de su barra. Document epoch,
  histéresis/huella y Undo son los mismos del monitor. No copiar overlays ajenos por selección.
- transcriptSource resuelve derivedFrom/channelSource antes de src para audio; usarlo en Texto,
  Buscar, generación y solicitudes. WAV de canales conserva reloj y transcripción del original.
- Disolución directa: setClipDissolve por ops; end en corte contiguo edita next.transitionIn.
  Preview de duración no aplica historial hasta soltar. Clic añade/quita y Escape cancela.
- MonitorViewer mantiene width/height nativos en monitor-image y aplica scale por transform.
  No volver a redimensionar Player al mover rueda: causaba un salto visual de un frame.
- QA de 169 tests/UI/6 exportaciones cortas está documentada en QUALITY_AUDIT.md. Prueba física
  de Alt/Ctrl+rueda, OS multiventana y anuncio largo/editorial no se declaran verificadas.
