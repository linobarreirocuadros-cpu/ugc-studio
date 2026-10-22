# Secuencias y entregas

## Uso

1. **Archivo → Nueva secuencia** o **Proyecto → Nuevo elemento → Secuencia** permite
   elegir nombre, lienzo, FPS y frecuencia de audio. Hay presets vertical, 4:5, cuadrado,
   720p, Full HD, QHD, UHD y DCI 4K, además de tamaños personalizados.
2. Abre la secuencia desde Proyecto. Sus ajustes se editan en **Secuencia → Ajustes de
   la secuencia** o en el botón de tamaño/FPS de la barra superior. Cambiar FPS conserva
   segundos y se puede deshacer; una pista bloqueada con contenido protege su reloj.
3. Al colocar el primer video original en una secuencia sin video, si sus dimensiones o
   FPS difieren, se pregunta **Mantener parámetros / Cambiar al video / Cancelar**.
   La lectura usa el original mediante FFprobe. Aceptar parámetros e insertar comparten
   un paso de Deshacer. También se aplica al menú «Colocar en el timeline» de un medio.
4. Las pestañas del timeline se pueden arrastrar para reordenar proyectos y secuencias.
   El orden se conserva localmente, separado del JSON y del historial de edición.

### Varios pares de llaves

En **Entregas**, debajo de la barra del timeline:

- Pon el cabezal al inicio y pulsa **{ Inicio**; ve al último fotograma que quieras incluir
  y pulsa **Fin }**. Los atajos I/O existentes también sirven para preparar estas marcas.
- **Guardar rango I/O** crea un par persistente. Repite para V1, V2, V3…
- Las casillas permiten seleccionar varios rangos. **⋯** permite renombrar, borrar o exportar.
- Clic derecho sobre el nombre del rango o su franja en la regla abre exportación.
- La regla sigue fuera del desplazamiento vertical. Crear, renombrar y borrar rangos usa ops
  y Deshacer. Son datos de la secuencia: `Project.exportRanges`.

El fin numérico es **exclusivo**: inicio 0, fin 30 exporta los fotogramas 0–29. Marcar Fin
incluye el fotograma que se está viendo. Los rangos deben quedar dentro del montaje.

### Panel Exportar

El botón superior **Exportar** y el comando del menú abren el mismo panel:

- **Entregas:** nombre, subcarpeta, rangos, versiones y formatos.
- **Codificación:** parámetros reales de salida, archivos adicionales y metadatos.
- **Cola:** progreso por archivo, cancelación del lote, descarga y reintento de salidas fallidas.
- **Vista previa:** se mantiene a la derecha; en ventanas pequeñas tiene su propia pestaña.

Por defecto se ofrecen estas versiones, confirmadas por Lino:

| Versión | Video y audio | Captions | Textos y gráficos |
| --- | --- | --- | --- |
| Completa | Sí | Sí | Sí |
| RAW | Sí | No | No |
| Overlays | Sí | No | Sí |

RAW conserva cortes, sonido y los ajustes de color aplicados al montaje. Las variantes se
pueden personalizar. «Overlays» **incluye el video**, según lo confirmado; para gráficos con
transparencia crea una variante sin videos y con fondo transparente. Esta usa ProRes 4444.

El lote es **rangos × versiones × formatos**: 3 rangos × 3 versiones × 2 formatos = 18 archivos.
Antes de enviarlo se muestran número y nombres. Se pueden guardar presets locales de entrega.
Los nombres se acortan para Windows; los duplicados se rechazan y nunca se pisa otro lote.
La ubicación inicial es `~/UGC Studio/Exportaciones/<subcarpeta>/<lote único>/`.

El panel captura una copia al abrirse y el servidor guarda otra al recibirla. Editar o cambiar
de documento no modifica un lote ya enviado. Cerrar el panel no cancela la cola; cerrar el
servidor interrumpe el trabajo y, al arrancar, se identifica como interrumpido para reintentar.
Las salidas terminadas se conservan. La cola y los manifiestos viven fuera del repositorio.

## Adaptación 9:16 ↔ 4:5

Cada formato tiene tamaño, encaje/relleno y foco de recorte general o por clip. La adaptación
proporcional mantiene estilos, animaciones y proporción física de rectángulos; limita texto a márgenes seguros y separa textos
que coincidan temporalmente con captions. **No altera el montaje original.**

**Sugerir encuadres con IA local** usa el modelo visual configurado en Ollama: tres muestras por
clip, hasta veinte clips originales del rango. Sugiere un foco estable, normalizado, por clip.
La tarea es cancelable al cerrar el panel y no reemplaza un encuadre cambiado mientras esperaba.
Sin modelo disponible se conserva el ajuste manual; no requiere servicios de pago.

Esto es una ayuda de composición y revisión, **no seguimiento continuo de caras/objetos** ni
una garantía editorial. Revisa cortes, títulos largos, elementos animados y zonas protegidas
por cada plataforma. La visión inicial no recorre automáticamente el interior de anidaciones.
Los clips anidados sí mantienen su contenido editable y se adaptan al componer la entrega.

