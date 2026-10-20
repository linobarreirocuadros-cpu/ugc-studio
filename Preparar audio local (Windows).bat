@echo off
cd /d "%~dp0"
python "%~dp0scripts\setup_audio.py"
if errorlevel 1 echo No se completo la preparacion. Revisa el mensaje de arriba.
pause
