"""Prepara transcripción local sin alterar Python global ni el repositorio."""
import os
from pathlib import Path
import subprocess
import sys
import venv

if sys.version_info < (3, 10):
    raise SystemExit("Instala Python 3.10 o superior.")
runtime = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local")) / "UGC Studio" / "runtime" / "transcription"
python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if not python.exists():
    venv.EnvBuilder(with_pip=True).create(runtime)
subprocess.run([str(python), "-m", "pip", "install", "faster-whisper>=1.1,<2"], check=True)
subprocess.run([str(python), str(Path(__file__).with_name("transcribe_local.py")), "--prepare"], check=True)
print("Transcripción large-v3 preparada. Selecciona «Local preciso» en UGC Studio.")
