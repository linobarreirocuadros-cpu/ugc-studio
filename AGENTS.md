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
- Nombres aprobados el 2026-10-20: B1, B2… y Audio 1, Audio 2…; pistas genéricas y ampliables.
  Los IDs internos V1/V2/A0/A1/A2 se conservan por compatibilidad. El audio original del video
  se representa como AudioClip enlazado, con el video silenciado para evitar duplicación.
  Mover/recortar/cortar/borrar respeta esa pareja; los stems procesados siguen independientes.
- El 2026-10-20 Lino aprobó herramientas a la izquierda del timeline y medidor a la derecha,
  y pidió paneles adaptables/reubicables. Primera implementación: cuatro zonas intercambiables,
  separadores y persistencia local; ventanas flotantes y separación de pestañas siguen pendientes.
- La transcripción es una parte del análisis. Remotion/HyperFrames componen y renderizan;
  reconocer acciones o sonidos requiere modelos y análisis adicionales.
- La dirección explícita es open source y un flujo completo utilizable sin servicios de pago.
  Revisar licencias del código, pesos y recursos para uso comercial UGC; no equiparar
  código disponible, pesos descargables, servicio con cuota gratuita y licencia open source.
- La investigación y las propuestas del roadmap no autorizan dar por aprobado un rediseño
  visual. Consultar a Lino antes de decisiones importantes de composición, timing y estilo.

## Regla de oro de la arquitectura
**El proyecto es un JSON (`src/project/types.ts`). Todo cambio pasa por funciones puras en
`src/project/ops.ts`.** La línea de tiempo usa esas funciones, y el chat de IA (Fase 2) las
llamará como tools. Nunca hagas que la IA genere código Remotion para editar un video: la IA
modifica el JSON y `src/remotion/ProjectComposition.tsx` lo dibuja.

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
- `src/app/TimelineTools.tsx` — herramientas/atajos; `workspace.tsx` — zonas y tamaños de paneles
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

## Al terminar cada sesión de trabajo (obligatorio)
1. Actualiza `PROGRESS.md`: qué hiciste, qué quedó pendiente, decisiones tomadas.
2. Marca en `ROADMAP.md` las tareas completadas.
3. Corre `npm run typecheck` y haz commit con un mensaje claro.
Así otro agente (Claude, ChatGPT, etc.) puede continuar exactamente donde quedaste.
