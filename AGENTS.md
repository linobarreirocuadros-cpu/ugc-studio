# UGC Studio — instrucciones para agentes de IA

Este archivo lo leen Claude Code (vía CLAUDE.md), Codex/ChatGPT y cualquier otro agente.
Es la fuente de verdad sobre cómo trabajar en este repo. Responde al usuario en español.

## Qué es
Editor de video personal para editar videos UGC (anuncios verticales para marcas), con flujo
parecido a Premiere Pro, vista previa y render con Remotion, y (en fases futuras) un chat de IA
que edita el proyecto. Ver `ROADMAP.md` para las fases y `PROGRESS.md` para el estado actual.

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
- `src/ai/tools.ts` — herramientas del chat (JSON Schema, tiempos en segundos) + system prompt
- `src/app/chat/` — panel de chat y `executeTool.ts` (ejecuta herramientas en el navegador)
- `server/llm.ts` — proveedores de IA, conversación en memoria, `/api/chat`, `/api/settings`, `/api/models`
- `server/` — servidor Express local: subida de archivos, proxies y export. Los datos viven en
  `~/UGC Studio/` (`media/`, `media/proxies/`, `Exportaciones/`), fuera del repo; se puede
  cambiar con la variable `UGC_DATA_DIR`.

## Comandos
- `npm install` — instalar
- `npm run dev` — app en http://localhost:5173 + servidor en :3001
- `npm run typecheck` — revisar tipos (correrlo antes de cada commit)

## Convenciones
- TypeScript estricto, React con componentes funcionales.
- Todas las versiones de paquetes `remotion` y `@remotion/*` deben ser exactamente iguales.
- Textos de la interfaz en español.
- Tiempos siempre en frames (no segundos) dentro del modelo de datos.

## Al terminar cada sesión de trabajo (obligatorio)
1. Actualiza `PROGRESS.md`: qué hiciste, qué quedó pendiente, decisiones tomadas.
2. Marca en `ROADMAP.md` las tareas completadas.
3. Corre `npm run typecheck` y haz commit con un mensaje claro.
Así otro agente (Claude, ChatGPT, etc.) puede continuar exactamente donde quedaste.
