# UGC Studio

Editor de video para UGC con flujo tipo Premiere Pro, construido sobre Remotion.

## Cómo abrirlo (sin programar)
1. Instala [Node.js](https://nodejs.org) (botón **LTS**). Solo una vez.
2. Descarga este proyecto: botón verde **Code → Download ZIP** y descomprímelo.
3. Doble clic en:
   - **Windows:** `Abrir UGC Studio (Windows).bat`
   - **Mac:** `Abrir UGC Studio (Mac).command` (la primera vez: clic derecho → Abrir → Abrir)
4. Se abre el editor en tu navegador (usa Chrome). No cierres la ventana negra mientras editas.

La primera vez tarda unos minutos porque instala todo.

## Para programadores
```bash
npm install
npm run dev   # http://localhost:5173
```

- **Importar**: botón en el panel Proyecto. Doble clic en un clip para ponerlo en la línea de tiempo.
- **Editar**: arrastra clips, arrastra los bordes para recortar, Ctrl/Cmd+K corta en el cabezal.
- **Exportar**: elige calidad arriba a la derecha → Exportar. El archivo queda en `out/`.

Ver `ROADMAP.md` para lo que viene y `PROGRESS.md` para el estado actual.
