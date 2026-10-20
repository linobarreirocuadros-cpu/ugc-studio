@echo off
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
  "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" pull qwen3-vl:4b-instruct
  if errorlevel 1 goto failed
  "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" pull qwen3:8b
) else (
  ollama pull qwen3-vl:4b-instruct
  if errorlevel 1 goto failed
  ollama pull qwen3:8b
)
if errorlevel 1 goto failed
goto end
:failed
echo No se completo la descarga. Comprueba que Ollama este instalado y abierto.
:end
pause
