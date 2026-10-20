# Progreso

## Estado actual
Fase 2 (chat con IA) construida, con primera visión local y limpieza de audio integradas.
ChatGPT conectado por Sign in with ChatGPT oficial y probado con GPT-6.1-Sol; selector de motor/modelo
dentro del chat. Resumen por rangos probado de 26.1 a 15 s con Deshacer/Rehacer y exportación.
Transcripción precisa local con faster-whisper large-v3 instalada y probada en este PC.
Selección múltiple con recuadro en timeline y Proyecto; movimiento/borrado conjunto reversible.
Barra de herramientas y espacio con cinco paneles acoplables por bordes, guía de destino,
separadores por división y ampliación/restauración. Medidor dBFS independiente, vertical/horizontal.
Monitores con zoom/pan, controles externos, regla y resolución Full/1/2/1/4/1/8/1/16 local;
Alt+clic aísla audio/video y Alt+arrastrar copia, con validación física de este último pendiente.
Timeline con anchos internos ajustables para herramientas y cabeceras; herramientas en una columna
por defecto, hasta tres al ensanchar y menú de sobrante cuando falta altura, sin scroll en la columna.
Menús superiores y editor visual de atajos Windows con conflictos, ámbitos, presets JSON y rueda
configurable. 116 comandos disponibles, 104 reservas pendientes y 629 asignaciones de Premiere 2026
auditadas/consultables como referencia. Ver ATAJOS.md para uso, fuentes y límites.
Chat simplificado con IA/modelo y cuenta en vistas secundarias; mascota/logo vectoriales basados
en el personaje de Lino. Apertura animada y conversación/borrador conservados al ocultar el panel.
Pistas B1, B2… y Audio 1, Audio 2… ampliables; audio original del video visible con ondas y
enlazado con su imagen durante las operaciones principales de edición.
Colocación por sobrescritura, controles de pista (candado/destino/ripple/ojo/M/S) y grabación
local de voz desde el timeline implementados; captura con micrófono físico pendiente de confirmar.
Barra superior con seis controles, marcadores persistentes y secuencias editables/anidadas o como clips.
Tema visual vigente: fondo azul noche/ámbar, tarjetas translúcidas, bordes y glow delicados,
Poppins local para la interfaz y escala compacta de texto/iconos; acabado pendiente de revisión.
Equipo verificado: Windows 11, Ryzen 7 7700X, 32 GB RAM y RTX 5070 de 12 GB.
Chat probado con Ollama `qwen3:30b-a3b` y `qwen3:8b`; el 30B usa también RAM y puede tardar.
Visión: `qwen3-vl:4b-instruct` + `qwen3:8b`. Audio: Resemble Denoiser ONNX en CPU y FFmpeg.

Fase 0 completa. Fase 1 casi completa: subtítulos, quitar silencios, pistas de audio genéricas, Foley,
tipografías, B2 para imagen adicional y ondas de audio. Falta: panel de transcripción y miniaturas.

## Registro

### 2026-10-20 — Asistente simplificado e identidad del personaje (Codex)

**Criterio y decisiones**
- Lino pidió conservar las funciones, reducir ruido y abrir el chat desde una mascota basada solo
  en la cara del dibujo adjunto. Eligió explícitamente una cara vectorial sencilla. Se conservaron
  Poppins, escala compacta y paleta azul noche/ámbar del software.
