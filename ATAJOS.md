# Atajos y navegación de UGC Studio

## Cómo usarlos

1. Abre **Ventana → Atajos de teclado** o pulsa **Ctrl+Alt+K** fuera de un campo de texto.
2. Busca una acción, selecciónala y pulsa **Añadir combinación**. Presiona las teclas y confirma
   la asignación. Si coinciden con otra acción, el diálogo identifica el conflicto.
3. También puedes arrastrar una acción del listado a una tecla del teclado visual. Los botones
   Ctrl, Alt y Shift permiten consultar/asignar combinaciones con modificadores.
4. Pulsa **Guardar atajos** para aplicar. Cancelar descarta el borrador. Puedes añadir varias
   combinaciones, quitar una, restaurar la base e importar/exportar presets JSON de UGC Studio.
5. En **Mouse y rueda** puedes cambiar cada combinación sobre el timeline.

Los atajos dependen del panel activo. Haz clic en Timeline, Origen, Programa o Proyecto, o usa
Shift+1 (Proyecto), Shift+2 (Origen), Shift+3 (Timeline), Shift+4 (Programa). Shift+5 abre Controles de efectos, Shift+6 el Mezclador de pistas y Shift+7 Efectos.
Propiedades y Texto están en Ventana; las combinaciones siguen siendo editables.
No se ejecutan al escribir en el chat, campos, elementos editables o dentro de un diálogo.

## Ejemplos de la base Windows

