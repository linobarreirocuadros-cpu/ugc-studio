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
Shift+1 (Proyecto), Shift+2 (Origen), Shift+3 (Timeline), Shift+4 (Programa). Shift+5 abre las
propiedades que existen actualmente; no representa unos Controles de efectos completos.
No se ejecutan al escribir en el chat, campos, elementos editables o dentro de un diálogo.

## Ejemplos de la base Windows

| Acción | Combinación |
|---|---|
| Selección / cuchilla / ripple / slip | V / C / B / Y |
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
y preferencias. Shift queda explícito y editable. Esta entrega trata de la rueda del timeline;
la ampliación/pan de la imagen en los monitores sigue pendiente. Con la herramienta Zoom,
Alt+clic aleja. Se conservan selección múltiple y Shift+cuchilla para cortar todas las pistas.

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
- El mapa operativo/adaptado contiene **220 comandos: 116 disponibles y 104 pendientes**.
  Los pendientes se distinguen por color y explicación; no ejecutan una función diferente.
  El contexto local tiene prioridad sobre el general. Una reserva pendiente también bloquea
  un comando general para evitar que una combinación haga algo inesperado.
- El preset real confirmó que **Shift+L pertenece a reproducción lenta**, no a selección
  enlazada. Se quitó la combinación anterior de UGC Studio. También diferencia acento grave
  para el panel bajo el mouse y Shift+acento grave para el panel activo. Se añadieron D,
  Shift+↑↓, Shift+=/− y los recortes Ctrl+Alt+Q/W tras revisar el preset.

## Límites y pruebas pendientes

- No están implementados todos los motores de Premiere: rolling, slide, cambio de velocidad,
  pluma/keyframes, transiciones, mezcladores completos, organización avanzada de medios y otros
  comandos siguen pendientes. Reservar su combinación no los implementa. La lista de referencia
  completa tampoco implica que cada comando esté traducido o adaptado al editor.
- J es revisión inversa por seeks sin audio; no es reproducción inversa audiovisual nativa.
  Los comandos Shift+J/L de velocidad lenta y las combinaciones sostenidas de J/K/L aún no existen.
- I/O de Programa son marcas de sesión visibles; no se guardan en Project ni limitan exportación.
  Los marcadores del montaje sí persisten. Los marcadores propios del archivo de Origen faltan.
- Pegar usa un portapapeles interno, las mismas pistas y sobrescritura, conservando enlaces y
  offsets. No es intercambio por portapapeles con otras aplicaciones. Pegar insertando está reservado.
- Ganancia usa el volumen existente 0..1: puede atenuar o recuperar hasta 100%, no superar ese techo.
- Ctrl+W/N/T, Alt+F4 y otras combinaciones pueden pertenecer al navegador/Windows. Usar el menú
  o reasignar. Los presets JSON de UGC Studio no importan/exportan archivos .kys personalizados.
- Pendiente validar Alt/Ctrl/Shift+rueda con el mouse físico de Lino, distribución de teclado
  y comodidad del editor; también arrastre de comandos a teclas y traslado de presets entre equipos.
  No se probó cada uno de los 116 comandos disponibles manualmente.

## Para continuar el desarrollo

- `commands.ts`: catálogo, valores iniciales, captura por posición, resolución por contexto,
  conflictos y rótulos. No añadir otro listener con teclas fijas en un componente.
- `useShortcuts.ts`: preferencias locales versionadas/revisión 2, fuera de Project JSON.
- `ShortcutEditor.tsx`, `MenuBar.tsx`, `PremiereReference.tsx`: interfaz y referencia completa.
- `gesturePreferences.ts` + listener no pasivo de `Timeline.tsx`: rueda y anclaje de zoom.
- `App.tsx`: ejecución de comandos mediante operaciones del proyecto. `SourceMonitor.tsx`
  expone controles de Origen; `useShuttle.ts` gestiona transporte. `copyClips`, `pasteClips` e
  `insertSourceRange` son operaciones puras de `src/project/ops.ts`, una transacción de historial.
- Siguiente paso: contrastar la sensación de rueda/puntuación con Lino y priorizar funciones
  faltantes del catálogo. No convertir 104 reservas o 629 referencias en promesas de funciones.
