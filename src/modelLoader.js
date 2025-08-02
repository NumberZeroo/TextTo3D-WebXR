/* ========================================================================== */
/*  File: src/modelLoader.js                                                  */
/* ========================================================================== */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Carica un modello GLB e lo restituisce come Promise<THREE.Object3D>.
 */
export function loadGeneratedModel(prompt, scene) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load('/assets/Astronaut.glb', (gltf) => {
      const model = gltf.scene;
      model.name = 'generatedModel';

      const old = scene.getObjectByName('generatedModel');
      if (old) scene.remove(old);

      scene.add(model);
      resolve(model);
    }, undefined, (err) => {
      console.error('Errore GLB:', err);
      reject(err);
    });
  });
}