| Acción | Combinación |
|---|---|
| Selección / cuchilla / ripple / slip | V / C / B / Y |
| Nueva secuencia vacía | Ctrl+N |
| Velocidad / duración constante | Ctrl+R |
| Ganancia / canales de audio | G / Shift+G |
| Agrupar / desagrupar | Ctrl+G / Ctrl+Shift+G |
| Enlazar / desenlazar | Ctrl+L |
| Mano / zoom / texto | H / Z / T |
| Añadir corte / corte en todas las pistas | Ctrl+K / Ctrl+Shift+K |
| Quitar inicio o final hasta el cabezal, cerrando hueco | Q / W |
| Recortar hasta el cabezal sin cerrar hueco | Ctrl+Alt+Q / Ctrl+Alt+W |
| Deshacer / rehacer | Ctrl+Z / Ctrl+Shift+Z |
| Copiar / cortar / pegar selección del timeline | Ctrl+C / Ctrl+X / Ctrl+V |
| Borrar / borrar cerrando hueco | Supr / Shift+Supr o Alt+Retroceso |
| Mover selección 1 / 5 frames | Alt+←→ / Alt+Shift+←→ |
| Deslizar contenido 1 / 5 frames | Ctrl+Alt+←→ / Ctrl+Alt+Shift+←→ |
| Reproducir / detener / avanzar a mayor velocidad | Espacio / K / L repetida |
| Revisar hacia atrás sin audio | J repetida; K detiene |
| Avanzar/retroceder 1 / 5 frames | ←→ / Shift+←→ |
| Edición anterior/siguiente en destinos / todas las pistas | ↑↓ / Shift+↑↓ |
| Entrada / salida en Origen o Programa | I / O |
| Insertar / sobrescribir rango de Origen | Coma / punto |
| Añadir marcador / siguiente / anterior | M / Shift+M / Ctrl+Shift+M |
| Imán / seleccionar clip bajo el cabezal | S / D |
| Ampliar panel bajo el puntero / activo | Acento grave (`) / Shift+acento grave |
| Exportar: abrir opciones, sin iniciar el render | Ctrl+M |

Las combinaciones de puntuación usan posiciones físicas QWERTY US. El selector de rótulos
Español ISO cambia su representación, no las asignaciones. Los teclados latinoamericanos y
otras distribuciones pueden necesitar reasignar esas teclas. AltGr y la composición de texto
no disparan comandos. No se interceptan teclas cuando el navegador no las entrega a la página.

### Rueda sobre el timeline

| Modificadores | Acción inicial |
|---|---|
| Ninguno | Desplazamiento horizontal |
| Ctrl, o Ctrl+Shift | Desplazamiento vertical entre pistas |
| Alt, Alt+Shift, Ctrl+Alt o Ctrl+Alt+Shift | Zoom manteniendo el tiempo bajo el puntero |
| Shift | Desplazamiento horizontal; se puede cambiar |

La base de Windows de Adobe documenta rueda horizontal, Ctrl para vertical y Alt para zoom.
No hay una equivalencia universal de todos los gestos: cambia según zona, plataforma, versión
y preferencias. Shift queda explícito y editable. La tabla anterior trata de la rueda del timeline.
Con la herramienta Zoom,
Alt+clic aleja. Se conservan selección múltiple y Shift+cuchilla para cortar todas las pistas.

### Gestos y controles de los monitores

Referencia de flujo: [ampliación en los monitores de Adobe](https://helpx.adobe.com/premiere/desktop/get-started/source-and-program-monitor-adjustments/adjust-the-magnification-for-the-source-and-program-monitors.html).

- Sobre la imagen: rueda amplía/reduce bajo el puntero; Shift+rueda acelera. Botón central
  sostenido o botón Mano + arrastre desplazan la imagen ampliada. Doble clic vuelve a Ajustar.
- El selector Ajustar/porcentaje cambia solo la ampliación de vista. Full usa el video original;
  1/2, 1/4, 1/8 y 1/16 preparan versiones locales reales, con caché y aviso durante la preparación.
  Las dimensiones se redondean a píxeles pares; no cambia duración, FPS, montaje ni exportación.
  Textos y subtítulos de la composición conservan su nitidez. Los gestos de imagen son fijos por ahora.
- El timecode permite buscar con Enter. La regla del monitor mueve el mismo cabezal del timeline;
  en Origen solo mueve el archivo. Los dos extremos de la barra inferior acotan el tiempo visible;
  ↔ restaura toda la duración. Las marcas I/O usan los mismos comandos y límites existentes.
- Transporte por frames, I/O y pantalla completa en ambos. Programa añade anterior/siguiente
  edición, marcador, localizar fotograma, repetición y mute de monitor. El mute no silencia pistas
  en la exportación. Márgenes seguros 90%/80% son guías de vista.

### Alt en clips del timeline (herramienta Selección)

- **Alt+clic:** selecciona solo la parte pulsada, imagen o audio, sin borrar el enlace.
  Su siguiente arrastre o edición actúa sobre esa selección; el desfase se muestra en frames.
  Un clic normal sin mover vuelve a seleccionar la pareja.
- **Alt+arrastrar desde una selección normal:** copia los clips y sus parejas. Desde una selección
  aislada copia solo esa parte. Los originales quedan en su sitio salvo el tramo sobrescrito si
  colocas encima de ellos. La copia usa la misma sobrescritura y candados del editor.
  Mantén Alt desde el inicio del arrastre. Esc cancela y Ctrl+Z deshace la colocación en un paso.

## Investigación y alcance real (2026-10-20)

- Se consultó la [tabla oficial de Adobe](https://helpx.adobe.com/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html),
  las [preferencias del timeline](https://helpx.adobe.com/au/premiere/desktop/get-started/preferences-and-settings/timeline-preferences.html),
  la [navegación](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/navigate-sequences-in-the-timeline.html)
  y el [manual de referencia de Adobe](https://helpx.adobe.com/archive/en/premiere-pro/cc/2015/premiere_pro_reference.pdf)
  para Alt+rueda bajo el puntero y Alt+clic de Zoom.
- Además se auditó **Adobe Premiere Pro Defaults V6.kys**, Windows/inglés, de la instalación
  Premiere Pro 2026 de este equipo, actualizado el **2026-09-15**. Tiene **629 asignaciones**:
  **394 de Edición y 235 de Color**, incluidos contextos clásicos. El archivo de formato 5
  contiene 396: no se mezclan sus variantes con las del formato 6.
- `src/app/premiereReference.json` conserva los hechos de compatibilidad: identificador de
  comando, modo, contexto y combinación, además de fecha y SHA-256 del archivo auditado.
  No se distribuye el XML .kys original ni se requiere instalar Premiere para usar UGC Studio.
  **Referencia Premiere 2026** permite buscar todas esas asignaciones. Son referencia; no se
  anuncian como funciones ejecutables de UGC Studio.
- El mapa operativo/adaptado contiene **233 comandos: 144 disponibles y 89 pendientes**.
  Los pendientes se distinguen por color y explicación; no ejecutan una función diferente.
  El contexto local tiene prioridad sobre el general. Una reserva pendiente también bloquea
  un comando general para evitar que una combinación haga algo inesperado.
- El preset real confirmó que **Shift+L pertenece a reproducción lenta**, no a selección
  enlazada. Se quitó la combinación anterior de UGC Studio. También diferencia acento grave
  para el panel bajo el mouse y Shift+acento grave para el panel activo. Se añadieron D,
  Shift+↑↓, Shift+=/− y los recortes Ctrl+Alt+Q/W tras revisar el preset.

## Límites y pruebas pendientes

- No están implementados todos los motores de Premiere: rolling, slide, rampas de velocidad,
  pluma/keyframes, transiciones, mezcladores completos, organización avanzada de medios y otros
  comandos siguen pendientes. Reservar su combinación no los implementa. La lista de referencia
  completa tampoco implica que cada comando esté traducido o adaptado al editor.
- J es revisión inversa por seeks sin audio; no es reproducción inversa audiovisual nativa.
  Los comandos Shift+J/L de velocidad lenta y las combinaciones sostenidas de J/K/L aún no existen.
- I/O de Programa son marcas de sesión visibles; no se guardan en Project ni limitan exportación.
  Los marcadores del montaje sí persisten. Los marcadores propios del archivo de Origen faltan.
- Pegar usa un portapapeles interno, las mismas pistas y sobrescritura, conservando enlaces y
  offsets. No es intercambio por portapapeles con otras aplicaciones. Pegar insertando está reservado.
- Ganancia admite 0..4 (hasta aproximadamente +12 dB); la barra horizontal sobre cada onda controla
  nivel constante. La automatización por puntos está pendiente.
- Ctrl+W/N/T, Alt+F4 y otras combinaciones pueden pertenecer al navegador/Windows. Usar el menú
  o reasignar. Los presets JSON de UGC Studio no importan/exportan archivos .kys personalizados.
- Pendiente validar Alt/Ctrl/Shift+rueda con el mouse físico de Lino, distribución de teclado
  y comodidad del editor; también arrastre de comandos a teclas y traslado de presets entre equipos.
  No se probó cada uno de los 144 comandos disponibles manualmente.

## Para continuar el desarrollo

- `commands.ts`: catálogo, valores iniciales, captura por posición, resolución por contexto,
  conflictos y rótulos. No añadir otro listener con teclas fijas en un componente.
- `useShortcuts.ts`: preferencias locales versionadas/revisión 2, fuera de Project JSON.
- `ShortcutEditor.tsx`, `MenuBar.tsx`, `PremiereReference.tsx`: interfaz y referencia completa.
- `gesturePreferences.ts` + listener no pasivo de `Timeline.tsx`: rueda y anclaje de zoom.
- `MonitorViewer.tsx`, `ProgramMonitor.tsx`, `usePreviewQuality.ts` y `server/previewQuality.ts`:
  controles de monitor y preparación local de las resoluciones. `duplicateClipsWithSelection`
  en ops mantiene identidades/enlaces y excluye de la selección los fragmentos sobrescritos.
- `App.tsx`: ejecución de comandos mediante operaciones del proyecto. `SourceMonitor.tsx`
  expone controles de Origen; `useShuttle.ts` gestiona transporte. `copyClips`, `pasteClips` e
  `insertSourceRange` son operaciones puras de `src/project/ops.ts`, una transacción de historial.
- Siguiente paso: contrastar la sensación de rueda/puntuación con Lino y priorizar funciones
  faltantes del catálogo. No convertir 89 reservas o 629 referencias en promesas de funciones.

## Edición con clic derecho

- Clip: menú de cortes/borrado, enlaces, grupos, anidación, etiquetas, velocidad, ganancia,
  canales y congelados. Las acciones incompatibles o protegidas aparecen desactivadas.
- Zona vacía del timeline → **Añadir…**: buscar secuencias y elementos existentes por nombre;
  crear texto, sólido, cuadrado o capa de ajuste. Se coloca en la posición del clic, y las
  secuencias usan la pista B pulsada. **Espacio conserva Reproducir/Pausa**.
- Proyecto → **Nuevo elemento → Secuencia** permite escribir el nombre; hereda tamaño/FPS actuales.
- Barra de volumen: arrastrar verticalmente, Shift para ajuste fino, doble clic a 0 dB;
  flechas arriba/abajo ajustan 1 dB, Home restablece y End silencia. Un arrastre es un Deshacer.
- Velocidad 25–400 % en archivos: enlaza imagen/audio y sobrescribe si extiendes. No retima
  automáticamente subtítulos/textos independientes. Secuencias anidadas y rampas pendientes.
- Congelado: Opciones mantiene todo el clip; Congelar desde cabezal corta y mantiene la cola;
  Insertar abre un hueco en todas las pistas (si no hay candados afectados) y agrega un segmento
  mudo. El sonido de las partes originales sigue reproduciéndose.

## Gestión de Proyecto

- Selecciona elementos y pulsa **Delete** o **Backspace**, o usa papelera/clic derecho. Si están
  usados, se revisan los clips afectados antes de quitar las entradas y sus usos. **Ctrl+Z**
  recupera la operación completa; los archivos originales permanecen en el PC.
- **F2** renombra el elemento. **Ctrl+B** o **Ctrl+/** crea carpeta dentro de Proyecto.
- **Shift+H** alterna la previsualización muda al pasar el mouse en la cuadrícula. **= / −**
  y **Shift+] / Shift+[** ajustan miniaturas. Las combinaciones se editan en el mapa común.
- El contexto del panel decide qué se elimina; escribir nombres/notas/búsqueda nunca borra clips.
- Pie → **Nuevo elemento** reúne secuencia, ajuste, sólidos/negro/transparente, texto y cuadrado.
  Propiedades muestra datos del original, notas y botones para localizar sus usos en secuencias.

## Paneles y menús — 2026-10-21

- Ventana → Presets de ventanas permite guardar distribuciones con pestañas, flotantes internos
  y ventanas en pantallas identificadas. Detectar pantallas solicita el permiso del navegador.
  Aplicar distribución abre/mueve las ventanas; el bloqueo de popups muestra una alternativa.
- Nuevas entradas operativas: Anidar, tres variantes de congelado, Sólido, Ajuste, Rectángulo y
  Presets de ventanas. No se asignaron teclas fijas fuera del mapa central. Las 89 reservas
  siguen en la referencia/edición de atajos, y se ocultan en los menús de trabajo.
- La disponibilidad de ganancia/canales/velocidad/anidar/grupos se comparte con clic derecho;
  una selección incompatible o protegida se deshabilita. No editar una selección antigua del
  timeline desde el panel Proyecto. Marcadores de archivo Origen siguen sin implementarse.
- Marcar selección en Origen marca su archivo completo; las marcas I/O son preferencias de
  ese visor. El foco y la entrada de las ventanas secundarias usan el mismo mapa de comandos.
- Recorrido real: ocho menús inspeccionados; acciones de edición y monitor descritas en
  QUALITY_AUDIT.md. No se ejecutó manualmente cada combinación de los 144 comandos.

## Imán y colocación — 2026-10-21

- **S** (asignación por defecto del mapa) alterna Imán. Cabezal y material entrante de Proyecto,
  Origen/Programa se acercan a cortes, inicios/finales y marcadores. Material entrante también
  ajusta su extremo final y el cabezal existente. La guía ámbar señala el punto elegido.
- **Shift** por defecto ignora el imán mientras arrastras cabezal, insertas o mueves/recortas
  clips. Cambiarlo/desactivarlo en **Atajos → Mouse y rueda → Ignorar imán al arrastrar**.
  La combinación se compara completa; no cambia Alt+arrastrar para duplicar.
- Soltar coloca; cancelar el arrastre no edita el proyecto. Imagen/audio/ambos del monitor
  usan el mismo rango I/O, con salida inclusiva en la interfaz y exclusiva en el modelo.

## Paneles y proyectos — 2026-10-21

- Alt+rueda conserva zoom bajo puntero durante arrastre interno de Proyecto/monitores.
  Usa la combinación elegida en Mouse y rueda, no un listener alternativo con Alt fijo.
  La rueda durante el arrastre HTML5 entre ventanas no está validada.
- Nuevo/abrir añade pestañas de proyecto. Cerrar tiene recuperación desde Archivo → Reabrir
  proyecto cerrado. Undo/Redo se aplican al proyecto activo; sus secuencias comparten historial.
- Vistas y documentos se recuperan con la sesión local. Tras recargar no se recupera la pila
  de Undo ni la conversación del proveedor. No confundir sesión local con guardar un .ugcproj.
- Los 629 atajos de referencia siguen siendo consulta. Catálogo adaptado actual: 233 comandos,
  144 implementados y 89 reservas. No se comprobó manualmente cada combinación.

## Rueda y altura de pistas (2026-10-22)

- Rueda sobre el contenido: desplazamiento horizontal compartido.
- Ctrl+rueda: desplazamiento vertical solo de Video, Audio o Subtítulos bajo el cursor.
- Alt+rueda sobre cabecera/nombre de pista: altura individual (24–180 px).
- Alt+rueda sobre clips/regla: zoom bajo el puntero, también durante arrastres internos.
- El modificador de altura de cabecera se cambia en el editor de Atajos → Gestos.
- Alturas y scroll son preferencias de vista; no entran en el montaje ni su historial.
- Texto: arrastra entre palabras para seleccionar; vuelve a arrastrar la selección o su botón
  al timeline. Shift extiende selección; doble clic corrige una palabra y Escape cancela.

Referencia de flujo: [edición por texto de Adobe](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/edit-sequences-using-text-based-editing.html). Las asignaciones efectivas son las configuradas en UGC Studio.
