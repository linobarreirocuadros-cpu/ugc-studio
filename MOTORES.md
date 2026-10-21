# Remotion y HyperFrames

## Uso

Remotion sigue siendo el compositor principal de imagen, sonido y exportación. Cada texto,
subtítulo, sólido o rectángulo puede usar Remotion o el runtime oficial local de HyperFrames.
Los archivos originales de video/audio y las capas de ajuste conservan Remotion.

- **Texto → Subtítulos/Gráficos → + Escena animada** crea elementos desde el cabezal.
  Se elige el motor y la duración; la colocación completa ocupa un paso de Deshacer.
- **Propiedades** permite corregir texto, tipografía y estilo por bloque. Los subtítulos
  incluyen una sección de palabras y tiempos relativos en frames. Aplicar estilo a todos
  los subtítulos desbloqueados es una opción explícita.
- **Propiedades/Controles de efectos → Motor y animación** cambia el motor del elemento,
  entrada/salida, duración, desplazamiento, easing, escala activa y fotogramas clave.
  Las claves ajustan posición X/Y en píxeles, escala, rotación y opacidad.
- En el timeline, **HF** indica HyperFrames y **◇** indica parámetros de animación.
  Cortar, recortar, copiar rangos y anidar conserva los datos. Cambiar el motor conserva
  IDs, palabras, tipografía y tiempos; no crea un archivo de video intermedio.

Ejemplos para el chat: «Anima este subtítulo con una entrada suave usando HyperFrames»;
«Cambia la fuente de este bloque»; «Corrige el inicio de la segunda palabra».
La generación manual sin transcripción reparte los tiempos de palabras uniformemente;
no supone alineación automática con la voz. Revisar texto y escucha sigue siendo necesario.

## Contrato técnico

`Project` es la fuente de verdad. `ClipMetadata.renderEngine` es opcional y su ausencia
significa Remotion. `motion` contiene parámetros tipados y validados, no código ejecutable.
Cada edición usa operaciones de `src/project/ops.ts` y comparte Deshacer con el montaje.
El chat ofrece `list_animation_presets`, `create_motion_scene`, `set_motion_parameters`
y `set_caption_word`. Los tiempos de herramientas son segundos; el modelo guarda frames.

Los recortes conservan el origen de animación en `offset` y `sourceDuration`, en frames.
Las claves permanecen relativas a ese origen para evitar reiniciar el movimiento en un corte.
El controlador muestra ese reloj y permite ir a claves que estén dentro del fragmento.

`HyperframesLayer` genera un documento aislado mediante una plantilla de confianza que
escapa los datos y carga las mismas fuentes locales. El runtime oficial descubre animaciones
WAAPI; Remotion le envía su frame y espera confirmación de `__player.renderSeek` antes de
capturarlo. El texto por palabra se resuelve desde los tiempos del mismo CaptionClip.
La composición principal y sus efectos constantes/transiciones envuelven esta escena.
La exportación falla de forma visible si el runtime no prepara el fotograma; no sustituye
silenciosamente el motor. En preview se muestra el error en el monitor.

## Alcance actual

Hay fundido, desplazamiento suave y entrada con escala, con parámetros y claves editables.
Esta integración **no importa ni convierte cualquier composición HTML/GSAP de HyperFrames**:
un archivo externo que no declare texto/capas/parámetros en este contrato no se vuelve
editable automáticamente. SVG/Lottie arbitrarios, efectos avanzados, rampas, automatización
de sonido/color y plantillas externas requieren ampliar primero el modelo y sus operaciones.

Queda pendiente medir sesiones largas y muchos elementos HyperFrames simultáneos, además
de la revisión editorial de Lino en anuncios reales. Los PNG de ambos motores pueden diferir
ligeramente por antialiasing del navegador; no se promete igualdad de píxel ni rendimiento
constante en todos los equipos.

## Dependencia y licencias

Se fija `@hyperframes/core` en **0.8.185**. Su runtime se incluye localmente; no se usan HeyGen
Cloud, CDN, GSAP externo ni servicios de pago para esta integración. La licencia Apache-2.0
del paquete se conserva en `scripts/licenses/hyperframes-core.LICENSE`.
Fuentes: [repositorio oficial](https://github.com/heygen-com/hyperframes),
[runtime](https://github.com/heygen-com/hyperframes/tree/main/packages/core/src/runtime).
La licencia y elegibilidad de uso de Remotion se mantienen separadas; esta integración no
resuelve el pendiente de licencia comercial para trabajo de agencia señalado en el roadmap.

## Verificación

`npm test` cubre validación, operaciones, protección, serialización y herramientas sin IA remota.
`node --import tsx scripts/verify-motion-render.ts <directorio>` genera PNG reales con ambos
motores, variantes a 24/30 fps, recorte y anidación. Requiere Chromium de Remotion disponible.
El directorio por defecto `.qa-motion` contiene resultados temporales y se ignora en Git.
