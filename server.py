from flask import Flask, request, send_file, jsonify
from diffusers import FluxPipeline
import torch
from flask_cors import CORS
from io import BytesIO

app = Flask(__name__)

CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

from huggingface_hub import login

# Inserisci il tuo token direttamente (solo per testing locale)
login("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")

# Caricamento modello FLUX.1-schnell
pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-schnell",
    use_auth_token="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",  # << qui passi il token direttamente
    torch_dtype=torch.bfloat16
)

pipe.enable_model_cpu_offload()  # Offload su CPU se hai poca VRAM

@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json()
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "Prompt mancante"}), 400

    # Generazione immagine
    image = pipe(
        prompt,
        guidance_scale=0.0,
        num_inference_steps=4,
        max_sequence_length=256,
        generator=torch.Generator("cpu").manual_seed(0)
    ).images[0]

    # Salva in memoria e invia
    img_io = BytesIO()
    image.save(img_io, format='PNG')
    img_io.seek(0)
    return send_file(img_io, mimetype='image/png')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
