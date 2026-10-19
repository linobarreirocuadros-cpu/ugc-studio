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
- [ ] Tipografías reales (Google Fonts) en preview y export
- [ ] Panel de transcripción: leer el texto y borrar frases para cortar el video
- [ ] Opción de transcripción en la nube (ElevenLabs Scribe / OpenAI) para más precisión
- [ ] Múltiples pistas de video y audio (A1, A2 para música y Foley)
- [ ] Waveform y miniaturas en la línea de tiempo

## Fase 2 — Chat de IA integrado
- [ ] Panel de chat; las funciones de `ops.ts` expuestas como tools
- [ ] Selector de modelo (Claude, OpenAI, otros) con claves API en `.env`
- [ ] Comandos de voz (micrófono → Whisper → chat)

## Fase 3 — Marcas, Foley y presets
- [ ] Brand Kits: tipografías, colores, estilo de subtítulos, reglas, hooks que funcionan
- [ ] Biblioteca de Foley / SFX por carpetas
- [ ] Guardar y reutilizar efectos y presets

## Fase 4 — Motion graphics
- [ ] Plantillas de textos animados parametrizables
- [ ] Animaciones vectoriales (SVG/Lottie) generadas por prompt
- [ ] Transiciones y efectos (zoom, shake, blur, color)

## Fase 5 — Integraciones
- [ ] ElevenLabs (voces, SFX)
- [ ] Higgsfield (generación de video/imagen)
- [ ] Métricas de Meta Ads por marca para mejorar hooks
- [ ] Empaquetar como app de escritorio (Electron o Tauri)
