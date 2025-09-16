# TextTo3D-WebXR

This project enables the generation of 3D models from textual prompts. 
The pipeline first produces an image using FLUX, then constructs a 3D model with StableFast, and finally UniRig applies rigging to the output.

## Requirements
- Node.js ≥ 18
- Python ≥ 3.10
- Conda (for the rigging environment)
- WebXR-compatible browser (Chrome, Edge, Oculus Browser, etc.)

## Installation
```bash
git clone https://github.com/NumberZeroo/TextTo3D-WebXR.git
cd TextTo3D-WebXR
```

## Backend (Flux + StableFast + UniRig)
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then navigate into stablefast repo and install the requirements.

```
conda create -n unirig python=3.10 -y
conda activate unirig
```
Navigate into UniRig repo and install the requirements.

## Frontend
```
npm install
```
## Usage
```
1. Use the virtual keyboard to type a prompt
2. Wait for the pipeline (image → 3D model → rigging)
3. Enter VR/WebXR mode
4. Move and resize the model freely
```
