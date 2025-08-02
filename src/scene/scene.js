/* ========================================================================== */
/*  File: src/scene/scene.js                                                  */
/* ========================================================================== */
import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene();

  /* --------------------------------------------------------------------- */
  /* SKYBOX – Yokohama                                                     */
  /* --------------------------------------------------------------------- */
  const skybox = new THREE.CubeTextureLoader()
    .setPath('/assets/skybox/skybox_chill/')
    .load([
      'posx.jpg', // +X (right)
      'negx.jpg', // -X (left)
      'posy.jpg', // +Y (top)
      'negy.jpg', // -Y (bottom)
      'posz.jpg', // +Z (front)
      'negz.jpg', // -Z (back)
    ]);
  scene.background = skybox;
  scene.environment = skybox; // riflessi PBR

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 3, 2);
  scene.add(dir);

  return scene;
}