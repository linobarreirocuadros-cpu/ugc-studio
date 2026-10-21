# Control de calidad — actualizado 2026-10-21

## Conclusión

UGC Studio es una **alfa funcional**, con una arquitectura aprovechable para un editor
profesional especializado en UGC. Todavía no está validado como único editor para entregar
trabajos de la agencia. La cantidad de botones o las pruebas automáticas aprobadas no prueban
continuidad audiovisual, criterio editorial, recuperación ante fallos ni rendimiento sostenido.

La prioridad recomendada es estabilizar un flujo completo y repetirlo con trabajos reales
antes de ampliar efectos, generación o interfaces. El MVP es terminar un anuncio, revisarlo,
reabrirlo y corregirlo con seguridad, con edición manual y por chat coherentes entre sí.

## Entrega de paneles, efectos y proyectos — 2026-10-21

Alcance comprobado de esta entrega, sin afirmar equivalencia completa con Premiere:

| Área | Resultado y evidencia |
|---|---|
| Gates | 128 pruebas de operaciones, sesión, tools y FFmpeg; typecheck y build. Bundle aún grande: Vite avisa chunks >500 kB |
| Paneles | 12 IDs, siete paneles añadidos; migración 2/3→4 conserva layout antiguo. UI agrupa Controles de efectos junto a Proyecto, lo flota internamente y lo devuelve al grupo |
| Varios documentos | UI: A conserva 8 clips y mezcla, B tiene montaje propio; Undo en A no borra texto de B. Abrir añade pestaña. Cierre/reapertura y recarga recuperan proyectos y vistas |
| Secuencias | UI abre Secuencia QA en pestaña, añade texto (1 clip); raíz mantiene 5. Volver conserva contenido; Undo en secuencia vuelve a 0, compartiendo historial con su raíz |
| Selección/contexto | Nueva key de Timeline al cambiar ámbito; guardas también en Undo del chat. Restauración comprueba epoch/serial y conserva selección/I-O. Localizar uso ahora sincroniza Programa/Propiedades |
| Regla y zoom | Área base 27 000 frames a 30 fps (15 min), sin cambiar duración. UI zoom mínimo: scrollWidth=clientWidth=511; etiquetas 0:00, 2:00…14:00. Se virtualizan fuera de pantalla |
| Gesto de inserción | Captura wheel durante puntero sostenido interno; mismo resolvedor de combinaciones, anclaje y huella. Cancelar no escribe JSON. El gesto físico combinado está pendiente de Lino |
| Parámetros | UI sombra 55→70 y un Undo devuelve 55. Entrada por teclado de Master «-6» funciona; Undo recupera -6.021 mostrado (.5 lineal). Campos admiten signos/decimales parciales al escribir |
| Texto | Diálogo sintético QA de un AudioClip se localiza en tiempo/selección. Corregir palabra conserva tiempos. Importar SRT añade sexto clip; un Undo devuelve cinco. Caption bloqueado no permite edición; campo vacío no finge guardar |
| Efectos | 15 implementaciones locales; estilos constantes y transiciones en JSON/ops/validación/preview/render. Drop por puntero resalta clip; parámetros y duración editables. Ajuste solo admite sus controles básicos existentes |
| Mezcla | Volumen constante de pista/Master, pan, M/S, grabación reutilizada. Medidor UI: Audio 1 R -16.709 / Master R -22.730 dBFS durante transición, diferencia 6.0206 dB con Master .5. L permanece silencioso al panear a R |
| Audio local | FFmpeg real en pruebas: estéreo, mono, cache concurrente, headroom sin clipping previo, rutas rechazadas y video legado sin stream de audio (silencio en vez de bloquear export). PCM float fallaba en binario incluido; corregido a PCM24 normalizado + recuperación del factor en renderer |
| Chat | Integración comprobable con DocumentBank: listar/abrir Efectos, preset, parámetros, mezcla, Undo, entradas inválidas y epoch vencido. Sin petición real al proveedor ni gasto de inferencia en QA |

### Exportaciones comprobadas

