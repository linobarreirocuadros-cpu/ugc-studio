@echo off
title UGC Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar Node.js. Se abrira la pagina de descarga.
  echo  Instala la version LTS, reinicia el computador y vuelve a abrir este archivo.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo  Instalando por primera vez, puede tardar unos minutos...
  call npm install
)
echo.
echo  UGC Studio se esta abriendo en tu navegador.
echo  NO cierres esta ventana mientras uses el editor.
echo.
start "" cmd /c "timeout /t 6 >nul && start http://localhost:5173"
call npm run dev
pause
