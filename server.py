"""Flask back-end for WebXR image generation – DEV version (CPU‑only)

* CORS aperto a qualunque origin per debug locale.
* Token HF hard‑codato (rimuovere prima del deploy).
* Forza **device CPU** e `torch.float32` per evitare l’errore «Torch not compiled with CUDA enabled».
"""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Optional

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS, cross_origin
import torch

# ---------------------------------------------------------------------------
# Config & logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

HF_TOKEN = ""  # ⚠️  solo test locale
HOST = "localhost"
PORT = 5000
DEBUG = True
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---------------------------------------------------------------------------
# Flask & CORS
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"], max_age=86400)

# ---------------------------------------------------------------------------
# Lazy‑loaded pipeline (CPU‑safe)
# ---------------------------------------------------------------------------
pipe: Optional["FluxPipeline"] = None  # type: ignore forward-reference


def _load_pipeline() -> "FluxPipeline":
    """Scarica il modello alla prima richiesta – dispositivo CPU."""
    global pipe  # pylint: disable=global-statement
    if pipe is None:
        logging.info("⏳ Download & init pipeline (CPU)…")
        from huggingface_hub import login
        from diffusers import FluxPipeline

        login(HF_TOKEN)
        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            use_auth_token=HF_TOKEN,
            torch_dtype=torch.float16 if DEVICE.type == "cuda" else torch.float32,
        ).to(DEVICE)

        logging.info("✅ Pipeline pronta in modalità CPU")
    return pipe


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
@cross_origin()
def health():
    return {"status": "ok"}, 200


@app.route("/generate", methods=["POST", "OPTIONS"])
@cross_origin()
def generate():
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "")).strip()
    if not prompt:
        return jsonify({"error": "Prompt mancante"}), 400

    logging.info("✏️  Prompt: %s", prompt)

    try:
        pipeline = _load_pipeline()
        gen = torch.Generator(DEVICE).manual_seed(0)
        image = (
            pipeline(
                prompt,
                guidance_scale=0.0,
                num_inference_steps=4,
                max_sequence_length=256,
                generator=gen,
            ).images[0]
        )
    except Exception as exc:  # noqa: BLE001
        logging.exception("Errore generazione: %s", exc)
        return jsonify({"error": str(exc)}), 500

    img_io = BytesIO()
    image.save(img_io, format="PNG")
    img_io.seek(0)
    logging.info("📦 Immagine generata – %d bytes", len(img_io.getbuffer()))
    return send_file(img_io, mimetype="image/png")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.info("🚀 Back‑end CPU online → http://%s:%s", HOST, PORT)
    app.run(host=HOST, port=PORT, debug=DEBUG)
