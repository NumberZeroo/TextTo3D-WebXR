"""
* CORS aperto a qualunque origin per debug locale.
* Token HF hard‑codato (rimuovere prima del deploy).bled».
"""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Optional

from diffusers import FluxPipeline
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS, cross_origin
import torch

torch.backends.cudnn.benchmark = True

# ---------------------------------------------------------------------------
# Config & logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

HF_TOKEN = "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"  # ⚠️  solo test locale
HOST = "localhost"
PORT = 5000
DEBUG = True
DEVICE = torch.device("cuda")

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
        logging.info("⏳ Download & init pipeline…")
        from huggingface_hub import login
        from diffusers import FluxPipeline

        login(HF_TOKEN)
        pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            torch_dtype=torch.bfloat16,
        ).to(DEVICE)
        pipe.enable_sequential_cpu_offload()
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

        with torch.no_grad():
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

    torch.cuda.empty_cache()

    return send_file(img_io, mimetype="image/png")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.info("🚀 Back‑end CPU online → http://%s:%s", HOST, PORT)
    _load_pipeline() #Warm-up
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)
