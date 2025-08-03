import * as THREE from 'three';

/**
 * Esegue una chiamata POST al backend per generare un'immagine
 * e la applica come texture a un piano 3D nella scena.
 */
export async function loadGeneratedModel(prompt, scene) {
  try {
    // Chiamata POST al backend tramite proxy definito in vite.config
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP: ${response.status}`);
    }

    const blob = await response.blob(); // L'immagine PNG
    const imageBitmap = await createImageBitmap(blob);
    const texture = new THREE.CanvasTexture(imageBitmap);

    // Crea un piano con la texture
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(geometry, material);
    plane.name = 'generatedModel';

    // Rimuovi modello precedente
    const old = scene.getObjectByName('generatedModel');
    if (old) scene.remove(old);

    scene.add(plane);
    return plane;

  } catch (err) {
    console.error('Errore generazione modello:', err);
    throw err;
  }
}
