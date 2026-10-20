# Roadmap

## Fase 0 — Base ✅
- [x] Modelo de proyecto en JSON + operaciones puras
- [x] Importar videos (panel Proyecto)
- [x] Monitor con Remotion Player
- [x] Línea de tiempo: mover, recortar bordes, cortar (Ctrl/Cmd+K), borrar, ripple delete, imán
- [x] Capa de texto con propiedades (texto, tamaño, color, fondo, posición, tipografía)
- [x] Deshacer / rehacer, autoguardado, guardar/abrir proyecto (.json)
- [x] Exportar: MP4 H.264 alta calidad / borrador, MOV ProRes 422 HQ
- [x] Proxies automáticos para reproducción fluida

## Fase 1 — Transcripción y subtítulos (en curso)
- [x] Transcripción con timestamps por palabra (Whisper en el navegador, gratis)
- [x] Generar subtítulos automáticos (estilos: karaoke, palabra por palabra, bloque)
- [x] Editar texto de cada bloque de subtítulos; estilo global (color, resaltado, mayúsculas, contorno)
- [x] Cortar silencios automáticamente (jump cuts) usando la transcripción
- [x] Tipografías reales incluidas en el programa (13 fuentes, funcionan sin internet)
- [ ] Panel de transcripción: leer el texto y borrar frases para cortar el video
- [ ] Opción de transcripción en la nube (ElevenLabs Scribe / OpenAI) para más precisión
- [x] Pistas de audio A1 (música) y A2 (efectos) con volumen y fade in/out
- [x] Arrastrar clips entre pistas del mismo tipo
- [x] Pista V2 para B-roll (botón "+ B-roll" en el panel, entra en silencio donde está el cabezal)
- [ ] Waveform y miniaturas en la línea de tiempo

## Fase 2 — Chat de IA integrado (hecho, falta probar con modelos reales)
- [x] Panel "Chat IA"; 14 herramientas que usan `ops.ts` (subtítulos, silencios, textos, volumen, Foley…)
- [x] Motores: Ollama (local, gratis, por defecto), Gemini / Groq / OpenRouter (gratis con límite),
      Claude y OpenAI (de pago, opcionales). Claves guardadas en `UGC Studio/config.json`
- [x] Comandos de voz (micrófono → Whisper en el navegador → chat)
- [x] Probar el chat con Ollama real en el PC del usuario (qwen3:8b: texto, duración y deshacer)
- [x] Probar el chat con qwen3:30b-a3b en el PC del usuario (texto, posición y duración)
- [ ] Probar el chat con un video UGC real y ajustar el prompt según los resultados
- [ ] Respuestas en streaming (ver el texto mientras se escribe)

## Fase 3 — Marcas, Foley y presets
- [ ] Brand Kits: tipografías, colores, estilo de subtítulos, reglas, hooks que funcionan
- [x] Biblioteca de Foley / SFX por carpetas (UGC Studio/Foley, pestaña Foley)
- [ ] Guardar y reutilizar efectos y presets

## Fase 4 — Motion graphics
- [ ] HyperFrames (HeyGen, open source Apache-2.0): la IA escribe escenas HTML + GSAP, se
      renderizan a video y entran como clip en V2. Remotion sigue siendo la base del editor.
- [ ] Plantillas de textos animados parametrizables
- [ ] Animaciones vectoriales (SVG/Lottie) generadas por prompt
- [ ] Transiciones y efectos (zoom, shake, blur, color)

## Fase 5 — Integraciones
- [ ] Limpieza de voz (DeepFilterNet / RNNoise) y separar voz/música (Demucs) — open source
- [ ] Quitar fondo sin pantalla verde (RobustVideoMatting / rembg) — open source
- [ ] Animaciones Lottie (@remotion/lottie) con biblioteca de LottieFiles
- [ ] ElevenLabs (voces, SFX)
- [ ] Higgsfield (generación de video/imagen)
- [ ] Métricas de Meta Ads por marca para mejorar hooks
- [ ] Empaquetar como app de escritorio (Electron o Tauri)
