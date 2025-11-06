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

HF_TOKEN_FLUX = "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"
HOST = "localhost"
PORT = 5000
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- UniRig rigging integration ------------------------------------------------
# Config di esecuzione per UniRig (Opzione B: usare gli .sh via conda + Git Bash)
UNIRIG_ENV = os.getenv("UNIRIG_ENV", "unirig")  # nome env conda indicato da te
UNIRIG_REPO_ROOT = Path(__file__).parent / "UniRig"
GIT_BASH = Path(os.getenv("GIT_BASH", r"C:\Program Files\Git\bin\bash.exe"))  # path di bash.exe (Git for Windows)
UNIRIG_SEED = int(os.getenv("UNIRIG_SEED", "42"))

# Dì a Bash come attivare conda
CONDA_SH = Path(r"C:\Users\mluke\miniconda3\etc\profile.d\conda.sh")

# ---------------------------------------------------------------------------
# Flask & CORS
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type"], max_age=86400, expose_headers=["X-Model-Id"],)

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

    print("Risoluzione immagine:", image.size)

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

# --- UniRig rigging integration ----------------------------------------------
def rig_with_unirig(input_glb: Path, out_fbx: Path, seed: int = UNIRIG_SEED) -> Path:
    """
    Esegue UniRig *senza modificare gli .sh*:
    - Attiva l'env conda 'unirig' all'interno di Git Bash (sorgendo conda.sh)
    - Lancia launch/inference/generate_skeleton.sh con gli stessi flag
    """
    if not GIT_BASH.exists():
        raise FileNotFoundError(
            f"Git Bash non trovato: {GIT_BASH}. Installa Git for Windows o imposta GIT_BASH env var."
        )
    if not UNIRIG_REPO_ROOT.exists():
        raise FileNotFoundError(
            f"Cartella UniRig non trovata: {UNIRIG_REPO_ROOT}. Imposta UNIRIG_REPO_ROOT env var."
        )
    if not CONDA_SH.exists():
        raise FileNotFoundError(
            f"conoda.sh non trovato: {CONDA_SH}. Imposta CONDA_SH all'etc/profile.d/conda.sh della tua installazione."
        )
    if not input_glb.exists():
        raise FileNotFoundError(f"Input GLB non trovato: {input_glb}")

    out_fbx.parent.mkdir(parents=True, exist_ok=True)

    repo_posix = UNIRIG_REPO_ROOT.resolve().as_posix()
    in_posix = input_glb.resolve().as_posix()
    out_posix = out_fbx.resolve().as_posix()
    conda_sh_posix = CONDA_SH.resolve().as_posix()

    # Attiva l'env conda in bash e poi esegui lo .sh
    bash_line = (
        f'source "{conda_sh_posix}" && '
        f'conda activate {UNIRIG_ENV} && '
        f'cd "{repo_posix}" && '
        f'bash launch/inference/generate_skeleton.sh '
        f'--input "{in_posix}" --output "{out_posix}" --seed {seed}'
    )

    logging.info("Avvio UniRig (env=%s) per il rig…", UNIRIG_ENV)
    subprocess.run([str(GIT_BASH), "-lc", bash_line], check=True)
    logging.info("UniRig completato: %s", out_fbx)

    if not out_fbx.exists():
        raise FileNotFoundError(f"FBX atteso non trovato: {out_fbx}")
    return out_fbx

def skin_with_unirig(input_fbx: Path, out_fbx: Path) -> Path:
    """
    Esegue UniRig skinning:
    - Richiede in input un FBX con lo scheletro (output di generate_skeleton.sh)
    - Restituisce un FBX con i pesi (skinned)
    """
    if not GIT_BASH.exists():
        raise FileNotFoundError(f"Git Bash non trovato: {GIT_BASH}")
    if not UNIRIG_REPO_ROOT.exists():
        raise FileNotFoundError(f"Cartella UniRig non trovata: {UNIRIG_REPO_ROOT}")
    if not CONDA_SH.exists():
        raise FileNotFoundError(f"conda.sh non trovato: {CONDA_SH}")
    if not input_fbx.exists():
        raise FileNotFoundError(f"Input FBX non trovato: {input_fbx}")

    out_fbx.parent.mkdir(parents=True, exist_ok=True)

    repo_posix = UNIRIG_REPO_ROOT.resolve().as_posix()
    in_posix = input_fbx.resolve().as_posix()
    out_posix = out_fbx.resolve().as_posix()
    conda_sh_posix = CONDA_SH.resolve().as_posix()

    bash_line = (
        f'source "{conda_sh_posix}" && '
        f'conda activate {UNIRIG_ENV} && '
        f'cd "{repo_posix}" && '
        f'bash launch/inference/generate_skin.sh '
        f'--input "{in_posix}" --output "{out_posix}"'
    )

    logging.info("Avvio UniRig skinning…")
    subprocess.run([str(GIT_BASH), "-lc", bash_line], check=True)
    logging.info("UniRig skinning completato: %s", out_fbx)

    if not out_fbx.exists():
        raise FileNotFoundError(f"FBX skinnato atteso non trovato: {out_fbx}")
    return out_fbx