- Se aplicaron divulgación progresiva, jerarquía visual y estado visible. Referencias primarias:
  [NN/g: divulgación progresiva](https://www.nngroup.com/articles/progressive-disclosure/),
  [heurísticas](https://www.nngroup.com/articles/ten-usability-heuristics/) y
  [W3C: movimiento reducido](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html).
  Esto orienta el diseño; no constituye una auditoría de accesibilidad ni validación UX con usuarios.

**Implementado**
- `Mascot.tsx`: sombrero azul, máscara oscura, ojos ámbar y barba clara, sin cuerpo/pose del dibujo.
  La misma cara se usa en marca, asistente y favicon `public/mascot.svg`. SVG nativo editable,
  sin nuevas dependencias ni recursos/servicios de pago. El original adjunto no se copia al repo.
- Mascota al pie del inspector: abre/oculta chat; ocultar muestra Propiedades. Logo superior abre
  el asistente incluso si otro panel está ampliado. ChatPanel permanece montado: no se reinician
  mensajes, borrador, propuesta ni tareas al cambiar de pestaña/cerrar. Estado de trabajo/voz en botón.
- Movimiento de apertura 220 ms con desplazamiento de 6 px y easing suave; gesto del sombrero
  320 ms y compresión al pulsar. Sin animación continua en reposo; alternativa sin movimiento
  por preferencia del sistema. Revisión perceptual del timing pendiente de Lino.
- Conversación principal: bienvenida corta, dos ideas y Más ideas. Las ideas rellenan el mensaje
  para revisar/enviar; no ejecutan una edición al pulsarlas. Chip con proveedor/modelo y estado
  junto al campo. Envío y micrófono con iconos coherentes y nombres accesibles.
- IA y cuenta: conserva motor, catálogo/modelo, refrescar, configurar, acceso ChatGPT, permisos,
  cancelar conexión, uso y desconectar. Ajustes: proveedor/modelo manual, claves, dirección Ollama,
  ayuda desplegable e idioma de voz. Aviso de cobro en proveedores opcionales de pago.
- Actividad agrupada por turno en Ver actividad; los errores siguen visibles. Propuestas mantienen
  resumen, rangos desplegables, aplicar/descartar y la operación reversible existente.
  Estado actual y segundos de espera visibles durante procesamiento. Se respeta la lectura del
  historial al subir, en lugar de forzar siempre el scroll al final.
- Ajustes usan feedback de guardado/error. Carga del servidor con reintento; bloqueo de controles
  durante transcripción/ejecución. Cambiar motor/modelo inicia conversación nueva como el selector.
- `assistant.css`: vistas secundarias con scroll propio, adaptación por tamaño y ancho de lectura
  limitado cuando se amplía el panel. No se modificaron herramientas de edición ni Project/ops.

**Pruebas realizadas**
- `npm run typecheck` y `npm run build` correctos; sigue el aviso previo de tamaño de bundles.
- Interfaz real y proyecto aislado en 5174: elegir idea, borrador conservado al abrir/cerrar,
  navegación IA/cuenta/ajustes/volver, controles de uso/desconexión accesibles sin activarlos,
  catálogos reales de ChatGPT y Ollama, panel ampliado y retorno desde monitor ampliado vía logo.
- Envío real con Ollama `qwen3:8b`: petición no editorial, respuesta LISTO, estados de espera y
  conversación conservada al ocultar/mostrar. No se solicitaron cambios en el video. Al terminar
  se restauraron ChatGPT `gpt-6.1-sol` y la preferencia Ollama `qwen3:30b-a3b`.
- Revisión a 1280×720 y 756×589, incluyendo panel estrecho y ampliado. Sin errores de consola QA.
  No se repitió la suite de operaciones: las operaciones de edición no cambiaron en esta sesión.

**Pendiente / siguiente paso**
- Criterio de Lino sobre cara/proporciones, legibilidad y animación. No dar por aprobados los detalles
  finales del personaje por haber aprobado el enfoque vectorial.
- Probar voz física, una edición por tools/propuesta y navegación con un historial largo en el nuevo
  diseño. No se repitieron OAuth, desconexión ni todos los proveedores; no se hizo certificación WCAG.
- Siguiente paso para Codex: incorporar el feedback visual de Lino y validar ese flujo de voz/edición.

### 2026-10-20 — Monitores navegables y gestos Alt de timeline (Codex)

**Implementado**
- Visor compartido en Origen/Programa: rueda con zoom bajo el puntero, Shift acelerado, Mano o
  botón central para pan, Ajustar/10..1600%, doble clic para ajustar y pantalla completa. Controles
  pequeños fuera de la imagen; no escalan con el zoom. Se conservan Dos visores/Pestañas.
- Timecode editable, regla con cabezal y dos tiradores para acotar el tiempo visible. Programa
  comparte cabezal y marcas/markers del timeline; Origen conserva sus I/O y acciones de colocación.
  Transporte por frames, I/O, navegación de ediciones/match frame/marker en Programa, sonido,
  repetición de Programa y guías de márgenes de acción/títulos (90%/80%) solo para visualizar.
- Selector Full, 1/2, 1/4, 1/8 y 1/16: Full usa originales; FFmpeg crea versiones reales de los
  medios de video, en serie y con caché por ruta/tamaño/fecha/divisor. Mensaje de preparación/error
  y Full temporal hasta terminar. `previewSources` se propaga a secuencias anidadas; solo se preparan
  fuentes referenciadas/visibles. No altera Project, FPS, duración ni resolución de exportación.
  Los overlays siguen dibujándose nítidos; no se reduce todo el compositor a una textura raster.
- Alt+clic aísla una parte enlazada; mover, recortar, cortar, copiar y borrar respetan esa selección.
  El enlace se conserva y el desfase se indica en frames. Clic normal sin arrastrar recupera la pareja.
- Alt+arrastrar desde Selección duplica con preview, IDs/enlaces nuevos, candados y sobrescritura.
  `duplicateClipsWithSelection` selecciona solo las copias, excluyendo fragmentos de vecinos.
  Una transacción de historial; Esc cancela. Partir de una selección aislada copia solo esa parte.

**Pruebas realizadas**
- `npm test`: 64 pruebas correctas. Cinco nuevas: copia de pareja a otra pista, audio aislado,
  protección de candados/sin desplazamiento, movimiento independiente reversible y copia sobre
  vecino conservando extremos/selección correcta. `npm run typecheck` y `npm run build` correctos
  (Vite conserva el aviso de tamaño de bundles).
- Prueba aislada con AssortedTapes: Alt+clic de video y de audio, clic normal para recuperar pareja,
  arrastre independiente +10 f con aviso de desfase y Deshacer restaurando posiciones. Rueda real,
  zoom 100%, Mano + arrastre, búsqueda 3:00 compartida con timeline, avance a 3:01, reproducción
  y medidor activo, pantalla completa y regreso mediante su botón. Sin errores de consola de QA.
- Las cuatro versiones fueron generadas y examinadas con ffprobe: 540×960, 270×480, 134×240 y
  66×120 codificados (redondeo par/SAR); todas conservan 24000/1001 FPS y duración de video
  26.109417 s. En Programa se comprobó 1/4 y cambio a 1/16 conservando el tiempo de búsqueda.
- Revisión visual a 1280×720 y 756×589; controles se redistribuyen al estrechar el monitor.
  El proyecto real de Lino se conservó: las operaciones de prueba se hicieron en otro origen local.

**Pendiente / alcance**
- Probar Alt+arrastrar con el mouse físico de Lino: la automatización disponible permitió Alt+clic
  y arrastre, pero no su combinación sostenida; la operación de copia sí pasó pruebas automáticas.
- Valorar comodidad, fluidez y escucha en trabajo real. No se probaron exportación, loops largos
  ni todas las combinaciones manuales de anidación/calidad en esta sesión. No se declara paridad
  completa con Premiere: captura de fotogramas, botones personalizables y otros modos faltan.
- Siguiente paso: revisión de estos gestos con Lino y ajustar sensaciones de zoom/transporte.

### 2026-10-20 — Densidad global a escala de la barra de herramientas (Codex)

**Implementado y decisiones**
- Lino pidió reducir proporcionalmente textos, botones y elementos tomando los iconos de la barra
  vertical como referencia. Nueva capa `compact-ui.css`: texto base 9 px, auxiliar 8 px, títulos
  10 px, iconos 12 px y controles habituales de 20 px. Se conservan Poppins y el tema vigente.
- Menús, barra superior, Proyecto/lista/cuadrícula, chat/configuración, propiedades, análisis local,
  monitores, timeline, medidor, popovers y diálogos de comandos/atajos comparten esta densidad.
  Rellenos, separaciones, miniaturas y sliders se reducen. La cabecera pasa de 74 a 56 px.
- Son medidas de interfaz reales, sin zoom CSS ni cambios de Project JSON. Se conservan la regla,
  las coordenadas de edición, la altura de pista elegida y la tipografía del contenido del video.
  Los controles nativos del video de Origen siguen dependiendo del navegador.

**Pruebas realizadas**
- Inspección en el editor real a 756×589 y copia aislada a 1280×720 con medios locales: selección
  de clip, campos de Propiedades y apertura/cierre de Atajos. Los cinco paneles de la copia aislada
  no desbordan horizontalmente; herramientas y medidor visibles en los tamaños comprobados.
- Medidas DOM: controles principales 20 px, fuentes 9 px, iconos de Programa 12 px. Sin errores
  de consola en la copia aislada durante esta revisión. Captura de resultado guardada fuera del repo.
- `npm run typecheck` y `npm run build` correctos; Vite mantiene su aviso de tamaño de bundles.
  No se repitió la suite de operaciones: esta sesión solo cambia presentación y altura de cabecera.

**Pendiente**
- Revisión de Lino de comodidad y legibilidad con su pantalla/escala de Windows. No se declara
  validación editorial ni prueba de todas las funciones por esta revisión visual.

### 2026-10-20 — Menús y atajos editables basados en Premiere Windows (Codex)

**Investigación y decisiones**
- Se contrastaron documentación primaria de Adobe y el preset de fábrica Windows/inglés de
  Premiere Pro 2026 instalado: formato 6, actualizado el 2026-09-15, 629 asignaciones (394 Edición,
  235 Color). Se conserva solo la tabla factual normalizada y su SHA-256, no el XML propietario.
  Referencia completa buscable dentro del diálogo. El formato 5 tiene 396 asignaciones y no se mezcla.
- Catálogo adaptado: 220 comandos, 116 disponibles y 104 reservados por funciones pendientes,
  diferenciados en UI. No es implementación de todos los motores de Premiere ni importador .kys.
- Se corrigió Shift+L: el preset real lo asigna a reproducción lenta; selección enlazada queda
  sin combinación inicial. Acento grave distingue panel bajo mouse y Shift+acento grave, activo.
  La documentación pública no enumera todos los comandos internos; ATAJOS.md explica el alcance.

**Implementado**
- Menús superiores en español; Ventana y Edición abren Atajos (Ctrl+Alt+K). Teclado visual US/ES,
  búsqueda, filtros de panel/estado/tecla, varias asignaciones, captura, arrastre a tecla, conflictos
  con reasignación explícita, guardar/cancelar/restaurar e importar/exportar presets JSON.
- Mapa único por código físico, modificadores exactos, prioridad del contexto y reservas pendientes.
  Ignora escritura, AltGr/composición, diálogos, menús y separadores. Hints de herramientas y toolbar
  leen las preferencias. Mapa versión 1/revisión 2 local, con migración de valores iniciales corregidos.
- Rueda en timeline horizontal, Ctrl vertical y Alt zoom bajo el puntero; ocho combinaciones
  configurables con normalización de unidades. Alt+clic de Zoom aleja. Altura común opcional por rueda.
- Atajos conectados a acciones existentes y nuevas: copiar/cortar/pegar/duplicar selección, corte
  de destinos/todas las pistas, Q/W y Ctrl+Alt+Q/W, mover/slip 1/5 frames, navegación de edición,
  paneles, I/O de Origen y Programa, marcadores, inserción/sobrescritura desde Origen y diálogo
  previo a exportar (Ctrl+M no inicia un render por sí solo). Ganancia limitada al modelo 0..1.
- `copyClips`, `pasteClips` e `insertSourceRange` en ops puras: enlaces/offsets/candados, sobrescritura,
  IDs nuevos, protección de ciclos de secuencias e inserción con seguidores de ripple y marcadores.
  Una operación de historial por edición. El portapapeles es interno, no comparte con otras apps.
- Espacio/K/L y revisión inversa J sin audio; L repetida llega a 2/4/8/16×. Origen tiene transporte
  propio; cambiar de monitor para reproducir detiene el otro. Marcas I/O de Programa son de sesión,
  visibles en regla/monitor; no modifican rango de export ni se persisten en Project.

**Pruebas realizadas**
- `npm run typecheck`, `npm test` (**59/59**), `npm run build` y `git diff --check` correctos.
  Ocho pruebas nuevas: validez/ámbitos/conflictos/captura, auditoría 629 y migración Shift+L,
  rueda/anclaje, pegado enlazado con candados, inserción con offsets/seguidores/marcadores y ciclos.
  Permanece el aviso previo de paquetes grandes.
- UI aislada en :5174: menú Ventana abre diálogo; conflicto Cuchilla→V avisa sin sobrescribir;
  asignación adicional F2 guardada y ejecutada después de recargar; se confirmó que escribir V en
  chat no cambia Cuchilla. Restauración de base y tabla completa Edición/Color visibles.
- Ctrl+K a 00:00:02:00 pasó de 6 a 8 clips (video/audio); Ctrl+Z volvió a 6. Copiar/pegar por
  menús pasó de 6 a 8; Deshacer restauró. La herramienta de navegador interceptó Ctrl+C/V con su
  portapapeles virtual; la ejecución física de esas dos combinaciones queda para validación de Lino.
- Origen: I, →, O produjo rango 0..2 frames; coma insertó dos frames, duración de 15:00 a 15:02,
  6 a 10 clips al dividir/insertar pareja. Deshacer restauró. M añadió marcador y Ctrl+Z lo quitó.
- Ctrl+M abrió opciones sin lanzar render. Rueda nativa pasó scroll horizontal de 0 a 261 px.
  → y Shift+→ sumaron 6 frames. L dos veces dejó video a 2×; J retrocedió de 2:00 a 1:26 y K
  dejó reproducción pausada. Sin errores de consola en la prueba. Montaje principal conservado.
- Al añadir un hook durante HMR, la vista de desarrollo mostró un error de orden de hooks;
  se recargaron prueba y editor principal y se recuperó el montaje desde autoguardado. No se
  reprodujo en carga nueva. Diálogo comprobado también a 756×589, con controles inferiores dentro.

**Pendientes y siguiente paso**
- Probar Alt/Ctrl/Shift+rueda con el mouse físico, distribución/puntuación y comodidad con Lino;
  arrastre de comandos a teclas, presets entre equipos y ejecución individual de todo el catálogo
  no validados manualmente. No se repitieron exportación final, IA ni micrófono en esta sesión.
- Las 104 reservas, más comandos adicionales de referencia, requieren desarrollar sus funciones:
  keyframes, rolling, slide, velocidad, transiciones, mezcladores y gestión avanzada, entre otras.
  J/K/L sostenidas y reproducción inversa con audio, zoom/pan de monitores y Alt+arrastre faltan.
- Siguiente paso de Codex: ajustar sensación de rueda y teclas con la prueba de Lino y priorizar
  funciones faltantes, manteniendo un único mapa de comandos y todas las ediciones mediante ops.

### 2026-10-20 — Anchos internos y herramientas compactas del timeline (Codex)

**Decisiones e implementación**
- Dos separadores internos permiten cambiar el ancho de herramientas y cabeceras de pistas;
  el área de clips recibe el espacio restante. Arrastre con Pointer Events, flechas para ajustar,
  doble clic para restablecer y Escape para cancelar. Anchos guardados localmente, fuera del JSON
  del proyecto; los límites se adaptan al ancho disponible.
- Herramientas de 12 px en celdas compactas, una columna inicial de 30 px y dos/tres columnas
  al ampliar. El cálculo considera también la altura: si no caben todas, «Más herramientas» abre
  el sobrante en un menú fuera del contenedor. No hay barras de scroll en la columna de herramientas.
- Cabeceras con texto de 9 px e iconos de 11 px; al medir 164 px o menos distribuyen controles
  en dos filas. Toolbar, etiquetas de clips y regla también se compactaron. Se conserva Poppins.
- No se modificaron operaciones de edición ni datos del montaje.

**Pruebas realizadas**
- `npm run typecheck`, `npm test` (**51/51**), `npm run build` y `git diff --check` correctos.
  Dos pruebas nuevas cubren límites/preferencias inválidas y distribución de herramientas según
  ancho/alto, reservando acceso a las que no caben. Permanece el aviso previo de paquetes grandes.
- Navegador aislado: arrastre real a 30/54/80 px dio una/dos/tres columnas. Herramientas a 208 px
  de altura sin desbordamiento; a 85 px aparecen tres herramientas y el botón de sobrante,
  con scrollHeight igual a clientHeight. Menú dentro del viewport; selección de Mano y cierre
  con Escape comprobados. Cabeceras estrechadas a 102 px, sin desbordamiento horizontal.
- Recarga conservó anchos 30/102 px. Regla después de ajustar: clic en 0:01 dio 00:00:01:00
  y clic en 0:00 dio 00:00:00:00. Separador de cabeceras visible con scroll vertical.
- Editor principal observado con columna de herramientas de 28×148 px sin scroll; su montaje
  se conservó. Sin errores de consola en la prueba aislada. Captura guardada fuera del repo.

**Pendientes y siguiente paso**
- Lino debe revisar comodidad y legibilidad de esta escala más pequeña durante edición real.
  Cancelación con Escape a mitad del arrastre no probada manualmente. No se repitieron exportación,
  procesamiento de audio ni captura de micrófono, que no cambian en esta entrega.
- Siguiente paso de Codex: ajustar densidad o límites a partir de la revisión de Lino; mantener
  estos anchos como preferencias de interfaz independientes del proyecto.

### 2026-10-20 — Acoplamiento flexible y adaptación de paneles (Codex)

**Decisiones e implementación**
- Lino pidió divisiones más maleables, guía al mover y adaptación de cada panel, especialmente
  del medidor que se recortaba. Se reemplazaron las cuatro zonas fijas por un árbol de divisiones
  horizontal/vertical. El medidor del Programa es ahora el quinto panel independiente.
- Agarre con Pointer Events: bordes de otro panel crean una división, centro intercambia y borde
  exterior acopla a toda la altura/anchura del área. La guía azul calcula la posición que tendrá
  el panel tras quitarlo de su lugar anterior. Escape/cancelación no confirman el acoplamiento.
- Cada división tiene separador con ratón y flechas. Botón o doble clic en el agarre amplía/restaura;
  menú de posición conserva una alternativa de teclado. Distribución versión 2 persistida localmente,
  validación y migración de zonas antiguas. Los paneles conservan su nodo React: mover no reinicia chat,
  visores ni medidor. No son ventanas flotantes ni pestañas desacopladas.
- `workspaceLayout.ts` reúne operaciones puras de UI y geometría: mínimos por contenido cuando
  caben, reparto dentro del área si la ventana es menor, sin coordenadas negativas ni solapamientos.
  Preferencias de espacio separadas de Project JSON; no se cambian clips, ops ni composición.
- `workspace.css` añade adaptación por contenedor: biblioteca en una columna al estrecharse,
  monitores apilados si el panel es estrecho/alto, desplazamiento interno en tamaños reducidos,
  barra del timeline desplazable y controles de pista en dos filas cuando falta ancho.
- Popovers del timeline portados a body para conservar posición en viewport y evitar recorte por
  contenedores responsivos; se cierran si su timeline queda oculto al ampliar otro panel.
- Medidor adapta orientación, gradiente/recorte/picos y escala; reduce marcas en altura pequeña.
  En vertical muy corto omite el pie redundante Picos (reinicio sigue en L/R), manteniendo barras,
  lectura y extremos 0/-60. No se cambia el cálculo dBFS ni su copia inaudible del Programa.

**Pruebas realizadas**
- `npm run typecheck`, `npm test` (**49/49**), `npm run build` y `git diff --check` correctos;
  permanece el aviso previo de tamaño de paquetes. Se añadieron seis pruebas de acoplamiento,
  intercambio, geometría sin solapamiento, bordes de área completa, migración y redimensión pura.
- UI aislada 1280×720: arrastre real del medidor al borde inferior (cambió a horizontal), Inspector
  al lateral del timeline, acoplamiento de Monitores a toda altura y separador arrastrado con ratón.
  Ampliación/restauración y doble clic del agarre probados; borrador de chat conservado al reubicar.
- Recargar conserva exactamente los rectángulos de los cinco paneles. Medidor a **72×150 px**:
  comprobados L/R, barras, lectura y etiquetas 0/-60 dentro de su tarjeta; también a 72 px de ancho
  y toda altura. Menú del timeline pequeño dentro del viewport y montado en body.
- Editor principal observado a 756×589: cinco paneles dentro de la ventana, sin scroll horizontal
  de página; sin errores de consola en ambas vistas. No se sustituyó el montaje del usuario.
- Captura de la distribución de ejemplo guardada fuera del repo en visualizations. No se repitió
  exportación ni captura de micrófono; la validación trata de espacio e interacción.

**Pendientes y siguiente paso**
- Lino debe revisar comodidad de zonas/guía durante el arrastre y tamaños mínimos en su flujo.
  La automatización comprobó el resultado del arrastre; no capturó una imagen intermedia del gesto
  sostenido ni probó Escape a mitad del gesto. Revisar esos dos casos manualmente.
- En tamaños extremos se usa desplazamiento interno; no se garantiza que todos los controles
  aparezcan simultáneamente en tarjetas arbitrariamente pequeñas. Ventanas flotantes y separación
  de pestañas requieren otra ampliación. Siguen los pendientes previos de reproducción larga/audio.
- Siguiente paso de Codex: ajustar interacción y límites con la revisión de Lino, manteniendo la
  preferencia de dos visores y el tema visual vigente; no rehacer el editor como réplica de Premiere.

### 2026-10-20 — Tarjetas translúcidas, degradado ambiental y Poppins (Codex)

**Decisiones e implementación**
- Lino sustituyó la referencia anterior por un dashboard azul noche, con luz azul arriba,
  ámbar a la derecha y tarjetas delicadas/translúcidas. Solicitó reducir y unificar textos/iconos
  y usar Futura o una alternativa gratuita como Poppins. Se eligió Poppins ya incluida en el repo;
  licencia SIL OFL 1.1 comprobada en el paquete local, sin servicio de fuentes ni dependencia nueva.
- Fondo con gradientes ambientales y paneles con fondos alfa, bordes finos y sombras contenidas.
  La transparencia afecta a la superficie, conservando la opacidad de sus textos/controles.
  Visores interiores neutros; menús más opacos para facilitar su lectura.
- Poppins 400/500/600 empaquetada localmente. Escala común: 10 px controles/texto, 9 px metadatos,
  11 px títulos; iconos de herramientas/barra 14 px y controles de pista 12 px. Códigos de tiempo,
  dBFS y menús también usan Poppins. El selector de fuente muestra su nombre con la fuente del UI.
- Controles del Player reducidos visualmente y espaciadores ajustados para evitar recortar los
  iconos en visores verticales. No se modificaron sus eventos de reproducción/volumen/fullscreen.
- Cabecera del inspector en dos columnas cuando es estrecha; formulario del chat compacto cuando
  la tarjeta es baja, incluido su uso en la zona inferior. Se conserva la distribución del usuario.
- Cambios de presentación: JSON/ops, fuentes de los títulos/subtítulos del montaje y composición
  de video permanecen como estaban. Sin funciones o herramientas de IA nuevas.

**Pruebas realizadas**
- `npm run typecheck`, `npm run build` y `git diff --check` correctos. Compilación incluye los
  archivos locales Poppins 500/600; se conserva el aviso previo de tamaño de paquetes.
- UI aislada 1280×720: dos visores con video, ondas de audio, selección y ajustes; reproducir/pausar
  y actividad del medidor verificados. Menú dentro del viewport (708 px de límite inferior).
  Sin errores de consola en la prueba. CSS aplicado confirma Poppins, texto base 10 px e iconos 14 px.
- Revisión del editor principal a 756×589, sin editar su montaje: chat reubicado por el usuario en
  panel inferior de unos 220 px; tras el ajuste, chat y compositor caben sin desbordar verticalmente.
- Captura real guardada fuera del repo como `ugc-studio-cristal-poppins.png` en visualizations.
  No se repitió la suite de operaciones por este cambio visual ni una exportación nueva.

**Pendientes y siguiente paso**
- Revisar con Lino la delicadeza del fondo, transparencias, brillo y legibilidad de los tamaños
  compactos en su pantalla. Ajustar esos valores desde el tema común con su criterio.
- Mantener las comprobaciones de reproducción larga, sincronía y micrófono como pendientes de
  sesiones anteriores; esta reproducción breve acredita interacción visual, no esos casos.

### 2026-10-20 — Paleta de Lino y luz difusa de borde (Codex)

**Decisiones e implementación**
- Lino aportó su paleta y una referencia de luz difusa que emerge del borde inferior oscuro.
  Se registraron los cinco valores exactos como variables CSS: #C9E0EB, #7392B5, #8350C4,
  #402B47 y #262423. La indicación sustituye la paleta provisional de la primera pasada.
- Superficies gris cálido, acentos denim/lila y violetas oscuros; luz inferior con gradientes
  radiales en paneles, botón Exportar, marca y campo del chat, y borde luminoso contenido.
- Video en denim, texto en lila y audio en violeta oscuro; ondas aclaradas/desaturadas para
  integrarlas en la paleta. Se conservan los colores funcionales de alertas y niveles del medidor.
- Cambio de presentación en CSS, sin nuevas funciones, dependencias ni servicios. Distribución,
  JSON, operaciones y aspecto del video exportado no se modificaron.

**Pruebas realizadas**
- `npm run typecheck`, `npm run build` y `git diff --check` correctos; sigue el aviso previo
  de tamaño de paquetes. No se repitió la suite de operaciones por este ajuste de colores.
- Revisión en el editor principal: cuatro paneles, brillo de borde, botones, clips y ondas.
  Lectura del CSS aplicado en navegador confirma los cinco valores de la referencia.
  Captura real guardada fuera del repo como `ugc-studio-paleta-lino.png` en visualizations.

**Pendiente y siguiente paso**
- Revisar con Lino la intensidad del brillo, contraste y densidad en su pantalla. El siguiente
  ajuste para Codex debe partir de su criterio sobre esta versión; no equivale a aprobación
  de todos los detalles visuales. Sin pruebas nuevas de reproducción, exportación o modelos.

### 2026-10-20 — Primera pasada de diseño de interfaz (Codex)

**Decisiones e implementación**
- Lino pidió un aspecto sobrio, paneles separados/redondeados y degradados basados en sus
  imágenes. Las referencias de botones se interpretaron visualmente, conservando las funciones
  y textos del editor. No se han aprobado nuevos espacios ni una distribución definitiva.
- Tema centralizado en `src/app/studio-theme.css`: grafito, acentos azul/cian y violeta suaves,
  bordes finos, superficies de 15 px de radio, controles compactos y degradado en acciones
  principales. Paleta provisional: Lino indicó que responderá con imágenes de referencia.
- Barra de proyecto con identificador UGC Studio, exportación destacada y restablecimiento
  compacto en ventanas estrechas. Biblioteca, visores, inspector, chat, timeline, clips y medidor
  comparten el nuevo estilo. El campo del chat conserva espacio al reducir la altura del panel;
  el selector de motor tiene desplazamiento interno. Foco visible y movimiento reducido.
- Se añadieron márgenes/separación real entre paneles. Separadores alineados con las tarjetas,
  límites coherentes entre ratón/teclado y comienzo desde las dimensiones visibles al redimensionar.
  Se conserva la distribución local guardada. Sin dependencias o servicios nuevos.
- No se cambiaron el JSON del montaje, sus operaciones ni los estilos de la composición de video.

**Pruebas realizadas**
- `npm run typecheck`, `npm test` (**43/43**), `npm run build` y `git diff --check` correctos.
  Continúa el aviso previo de paquetes de más de 500 kB en la compilación.
- Revisión visual en navegador: proyecto principal con su distribución y prueba aislada a
  1280×720; también se observó la variante estrecha del navegador principal. Dos visores,
  selección, clips/ondas, medidor y campo del chat visibles; sin errores de consola en la prueba.
- Intercambiar Proyecto/Inspector y devolverlos mediante selector; cambiar tamaños con teclado;
  alternar dos visores/pestañas y propiedades/chat; ajustar altura de pistas. Menú de ajustes
  dentro del viewport (límite inferior 708 px en una ventana de 720 px).
- Captura de la app real con montaje de prueba guardada fuera del repo en visualizations.

**Pendientes y siguiente paso**
- Recibir/revisar las próximas referencias de Lino y validar paleta, contraste, densidad y comodidad
  del diseño con él. Esta pasada no acredita su aprobación estética final.
- Probar arrastre físico de cabeceras y tamaños de pantalla adicionales; la comprobación de
  reubicación en esta sesión fue por selector, y la de tamaño por teclado.
- No se repitió exportación ni se hizo una nueva prueba de chat/modelos o micrófono físico:
  las verificaciones de esta entrega se centran en presentación y navegación.
- Siguiente paso para Codex: afinar el tema desde la revisión visual de Lino y mantener sus
  preferencias de dos visores, paneles reubicables y edición reflejada en el timeline.

### 2026-10-20 — Barra del timeline, marcadores y secuencias editables (Codex)

**Decisiones e implementación**
- Lino identificó expresamente el primer icono como «Insert and overwrite sequences as nests
  or individual clips» y el cuarto como «Selection Follows Playhead». Se implementaron los seis
  controles: secuencias, imán, selección enlazada, selección bajo cabezal, marcadores y ajustes.
- Imán integrado con bordes/cabezal/marcadores; se trasladó de la columna a la barra superior.
  Código de tiempo editable HH:MM:SS:FF. Preferencias normalizadas y persistidas localmente:
  ondas, nombres, marcadores, altura de 36–120 px y estados de los cuatro conmutadores.
- Selección enlazada desactivada permite edición manual independiente mediante `editSelection`;
  restaura enlaces de IDs supervivientes y muestra diferencia de sincronía en frames. La llave
  permite desvincular o vincular un video y un audio. Los fragmentos nuevos de cortes independientes
  pueden quedar sin pareja; falta agrupación de enlaces más amplia como en Premiere.
- Selección bajo cabezal actúa al buscar desde regla, código de tiempo, teclado o Programa,
  con destino B y alternativa Audio; respeta límites/candados. No selecciona durante playback.
- Marcadores JSON con nombre/color/tiempo, crear/editar/borrar/ir, M y navegación Shift+M /
  Ctrl/Cmd+Shift+M. Resumen por rangos los remapea; otros movimientos/ripple los dejan absolutos.
- Secuencias JSON: crear copia desde selección, tarjetas en Proyecto, colocar por botón o arrastre
  como bloque anidado o clips individuales. IDs/enlaces se remapean al expandir. Se pueden abrir,
  editar con las mismas ops y volver al montaje. Autoguardado/Guardar mantienen la raíz completa;
  Deshacer es compartido. Los cambios internos actualizan las referencias anidadas.
- Render recursivo de capas e imagen/audio separados para evitar duplicación; fuentes originales
  conservadas, sin video intermedio. Ciclos impedidos al colocar y máximo ocho niveles al renderizar.
  Las tareas de análisis piden abrir la secuencia para acceder a sus medios originales.
- Nuevas herramientas de chat para marcadores y crear/colocar secuencias; estado incluye referencias,
  marcadores y secuencia abierta. No se requiere ningún servicio o dependencia nuevos.
- Se corrigió caché de bundle de export: un proceso abierto conservaba el renderizador anterior.
  Ahora detecta cambios en fuentes/paquetes y reconstruye; reintenta si un empaquetado falla.

**Pruebas realizadas**
- `npm run typecheck`, `npm test` (**43/43**), `npm run build` y `git diff --check` correctos;
  permanece el aviso previo de tamaño de paquetes. Pruebas nuevas: edición independiente, enlaces,
  candados, marcadores/rangos, creación/anidación/expansión/actualización, IDs, ciclos directos,
  preferencias inválidas y selección de clips de video o solo audio bajo el cabezal.
- UI aislada: crear marcador «Gancho», mover solo video 15 frames y ver audio inmóvil con aviso
  +15/-15; Deshacer recupera sincronía. Código de tiempo y selección bajo cabezal funcionan.
  Apagar ondas las retira; cambiar altura 56→60 px cambia las pistas; restaurados después.
- Crear secuencia desde selección y colocar Gancho anidado; abrir sus capas, editar texto,
  volver y ver el cambio. Colocar Plano guardado con primer botón apagado produce clips ordinarios;
  Deshacer recupera el anidado. Recargar conserva preferencias, marcadores y secuencias.
- Comprobado autoguardado **sin salir** de edición interna: tras cambiar texto y recargar reaparece
  el montaje principal completo y el cambio interno persiste; no se sustituye la raíz por la subsecuencia.
- Primera exportación anidada falló por bundle viejo; después de corregirlo, render anidado e
  individual de 2 s completados. Comparación: **60/60 fotogramas decodificados idénticos** y audio
  PCM idéntico (**96240 muestras estéreo**). Incluye texto y audio original; no acredita todos los
  formatos, efectos o niveles de anidación. Medios de prueba fuera del repo.

**Pendientes y siguiente paso**
- Validar con Lino comodidad de la barra y uso en un montaje real. Profundizar pruebas de
  anidación multinivel, secuencias largas, cambios de duración y formatos distintos antes de ampliarlos.
- Mejorar grupos de enlaces tras cortes independientes y generar onda del audio compuesto anidado
  (actualmente es bloque sin onda propia; al abrir se ven las ondas originales).
- Siguen pendientes la sincronía de stems procesados y la confirmación del micrófono físico.
- Continuar desde la validación de Lino; mantener las seis funciones y el proyecto como JSON editable.

### 2026-10-20 — Sobrescritura, controles de pista y grabación de voz (Codex)

**Decisiones e implementación**
- Lino pidió que los videos no se montaran en una misma pista. Se aplicó sobrescritura:
  al colocar, mover o extender video/audio se recorta lo ocupado, conservando los dos extremos
  cuando procede, sus offsets de origen y sus parejas de audio. No corre el montaje posterior.
  Todo pasa por ops y un paso de Deshacer; no se alteran automáticamente solapamientos antiguos.
- Cabeceras ampliadas con candado, destino (nombre azul), seguir ripple optativo, ojo para
  imagen/texto/subtítulos, M y S para audio. Los estados son JSON y se guardan/deshacen.
  Ojo/M/S utilizan la misma composición para Programa y export. M tiene prioridad sobre S;
  se pueden escuchar varias pistas en solo. El bloqueo no afecta la reproducción.
- Candados protegen edición de clips y de sus parejas, destinos y víctimas de sobrescritura.
  Los resúmenes globales piden desbloquear las pistas con clips. Seguir ripple está inicialmente
  desactivado para conservar el comportamiento previo; permite cerrar huecos en pistas optadas.
  El chat consulta estados y dispone de `set_track_state`; no debe desbloquear sin petición.
- Origen y doble clic en Proyecto respetan destino de imagen/audio. Video completo coloca el
  sonido en el destino Audio marcado; si está bloqueado, no se inserta una pareja incompleta.
  La migración de videos antiguos conserva su estrategia de buscar audio libre.
- Lino confirmó incluir grabación de voz. Micrófono en cada pista Audio: permiso explícito del
  navegador, pausa del Programa, contador, detener/añadir y cancelar. Captura con MediaRecorder;
  `/api/record-voice` convierte a WAV local con FFmpeg incluido y obtiene duración con ffprobe.
  Inserta desde el cabezal inicial, crea onda y puede deshacerse. Máximo 10 minutos / 50 MB.
  Al cancelar o cerrar se liberan los tracks del micrófono; no hay envío a servicios externos.
  Si la pista se bloquea, conserva el archivo en Proyecto; si falla el guardado ofrece descargar
  la toma del navegador. Abrir otro proyecto cancela la sesión activa.

**Pruebas realizadas**
- Interfaz aislada: arrastre de B2 a B1 a 3 s sobre un video de 10 s conserva fragmentos
  [0,3), reemplazo [3,5) y [5,10), con tres audios alineados y ondas. Candado impide moverlos;
  ojo oculta imagen sin borrar clips. Botones M/S cambian sus estados y estilos.
- Exportaciones reales: montaje de sobrescritura completado (2 s), salida con B1 oculta y
  Audio 1 silenciada completada (2 s; RGB máximo 0 y amplitud de audio 0 tras decodificar).
- Flujo de guardado de toma probado con audio WebM de prueba de 1.25 s: conversión WAV y
  generación de onda HTTP 200; importado en UI, reproducido (pico -5.7 dBFS) y exportado con
  audio no nulo. La duración contenedora MP4 de 1.28 s incluye redondeo de frames/padding AAC.
  Esta prueba no valida la captura del micrófono físico ni sus permisos. Lino indicó que lo
  probaría; aún no informó el resultado. Medios/pruebas permanecen fuera del repositorio.
- Pruebas automáticas nuevas cubren sobrescribir principio/centro/final/todo y audio independiente,
  movimiento entre pistas, extensión de bordes, offsets, parejas, candados, salida y destinos,
  seguimiento ripple con pistas bloqueadas y serialización. `npm run typecheck`, `npm test`
  (**36/36**), `npm run build` y `git diff --check` correctos. Build mantiene el aviso previo
  de tamaño de paquetes de Vite.

**Pendientes y siguiente paso**
- Confirmar con Lino la captura real y escucha de su micrófono; probar errores de dispositivo,
  permiso revocado y guardado interrumpido en navegador. No se declara esa validación completada.
- Completar desvinculación/revinculación y sincronía de stems procesados; estos siguen independientes.
- Validar montajes complejos y comodidad de controles. Esta primera versión no reproduce todos
  los modos de source patching, sync lock, inserción ripple ni monitorización/latencia de Premiere.
- Continuar desde la prueba de Lino y corregir cualquier fallo real antes de ampliar modos.

### 2026-10-20 — Pistas genéricas, ampliables y audio original visible (Codex)

**Decisiones e implementación**
- Petición de Lino: nombres literales B1, B2, B3… y Audio 1, Audio 2, Audio 3…; sin roles
  prefijados. Se mantienen los IDs internos antiguos para abrir proyectos y herramientas existentes.
- Botones **+ B / + Audio** en la cabecera fija del timeline; herramienta `add_track` para el chat.
  La vista se desplaza a la pista añadida. Normalización conserva pistas adicionales al reabrir.
- Importar/inserir video completo crea un AudioClip del mismo archivo, con onda, rango, offset
  y volumen originales; se silencia el audio embebido del VideoClip para no duplicarlo. No se
  recodifica el medio. Busca una pista de audio libre y crea otra si hay solapamientos.
- Metadatos `hasAudio` verificados localmente con ffprobe. Proyectos anteriores convierten su
  sonido embebido en una operación reversible; Deshacer no dispara de inmediato otra conversión.
  Videos sin sonido y **Solo video / + B2** no crean una pareja de audio.
- Referencias recíprocas `linkedClipId`: movimiento, recorte, cuchilla, slip y borrado operan
  sobre ambas partes. El traslado vertical cambia únicamente la pista elegida; el tiempo sigue
  enlazado. Ripple actualiza también las parejas posteriores situadas en otras pistas de audio.
- Resumen por rangos y quitar silencios conservan los enlaces de cada fragmento. Reconectar un
  archivo actualiza imagen y sonido. Inspector y procesamiento/restauración usan el volumen
  efectivo del audio enlazado. Audios nuevos entran al nivel original y sin fades automáticos.
- Chat recibe nombres, IDs, tipos y enlaces; puede crear pistas y elegirlas por nombre o ID.

**Pruebas realizadas**
- `npm run typecheck`, `npm test` (**27/27**, seis pruebas nuevas), `npm run build` y
  `git diff --check` correctos. Build conserva el aviso de tamaño de paquetes de Vite.
- Operaciones puras: numeración y compatibilidad, creación única, solo imagen/sin sonido,
  sincronía al mover/recortar/cortar/slip/borrar, rangos de resumen, silencios, ripple en pistas
  distintas, limpieza/restauración sin duplicación y reconexión. Se comprueba inmutabilidad.
- Interfaz aislada: proyecto antiguo con tres videos muestra tres audios con ondas alineadas;
  Deshacer retira la conversión y Rehacer la recupera. Arrastrar imagen desplaza su audio;
  cuchilla crea cuatro parejas y Deshacer recupera tres. **+ B / + Audio** muestran B3 y Audio 4.
  Programa reproduce hasta el final y el medidor registra picos de -7.8 dBFS.
- Export real de resumen de 15 s con tres parejas: completado. Comparado con el export anterior
  al separar pistas, el PCM decodificado estéreo a 48 kHz resulta idéntico: 720896 muestras,
  correlación 1.0, diferencia RMS 0 dB y diferencia máxima absoluta 0. Sin duplicación ni cambio
  de ganancia en ese caso. Los archivos de prueba quedan fuera del repositorio.
- Editor principal actualizado: cinco audios enlazados, todos con ondas; botones nuevos y nombres
  visibles correctos. Servidor principal permanece abierto; pestaña/servidor de QA cerrados.

**Pendiente y siguiente paso**
- Falta control de desvincular/revincular. Los stems de limpieza/separación siguen independientes
  y no heredan el vínculo al cortar/mover después. No hay bloqueo global de sincronía de pistas.
- Validar con Lino comodidad al seleccionar parejas, montajes largos y continuidad editorial de
  su video. No inferir calidad creativa por pruebas técnicas ni por igualdad del audio exportado.
- Continuar con esa validación; después abordar desvinculación y sincronía de derivados.

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

### 2026-10-19 — Reproducción fluida (Claude)
- Problema reportado: la vista previa se trababa y repetía partes, sobre todo en los cortes.
- Solución: **proxies** como en Premiere. Al importar, el servidor crea una copia liviana
  (lado corto 540 px, keyframe cada 15 frames) con el ffmpeg que trae Remotion
  (`RenderInternals.callFf`), en `media/proxies/`. `VideoClip.proxySrc` la guarda; el Player usa
  `preview: true` → proxy; la exportación usa siempre el original (probado borrando el proxy).
- Además: `premountFor` (carga el siguiente clip 1 s antes), `pauseWhenBuffering` y
  `acceptableTimeShiftInSeconds` en el video. Proyectos viejos piden su proxy a `/api/proxy`.

### 2026-10-19 — Pantalla negra al reproducir (Claude)
- Causa probable: el usuario descargó el ZIP nuevo en otra carpeta; el proyecto (guardado en el
  navegador) apuntaba a videos que estaban en `media/` de la carpeta vieja → 404 → negro.
- Arreglos: datos fuera del programa en `~/UGC Studio/`; aviso "Archivo no encontrado" en el panel
  y en el monitor; al importar un archivo con el mismo nombre se reconecta solo (`relinkMedia`);
  si el proxy falla se usa el original (onError solo en preview; el export sigue fallando fuerte).
- Probado en navegador: aviso, reconexión y reproducción con fallback.

### 2026-10-19 — Audio, Foley y tipografías (Claude)
- `AudioClip` (volumen, fadeIn/fadeOut en frames) y pistas A1 "Música" / A2 "SFX".
  `normalizeProject()` agrega pistas faltantes a proyectos viejos (se llama al cargar/abrir).
- La duración del video la marcan video/textos/subtítulos; una canción más larga no alarga el
  export y su fade out ocurre donde termina el video (`useVideoConfig` en `AudioLayer`).
- `moveClip(p, id, from, trackId)`: arrastre vertical entre pistas del mismo tipo.
- Foley: carpetas en `~/UGC Studio/Foley/<categoría>`; `GET /api/library`, servidas en `/library`.
  Pestaña "Foley": clic = escuchar, doble clic = agrega en A2 en el cabezal.
  `POST /api/open-folder` abre la carpeta en Explorador/Finder.
- Tipografías: se probó @remotion/google-fonts pero el export falla sin internet; se cambió a
  archivos locales `@fontsource/*` + `@remotion/fonts` (`src/remotion/fonts.ts`, generado con
  pesos 400/700/900 del subset latin). `fontWeightFor` evita negritas falsas (Anton solo 400).
- "+ Texto" deja el texto seleccionado. Timeline: nombres de pista se desplazan con las pistas.
- Probado en navegador: importar video+mp3, Foley a A2, mover A1→A2, fuente Anton, export con
  audio (6 s aunque la canción dura 20 s).

### 2026-10-19 — V2 B-roll + investigación de herramientas (Claude)
- Pista `V2` (video, encima de V1). `addVideoClip(p, media, trackId, from?)`: en V2 entra en el
  cabezal y con volumen 0. Botón "+ B-roll" al pasar el mouse por un video del panel.
- Probado export: V2 tapa a V1 solo durante su clip.
- El usuario preguntó por HyperFrames (HeyGen, github.com/heygen-com/hyperframes, Apache-2.0,
  HTML+GSAP → MP4 con Chrome headless + FFmpeg). Decisión: Remotion sigue siendo la base; HyperFrames
  se integra en la Fase 4 como generador de clips de motion graphics que entran en V2.
  "Hypermotion" no se encontró; pendiente que el usuario mande link.

### 2026-10-19 — Fase 2: chat con IA (Claude)
- Principio "todo gratis" en AGENTS.md. Motor por defecto: Ollama local.
- Flujo: el navegador envía el texto a `/api/chat`; el servidor guarda la conversación (en
  memoria, por `conversationId`) en el formato nativo de cada proveedor y devuelve
  `{text, toolCalls}`; el navegador ejecuta cada herramienta con `executeTool` y devuelve los
  resultados; se repite hasta 12 vueltas. Cambiar motor/modelo inicia conversación nueva.
- Adaptadores: OpenAI-compatible por `fetch` (Ollama, Gemini, Groq, OpenRouter, OpenAI; quita
  `<think>…</think>`), y Claude con el SDK oficial `@anthropic-ai/sdk` (beta messages, effort
  medium, `fallbacks: "default"` salvo Haiku, guarda `response.content` completo).
- `useHistory` ahora guarda el estado en un ref y expone `current()` para que varias
  herramientas seguidas vean el proyecto actualizado. Cada herramienta = un paso de deshacer.
- Voz: MediaRecorder → `transcribeVoice` (Whisper web, idioma "voice-lang", por defecto es).
- Ollama en `127.0.0.1` (no `localhost`: en Windows puede resolver a IPv6 y fallar).
- Probado con un servidor simulado tipo Ollama: lista de modelos, herramientas, errores,
  `<think>` oculto y Ctrl+Z. NO probado con un modelo real (sin red/sin Ollama en la nube).

### 2026-10-19 — Traspaso a ChatGPT (Claude)
- El usuario quiere seguir el proyecto en ChatGPT. Se creó `PROMPT_PARA_CHATGPT.md` con todo el
  contexto (visión, stack, arquitectura, historial, decisiones, pendientes y reglas de trabajo).
  Mantenerlo actualizado si cambia algo importante.

### 2026-10-19 — Primera prueba local del chat con Ollama (Codex)
- Se actualizó la copia local al `main` de GitHub antes de probar. Se instaló Ollama 0.40.5
  y se descargó `qwen3:8b`. PC: RTX 5070 con 12 GB de VRAM, 32 GB de RAM.
- Prueba real en el navegador con un video sintético de 4 s: el chat agregó `PRUEBA IA`
  en T1 desde el frame 0 durante 90 frames (3 s a 30 fps), arriba (`y: 0.18`). Se verificó
  en monitor, línea de tiempo y archivo `.ugcproj.json` guardado. Deshacer quitó el texto,
  Rehacer lo restauró y el autoguardado lo conservó tras recargar la página.
- Se descargó y probó también `qwen3:30b-a3b` (18 GB). Su primera petición, incluida la
  carga del modelo, tardó aproximadamente 69 s. Agregó `MODELO 30B` abajo (`y: 0.72`),
  desde el frame 0 durante 60 frames (2 s). Se verificó en el monitor, la línea de tiempo
  y el proyecto guardado. El PC tiene una RTX 5070 con 12 GB de VRAM; parte del modelo
  se cargó en RAM. Una segunda petición, con el modelo ya cargado, leyó y resumió el proyecto
  sin editarlo en unos 28 s. Quedó seleccionado el modelo de 30B en el editor.
- `npm install` y `npm run typecheck` completados. `npm audit --omit=dev` reportó tres
  avisos de severidad alta en la cadena `multer` → `busboy` → `dicer`; la corrección
  automática propone un cambio mayor de `multer` y no se aplicó en esta prueba.
- Pendiente: probar con un video UGC real y ajustar el prompt si las ediciones lo requieren.
  Tampoco se probó Whisper real en este PC.

### 2026-10-19 — Reproducción, conexión de Ollama y flujo de medios (Codex)
- Lino reportó saltos/bucles visuales en distintos videos y un mensaje de desconexión al escribir
  al chat. Se encontró un video UGC suyo ya importado (23.976 fps; proyecto a 30 fps).
- Reproducción: `App` actualizaba el cabezal en cada frame y reconstruía `inputProps` del
  `Player` en cada actualización. Se aisló el reproductor con `React.memo` y se memoizaron
  `inputProps`, siguiendo la guía oficial de Remotion y un reporte de saltos similares.
  Ese video avanzó hasta el final en la prueba local; **Lino debe confirmar** que
  desapareció el bucle visual en sus casos concretos. No se modificaron los originales ni proxies.
- Chat: el registro mostró `UND_ERR_HEADERS_TIMEOUT` con Ollama 30B; se confundía con
  desconexión. Ahora el servidor recibe la respuesta de Ollama por SSE y reconstruye texto y
  llamadas a herramientas. En la interfaz aparece el estado de conexión y un contador de espera.
  **Probado con Ollama real**: respuesta simple, `get_project_state` y respuesta posterior al
  resultado de la herramienta. No se ha probado aún una edición del video UGC real mediante IA.
- Proyecto: lista/cuadrícula, monitor de Origen junto a Programa por defecto y opción de pestañas
  (preferencia explícita de Lino). Se pueden marcar entrada/salida y colocar el rango como video,
  solo video o solo audio; se añadió A0 Voz a proyectos nuevos y antiguos. Los medios tienen
  arrastre HTML hacia pistas compatibles. El arrastre **requiere validación manual** en el
  navegador de Lino; la prueba automatizada de arrastre no produjo un drop verificable.
- Ondas: el FFmpeg incluido con Remotion no trae `showwavespic`; se decodifica a WAV mono y
  se crea un SVG local. Probado con el audio del video UGC: la onda apareció en A0,
  y Deshacer restauró el proyecto. Se comprobó con una operación pura que un rango marcado
  conserva inicio, duración y volumen correctos en V2/A0. Se exportó un proyecto de prueba de
  1 s con solo audio extraído del video: el MP4 contenía una pista AAC de 1.003 s;
  se retiró el archivo exportado de prueba. `npm run typecheck` y `npm run build` pasaron.
- Pendiente: validación visual por Lino de la reproducción y del arrastre; miniaturas de video;
  clips de video/audio vinculados; probar una edición real por chat y revisar avisos de `multer`.

### 2026-10-19 — Diagnóstico del archivo UGC original (Codex)
- Lino proporcionó el archivo fuente que asocia con el bucle. Se inspeccionó sin modificarlo:
  H.264, 1080 × 1920, 24000/1001 fps, 626 fotogramas y 26.109 s. Los 626 tiempos de
  fotograma crecen de forma regular (~41.708 ms); FFmpeg lo decodificó sin avisos.
- La copia previamente importada tiene igual duración y número de fotogramas, pero distinto
  hash y diferente texto incrustado en al menos un fotograma. Es otra versión del montaje:
  reproducirla en el proyecto no equivale a probar exactamente el archivo recién enviado.
- En UGC Studio se reprodujo la copia importada de principio a fin. Se observaron el cabezal
  y el reloj interno del elemento de video a ~2.5, 5.4 y 8 s: avanzaron sincronizados. En
  capturas de ~4, 15, 18 y 24 s cambiaron imagen y texto. No se reprodujo un retroceso del
  cabezal ni un bucle visual en esos puntos; esto no descarta saltos breves entre muestras.
- Se importó el original en un proyecto aislado (otro origen del navegador, sin alterar el
  proyecto guardado de Lino). Programa avanzó de 0 a 26 s; a ~2.6, 5.1, 7.8, 10.6, 13.7,
  16.4, 19.2, 22.0 y 25.8 s el reloj interno del video coincidió con el cabezal. Las capturas
  mostraron cambios esperados de plano y texto. No se observó bucle en esos puntos, pero el
  muestreo no descarta un salto breve entre capturas. Se cerró la instancia de prueba.
- No hubo cambios de código. Pendiente: confirmar con Lino si el bucle persiste en su pantalla
  y obtener el segundo exacto o una grabación corta para registrar los fotogramas afectados.
  Quedaron una copia de prueba y su proxy en `UGC Studio/media/` porque el intento de borrarlos
  fue rechazado por la política automática del entorno; no están referenciados por su proyecto.

### 2026-10-19 — Investigación del rumbo de producto (Codex)

- Lino pidió detener el avance de funciones para investigar cómo orientar el editor. Aclaró que
  busca dirigir la edición por texto/voz y comprender imagen, sonido y gestos, con todo resultado
  reflejado en el timeline. Quiere organización por espacios con barra inferior; Premiere,
  Resolve y Descript son referencias, no productos que haya que replicar.
- Se verificaron fechas, estado de Git, `AGENTS.md`, `ROADMAP.md`, este historial, tipos del
  proyecto y herramientas del chat. Se consultaron fuentes oficiales de productos, repositorios,
  modelos y artículos de investigación; los enlaces y requisitos derivados están en `ROADMAP.md`.
- Hallazgo del código: el chat actual recibe texto/estado/transcripciones, sin enviar imagen o
  audio al modelo. Remotion compone/renderiza; HyperFrames sigue sin integrar. El modelo del
  proyecto aún no representa capas de ajuste, efectos genéricos o keyframes. El prompt actual
  propone recortar silencios y poner efectos en cortes por defecto; revisar ese criterio a la
  luz del brief y las decisiones de Lino queda como trabajo pendiente.
- Recomendación, todavía propuesta de diseño: conversación persistente, selección contextual,
  análisis audiovisual local con tiempos verificables, operaciones reversibles y variantes.
  Espacios candidatos: Medios, Edición, Audio, Crear y Exportar. Nodos como opción avanzada
  para generación/composición. Se conserva la preferencia ya aprobada de dos visores/pestañas.
- Candidatos investigados, NO instalados ni probados aquí: Qwen3-VL 4B/8B en Ollama, PySceneDetect,
  faster-whisper, CLAP, Chatterbox Multilingual, ACE-Step 1.5 y ComfyUI con video local. Probar
  trabajos pesados de uno en uno en los 12 GB de VRAM; las cifras publicadas no son benchmarks
  de la RTX 5070 de Lino. Primero localizar un plano visualmente y editarlo con Deshacer.
- Licencias: no hay `LICENSE` en la raíz. Remotion tiene condiciones de licencia empresarial;
  revisar su alcance y dependencias antes de prometer uso gratuito para cualquiera. HyperFrames
  publica Apache-2.0. MMAudio tiene código MIT pero pesos no comerciales: se excluye como
  recomendación del flujo de anuncios. No se decidió una migración ni una licencia del proyecto.
- Conexiones opcionales: la documentación actual de OpenAI describe Sign in with ChatGPT para
  planes Plus/Pro elegibles en apps locales/open source. No está implementado. La documentación
  de Anthropic no permite ofrecer login/cuotas de claude.ai a terceros sin aprobación;
  Gemini API ofrece cuota gratuita para ciertos modelos. La vía gratuita local sigue siendo base.
- Cambios de esta sesión: documentación de intención en `AGENTS.md`, investigación y propuesta
  en `ROADMAP.md`, e historial. Ninguna nueva función del programa ni cambio visual. No se
  ejecutaron pruebas audiovisuales o de IA adicionales; los resultados previos siguen separados.
  `npm run typecheck` y `git diff --check` completados sin errores.

### 2026-10-20 — Primera visión local y tratamiento de voz dentro del editor (Codex)

**Decisiones e implementación**
- Lino autorizó continuar con la primera prueba visual y pidió limpiar audio sin salir del
  editor. Se añadieron paneles Visión y Audio al inspector actual. El diseño de espacios con
  barra inferior sigue pendiente de revisión visual con Lino; no se ha hecho ese rediseño.
- Visión: muestreo de imágenes con tiempos de origen (~una por segundo, máximo 60 s), caché por
  archivo/modelo/esquema, miniaturas, búsqueda semántica y segunda verificación mirando imágenes.
  Usa Ollama exclusivamente local: `qwen3-vl:4b-instruct` y `qwen3:8b`; sin transcripción.
  Muestra rangos aproximados, permite ir al Programa y crear dos cortes reversibles. Se invalida
  la aplicación de una búsqueda cuando el clip cambia. El modelo 4B puede omitir coincidencias.
- El alias visual `4b` descargó una variante thinking que agotaba el presupuesto de respuesta;
  se sustituyó por la variante Instruct explícita. El modelo de chat de Lino sigue siendo 30B.
- Audio: Resemble Denoiser ONNX extrae voz mono (duplicada a estéreo); el fondo se obtiene
  restando esa voz al original estéreo. No equivale a separar música y ambiente independientes.
  FFmpeg completo ofrece reducción de ruido y nivelación adicionales. Se incluye preparación
  de dependencias en entorno propio y descarga de 43 MB fijada por revisión/SHA-256.
- Se evaluó inicialmente Demucs, pero se retiró de la integración al encontrar la aclaración
  del autor sobre pesos para fines científicos: [fuente](https://github.com/facebookresearch/demucs/issues/327).
  La alternativa final tiene pesos originales MIT explícitos en la
  [ficha de ResembleAI](https://huggingface.co/ResembleAI/resemble-enhance) y conversión
  [ONNX MIT](https://github.com/skeskinen/resemble-denoise-onnx-inference).
  Se conservaron ambos avisos de licencia. No confundir la licencia del código con la del modelo.
- Todo resultado de audio se aplica con operaciones puras: silencia el original sin modificar
  su archivo, crea pistas alineadas al rango visible y permite restaurar su volumen previo.
  Reprocesar sustituye derivados, sin acumularlos en el timeline. Al separar y limpiar, el
  fondo entra silenciado. Los WAV se añaden a Proyecto y conservan ondas editables.
- Nuevas herramientas de chat: `search_visual`, `split_clip_range`, `process_audio` y
  `restore_original_audio`. El prompt respeta brief, pausas expresivas y Foley motivado.
  Se comparten selección/cabezal; resultados persistentes fuera del repo; cola serial con
  progreso/cancelación. Cambiar rango/posición/volumen durante el proceso impide aplicar audio
  sobre un estado distinto del analizado. No se integraron servicios de pago.

**Pruebas realizadas**
- Video UGC real de ~26 s en un proyecto de navegador aislado, conservando el proyecto de Lino.
  La consulta por el teléfono devolvió dos rangos verificados visualmente (~4.82–8.72 y
  ~10.62–14.52 s). Una búsqueda negativa por un perro en una playa no devolvió coincidencias.
- Se generó un fragmento de 4 s SIN pista de audio y la búsqueda encontró el teléfono mirando
  sus cuatro imágenes; comprobado que esta función no depende de texto hablado.
- En la interfaz: miniaturas, búsqueda en caché, salto al monitor, cortes en bordes y Deshacer.
  Chat Ollama 30B real también buscó el teléfono, llamó a `split_clip_range`, conservó los
  tres fragmentos y confirmó la edición. Deshacer restauró el clip completo en un paso.
  Audio: aplicación, restauración, cancelación y pistas con ondas. Chat Ollama 30B real ejecutó
  separación/limpieza con el motor final y confirmó la acción; un Deshacer eliminó los dos
  derivados, Rehacer los restituyó. Proyecto guardado: original volumen 0, voz 1, fondo 0,
  inicio 0 y 783 frames para las tres piezas a 30 fps.
- Resemble final + FFmpeg sobre 26.1 s: entrada, voz y residuo tienen exactamente 1,151,010
  muestras estéreo a 44.1 kHz; voz final finita, pico ~0.844. La correlación del original
  con la voz antes de nivelar detectó desplazamiento de 0 muestras en el tramo comprobado.
  La reconstrucción voz+residuo antes de nivelar difiere menos de 2e-10. La conversión
  STFT/ISTFT sola se comprobó con distintas longitudes (error máximo <1e-7).
- Preparador de audio ejecutado en este PC; detección de dependencias/modelos y FFmpeg correcta.
  `npm run typecheck`, ocho pruebas `npm test`, `npm run build` y `git diff --check` pasan.
  Build mantiene el aviso de chunks grandes. No se añadieron videos, modelos ni claves al repo.

**Pruebas pendientes y límites**
- Lino debe comparar de oído voz/original y validar inteligibilidad, textura, artefactos,
  sincronía labial y calidad de la mezcla. No se midió mejora perceptual ni se promete calidad
  equivalente a Adobe Podcast. No se integra el enhancer/restaurador de Resemble; saturación
  severa, reverberación y datos perdidos pueden no recuperarse.
- Las pistas derivadas son independientes: mover/cortar el video después requiere ajustar
  también su audio. Vinculación automática, tres stems y límites precisos de planos pendientes.
- Audio limitado a 180 s por tarea; visión a 60 s. Modelos y análisis pueden tardar; el chat
  y sus modelos no forman parte de la cola de trabajos audiovisuales. No hay benchmark general.
- Pendientes anteriores: confirmación de Lino de reproducción sin bucles y arrastre, miniaturas
  de timeline, export completo con derivados, Whisper real y avisos de dependencias `multer`.
  No se verificó el instalador en un equipo limpio ni la ejecución en macOS/Linux.

### 2026-10-20 — ChatGPT dentro del editor, resumen reversible y transcripción precisa (Codex)

**Funciones implementadas y decisiones**
- Selector Motor/Modelo dentro del chat, catálogo real y conversación nueva al cambiar de motor
  o modelo. La selección queda fija durante cada petición. Ollama conserva la vía local gratuita;
  OpenAI API se identifica como opción separada con cobro por uso.
- Sign in with ChatGPT oficial: registro dinámico, retorno local, state/nonce/PKCE, verificación
  de identidad con jose (MIT), renovación y revocación. Credenciales cifradas con DPAPI del usuario
  Windows fuera del repo, nunca en frontend/config.json. Primera versión Windows, una cuenta por
  registro. Se ofrece enlace visible si el navegador bloquea la ventana emergente.
- El usuario completó el acceso oficial. Se comprobó el estado conectado y el permiso de uso del
  plan. No hay que pedirle que vuelva a iniciar sesión. GPT-6.1-Sol quedó seleccionado.
- Se revisó el DevKit SIWC: licencia no comercial, por lo que no se incorporó su código. El cliente
  es propio, basado en la documentación pública. La licencia de publicación del proyecto sigue
  pendiente de decisión de Lino. ChatGPT usa permisos/límites del plan elegible; no es una IA local
  gratuita. El editor no hereda el historial ni el contexto personal de esta conversación.
- Responses con historial explícito, namespace de herramientas, store:false y respuesta completa
  antes de ejecutar. Hallazgo real: el evento final de SIWC podía traer output vacío; se recuperan
  los items completos del flujo únicamente después de response.completed. Un flujo fallido o
  interrumpido no entrega herramientas. La transcripción no usa la conexión SIWC.
- Resumir: get_project_state/read_transcript → create_edit_plan → apply_edit_plan. Validación de
  duración en frames, rangos ordenados, palabras enteras y proyecto sin cambios desde el plan.
  keepTimelineRanges conserva/cierra los mismos rangos en todas las pistas y ajusta trims,
  subtítulos, fades y referencias de audio derivado; un solo paso de Deshacer. También puede
  mostrarse una propuesta antes de aplicarla. La coherencia sigue siendo una decisión editorial.
- Transcripción local: faster-whisper large-v3 CPU int8, marcas por palabra, idioma automático,
  vocabulario de marcas, caché y retranscripción. Código/pesos MIT; revisión fija del modelo
  edaa852ec7e145841d8ffdb056a99866b5f0a478. Entorno propio fuera del repo y preparador Windows;
  ya preparado en este PC. FFmpeg extrae PCM, leído con wave/NumPy para evitar incompatibilidad
  de PyAV 19. Whisper del navegador sigue disponible y el micrófono conserva su motor anterior.
- Se corrigió Whisper del navegador: se trataban subtokens como palabras, generando separaciones
  incorrectas en nombres, contracciones y palabras. Las transcripciones guardan motor/modelo/idioma.
  Los subtítulos antiguos no se sustituyen hasta Volver a transcribir → Generar subtítulos.
- Ollama usa ahora su API nativa, contexto 16K y modo sin thinking/prefill para las plantillas
  Qwen3 antiguas. Se mantienen validaciones aunque el modelo elija rangos incorrectos.
- Exportar tres fragmentos del mismo archivo falló inicialmente con los recursos por defecto
  del compositor. Limitar concurrencia a 2 y caché de video a 1 GiB permitió exportar el caso
  completo; no se afirma haber demostrado una causa única para cualquier fallo de reproducción.

**Pruebas realizadas**
- Acceso real de la cuenta, permiso del plan y catálogo real; inferencia GPT-6.1-Sol con herramientas.
  No se guardaron email, tokens, códigos OAuth ni material audiovisual del usuario en el repo.
- Video UGC real de 26.1 s: large-v3 generó marcas y texto sin la fragmentación previa, con nombres
  de producto y siglas correctos en los casos revisados. No se midió tasa de error general.
- Resumen real GPT-6.1-Sol: tres rangos 0–7.2, 14.6–18.9667 y 22.6667–26.1 s; total 450 frames
  a 30 fps. Conservó gancho, explicación, argumento sobre derechos y llamada a la acción.
  Esto describe el resultado de la prueba; Lino aún debe aprobar su calidad editorial.
- En la interfaz, sobre una copia aislada: solicitud por chat, lectura de transcripción, plan,
  aplicación y tres clips en el timeline. Deshacer recuperó los 783 frames originales en un paso;
  Rehacer recuperó los 450. Se conservó el proyecto de trabajo original del usuario.
- Export MP4 completo: H.264, 30 fps, 450 frames/15.000 s de video; audio AAC 15.019 s por padding.
  Tres muestras comparadas con sus tiempos de origen: diferencia visual media de ~2.1–3.7/255;
  correlación del audio 1.0/1.0/0.995, desfase máximo ~0.31 ms en esas muestras.
- Ollama qwen3:8b nativo consultó el proyecto y respondió su duración. El 30B no resolvió el caso
  exacto de 15 s en esta prueba; validaciones evitaron aplicar rangos incorrectos. No se declara
  igual capacidad editorial entre modelos.
- Pruebas automatizadas cubren agrupación de subtokens, sincronía/rangos/subtítulos/audio, pureza,
  planes obsoletos y palabras partidas, flujo Responses fallido/completo e historial, además de
  OAuth sintético firmado, PKCE/state, restricción de origen y almacenamiento DPAPI sin exposición.
- Comprobaciones finales: npm run typecheck, 15 pruebas npm test, npm run build y git diff --check
  pasan. Build conserva el aviso de chunks grandes; no se hizo una actualización forzada de multer.

**Pruebas pendientes y límites**
- Revisión de Lino del texto, ritmo, continuidad y mezcla del resumen; no prometer perfección ni
  equivalencia con la transcripción interna de ChatGPT. Probar español, ruido y voces superpuestas.
- Renovación por expiración y revocación de una cuenta real; cambios de cuenta, errores de cuotas,
  reinicios durante el acceso y plataformas distintas de Windows. OAuth sintético no sustituye esas pruebas.
- Voz por micrófono, exportación con audio separado/limpiado y vínculo individual video/audio al
  mover o cortar siguen pendientes. El resumen sí aplica rangos conjuntos a todas las pistas.
- Continúan pendientes validación de reproducción sin bucles por Lino, miniaturas de timeline,
  diseño de espacios con su criterio, instalador en equipo limpio y avisos previos de multer.

### 2026-10-20 — Selección múltiple con el mouse (Codex)

**Implementado**
- Recuadro de selección al mantener clic izquierdo y arrastrar desde un espacio vacío del
  timeline o de la zona de archivos de Proyecto. Funciona en lista y cuadrícula, en ambos
  sentidos, seleccionando los elementos que toca. El recuadro no mueve el cabezal.
- Shift/Ctrl/Cmd+clic añade o quita elementos. Arrastrar con modificador suma al conjunto previo;
  clic vacío limpia, Esc limpia y Ctrl/Cmd+A selecciona todo en el panel activo. Esc durante un
  recuadro y pérdida de foco cancelan el gesto y recuperan la selección anterior. Desplazamiento
  automático en bordes; coordenadas del contenido limitadas para arrastres fuera del panel.
- Mover varios clips conserva sus distancias, posiciones entre pistas y orden de composición.
  Límite en frame cero para todo el grupo; cambio vertical solo si todas las pistas destino
  son compatibles. Los tiradores siguen recortando un solo clip. Movimiento y borrado de grupo
  usan ops puras y una transacción de Deshacer. Ripple calcula la unión de huecos por pista.
- Selecciones independientes entre Proyecto y timeline, contador visible y estado accesible.
  Supr en Proyecto no borra una selección anterior del timeline. Abrir otro proyecto limpia
  las selecciones; se eliminan identificadores que ya no existen. El inspector indica la
  selección múltiple y el chat recibe todos sus IDs; acciones locales de un solo clip rechazan
  una selección ambigua en lugar de procesar otro clip por descarte.
- El payload de arrastre de Proyecto admite varios archivos, en su orden del panel, y la
  inserción los agrupa en una operación. Una mezcla de audio/video requiere pista de audio;
  se avisa si se intenta colocarla completa en video. El monitor Origen conserva su rango individual.

**Pruebas realizadas**
- Interfaz real en copia aislada: recuadro seleccionó cuatro clips de dos pistas; arrastre de
  grupo los desplazó 30 frames manteniendo distancias. Un Deshacer recuperó las posiciones.
  Supr eliminó los cuatro y un Deshacer los recuperó. No se cambió el proyecto de trabajo de Lino.
- Proyecto en lista: seleccionó tres archivos con recuadro. Ctrl+clic quitó uno; Supr en ese
  panel no borró clips del montaje. Cuadrícula: otro recuadro seleccionó dos archivos.
- Timeline: recuadro en sentido inverso, Ctrl+clic para pasar de cuatro a cinco y volver a cuatro.
- Pruebas de operaciones: límite conjunto al frame cero, pistas incompatibles, traslado a V2
  sin duplicación, pureza y ripple con huecos solapados sin descontarlos dos veces.
- npm run typecheck, 17 pruebas npm test, npm run build y git diff --check sin errores. Build
  mantiene el aviso previo de chunks grandes.

**Pendiente de validar**
- Arrastre nativo de varios archivos desde Proyecto: la automatización de navegador no produjo
  un drop HTML5 en dos intentos; no se declara probado este gesto. Revisar manualmente con Lino.
- Cancelar a mitad de gesto y selección con desplazamiento automático prolongado; dispositivos
  táctiles/lápiz no cubiertos. Esta selección funciona con clic izquierdo de mouse.
- Las acciones de audio/visión individuales siguen requiriendo un clip o ID explícito. La
  selección múltiple no crea vínculos permanentes entre video y audio ni propiedades de grupo.

### 2026-10-20 — Herramientas básicas, medidor y paneles adaptables (Codex)

**Decisiones y funciones implementadas**
- Lino aprobó herramientas a la izquierda del timeline y medidor a la derecha, y amplió el
  pedido a paneles reubicables/redimensionables. Se mantienen los monitores y el estilo existente.
- Barra con iconos SVG propios y atajos: V selección, A selección hacia delante (Shift limita
  a una pista), C cuchilla (Shift corta todas), B ripple, Y slip, H mano, Z zoom, T texto, S imán,
  +/− y ajustar todo el montaje. No se añadieron botones de herramientas sin implementar.
- Nuevas ops puras slipClip y rippleTrimClip: límites del archivo, duración mínima y transacción
  única de historial. Ripple solo sobre video/audio sin solapamientos y en su propia pista;
  no sustituye el vínculo/sync lock entre pistas, que sigue pendiente. Slip conserva los bordes.
  La previsualización usa las mismas ops que la aplicación final; la cuchilla ajusta tiempos
  de palabras al dividir subtítulos. Texto crea clip en T1, mueve el cabezal y abre Propiedades.
- Medidor L/R a la derecha: pico de muestras de −60 a 0 dBFS, números, caída visual de 28 dB/s,
  pico máximo retenido y aviso rojo al alcanzar/superar 0; botón para reiniciar ambos. Pausa/mute
  muestran silencio y conservan la retención hasta reinicio. No es RMS, LUFS, true peak ni dB SPL.
- ProgramMeter captura una copia de los elementos de audio/video del Programa con captureStream,
  reproduce su volumen/mute mediante ganancias, suma en Web Audio y analiza por canal. La copia
  sale por una ganancia cero: no duplica sonido ni modifica/reconecta la salida audible de Remotion.
  El estándar de captura ignora mute/volume, por lo que esos parámetros se aplican explícitamente.
  Se excluye el monitor Origen. Sin micrófono, modelos nuevos, servicios o dependencias de pago.
  Navegadores sin la API reciben un aviso y mantienen la reproducción original.
- Paneles Proyecto, Monitores, Inspector y Timeline intercambiables entre cuatro zonas mediante
  selector de cabecera; asa de arrastre y destinos sobre los otros paneles. Separadores verticales
  y horizontal con mouse/teclado, tamaños adaptados a ventana, persistencia local independiente
  del proyecto JSON y botón Restablecer paneles. El timeline mueve juntos herramientas/medidor.
  Cambiar zona no desmonta las pestañas del chat ni modifica el proyecto/historial.
- Abrir otro proyecto restablece cabezal a cero y herramienta Selección; conserva la distribución.

**Pruebas realizadas**
- Interfaz en copia aislada: cuchilla creó dos fragmentos con offsets correctos y Deshacer
  recuperó uno. Slip desplazó el origen 30 frames sin cambiar posición/duración. Ripple final
  quitó 30 frames y desplazó los siguientes dos clips de esa pista; se comprobó el resultado
  y se deshizo. A con Shift seleccionó los dos clips siguientes de V1. T creó texto en el punto
  pulsado y abrió Propiedades. Zoom amplió anchuras; Mano desplazó la vista; Ajustar volvió a cero.
- Audio real de calibración estéreo: amplitudes 0.5/0.25 → lecturas −6.0203/−12.0409 dBFS.
  Volumen del clip al 50% → −12.0409/−18.0615. Mute y pausa → silencio; reanudar al terminar
  el archivo volvió a medir correctamente. Tres archivos/pistas al 100% sumaron +3.5/−2.5 dBFS,
  activaron rojo en L; Picos durante pausa borró retención y alerta. Video UGC real también
  produjo lectura de sus canales durante reproducción. No se evaluó sonoridad perceptual.
- Panel Proyecto pasó a la derecha intercambiándose con Inspector. Cambio de ancho por teclado
  y aumento de altura inferior 40 px arrastrando el separador. Recargar conservó posiciones y
  tamaños. Timeline pasó al centro con herramientas/medidor y Monitores abajo; Restablecer
  recuperó la disposición inicial. Proyecto de trabajo de Lino conservado.
- Pruebas automatizadas añadidas para límites/offsets del ripple y slip, pureza, sincronía de
  otras pistas, palabras de subtítulos divididos y conversión de muestras a dBFS/saturación.
- npm run typecheck, 21 pruebas npm test, npm run build y git diff --check pasan. Build conserva
  el aviso previo de chunks grandes. No se incorporaron muestras, videos ni cachés al repositorio.

**Pendiente y límites**
- Validación de Lino de iconos, comodidad, tamaños y calidad de escucha/reproducción con medidor.
- Validar el arrastre HTML5 del asa de cabecera con mouse real; la reubicación por selector sí
  está probada. Ventanas flotantes, anidamiento libre y separar pestañas del Inspector pendientes.
- Safari/Firefox, medios externos/CORS, reproducción a otra velocidad y sesiones largas con
  muchas pistas pendientes. Se probó Chromium de escritorio en Windows. El medidor caracteriza
  la mezcla de previsualización; no reemplaza un análisis del archivo exportado.
- Ripple multitrack con sync lock, rolling edit, slide, pluma y formas no se incluyen en esta barra.

## Siguiente paso sugerido para Codex

Validar con Lino el gesto de selección en su flujo y el arrastre nativo de varios archivos.
Recoger su evaluación de herramientas, medidor y distribución; priorizar después vínculo/sync lock
de video/audio antes de ampliar recortes que afecten múltiples pistas. No dar por aprobado un dock
con ventanas flotantes o un rediseño de espacios sin revisar con Lino la interacción concreta.
Recoger la revisión editorial de Lino del resumen de 15 s y de la nueva transcripción. Ajustar
con ejemplos concretos y verificar reproducción. Después priorizar vínculo individual de video/audio
derivado y export con ese audio. Revisar con Lino el prototipo de espacios antes de rediseñar;
ampliar visión a límites de plano/eventos y Foley sincronizado. Mantener JSON/ops y Deshacer.
