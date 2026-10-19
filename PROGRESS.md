# Progreso

## Estado actual
Fase 0 completa. Fase 1 en curso: subtítulos automáticos y quitar silencios ya funcionan.

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

## Siguiente paso sugerido
Probar transcripción real con un video UGC del usuario. Luego: Google Fonts y panel de transcripción.