def merge_with_unirig(source_fbx: Path, target_mesh: Path, out_path: Path) -> Path:
    """
    Merge del rig nella mesh originale usando gli .sh di UniRig.
    - Se hai fatto lo skin:   source = <...>_skinned.fbx
    - Se hai solo skeleton:   source = <...>_rigged.fbx
    - target = mesh originale (glb/gltf/fbx)
    - out_path = file riggato finale (tipicamente .glb)
    """
    if not GIT_BASH.exists():
        raise FileNotFoundError(f"Git Bash non trovato: {GIT_BASH}")
    if not UNIRIG_REPO_ROOT.exists():
        raise FileNotFoundError(f"Cartella UniRig non trovata: {UNIRIG_REPO_ROOT}")
    if not CONDA_SH.exists():
        raise FileNotFoundError(f"conda.sh non trovato: {CONDA_SH}")
    if not source_fbx.exists():
        raise FileNotFoundError(f"Sorgente (FBX) non trovato: {source_fbx}")
    if not target_mesh.exists():
        raise FileNotFoundError(f"Target (mesh) non trovato: {target_mesh}")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    repo_posix = UNIRIG_REPO_ROOT.resolve().as_posix()
    src_posix  = source_fbx.resolve().as_posix()
    tgt_posix  = target_mesh.resolve().as_posix()
    out_posix  = out_path.resolve().as_posix()
    conda_sh_posix = CONDA_SH.resolve().as_posix()

    bash_line = (
        f'source "{conda_sh_posix}" && '
        f'conda activate {UNIRIG_ENV} && '
        f'cd "{repo_posix}" && '
        f'bash launch/inference/merge.sh '
        f'--source "{src_posix}" --target "{tgt_posix}" --output "{out_posix}"'
    )

    logging.info("Avvio UniRig merge (source=%s, target=%s)…", source_fbx.name, target_mesh.name)
    subprocess.run([str(GIT_BASH), "-lc", bash_line], check=True)
    logging.info("UniRig merge completato: %s", out_path)

    if not out_path.exists():
        raise FileNotFoundError(f"Output atteso non trovato: {out_path}")
    return out_path

def reapply_materials_no_blender(src_glb_with_materials: Path, dst_glb_rigged: Path, out_glb_colored: Path) -> Path:
    """
    Ricopia materiali/texture dal GLB originale (con materiali) al GLB riggato, senza usare Blender.
    Strategia: match per indice (mesh i, primitive j). Copia arrays: samplers, images, textures, materials
    dal sorgente e riassegna gli indici sui primitive del target. Salva GLB finale con le risorse embeddate.
    """
    try:
        from pygltflib import GLTF2, BufferFormat, Image, Texture, Material, Sampler
    except ImportError:
        raise RuntimeError("pygltflib non installato. Esegui: pip install pygltflib")

    if not src_glb_with_materials.exists():
        raise FileNotFoundError(f"Sorgente con materiali non trovato: {src_glb_with_materials}")
    if not dst_glb_rigged.exists():
        raise FileNotFoundError(f"Bersaglio riggato non trovato: {dst_glb_rigged}")

    out_glb_colored.parent.mkdir(parents=True, exist_ok=True)

    # Carica i due GLB
    src = GLTF2().load_binary(str(src_glb_with_materials))
    dst = GLTF2().load_binary(str(dst_glb_rigged))

    # Se il sorgente non ha materiali, non possiamo fare nulla
    if not src.materials or len(src.materials) == 0:
        # Salva una copia del rigged così com'è
        dst.save_binary(str(out_glb_colored))
        return out_glb_colored

    # --- Copia risorse di shading dal sorgente ---
    # Nota: manteniamo l'ordine del sorgente e sovrascriviamo quello del target
    dst.samplers  = src.samplers  or []
    dst.images    = src.images    or []
    dst.textures  = src.textures  or []
    dst.materials = src.materials or []

    # Assicurati che i bufferView delle immagini esistano nel dst
    # (in pratica ricopiamo anche buffer/bufferViews del sorgente se servono)
    # Semplificazione: se il sorgente ha più buffers/bufferViews che il target, li estendiamo.
    # Questo copre i casi comuni dove le texture sono embeddate.
    if src.bufferViews:
        if not dst.bufferViews:
            dst.bufferViews = []
        # Evita conflitti di indice: append semplice
        base_bv = len(dst.bufferViews)
        dst.bufferViews.extend(src.bufferViews)

        # Fix indices in images -> bufferView
        if dst.images:
            for img in dst.images:
                if getattr(img, "bufferView", None) is not None and img.bufferView < 0:
                    img.bufferView = None  # safety
        if src.images:
            for i, s_img in enumerate(src.images):
                if s_img.bufferView is not None:
                    # punta alla nuova posizione (append alla fine)
                    dst.images[i].bufferView = base_bv + s_img.bufferView
                    dst.images[i].mimeType = s_img.mimeType

    if src.buffers:
        if not dst.buffers:
            dst.buffers = []
        # Append del/i buffer contenente/i le immagini
        dst.buffers.extend(src.buffers)

    # --- Riassegna materiali per (mesh, primitive) by index ---
    # Usa la stessa coppia (mesh_idx, prim_idx) del sorgente come "donatore" del material index
    def collect_prim_mats(gltf: GLTF2):
        mats = {}  # (mesh_idx, prim_idx) -> material_index (o None)
        if not gltf.meshes:
            return mats
        for mi, mesh in enumerate(gltf.meshes):
            if not mesh.primitives:
                continue
            for pi, prim in enumerate(mesh.primitives):
                mats[(mi, pi)] = getattr(prim, "material", None)
        return mats

    src_mats = collect_prim_mats(src)
    if dst.meshes:
        for mi, mesh in enumerate(dst.meshes):
            if not mesh.primitives:
                continue
            for pi, prim in enumerate(mesh.primitives):
                donor = src_mats.get((mi, pi), None)
                if donor is not None:
                    prim.material = donor  # assegna l’indice del materiale del sorgente

    # Salva GLB con tutto embed
    dst.save_binary(str(out_glb_colored))
    if not out_glb_colored.exists():
        raise FileNotFoundError(f"GLB colorato atteso non trovato: {out_glb_colored}")
    return out_glb_colored


