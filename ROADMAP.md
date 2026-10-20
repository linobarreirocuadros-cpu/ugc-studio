# Roadmap

## Dirección del producto — investigación del 2026-10-19

**Intención confirmada por Lino:** editor UGC dirigido por chat y voz; comprensión de imagen,
acciones, gestos observables, voz y sonidos; toda edición reflejada en un timeline editable;
base gratuita/local y proyecto open source. Organización por espacios con barra inferior.
Las referencias a Premiere/Resolve sirven para aprender flujos, no para replicar productos.

**Rumbo aceptado para continuar (2026-10-19), con diseño detallado pendiente:**
Medios · Edición · Audio · Crear · Exportar, con una
conversación persistente y contexto de selección compartido. Edición conserva la preferencia
ya confirmada de dos visores y opción de pestañas. Timeline con detalle ajustable; vista por
planos y alternativas A/B como posibilidades posteriores. Nodos como vista avanzada opcional
para generación/composición. Los nombres y la distribución final se revisarán con Lino antes
de rediseñar la interfaz. En esta entrega se añadieron paneles Visión/Audio al editor actual.

### Orden de trabajo (primera prueba y audio autorizados por Lino)

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

### Requisitos técnicos derivados

- [x] Investigar la dirección de edición multimodal, nodos, herramientas locales y acceso a cuentas
- [x] Confirmar con Lino la prioridad de la primera prueba de visión y la limpieza/separación de audio
- [ ] Diseñar con Lino la distribución final de espacios
- [x] Índice visual por fotogramas con tiempos de origen, miniaturas y evidencia generada desde imagen
- [ ] Detección de límites reales de planos, eventos sonoros y análisis audiovisual más completo
- [x] Persistir análisis por huella de archivo/modelo/esquema y mapear rangos aproximados al timeline
- [x] Visión local con `qwen3-vl:4b-instruct`, búsqueda semántica con `qwen3:8b` y verificación visual
      de candidatos; las imágenes van directamente a Ollama, sin transcribir el video
- [ ] Comparar la precisión de un modelo visual 8B frente al 4B probado
- [ ] Analizar sonido no hablado; candidato CLAP para búsqueda/clasificación por ventanas,
      con refinamiento temporal para eventos y validación por Lino
- [ ] Plan de edición validado antes de aplicar; transacciones reversibles, versiones y comparación A/B
- [ ] Extender JSON/ops para efectos, capas de ajuste y keyframes; conservar parámetros editables
      de motion. Un video generado externamente es un clip renderizado, no capas recuperables
- [x] Ajustar el criterio editorial del asistente al brief y al estilo de Lino: ritmo, pausas
      expresivas, continuidad y Foley motivado por la acción; revisar los presets UGC del prompt
- [ ] Proveedores por capacidad, con requisitos de memoria/licencia y ejecución serial de trabajos
      pesados en la RTX 5070 de 12 GB; no prometer velocidad antes de medirla en este PC
- [x] Cola serial de tareas locales con progreso, cancelación y protección frente a clips modificados
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

La investigación inicial fue documental. La entrega posterior probó Qwen3-VL 4B Instruct,
Qwen3 8B y Resemble Denoiser ONNX en este PC; ver resultados y límites en `PROGRESS.md`.
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
- [x] Primera pasada visual basada en referencias de Lino: paneles grafito separados/redondeados,
      degradados suaves, jerarquía de botones, biblioteca, chat y timeline coherentes
- [x] Aplicar paleta indicada por Lino: Pale Sky, Dusty Denim, Deep Lilac, Midnight Violet,
      Shadow Grey y luz difusa inferior (primera referencia, sustituida por la siguiente)
- [x] Nueva referencia de Lino: fondo azul noche/ámbar, tarjetas translúcidas y glow delicado;
      Poppins local para el UI, escala común de textos e iconos más pequeños
