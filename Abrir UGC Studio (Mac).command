#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta instalar Node.js. Se abrirá la página de descarga."
  echo "  Instala la versión LTS y vuelve a abrir este archivo."
  open https://nodejs.org
  read -p "Presiona Enter para cerrar..."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "  Instalando por primera vez, puede tardar unos minutos..."
  npm install
fi
echo ""
echo "  UGC Studio se está abriendo en tu navegador."
echo "  NO cierres esta ventana mientras uses el editor."
echo ""
(sleep 6 && open http://localhost:5173) &
npm run dev
