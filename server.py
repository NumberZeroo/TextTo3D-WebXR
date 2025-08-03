from __future__ import annotations

import logging
import os
import subprocess
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional
import sys

import torch
from diffusers import FluxPipeline
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS, cross_origin
from PIL import Image
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config & logging
# ---------------------------------------------------------------------------
torch.backends.cudnn.benchmark = True

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

HF_TOKEN_FLUX = ""
HOST = "localhost"
PORT = 5000
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---------------------------------------------------------------------------
# Flask & CORS
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type"], max_age=86400)

# ---------------------------------------------------------------------------
# Lazy-loaded pipeline
# ---------------------------------------------------------------------------
pipe: Optional["FluxPipeline"] = None


def _load_pipeline() -> "FluxPipeline":
    global pipe
    if pipe is None:
        logging.info("⏳ Download & init FLUX pipeline…")
        from huggingface_hub import login
        login(HF_TOKEN_FLUX)

        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=torch.bfloat16,
        ).to(DEVICE)

        pipe.enable_sequential_cpu_offload()
    return pipe

# ---------------------------------------------------------------------------
# Prompt enhancement
# ---------------------------------------------------------------------------
def enhance_prompt(prompt: str) -> str:
    base = "Create a 3D high-Quality Render {}"
    return base.format(prompt.strip())

# ---------------------------------------------------------------------------
# 3D generation via subprocess (Stable Fast 3D)
# ---------------------------------------------------------------------------
TEMP_DIR = Path("temp_assets")
SF3D_SCRIPT = Path("stable-fast-3d/run.py")  # <-- Path al tuo run.py locale

def generate_3d_model(prompt: str) -> Path:
    # 1. Prompt → PNG (via Flux)
    pipeline = _load_pipeline()
    gen = torch.Generator(DEVICE).manual_seed(0)
    enhanced = enhance_prompt(prompt)

    logging.info("Genero immagine con FLUX per prompt: %s", enhanced)

    with torch.no_grad():
        image = pipeline(
            enhanced,
            guidance_scale=0.0,
            num_inference_steps=4,
            max_sequence_length=256,
            generator=gen,
        ).images[0]

    # 2. Salva immagine temporanea
    TEMP_DIR.mkdir(exist_ok=True)
    uid = uuid.uuid4().hex
    image_path = TEMP_DIR / f"{uid}.png"
    output_dir = TEMP_DIR / f"{uid}_out"
    output_dir.mkdir(parents=True, exist_ok=True)
    image.save(image_path)

    print("📏 Risoluzione immagine:", image.size)

    # 3. Chiamata a stable-fast-3d/run.py via subprocess
    logging.info("🛠 Lancio stable-fast-3d su immagine salvata…")
    cmd = [
        sys.executable,
        str(SF3D_SCRIPT),
        str(image_path),
        "--output-dir",
        str(output_dir),
        "--texture-resolution", "1024",
        "--remesh_option", "triangle",
        "--batch_size", "1"
    ]

    subprocess.run(cmd, check=True)

    # 4. Cerca il .glb generato
    glb_path = output_dir / "0" / "mesh.glb"
    if not glb_path.exists():
        raise FileNotFoundError("Mesh non trovata")

    logging.info("Mesh generata: %s", glb_path)
    return glb_path

# ---------------------------------------------------------------------------
# Route: /generate3d
# ---------------------------------------------------------------------------
@app.route("/generate", methods=["POST", "OPTIONS"])
@cross_origin()
def generate3d():
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "Prompt mancante"}), 400

    try:
        glb_path = generate_3d_model(prompt)

        return send_file(
            glb_path,
            mimetype="model/gltf-binary",
            as_attachment=True,
            download_name="model.glb"
        )

    except subprocess.CalledProcessError as e:
        logging.error("Errore SF3D: %s", e)
        return jsonify({"error": f"Errore SF3D: {e}"}), 500
    except Exception as exc:
        logging.exception("Errore generale: %s", exc)
        return jsonify({"error": str(exc)}), 500

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.info("Back‑end → http://%s:%s", HOST, PORT)
    _load_pipeline()  # Warm-up
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)