- [ ] Validar transparencias, intensidad del brillo y legibilidad de la escala compacta con Lino
- [x] Panel Proyecto con vistas de lista y cuadrícula; selección del archivo de origen
- [x] Selección múltiple por recuadro en timeline y Proyecto (lista/cuadrícula), Ctrl/Shift+clic,
      movimiento/borrado conjunto reversible y selección independiente entre paneles
- [x] Barra de herramientas: selección, selección hacia delante, cuchilla, recorte ripple de
      video/audio en su pista, slip, mano, zoom, texto, imán y ajustar montaje
- [x] Medidor estéreo dBFS del Programa con pico retenido, aviso de saturación y reinicio
- [x] Paneles intercambiables entre izquierda/centro/derecha/abajo, separadores de tamaño,
      persistencia de distribución y restablecimiento; criterio de distribución aprobado por Lino
- [x] Acoplamiento por árbol de divisiones: bordes, centro para intercambiar y bordes exteriores
      a toda altura/anchura, guía de destino, separadores individuales, ampliar/restaurar y migración
- [x] Medidor independiente vertical/horizontal, escala adaptable y comprobación en 72×150 px;
      adaptación por contenedor de biblioteca, monitores, inspector y timeline con popovers sin recorte
- [x] Probar arrastre real, redimensión con mouse/teclado, doble clic y persistencia de distribución
- [x] Anchos internos del timeline ajustables: herramientas y cabeceras de pistas con separadores;
      herramientas compactas en una/dos/tres columnas, sobrante en menú sin scroll de columna,
      cabeceras responsivas y tipografía/iconos reducidos; preferencias locales persistentes
- [ ] Validar con Lino comodidad de zonas/guía y cancelación de arrastre; ventanas flotantes y pestañas separables
- [x] Monitores Origen y Programa visibles por defecto, con opción de pestañas
- [x] Marcas de entrada/salida e inserción de video, solo video o solo audio en Audio 1
- [x] Arrastre de medios del panel Proyecto y del monitor Origen a pistas compatibles
- [x] Comprobar integridad y reproducción local del video UGC original en un proyecto aislado
- [ ] Validar con Lino el arrastre y la continuidad visual de la reproducción en sus videos
- [x] Pistas genéricas B1, B2… y Audio 1, Audio 2…; botones para añadir más desde el timeline y chat
- [x] Barra superior: anidar/individuales, imán, selección enlazada, selección bajo cabezal,
      marcadores editables y ajustes de nombres/ondas/altura persistidos localmente
- [x] Crear secuencia desde selección; colocar anidada o como clips, abrir/editar/volver al montaje,
      autoguardar raíz y renderizar sus capas y sonido sin aplanar; guardas frente a ciclos
- [x] Vincular/desvincular una pareja y editar independientemente con aviso de diferencia en frames
- [ ] Ampliar agrupación de enlaces tras cortes independientes y validar secuencias grandes/anidación profunda
- [x] Sobrescribir al colocar/mover/extender video o audio en una pista ocupada: conservar extremos,
      offsets y parejas enlazadas; una operación reversible, sin desplazar el resto
- [x] Controles de pista: candado, destino, seguir ripple optativo, ojo, M y S;
      persistencia en proyecto y misma salida en Programa/exportación; herramientas del chat
- [x] Grabar voz desde pistas Audio: permiso, detener/cancelar, WAV local, onda e inserción reversible
- [ ] Validar captura del micrófono físico y permisos del navegador con Lino; comparar latencia de voz
- [x] Audio original visible con ondas al insertar video completo y al migrar proyectos anteriores;
      parejas enlazadas al mover, recortar, cortar, deslizar contenido y borrar; sin duplicar sonido
- [ ] Sincronía de stems procesados; ampliar casos complejos de seguimiento ripple y controles de origen/destino

## Fase 1 — Transcripción y subtítulos (en curso)
- [x] Transcripción con timestamps por palabra (Whisper en el navegador, gratis)
- [x] Transcripción local más precisa con faster-whisper large-v3, idioma automático,
      vocabulario de marcas, caché y retranscripción; corregir unión de subtokens del navegador
