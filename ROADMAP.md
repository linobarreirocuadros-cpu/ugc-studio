# Roadmap

## Dirección del producto — investigación del 2026-10-19

**Intención confirmada por Lino:** editor UGC dirigido por chat y voz; comprensión de imagen,
acciones, gestos observables, voz y sonidos; toda edición reflejada en un timeline editable;
base gratuita/local y proyecto open source. Organización por espacios con barra inferior.
Las referencias a Premiere/Resolve sirven para aprender flujos, no para replicar productos.

**Propuesta para discutir con Lino:** Medios · Edición · Audio · Crear · Exportar, con una
conversación persistente y contexto de selección compartido. Edición conserva la preferencia
ya confirmada de dos visores y opción de pestañas. Timeline con detalle ajustable; vista por
planos y alternativas A/B como posibilidades posteriores. Nodos como vista avanzada opcional
para generación/composición. Los nombres y la distribución no están aprobados ni implementados.

### Orden de trabajo propuesto (pendiente de revisión de Lino)

1. **Fiabilidad:** validar reproducción, sincronía y arrastre con Lino; cerrar un flujo UGC real.
2. **Primera edición con visión:** analizar un clip corto localmente, localizar un plano por su
   contenido visible, mostrar el rango encontrado y ejecutar una edición reversible por chat.
   Probar también un fragmento sin diálogo para verificar que la transcripción no sea un requisito.
3. **Interacción y control:** prototipo de espacios; chat contextual, entrada de voz, selección
   de clips/rangos/personajes visuales y operaciones agrupadas en un paso de deshacer.
4. **Sonido y duración:** localizar un evento visual/sonoro, colocar Foley local y comprobar
   sincronía; generar una propuesta de 25 s desde 30 s conservando los tramos protegidos del brief.
5. **Extensiones:** voz, música, motion y video generado por proveedores intercambiables,
   con colas, cancelación, estado de progreso y recursos persistidos fuera del repositorio.

### Requisitos técnicos derivados (sin implementar)

- [x] Investigar la dirección de edición multimodal, nodos, herramientas locales y acceso a cuentas
- [ ] Revisar con Lino la propuesta de espacios y la prioridad de la primera prueba con visión
- [ ] Índice de medios con planos, fotogramas con tiempo, voz, eventos sonoros y evidencias de análisis
- [ ] Persistir análisis por huella del medio, versión de modelo/esquema y tiempo del original;
      mapearlo correctamente al timeline en frames, incluyendo recortes y fuentes con fps distinto
- [ ] Adaptador de visión local: probar `qwen3-vl:4b` y después 8B, con muestras temporales limitadas;
      el transporte actual del chat es textual y no envía imágenes/sonido al modelo
- [ ] Analizar sonido no hablado; candidato CLAP para búsqueda/clasificación por ventanas,
      con refinamiento temporal para eventos y validación por Lino
- [ ] Plan de edición validado antes de aplicar; transacciones reversibles, versiones y comparación A/B
- [ ] Extender JSON/ops para efectos, capas de ajuste y keyframes; conservar parámetros editables
      de motion. Un video generado externamente es un clip renderizado, no capas recuperables
- [ ] Ajustar el criterio editorial del asistente al brief y al estilo de Lino: ritmo, pausas
      expresivas, continuidad y Foley motivado por la acción; revisar los presets UGC del prompt
- [ ] Proveedores por capacidad, con requisitos de memoria/licencia y ejecución serial de trabajos
      pesados en la RTX 5070 de 12 GB; no prometer velocidad antes de medirla en este PC
- [ ] Revisar licencia propia del repositorio (no hay `LICENSE` en la raíz) y dependencias antes
      de prometer una distribución enteramente libre; elección de licencia pendiente de Lino
- [ ] Revisar el alcance comercial de Remotion y evaluar independencia del motor de render;
      HyperFrames Apache-2.0 es candidato para motion, no está integrado ni se decidió migrar
- [ ] Probar candidatos de generación: Chatterbox Multilingual (voz), ACE-Step 1.5 (música),
      ComfyUI local con un modelo de video que quepa en el equipo; comparar calidad y latencia
- [ ] Seleccionar generador de Foley con pesos aptos para anuncios comerciales. MMAudio tiene
      código MIT pero pesos CC BY-NC 4.0: no se propone como motor del flujo comercial
- [ ] Evaluar Sign in with ChatGPT para planes elegibles en apps locales/open source; no está
      integrado. Claude requiere API salvo aprobación del proveedor; Gemini API tiene nivel
      gratuito con cuotas. Son extras opcionales, separados del funcionamiento local

### Evidencia consultada y límites

Investigación documental; no se instalaron ni ejecutaron los modelos candidatos en esta sesión.
El rumbo recomendado es una inferencia de producto, no una predicción demostrada del mercado.

