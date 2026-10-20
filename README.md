# UGC Studio

Editor de video para UGC con flujo tipo Premiere Pro, construido sobre Remotion.

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