- [x] Generar subtítulos automáticos (estilos: karaoke, palabra por palabra, bloque)
- [x] Editar texto de cada bloque de subtítulos; estilo global (color, resaltado, mayúsculas, contorno)
- [x] Cortar silencios automáticamente (jump cuts) usando la transcripción
- [x] Tipografías reales incluidas en el programa (13 fuentes, funcionan sin internet)
- [ ] Panel de transcripción: leer el texto y borrar frases para cortar el video
- [ ] Opción de transcripción en la nube (ElevenLabs Scribe / OpenAI) para más precisión
- [x] Pistas genéricas Audio 1, Audio 2… con volumen y fade in/out
- [x] Arrastrar clips entre pistas del mismo tipo
- [x] Pista B2 (botón "+ B2" en el panel, solo imagen donde está el cabezal)
- [x] Ondas de audio en las pistas, generadas localmente
- [ ] Miniaturas de video en la línea de tiempo

## Fase 2 — Chat de IA integrado (base implementada, pendiente validación editorial UGC)
- [x] Panel "Chat IA"; herramientas de proyecto y análisis (subtítulos, textos, Foley, visión y audio)
- [x] Elegir motor y modelo dentro del chat; catálogo real de la cuenta y conversación nueva al cambiar
- [x] Conectar plan ChatGPT elegible mediante Sign in with ChatGPT oficial (Windows, DPAPI),
      Responses y herramientas; probar acceso, catálogo y edición reales con GPT-6.1-Sol
- [x] Proponer/aplicar resumen por rangos conservando todas las pistas; validación de duración,
      palabras y estado; Deshacer/Rehacer en un paso. Prueba real de 26.1 a 15 s y export MP4
- [ ] Validar con Lino coherencia del resumen, transcripción local y calidad de los cortes
- [ ] Probar expiración/renovación y revocación reales de ChatGPT; ampliar gestión de cuentas/plataformas
- [x] Motores: Ollama (local, gratis, por defecto), Gemini / Groq / OpenRouter (gratis con límite),
      Claude y OpenAI API (de pago, opcionales). Claves API guardadas en `UGC Studio/config.json`;
      ChatGPT usa por separado el plan autorizado, sin clave API y sujeto a sus límites
- [x] Comandos de voz (micrófono → Whisper en el navegador → chat)
- [x] Probar el chat con Ollama real en el PC del usuario (qwen3:8b: texto, duración y deshacer)
- [x] Probar el chat con qwen3:30b-a3b en el PC del usuario (texto, posición y duración)
- [x] Evitar el timeout de Ollama 30B al recibir su respuesta en flujo desde el servidor
- [x] Probar el chat con un video UGC real: limpieza/separación de audio y Deshacer; ajustar criterio editorial
- [ ] Validar con Lino la calidad editorial y del audio procesado en un trabajo real
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
- [x] Extracción local de voz con Resemble Denoiser ONNX (pesos MIT) y residuo de fondo;
      pistas nuevas y restauración del original. No hay tres stems independientes
- [x] Reducción de ruido y nivelación local con FFmpeg, incluyendo opción de separar antes de limpiar
- [x] Denoiser neuronal local para voz con ruido/música; modelo verificado por SHA-256
- [ ] Restauración neuronal de distorsión y reducción de reverberación: evaluar calidad/pesos
- [ ] Separar diálogo, música y efectos/ambiente como tres componentes independientes (hoy hay dos)
- [ ] Quitar fondo sin pantalla verde (RobustVideoMatting / rembg) — open source
- [ ] Animaciones Lottie (@remotion/lottie) con biblioteca de LottieFiles
- [ ] ElevenLabs (voces, SFX)
- [ ] Higgsfield (generación de video/imagen)
- [ ] Métricas de Meta Ads por marca para mejorar hooks
- [ ] Empaquetar como app de escritorio (Electron o Tauri)