- [ExpressEdit (IUI 2024)](https://arxiv.org/abs/2403.17693): lenguaje y dibujo sobre imagen;
  estudio pequeño con 10 participantes. [EditDuet](https://arxiv.org/abs/2509.10761): investigación
  sobre edición mediante herramientas; no equivale a validación de un editor completo en este PC.
- [Descript Underlord](https://www.descript.com/underlord): el fabricante anuncia un agente que
  lee guion y ve video. [Premiere Media Intelligence](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/search-for-media-using-ai-powered-media-intelligence.html):
  búsqueda de medios mediante IA. Se consultaron sus documentos, no se probaron esos productos.
- [Resolve](https://www.blackmagicdesign.com/products/davinciresolve/): espacios por tarea.
- [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) y [catálogo Ollama](https://ollama.com/library/qwen3-vl):
  candidato visual. La descarga 4B figura como 3.3 GB; eso no es su memoria total en ejecución.
- [PySceneDetect](https://github.com/Breakthrough/PySceneDetect),
  [faster-whisper](https://github.com/SYSTRAN/faster-whisper) y [CLAP](https://github.com/LAION-AI/CLAP):
  candidatos para planos, transcripción local y búsqueda de sonidos. No integrados por esta sesión.
- [Chatterbox](https://github.com/resemble-ai/chatterbox), [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5),
  [ComfyUI](https://github.com/Comfy-Org/ComfyUI) y [Wan2.1](https://github.com/Wan-Video/Wan2.1):
  generación local candidata; verificar versiones/pesos concretos y rendimiento antes de integrar.
- [MMAudio/licencias](https://github.com/hkchengrex/MMAudio#license),
  [Remotion/licencia](https://www.remotion.dev/docs/license/faq) y
  [HyperFrames](https://github.com/heygen-com/hyperframes): distinguir disponibilidad y permiso de uso.
- [OpenAI: Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt):
  admite planes Plus/Pro elegibles en proyectos locales/open source, sujeto a permisos y límites.
  [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview): no ofrecer login/cuotas
  de claude.ai en otro producto sin aprobación.
  [Gemini API](https://ai.google.dev/gemini-api/docs/billing): ciertos modelos tienen cuota gratuita.

## Fase 0 — Base ✅
- [x] Modelo de proyecto en JSON + operaciones puras
- [x] Importar videos (panel Proyecto)
- [x] Monitor con Remotion Player
- [x] Línea de tiempo: mover, recortar bordes, cortar (Ctrl/Cmd+K), borrar, ripple delete, imán
- [x] Capa de texto con propiedades (texto, tamaño, color, fondo, posición, tipografía)
- [x] Deshacer / rehacer, autoguardado, guardar/abrir proyecto (.json)
- [x] Exportar: MP4 H.264 alta calidad / borrador, MOV ProRes 422 HQ
- [x] Proxies automáticos para reproducción fluida

## Herramientas de edición manual y gestión de medios (en curso)
- [x] Panel Proyecto con vistas de lista y cuadrícula; selección del archivo de origen
- [x] Monitores Origen y Programa visibles por defecto, con opción de pestañas
- [x] Marcas de entrada/salida e inserción de video, solo video o solo audio en A0 Voz
- [x] Arrastre de medios del panel Proyecto y del monitor Origen a pistas compatibles
- [x] Comprobar integridad y reproducción local del video UGC original en un proyecto aislado
- [ ] Validar con Lino el arrastre y la continuidad visual de la reproducción en sus videos
- [ ] Audio y video vinculados al insertar un clip completo; desvincular y editar cada parte

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
- [x] Ondas de audio en las pistas, generadas localmente
- [ ] Miniaturas de video en la línea de tiempo

## Fase 2 — Chat de IA integrado (base implementada, pendiente validación editorial UGC)
- [x] Panel "Chat IA"; 14 herramientas que usan `ops.ts` (subtítulos, silencios, textos, volumen, Foley…)
- [x] Motores: Ollama (local, gratis, por defecto), Gemini / Groq / OpenRouter (gratis con límite),
      Claude y OpenAI (de pago, opcionales). Claves guardadas en `UGC Studio/config.json`
- [x] Comandos de voz (micrófono → Whisper en el navegador → chat)
- [x] Probar el chat con Ollama real en el PC del usuario (qwen3:8b: texto, duración y deshacer)
- [x] Probar el chat con qwen3:30b-a3b en el PC del usuario (texto, posición y duración)
- [x] Evitar el timeout de Ollama 30B al recibir su respuesta en flujo desde el servidor
- [ ] Probar el chat con un video UGC real y ajustar el prompt según los resultados
- [ ] Mostrar en el panel las respuestas en streaming mientras se escriben

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
