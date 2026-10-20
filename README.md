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
- **Llevar a la línea de tiempo**: arrastra un archivo desde Proyecto a una pista, o usa **Insertar video**, **Solo video** y **Solo audio** en Origen. También puedes arrastrar los botones de solo video/audio a la pista deseada. El audio extraído de un video entra en **A0 Voz**; allí se muestra su onda.
- **Editar**: arrastra clips, arrastra los bordes para recortar, Ctrl/Cmd+K corta en el cabezal.
- **Exportar**: elige calidad arriba a la derecha → Exportar.

Tus videos importados y exportaciones se guardan en la carpeta **`UGC Studio`** dentro de tu
carpeta de usuario (ej. `C:\Users\TuNombre\UGC Studio` o `/Users/TuNombre/UGC Studio`).
Así, al descargar una versión nueva del programa, no pierdes nada.

**Chat con IA (gratis):** instala [Ollama](https://ollama.com/download), abre PowerShell y escribe
`ollama pull qwen3:8b` para empezar; `qwen3:30b-a3b` ofrece otra opción, pero responde más lento.
En el editor, pestaña **Chat IA** → ⚙ → Motor "Ollama". El panel indica si Ollama está conectado
y muestra el tiempo de espera cuando el modelo está pensando. También puedes usar Gemini/Groq/OpenRouter (gratis con
límite diario) o Claude/ChatGPT (de pago) pegando su clave.

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
sobrescribe el archivo original. Las pistas derivadas son independientes: el vínculo automático
al mover/cortar después el video todavía está pendiente. Se pueden ajustar como cualquier audio.

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