1. **QA efectos y mezcla**, 180 frames a 30 fps, H264 640×360 + AAC estéreo 48 kHz.
   Contenedor 6.016 s; imagen 6 s. Esquinas a 1/3/5 s: RGB (254,0,0), (127,0,129),
   (0,0,254): disolución real. Sombra sobre texto claro deja 23 642 píxeles de rojo oscurecido
   en prueba sin stroke. Audio pan R: RMS L=0, R≈.02999 antes/después; volumen pista=2,
   Master=.5 y headroom de pan recuperado una vez. Ajuste espectral del crossfade recupera
   coeficientes saliente≈.708/entrante≈.718 (suma de cuadrados≈1.017, con AAC), distinto de
   fundido lineal. No afirmar sample accuracy a partir de esta prueba.
2. **QA video sin handles**, dos MP4 reales de 60 frames sin material extra, corte al frame 60,
   transición de 30 frames. Exporta 120 frames / 4 s; RGB a 1/2/3 s (254,0,0), (126,0,126),
   (0,0,254). Extiende secuencias de render y repite bordes sin modificar clips ni añadir negro.
   Ambas exportaciones se decodificaron completas con rawvideo/PCM explícitos, sin errores.
3. Mono: prueba FFmpeg comprueba que iniciar pan no introduce -3 dB y que salida estéreo
   central usa el nivel del monitor. MP4 UI de 30 frames / 1 s, H264/AAC: RMS L/R
   ≈.0212 para fuente mono de pico .03, pista 2 y Master .5; coincide con el monitor.

Evidencias locales: `C:/Users/USUARIO/.codex/visualizations/2026/10/20/01a156a1-e17c-7d80-bb46-7854e62306d8/`.
`qa-efectos-{1,3,5}s.png`, `qa-video-bordes-{1,2,3}s.png`, `qa-mixer-export.wav` y captura
`studio-paneles-mixer.png`. Los medios sintéticos/proyectos QA están fuera del repositorio;
la prueba de interfaz usa :5174 y no edita el montaje del usuario en :5173.
Al comprobar :5173 se encontró vacío activo con «Prueba Chat Ollama» en cerrados. Se reabrió
esa copia de 26 clips y se guardó `Downloads/Prueba Chat Ollama.ugcproj (3).json`, manteniendo
el vacío en otra pestaña. No se usaron las descargas antiguas (45 clips) para sustituirla.

### Límites vigentes

- No son plugins Adobe ni Lumetri completo: faltan curvas/LUT avanzadas, keyframes, shake,
  rampas, guardado de presets personales, inserts/sends/submezclas y automatización. Frame.io
  se omite por pedido. Clasificación de Sonido esencial es metadata; limpieza local conserva
  sus acciones explícitas, no un análisis automático por elegir «Diálogo».
- Pan se prepara al soltar, con caché de archivo completo. Falta medir latencia/espacio en
  medios largos. Mono mantiene duplicación L/R del monitor; no se anuncia pan law Adobe exacta.
- El gesto Alt+rueda sostenido y arrastre entre dos ventanas/monitores necesitan prueba física.
  La herramienta UI solo ofrece arrastre atómico, no rueda intercalada con botón mantenido.
  El fallback HTML5 entre ventanas puede limitar rueda. No se comprobó desconectar hardware.
- Persisten JSON/vistas de documentos abiertos/cerrados; no Undo después de recargar ni
  conversación del proveedor. Límite de almacenamiento del navegador visible si falla autosave.
- No se pulsaron los 144 comandos implementados uno por uno. Siguen 89 reservas y 629
  asignaciones de referencia. No se ejecutó Whisper largo ni un anuncio UGC completo con brief.
- Sigue pendiente demostrar fluidez, recuperación y calidad editorial en un trabajo real,
  y resolver licencia comercial de Remotion antes de sustituir Premiere en la agencia.

