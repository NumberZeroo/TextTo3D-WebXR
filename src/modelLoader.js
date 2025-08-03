import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Esegue una chiamata POST al backend per generare un modello GLB
 * e lo carica nella scena con GLTFLoader.
 */
export async function loadGeneratedModel(prompt, scene) {
  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP: ${response.status}`);
    }

    const blob = await response.blob(); // riceve un .glb
    const arrayBuffer = await blob.arrayBuffer();

    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(arrayBuffer, '', resolve, reject);
    });

    const model = gltf.scene;
    model.name = 'generatedModel';
    model.position.set(0, 0, 0); // opzionale

    // Rimuovi modello precedente
    const old = scene.getObjectByName('generatedModel');
    if (old) scene.remove(old);

    scene.add(model);
    return model;

  } catch (err) {
    console.error('Errore generazione modello:', err);
    throw err;
  }
}
