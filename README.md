# UGC Studio

Editor UGC dirigido por chat y voz, con línea de tiempo editable y render con Remotion.

## Cómo abrirlo (sin programar)
1. Instala [Node.js](https://nodejs.org) (botón **LTS**). Solo una vez.
2. Descarga este proyecto: botón verde **Code → Download ZIP** y descomprímelo.
3. Doble clic en:
   - **Windows:** `Abrir UGC Studio (Windows).bat`
   - **Mac:** `Abrir UGC Studio (Mac).command` (la primera vez: clic derecho → Abrir → Abrir)
4. Se abre el editor en tu navegador (usa Chrome). No cierres la ventana negra mientras editas.

La primera vez tarda unos minutos porque instala todo.

## Para programadores
```bash
npm install
npm run dev   # http://localhost:5173
```

## Uso básico

- **Importar**: botón en el panel Proyecto. Usa ☰ para la vista de lista o ▦ para la cuadrícula.
- **Previsualizar y elegir un fragmento**: un clic en un archivo lo abre en el monitor **Origen**. Reproduce hasta el punto deseado y marca **I · Entrada** y **O · Salida**. El monitor **Programa** muestra la edición. Puedes usar **Dos visores** o **Pestañas**.
- **Llevar a la línea de tiempo**: arrastra un archivo desde Proyecto a una pista, o usa **Insertar video**, **Solo video** y **Solo audio** en Origen. También puedes arrastrar los botones de solo video/audio a la pista deseada. Un video completo añade imagen y audio original enlazados; el sonido aparece con su onda en una pista de audio libre. **Solo video** y **+ B2** añaden únicamente imagen; **Solo audio** utiliza Audio 1 por defecto.
- **Pistas**: se llaman **B1, B2, B3…** y **Audio 1, Audio 2, Audio 3…**, sin funciones asignadas. Pulsa **+ B** o **+ Audio**, en la cabecera del timeline, para añadir más. También puedes pedírselo al chat. Los archivos de audio nuevos entran al volumen original, sin fades automáticos.
- **Imagen y sonido enlazados**: al mover, recortar, cortar, deslizar contenido o borrar uno, se modifica también su pareja. Puedes trasladar la imagen a otra pista de video conservando el audio en su pista. Selecciona el audio para ajustar volumen/fades. Los proyectos anteriores muestran su audio después de comprobar localmente el archivo; la conversión se puede deshacer. El original no se recodifica y no suena dos veces.
- **Editar**: arrastra clips, arrastra los bordes para recortar, Ctrl/Cmd+K corta en el cabezal.
- **Seleccionar varios**: mantén el clic izquierdo en un espacio vacío de Proyecto o del timeline
  y arrastra el recuadro sobre los elementos. Funciona en lista y cuadrícula. Shift/Ctrl+clic
  suma o quita elementos; Esc limpia la selección. Ctrl/Cmd+A selecciona todo en el panel activo.
  En el timeline puedes mover el grupo o borrarlo con Supr; Ctrl/Cmd+Z deshace el conjunto.
  La regla de tiempo sigue sirviendo para mover el cabezal. Arrastrar desde un clip lo mueve;
  arrastrar desde un archivo de Proyecto lo lleva al timeline.
- **Exportar**: elige calidad arriba a la derecha → Exportar.

Tus videos importados y exportaciones se guardan en la carpeta **`UGC Studio`** dentro de tu
carpeta de usuario (ej. `C:\Users\TuNombre\UGC Studio` o `/Users/TuNombre/UGC Studio`).
Así, al descargar una versión nueva del programa, no pierdes nada.

**Chat con IA (gratis):** instala [Ollama](https://ollama.com/download), abre PowerShell y escribe
`ollama pull qwen3:8b` para empezar; `qwen3:30b-a3b` ofrece otra opción, pero responde más lento.
En el editor, pestaña **Chat IA** → **Motor: Ollama** → elige **Modelo**. El panel indica si Ollama está conectado
y muestra el tiempo de espera cuando el modelo está pensando. También puedes usar Gemini/Groq/OpenRouter (gratis con
límite) o Claude/OpenAI API (de pago, opcionales) pegando su clave en **Configurar**.

## Herramientas, medidor de audio y paneles

La columna a la izquierda del timeline incluye:

- **V · Selección:** seleccionar, mover y recortar como antes; recuadro desde un espacio vacío.
- **A · Seleccionar hacia delante:** selecciona los clips desde el clip pulsado hacia la derecha.
  Shift+clic limita la selección a esa pista. Arrastra para mover el conjunto.
- **C · Cuchilla:** clic sobre un clip crea un corte en ese punto; Shift+clic corta todas las pistas.
- **B · Recorte ripple en esta pista:** arrastra el borde de un video/audio; se desplazan los clips
  posteriores de esa pista y sus parejas enlazadas. No sincroniza las pistas independientes ni actúa sobre solapamientos.
- **Y · Deslizar contenido:** arrastra el centro de un video/audio para cambiar el fragmento de origen,
  conservando su posición y duración. Respeta el inicio/final del archivo.
- **H · Mano:** arrastra para desplazar la vista del timeline.
- **Z · Zoom:** clic acerca alrededor del punto pulsado; Shift+clic aleja.
- **T · Texto:** clic en el timeline crea texto en ese momento y abre sus propiedades.
- **S · Imán**, **+/−** y **Ajustar timeline**: activar imán, cambiar zoom y ver todo el montaje.

Los cambios de montaje se pueden deshacer con Ctrl/Cmd+Z. La cuchilla también conserva los tiempos
relativos de las palabras al cortar un bloque de subtítulos.

El **medidor L/R** está a la derecha del timeline. Reproduce el **Programa** para ver picos de muestras
en dBFS, con caída visual y picos retenidos. Rojo indica que la suma medida alcanzó 0 dBFS; **Picos**
reinicia la retención y la alerta. Sigue el volumen/mute del Programa y mezcla sus pistas; no mide
el monitor Origen, LUFS, true peak ni el volumen físico de los altavoces. Se probó en Chrome/Chromium
de escritorio en Windows. Utiliza una copia silenciosa de los medios que ya se están reproduciendo,
sin micrófono ni subida de audio. [Protocolo de captura del navegador](https://w3c.github.io/mediacapture-fromelement/).
Si el navegador no permite esta captura, muestra un aviso sin modificar la reproducción original.

**Paneles adaptables:** arrastra los separadores entre columnas o sobre el panel inferior para
cambiar tamaños. Cada cabecera tiene una posición (**Izquierda/Centro/Derecha/Abajo**): al cambiarla,
intercambia lugar con el panel de destino. También existe el asa **⠿** para arrastrar una cabecera
sobre otro panel; ese gesto nativo requiere validación manual. La distribución se guarda en este
navegador. **Restablecer paneles**, arriba, recupera tamaños y posiciones iniciales.
Esta versión mueve los grupos Proyecto, Monitores, Inspector y Timeline dentro de cuatro zonas;
todavía no crea ventanas flotantes ni separa las pestañas del Inspector en paneles independientes.

## Usar tu cuenta ChatGPT para editar

1. En **Chat IA**, elige **Motor: ChatGPT** y pulsa **Continue with ChatGPT**.
2. Completa tú el acceso y los permisos en la página oficial. Si no se abre una ventana, pulsa
   **Abrir acceso de ChatGPT**, que aparece mientras la conexión está pendiente.
3. Cuando aparezca **ChatGPT conectado · Plan autorizado**, elige un modelo del catálogo de tu cuenta.
4. Prueba: «Resume el video coherentemente a 15 segundos, conserva el gancho y la llamada a la
   acción y aplica los cortes en la línea de tiempo». El chat lee el montaje/transcripción,
   valida un plan por rangos y lo aplica. **Deshacer** recupera la edición anterior en un paso.

Necesitas un plan ChatGPT elegible y conexión a internet; se aplican sus permisos y límites.
Es opcional: Ollama mantiene la vía local gratuita. **OpenAI API** es otra conexión, con
facturación por uso separada de ChatGPT. El editor no hereda el historial de esta conversación:
escribe dentro del editor el brief y tus criterios. Cambiar motor/modelo inicia una conversación nueva.

Esta primera conexión de cuenta funciona en Windows. Las credenciales se guardan cifradas para
tu usuario de Windows (DPAPI), en `UGC Studio/chatgpt/`; no se entregan al navegador ni van en
el proyecto. **Cuenta y uso** permite gestionar uso o desconectar. No hay selector de varias cuentas.
Se utiliza un cliente propio del protocolo público, no el DevKit de licencia no comercial.

## Mejorar la transcripción gratis y localmente

1. Con Python 3.10 o superior instalado, ejecuta **Preparar transcripcion local (Windows).bat** una vez.
   Prepara un entorno propio y descarga faster-whisper **large-v3** (varios GB, código/pesos MIT).
2. En el panel de transcripción, elige **Local preciso · Whisper large-v3**, idioma automático o el idioma
   hablado y, si hace falta, añade nombres de marcas/productos al vocabulario.
3. Pulsa **Volver a transcribir**. Revisa el texto y después **Generar subtítulos** para sustituir
   los subtítulos anteriores; retranscribir por sí solo no los reemplaza.

El modelo funciona en CPU y puede tardar. Whisper del navegador sigue disponible como alternativa
ligera; se corrigió la separación incorrecta de fragmentos de una misma palabra. Ningún motor
garantiza texto perfecto: revisa nombres, cifras y voces superpuestas. ChatGPT conectado dirige
las herramientas; esta transcripción utiliza el modelo local, no la transcripción de ChatGPT.

Entorno/modelos fuera del repositorio; caché en `UGC Studio/transcripciones/`. Límite inicial:
30 minutos por archivo, tareas seriales cancelables. Para instalaciones personalizadas,
`UGC_WHISPER_PYTHON` selecciona el Python del entorno y `UGC_WHISPER_MODEL_DIR` un modelo local.

**Foley:** copia tus efectos de sonido a las carpetas de `UGC Studio/Foley` (Whoosh, Impactos,
Pops y clicks…) y aparecen en la pestaña **Foley** del editor.

Ver `ROADMAP.md` para lo que viene y `PROGRESS.md` para el estado actual.

## Visión local: encontrar un plano por lo que muestra

1. Con Ollama instalado y abierto, ejecuta **Preparar vision local (Windows).bat** una vez.
   Descarga `qwen3-vl:4b-instruct` (unos 3.3 GB) y `qwen3:8b` (unos 5.2 GB, si no lo tienes).
   El primero observa imágenes; el segundo encuentra coincidencias entre esas observaciones.
   Se usa la variante Instruct explícita, ya que
   el alias `4b` puede apuntar a una variante que dedica demasiado tiempo a razonar.
2. Selecciona un clip de video en la línea de tiempo y entra en **Visión**.
3. Escribe algo visible, por ejemplo «el teléfono apoyado sobre la mesa», y pulsa **Buscar en el clip**.
4. Revisa las miniaturas. **Ver en Programa** lleva al rango; **Cortar en bordes** crea dos cortes
   sobre ese clip en un paso de Deshacer. La búsqueda sola no modifica el montaje.

También puedes pedirlo en Chat IA: «Busca visualmente el plano donde enseña el teléfono en el
clip seleccionado». Funciona sin transcripción. Esta primera versión muestrea una imagen cada
segundo, hasta 60 s por búsqueda: son rangos aproximados, no detección de límites exactos de planos.
El análisis y las miniaturas se guardan localmente en `UGC Studio/analisis/`, con la huella del
archivo y del modelo para reutilizarlos. Cambiar el clip invalida la aplicación de cortes antiguos.

## Limpiar y separar audio dentro del editor

La extracción de voz usa el denoiser de [Resemble Enhance](https://huggingface.co/ResembleAI/resemble-enhance)
en formato [ONNX](https://github.com/skeskinen/resemble-denoise-onnx-inference), con código y pesos MIT.
Funciona localmente en CPU; FFmpeg reduce ruido adicional y nivela el volumen. Para prepararlo en Windows:

1. Instala Python 3.10 o superior desde [python.org](https://www.python.org/downloads/) con
   **Add Python to PATH** si no lo tienes.
2. Ejecuta **Preparar audio local (Windows).bat**. Instala ONNX Runtime, NumPy y SoundFile en un
   entorno propio dentro de `%LOCALAPPDATA%/UGC Studio/runtime/audio/`. Descarga el denoiser
   (43 MB) de una revisión fija y verifica su SHA-256 antes de utilizarlo.
3. Para reducir ruido se necesita FFmpeg completo, por ejemplo `Gyan.FFmpeg` de WinGet. El binario
   reducido que incluye el render no trae todos los filtros. Reinicia el programa tras instalarlo.
4. Selecciona el video/audio en la línea de tiempo y abre **Audio**:
   - **Reducir ruido y nivelar:** atenúa ruido y ajusta nivel de voz; no separa música.
   - **Separar voz / fondo y música:** extrae la voz y crea otra pista con el residuo del original.
   - **Separar y limpiar la voz:** separa primero y aplica limpieza/nivelación a la pista vocal.
     El fondo se crea silenciado para escuchar la voz aislada. Puedes recuperarlo subiendo
     su volumen en Propiedades o mediante el chat.
5. Escucha el resultado. **Restaurar sonido original** o **Deshacer** recuperan el sonido previo.

El mismo flujo está disponible en el chat: «Separa y limpia la voz del clip seleccionado».
Al terminar se silencia el sonido del clip original y se crean pistas alineadas con su rango
visible. Los WAV aparecen también en Proyecto. Mientras se procesa puedes cancelar; si mueves,
recortas o cambias el volumen del clip durante la espera, el resultado no se aplica a ciegas.

Límites: hasta 180 s por tarea, procesadas de una en una. La voz extraída es mono, duplicada a
estéreo. Música y ambiente permanecen juntos en el residuo estéreo;
no son tres stems independientes. Puede haber artefactos o voz residual en el fondo. La reducción
de ruido y nivelación no garantizan reparar una voz saturada, eliminar reverberación o recuperar
información perdida. Se integra el denoiser neuronal, no el módulo enhancer de Resemble Enhance.
No se integra Adobe Podcast ni se requiere subir el video a un servicio externo.

Los resultados/cachés viven en `UGC Studio/audio-procesado/` y `UGC Studio/media/`; nunca se
sobrescribe el archivo original. Las pistas derivadas del procesamiento son independientes: su vínculo
automático al mover/cortar después el video todavía está pendiente. El audio original sí permanece
enlazado con su imagen. Tampoco hay aún un control para desvincular/revincular las parejas.

El adaptador STFT está basado en la conversión ONNX de Santtu Keskinen (aviso MIT en
`scripts/licenses/resemble-denoiser.LICENSE`). Los pesos originales de ResembleAI se publican
como MIT (aviso en `scripts/licenses/resemble-enhance.LICENSE`). No se usa Demucs: la licencia
MIT de su código no acredita los permisos de sus pesos.

Para instalaciones personalizadas: `UGC_AUDIO_PYTHON` puede apuntar a un Python con ONNX Runtime,
NumPy y SoundFile; `UGC_AUDIO_MODEL` al mismo modelo ONNX verificado; `UGC_FFMPEG` a FFmpeg completo.
`visionModel` y `visionSearchModel` en el `config.json` local
seleccionan los modelos visual y de búsqueda; el chat conserva su propio modelo. En macOS/Linux se puede ejecutar
`python scripts/setup_audio.py` y configurar `UGC_AUDIO_PYTHON` con la ruta mostrada por el entorno.

Verificación de desarrollo: `npm run typecheck`, `npm test` y `npm run build`.