Referencias de flujo: [mezclador de Adobe](https://helpx.adobe.com/uk/premiere/desktop/add-audio-effects/advanced-audio-techniques/about-audio-track-mixer.html),
[transiciones](https://helpx.adobe.com/lt/premiere-pro/how-to/apply-transitions-premiere-cc.html),
[handles](https://helpx-origin-ew1.aws116.adobeitc.com/uk/premiere/desktop/add-video-effects/apply-video-transitions/clip-handles-settings.html)
y [crossfades](https://helpx-origin-ew1.aws116.adobeitc.com/uk/premiere/desktop/add-audio-effects/apply-audio-transitions/audio-crossfade-transitions.html).

## Alcance de la revisión inicial (2026-10-20)

- Base revisada: `fd13cc0`, AGENTS/ROADMAP/PROGRESS del repositorio, no las capturas antiguas.
- Lectura de interfaz, comandos/foco, historial, modelo/operaciones, reproducción, exportación,
  importación, chat, análisis local y documentación de limitaciones.
- Pruebas de interfaz en origen separado `localhost:5174`, con proyecto de QA de 15 s y tres
  parejas audio/video de AssortedTapes. No se aplicaron ediciones al montaje de Lino en 5173.
- Configuración de IA restaurada: ChatGPT `gpt-6.1-sol`, Ollama `qwen3:30b-a3b`.
- No se ejecutaron individualmente todos los comandos del catálogo ni todas las combinaciones
  de codecs, paneles, proyectos, proveedores o periféricos. Esta revisión no certifica ausencia
  de errores ni reemplaza una auditoría de seguridad o accesibilidad completa.

## Hallazgos y correcciones

| Área | Problema / evidencia | Corrección | Verificación realizada |
|---|---|---|---|
| Borrado, alta | Tras escribir en chat y clicar un clip, Backspace seguía borrando letras del chat | Trasladar foco al panel al clicar/arrastrar superficies de edición, conservando campos y controles | Reproducción del fallo; Backspace: 6 clips → 4; Deshacer: 6. Delete también probado. Escribir/borrar en textarea conserva clips |
| Controles del monitor | I/O funcionaba sin estado visual suficiente; mute de Origen no mostraba estado | Luz/contraste e indicador en estados activos; lectura explícita de Entrada/Salida; estados de play, mute y fullscreen | I/O en Programa 03:00–08:00, ir a salida; Origen con salida anterior a entrada; mute, guías, bucle y pantalla completa |
| Origen, media | Full → 1/4 volvía al frame cero: timeupdate sobrescribía el tiempo a restaurar durante la recarga | Separar restauración pendiente de los eventos del archivo que se descarga | Antes: 5 s → 0. Después: 07:12 conservado al pasar a 1/8 y volver a Full |
| Candados | El borrado podía parecer ignorado y quitar la selección aunque la pista estuviera protegida | Conservar supervivientes seleccionados y explicar que hay pistas/parejas bloqueadas | Delete con B1 bloqueada conserva 6 clips y muestra aviso; desbloquear permite borrar la pareja |
| Guardar/abrir, alta | JSON inválido podía lanzar error sin gestionar; abrir conservaba historial de otro documento | Validación antes de sustituir; historial nuevo al abrir/crear; liberar URL de descarga; permitir reabrir el mismo archivo | Guardar y reabrir por UI: seis clips conservados; archivo inválido rechazado con montaje intacto. Pruebas de ciclos, IDs repetidos, rangos, textos, subtítulos y secuencias |
| Autoguardado, alta | Error de almacenamiento silencioso y carga sin validar | Aviso persistente; si la copia inicial es inválida no sobrescribirla y ofrecer descargarla | Validador y carga normal probados; cuota agotada/copia corrupta en navegador no forzadas en esta ronda |
| Exportación, alta | Fallos HTTP/red podían dejar el estado en Exportando; cerrar estado permitía lanzar otra | Validar respuesta/progreso/error, devolver error visible, evitar duplicados; validar proyecto también en servidor | MP4 real completo; pruebas simuladas HTTP, desconexión, protocolo inválido y abortar seguimiento; API rechaza proyecto inválido con 400 |
| Tareas y documento, alta | Una respuesta del chat pendiente podía tomar la selección/documento abierto después | Capturar contexto al enviar y comprobar sesión antes de leer/aplicar; proteger también análisis local, transcripción, importación y Foley al cambiar documento/secuencia | Prueba de respuesta diferida que no modifica el documento nuevo; edición normal por Ollama probada antes de añadir la guarda. Carrera completa con backend real pendiente |
| Importación | Lectura de duración sin límite ni rechazo explícito de Infinity | Timeout de metadatos, liberar lector y rechazar duración inválida; respuesta JSON ante multipart erróneo | Importación real de MP4 sintético y solicitud multipart inválida con 400; timeout/Infinity no forzados en UI |
| Dependencias | `npm audit --omit=dev`: tres paquetes con severidad alta en cadena Multer/busboy/dicer | Multer 1.x → 2.4.0; mantener almacenamiento en disco y gestionar fallos de recepción | Auditoría final: 0 avisos conocidos; importación real por UI tras actualizar |

Los errores de recarga de módulos observados al modificar hooks durante desarrollo se separan
de las comprobaciones con la página recargada. No se usan esos reinicios como evidencia de un
fallo del montaje exportado. Una entrega estable debe ejecutarse sin el recargador de desarrollo.

## Pruebas ejecutadas

- `npm test`: **69/69**, incluyendo cinco grupos nuevos de regresión. Cubren operaciones,
  sincronía de parejas, candados, sobrescritura, rangos, historial de datos, protocolos y paneles;
  no son 69 pruebas de interfaz ni una medida porcentual de calidad profesional.
- `npm run typecheck` y `npm run build`: aprobados. Persiste aviso de archivos JS >500 kB;
  carga inicial/rendimiento con montajes grandes pendientes de medir.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas después de actualizar.
- Ollama `qwen3:8b`, por la interfaz: añadir CONTROL QA arriba, 0–2 s; texto visible en Programa,
  clip en T1, Deshacer/Rehacer y Delete. No se enviaron pruebas a un servicio de pago.
- Medidor estéreo observado durante Programa: aproximadamente −12.7 dBFS L/R en la muestra.
  Esto no mide LUFS, true peak ni calidad de escucha.
- Exportación MP4 borrador real: H.264 1080×1920, 30 fps, 450 frames = 15.000 s de imagen;
  AAC estéreo 48 kHz, 15.019 s incluyendo relleno del codec. Decodificación completa FFmpeg
  sin errores. No demuestra por sí sola lip sync ni ausencia de repeticiones visuales.

Archivos locales de evidencia, fuera del repositorio:

- `C:\Users\USUARIO\Downloads\Prueba pistas y audio visible.ugcproj.json`
- `C:\Users\USUARIO\UGC Studio\Exportaciones\Prueba_pistas_y_audio_visible_mvh2wdu8.mp4`
- Captura `ugc-studio-control-calidad.png` en la carpeta de visualizaciones de esta conversación.

## Pendiente: condiciones para un MVP profesional

### 1. Entregas y continuidad (prioridad inmediata)

- Completar **tres anuncios reales de 15–90 s** con brief y revisión de Lino: importar, seleccionar,
  recortar, B-roll, voz/música, subtítulos, revisión, guardar/reabrir y exportar. Verificar CTA,
  afirmaciones y coherencia del resumen por chat.
- Revisar y escuchar preview y exportación juntos: sin bucles involuntarios, flashes, frames negros,
  audio repetido o cortes de palabras; sincronía con tolerancia acordada con Lino.
- Matriz de archivos de cámara/teléfono usados en agencia: H.264/HEVC, tasas variables y 24/30/60 fps.
  No se declara resuelto para todos los videos el reporte histórico de bucles.
- Medir una sesión de al menos una hora, varios medios y capas, uso de RAM/GPU, seeks y tiempos
  de exportación. Esta pasada no incluyó prueba prolongada ni carga máxima.

### 2. Recuperación y operaciones

- Autoguardado versionado en disco y copia anterior recuperable; probar cierre inesperado,
  almacenamiento lleno, medio movido y reapertura. El JSON guardado referencia medios locales:
  todavía no es un paquete portátil con todos los recursos.
- Cerrar regresiones físicas Alt+arrastrar, rueda modificada y micrófono; validar layouts estrechos,
  atajos con teclado español y foco después de editar propiedades/tiempos/menús.
- Ampliar pruebas de tareas concurrentes con edición manual, Deshacer y cambios de secuencia.
  Los casos grandes o anidados y recuperación de exportaciones tras reiniciar servidor siguen pendientes.

### 3. IA y audio con criterio de entrega

- Revisar transcripción large-v3 y nombres de marca con Lino; no se volvió a transcribir toda la
  muestra en esta ronda. Medir correcciones necesarias, además de velocidad.
- Validar resumen a duración objetivo sobre un brief real, con palabras completas, CTA protegido
  y confirmación/aplicación en un paso reversible. La comprensión de acciones y sonido es parcial.
- Escuchar limpieza de voz y residuo con ruido real; comprobar música, fades y nivel final.
  Separación actual: voz/acompañamiento, no tres stems perfectos voz/música/ambiente.
- ChatGPT real ya figura probado en el registro anterior; aquí no se repitió autenticación,
  renovación/revocación ni todos los proveedores. Comandos de voz/micro físico pendientes.

### 4. Gratuidad y distribución

El repositorio todavía carece de `LICENSE`. Según la
[FAQ oficial de Remotion](https://www.remotion.dev/docs/license/faq), consultada el 2026-10-20,
Remotion es source-available, no open source OSI; para una agencia que entrega videos, el umbral
gratuito depende del tamaño de la agencia, no solo de la persona que utiliza el editor. No se ha
determinado el encaje contractual concreto de Lino. Esto impide prometer hoy gratuidad universal
para su uso en agencia. No se contrató ninguna licencia.

Para mantener el objetivo aprobado de no pagar, el siguiente análisis técnico debe evaluar un
motor de preview/render con licencia apropiada y una ruta de migración que preserve Project/ops.
La elección de licencia propia corresponde a Lino. No cambiar de motor durante esta reparación
sin comparar fidelidad, capacidades y esfuerzo. Referencias: [licencia de Remotion](https://www.remotion.dev/license)
y [Multer: API de almacenamiento y manejo de errores](https://github.com/expressjs/multer).

## Siguiente paso para Codex

Cerrar primero el caso AssortedTapes con Lino comparando reproducción y exportación; registrar
tiempos exactos de cualquier bucle/desfase. Después ejecutar la matriz de entregas anterior y
priorizar incidencias que bloqueen terminar/reabrir/exportar. Resolver en paralelo de planificación
el encaje de licencia del render, antes de considerar el editor apto para sustituir Premiere en agencia.

## Ampliación de edición contextual — 2026-10-20

- 82 pruebas totales aprobadas, typecheck y build. Menús, ganancia, canales, secuencias,
  gráficos y congelados comprobados por UI en 5174, sin modificar el montaje principal.
- Dos exportaciones cortas reales de 3 s (directa y anidada), velocidad 200 %, nivel 2,
  congelado, cuadrado y ajuste; decodificación completa correcta, misma señal de audio.
- Se detectó y corrigió bloqueo de metadata de Html5Audio con crossOrigin anónimo durante
  render. Web Audio queda para preview; el render conserva ganancia mediante FFmpeg.
- Se corrigieron referencias anidadas fuera de rango al acortar su contenido. Una prueba
  protege la validación del documento tras ese cambio.
- Evidencias y límites detallados en PROGRESS.md. Esta ampliación no reemplaza las pruebas
  de anuncio completo, escucha editorial, formatos variados, montajes largos y recuperación.

## Ampliación de Proyecto — 2026-10-20

- Corregido Delete/Backspace de Proyecto: estaba reservado como pendiente. Papelera y clic derecho
  retiran entradas y usos en una sola transacción, con aviso del alcance, candados y Deshacer;
  no eliminan medios físicos. Parejas y fuentes de canales/derivados están incluidas en la revisión.
- Biblioteca dentro del JSON/historial, migración compatible y validación de carpetas/ciclos,
  plantillas y referencias. Proxies asíncronos no interrumpen Deshacer ni recrean medios borrados.
- 95/95 pruebas totales, typecheck/build; eliminación de 6 usos y recuperación en un Ctrl+Z
  comprobadas por UI en 5174. También Backspace en secuencia, carpetas, alias, notas, propiedades,
  crear/colocar ajuste, abrir secuencia y guardar/reabrir. Panel reducido con pie accesible.
- ffprobe del original AssortedTapes confirmó 1080×1920, 24000/1001 fps, AAC estéreo 48 kHz y
  duración 26.109417 s; la lista no usa los FPS del proxy para esta información.
- Pendientes: colecciones grandes, arrastre físico mixto y criterio de Lino. No se reexportó un
  anuncio completo en esta entrega, ni se implementaron todas las opciones de Proyecto de Premiere.

## Segunda fiscalización — 2026-10-21

Base de partida `a174a18`. Origen QA aislado 5174: montaje vertical de 15 s, tres parejas
AV y un ajuste (7 clips), medios reales AssortedTapes. Se preservó el montaje de Lino en 5173.
Esta tabla distingue ejecución UI, inspección de código y pruebas puras; no certifica cada
combinación ni todas las opciones históricas de Premiere.

| Área | Hallazgo/cambio | Evidencia |
|---|---|---|
| Paneles | Grupos de pestañas, float interno y ventana nativa; mover DOM sin desmontar React | Borrador conservado entre pestañas, popup y recuperación. Resize interno por mouse/teclas; cerrar/acoplar recupera |
| Pantallas/presets | Destino por etiqueta/geometría relativa; fallback visible sin sobrescribir preset; aviso por bloqueo | PXP 27G/Kamvas 13 detectadas; guardar doble → simple → doble devuelve Inspector a Kamvas. Pruebas de cambio de origen/orden y ausencia/reconexión |
| Contexto en popup | Portal/diálogo/menu/fullscreen antes dependían del documento principal | UiDocument y entrada global compartida; foco estructural sin instanceof entre ventanas; pagehide cierra secundarias |
| Ondas | La amplitud no reflejaba ganancia | +6 dB: escala 1.58204→3.15659 con ancho/offset iguales; Undo restaura. Barra preview y una transacción al soltar |
| Menús | Reservas aparecían como opciones; habilitación divergente y cambio mouse hover/clic ambiguo | Ocho menús inspeccionados: Archivo 8, Edición 12, Clip 20, Secuencia 14, Marcadores 14, Gráficos 4, Ventana 13, Ayuda 1. Reservas se consultan en Atajos; edición comparte editAvailability |
| Edición contextual | Compatible con parejas/candados; ganancia captura IDs y documento | Gain/Left WAV/nest (abrir y volver)/speed 200 %/tres freeze, agrupar/desagrupar, desenlazar y Undo ejecutados. WAV Left conserva channelSource original |
| Menús de edición/gráficos | Nest/congelados y gráficos faltaban en menús superiores | Sólido, ajuste, rectángulo, texto: 7→8→7; corte en 1 s:7→9→7. Copiar/Pegar por menú y Undo |
| Foco/borrado | Prevenir edición de selección antigua desde Proyecto/Origen y atajos del timeline sobre Inspector/medidor, o borrado al escribir | Texto Backspace conserva 7; click clip transfiere foco timeline; Backspace 7→5, Undo 7. Delete y candados cubiertos en UI/pruebas previas |
| Programa/Origen | Revisar respuesta/estado de iconos y resoluciones | Play/pause, ±frame, cortes, I/O 2–4 s, goIn/goOut, limpiar, marcador, localizar Origen, mute/loop/guías/mano/fullscreen, zoom/regla. 1/16 video 68×120 readyState4; Full restaurado. Marcar selección Origen 0–26 s |
| Timeline separado | Pointer capturado no atraviesa ventanas | HTML5 para documentos distintos, payload guardado y epoch; clic Origen con Timeline popup amplía 15→26 s, Undo 15 s/7 clips. Arrastre físico entre ventanas pendiente |
| Render | Verificar que cambios de UI no afecten documento/salida | Export UI 15 s H.264 1080×1920, AAC 48 kHz estéreo; contenedor 15.019 s; decodificación completa con rawvideo/pcm explícitos, sin errores |

Pruebas finales: **105/105**, `npm run typecheck`, `npm run build` correctos. Vite mantiene
advertencia de chunks >500 kB; queda para medir/optimizar carga, no impidió compilar/exportar.
No se hicieron llamadas a IA de pago. Archivo de salida y capturas en PROGRESS.md.

### Límites concretos de esta entrega

- El navegador puede impedir abrir varias ventanas o detectar pantallas; la UI informa y
  conserva paneles accesibles. Detectar y Aplicar son interacciones explícitas. API consultada:
  [Window Management (Chrome)](https://developer.chrome.com/docs/capabilities/web-apis/window-management),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API/Using).
- Desconectar/reconectar cable, cambiar DPI físico y arrastrar entre ventanas del sistema no
  se ejecutaron físicamente. La prueba de preset real sí retornó a la pantalla Kamvas; no se
  promete posición exacta en píxeles si el navegador/sistema ajusta límites.
- No se pulsó manualmente cada uno de los 137 comandos adaptados (229 con 92 reservas),
  ni todas sus combinaciones de foco/candados/tipos. Se revisaron rutas de código comunes,
  habilitación y acciones representativas de alto impacto, además de regresiones automáticas.
- Esta ronda no vuelve a validar IA/escucha editorial/transcripción, micrófono o todos los
  codecs/montajes largos. HMR de desarrollo pudo quedar blanco al cambiar hooks; recarga limpia
  comprobada. No confundir ese cambio de código en vivo con fallo del proyecto guardado.
- Sigue siendo alfa funcional; el criterio de MVP es un anuncio UGC real completo, guardado,
  reabierto, corregido y exportado, con escucha y revisión editorial de Lino, pruebas de fallo
  y rendimiento sostenido, más resolución del alcance comercial del motor ya registrada.

## 2026-10-21 — Alcance: interacción del timeline y compatibilidad visual

- 116 pruebas pasan; typecheck y build correctos. Nuevas regresiones: histéresis por píxel,
  extremos y zoom; huella igual a colocación; IO y sus offsets; modos parciales sin borrar otra
  señal; candados; consecutivos Proyecto; rangos multicapa Programa; pistas mixtas/JSON;
  selección sin fragmentos sobrescritos; migración del modificador y subtítulos no destructivos.
- QA UI en 5174: Origen y Programa, rangos de dos segundos, tres variantes; el rango de Programa
  mantiene video/ajuste/audio. Deshacer en un paso. Snap 216 frames frente a 214 sin imán.
  Video en antigua T1/B3 visible, guardado y reabierto: 8 clips, incluido video de 60 frames en B3.
- No se usa 5173 para editar datos de QA. La API se reinició al detectar ECONNREFUSED; Origen
  volvió a readyState 4. Se corrigió además I/O inmediato durante carga/seek en SourceMonitor.
- Proyecto usa el controlador de puntero dentro del documento, tras un primer gesto HTML5 no
  completado. UI: gráfico en B2 (150 frames), video en B4 (783) con audio y snap a 216; foco
  Timeline y Backspace elimina lo colocado. Ctrl+clic de dos entradas coloca tres piezas
  consecutivas y Deshacer revierte. Mover a carpeta, abrirla y dos Deshacer restaura estructura.
  Quedan gesto físico/umbrales/modificadores y HTML5 entre ventanas con Lino.
- No se repite exportación ni validación editorial de IA/sonido en esta ronda. El renderer no
  cambia; la advertencia de chunks grandes sigue abierta. No se declara auditoría exhaustiva.
