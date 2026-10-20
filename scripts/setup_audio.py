"""Instala audio local en un entorno privado; pesos MIT con huella verificada."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import venv

if sys.version_info < (3, 10):
    raise SystemExit("Instala Python 3.10 o superior desde python.org y vuelve a intentarlo.")
runtime = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local")) / "UGC Studio" / "runtime" / "audio"
python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if not python.exists():
    venv.EnvBuilder(with_pip=True).create(runtime)
subprocess.run([str(python), "-m", "pip", "install", "onnxruntime>=1.18,<2", "numpy>=1.26,<3", "soundfile>=0.12,<1"], check=True)
model = runtime / "models" / "resemble-denoiser.onnx"
model.parent.mkdir(parents=True, exist_ok=True)
sha = "490640369540d1b0948352b75f880e215863a0de0b95a4b621ef590ee0e04e77"
if not model.exists() or hashlib.sha256(model.read_bytes()).hexdigest() != sha:
    url = "https://raw.githubusercontent.com/skeskinen/resemble-denoise-onnx-inference/577726152f06c8d8d6a4137371a5bd29a9936a87/denoiser.onnx"
    print("Descargando Resemble Denoiser (43 MB, licencia MIT)…", flush=True)
    temporary = model.with_suffix(".download")
    urllib.request.urlretrieve(url, temporary)
    if hashlib.sha256(temporary.read_bytes()).hexdigest() != sha:
        raise SystemExit("La huella del modelo no coincide; no se utilizará el archivo descargado.")
    temporary.replace(model)
for notice in (Path(__file__).parent / "licenses").glob("*.LICENSE"):
    shutil.copyfile(notice, model.parent / notice.name)
subprocess.run([str(python), "-c", "import onnxruntime,numpy,soundfile; print('Dependencias verificadas')"], check=True)
if not shutil.which("ffmpeg"):
    print("Para reducir ruido instala FFmpeg completo (Gyan.FFmpeg en WinGet) y reinicia UGC Studio.")
print(f"Python de audio: {python}")
print("Audio local preparado. En UGC Studio entra en Audio y pulsa Comprobar herramientas.")