La copia JSON opcional contiene solo el rango de esa entrega, con tiempos trasladados a cero,
fuentes originales, estilos, keyframes, motor y foco. El foco también se puede editar en
**Controles de efectos → Foco del encuadre** al abrir esa copia. El SRT adicional recorta las
palabras al rango e incluye captions anidados; SRT no conserva animaciones ni diseño.

## Parámetros y referencia de Adobe

After Effects separa **Ajustes de render** y **Módulos de salida**, y permite varias salidas
por composición. Aquí los equivalentes compatibles comparten un plan de entregas; no se
presentan capacidades de After Effects como si existieran en Remotion/FFmpeg.

| Familia de ajustes de Adobe | Estado en UGC Studio |
| --- | --- |
| Intervalo, inicio, fin, duración y varios módulos de salida | Secuencia completa o varios rangos y matriz de versiones/tamaños |
| Resolución y redimensionado | Tamaños pares personalizados de 16 a 8192 px por lado, presets y encuadre por formato |
| FPS | 1–120, incluidos 24000/1001, 30000/1001 y 60000/1001; retiming conserva segundos |
| Formato y compresión | MP4 H.264/HEVC, WebM VP9, MOV ProRes y WAV PCM |
| Calidad, bitrate y fotograma clave | CRF; VBR de una pasada/CBR; bitrate, máximo, GOP y calidad JPEG intermedia según códec |
| Perfil H.264 | Automático, Baseline, Main y High |
| Perfil ProRes | Proxy, LT, estándar, HQ, 4444 y 4444 XQ |
| Canales de imagen y alpha | RGB; transparencia mediante ProRes 4444, PNG intermedio y alpha recto |
| Profundidad y espacio de color | Compositor web SDR de 8 bits. H.264/HEVC incluidos: 8 bits. VP9 puede codificar a 10 bits; ProRes usa su profundidad nativa. Rec.709 o predeterminado del codificador |
| Audio | Activar/desactivar, mono/estéreo, 44,1/48/96 kHz y bitrate AAC/Opus; PCM de 16 bits. Opus usa 48 kHz y hasta 256 kbps por canal |
| Efectos, Solo y visibilidad | Versiones controlan contenido/efectos; se respeta Ojo/M/S, con opción de ignorarlos para la entrega |
| Proxies y calidad de capas | Exportación usa originales. La calidad Full/1/2… del monitor no modifica la salida |
| Nombre, ubicación, metadatos y registro | Nombre base, subcarpeta local, título/autor/comentario, manifiesto y nivel de registro |
| Copia del proyecto y subtítulos | JSON editable por entrega y SRT opcionales; no es empaquetado de medios |
| Campos, pulldown, píxel no cuadrado | Pendiente; la salida actual es progresiva y de píxel cuadrado |
| HDR, perfiles ICC, lineal 16/32 bits, gestión de alpha premultiplicado | Pendiente; codificar a más bits no crea detalle HDR |
| Audio PCM 24 bits real y multicanal | Pendiente; no se disfraza un archivo de 16 bits como mezcla de 24 bits |
| VBR de dos pasadas, aceleración GPU, caché de frames, salto de existentes | Pendiente en esta integración |
| Secuencias PNG/EXR, GIF y otros contenedores | Pendiente |
| Frame blending de salida, motion blur global, capas guía y rasterización continua | Pendiente; se conservan las animaciones ya presentes |
| Recorte global del módulo de salida, XMP, credenciales y acciones posteriores | Pendiente; no se ejecutan acciones externas automáticas |

Fuentes primarias consultadas:

- [Adobe: fundamentos de render y exportación de After Effects](https://helpx.adobe.com/after-effects/desktop/render-and-export/basics-of-rendering-and-exporting/basics-rendering-exporting.html).
- [Adobe: H.264 en la cola de After Effects](https://helpx.adobe.com/ee/after-effects/desktop/render-and-export/export-h-264-from-the-after-effects/exporting-h264-from-the-after-effects-render-queue.html).
- [Adobe: presets y ajustes de secuencia de Premiere](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/sequence-presets-and-settings.html).

## Arquitectura

- `sequenceSettings.ts`: retiming de frames, palabras, fuentes, transiciones y animación.
- `ops.ts`: crear/actualizar secuencias y llaves; biblioteca indica `frameBase` para que un
  medio conserve segundos al colocarlo en secuencias con FPS distintos.
- `exportPlan.ts`: validación, variantes, recomposición, matriz de salidas y SRT.
- `ExportPanel.tsx`: snapshot, revisión, ajustes, presets y progreso; `ExportRangeControls.tsx`
  administra las llaves del documento mediante ops.
- `server/exportQueue.ts`: cola serial persistida, cancelación/reintento y archivos únicos.
  Remotion produce video en su contenedor nativo y PCM separado; FFmpeg mezcla canales y
  codifica audio una vez, copiando el video. FFprobe comprueba tamaño, FPS, canales y frecuencia
  antes de declarar una salida terminada. Una cola dañada se conserva en copia de recuperación.

Esta entrega incorpora funciones y pruebas específicas. No equivale a certificar todo el
editor ni a validar rendimiento de proyectos largos o criterio editorial de los reencuadres.
