# Progreso

## Estado actual
Fase 0 completa. Se puede importar video, editar en la línea de tiempo, agregar textos y exportar.

## Registro

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

## Siguiente paso sugerido
Fase 1: transcripción con timestamps por palabra y subtítulos automáticos.