# ---------------------------------------------------------------------------
# Route: /generate
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

        # --- UniRig rigging integration: esegui subito dopo la generazione SF3D ---
        # Salviamo l'FBX riggato accanto al GLB (es. mesh_rigged.fbx)
        rigged_fbx = glb_path.with_name(glb_path.stem + "_rigged.fbx")
        try:
            rig_with_unirig(glb_path, rigged_fbx, seed=UNIRIG_SEED)

            # Step 2: skinning (FBX con pesi)
            skinned_fbx = glb_path.with_name(glb_path.stem + "_skinned.fbx")
            skin_with_unirig(rigged_fbx, skinned_fbx)

            # Step 3: merge (rig + pesi dentro la mesh originale)
            merged_glb = glb_path.with_name(glb_path.stem + "_rigged.glb")
            merge_with_unirig(skinned_fbx, glb_path, merged_glb)

            #Salviamo l'id del modello
            try:
               model_id = glb_path.parent.parent.name
               if model_id.endswith("_out"):
                   model_id = model_id[:-4]
            except Exception:
               model_id = glb_path.stem

            #Step 4: Colori
            #colored_glb = glb_path.with_name(glb_path.stem + "_rigged_colored.glb")
            #reapply_materials_no_blender(glb_path, merged_glb, colored_glb)

        except subprocess.CalledProcessError as e:
            logging.error("Errore UniRig: %s", e)
            return jsonify({"error": f"Errore UniRig: {e}"}), 500
        # ---------------------------------------------------------------------------

        # Risposta invariata: ritorniamo comunque il GLB come in origine
        response = send_file(
            merged_glb,
            mimetype="model/gltf-binary",
            as_attachment=True,
            download_name="model.glb",
        )

        response.headers["X-Model-Id"] = model_id
        return response

    except subprocess.CalledProcessError as e:
        logging.error("Errore SF3D: %s", e)
        return jsonify({"error": f"Errore SF3D: {e}"}), 500
    except Exception as exc:
        logging.exception("Errore generale: %s", exc)
        return jsonify({"error": str(exc)}), 500

@app.route("/models/<model_id>", methods=["GET"])
def get_saved_model(model_id):
    folder = TEMP_DIR  # = Path("temp_assets")

    # cerchiamo il file riggato finale
    candidates = list(folder.glob(f"{model_id}_out/**/mesh_rigged*.glb")) + \
                 list(folder.glob(f"{model_id}_out/**/mesh_rigged.glb")) + \
                 list(folder.glob(f"{model_id}_out/**/mesh.glb"))


    if not candidates:
        return jsonify({"error": "Modello non trovato"}), 404

    path = candidates[0]
    return send_file(path, mimetype="model/gltf-binary")

# AGGIUNGERE REQUESTTT
@app.route("/generate3dOnly", methods=["POST", "OPTIONS"])
@cross_origin()
def generate3dOnly():
    if request.method == "OPTIONS":
        return "", 204
# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.info("Back-end su http://%s:%s", HOST, PORT)
    _load_pipeline()  # Warm-up
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
