# Control de calidad — 2026-10-20

## Conclusión

UGC Studio es una **alfa funcional**, con una arquitectura aprovechable para un editor
profesional especializado en UGC. Todavía no está validado como único editor para entregar
trabajos de la agencia. La cantidad de botones o las pruebas automáticas aprobadas no prueban
continuidad audiovisual, criterio editorial, recuperación ante fallos ni rendimiento sostenido.

La prioridad recomendada es estabilizar un flujo completo y repetirlo con trabajos reales
antes de ampliar efectos, generación o interfaces. El MVP es terminar un anuncio, revisarlo,
reabrirlo y corregirlo con seguridad, con edición manual y por chat coherentes entre sí.

## Alcance de esta revisión

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
