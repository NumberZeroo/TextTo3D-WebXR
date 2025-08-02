/* ========================================================================== */
/*  File: src/app.js                                                          */
/* ========================================================================== */
import * as THREE from 'three';
import ThreeMeshUI from 'three-mesh-ui';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { createScene } from './scene/scene.js';
import { createUI, interactive } from './ui/index.js';
import { setupControllers, handleIntersections } from './controllers.js';
import { loadGeneratedModel } from './modelLoader.js';
import store from './state.js';

export class App {
  async init() {
    /* ── Renderer ────────────────────────────────────────────────────────── */
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const DPR_CAP = 1.2;
    this.renderer.setPixelRatio(Math.min(DPR_CAP, window.devicePixelRatio));
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    document.body.appendChild(VRButton.createButton(this.renderer));

    /* ── Camera ─────────────────────────────────────────────────────────── */
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50);
    this.camera.position.set(0, 1.6, 3);

    /* ── Scene & UI ─────────────────────────────────────────────────────── */
    this.scene   = createScene();
    this.uiGroup = createUI(this.scene, store);

    this.generatedModel = null; // riferimento al modello caricato

    /* ── Model loading on submit ────────────────────────────────────────── */
    store.on('submit', (prompt) => {
      let finalPrompt = prompt;
      if (!finalPrompt && this.renderer.xr.isPresenting) finalPrompt = 'astronauta';
      if (!finalPrompt) return;

      if (this.uiGroup) this.uiGroup.visible = false;

      loadGeneratedModel(finalPrompt, this.scene).then((model) => {
        this.generatedModel = model;
      });
    });

    /* ── XR Controllers ─────────────────────────────────────────────────── */
    setupControllers(this.renderer, this.scene, interactive);

    window.addEventListener('resize', () => this.onResize());
  }

  start() {
    this.renderer.setAnimationLoop(() => this.loop());
  }

  loop() {
    // riferimento alla camera attiva (monoscopic o XR)
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera(this.camera) : this.camera;

    // UI segue la vista quando visibile
    if (this.uiGroup && this.uiGroup.visible) {
      this.uiGroup.position.copy(cam.position);
      this.uiGroup.quaternion.copy(cam.quaternion);
      this.uiGroup.translateZ(-1.2);
      this.uiGroup.translateY(-0.1);
    }

    // Modello segue la vista se presente
    if (this.generatedModel && !this.generatedModel.userData.isGrabbed) {
        const headPos = new THREE.Vector3();
        cam.getWorldPosition(headPos);
        const headQuat = new THREE.Quaternion();
        cam.getWorldQuaternion(headQuat);
        const offsetDir = new THREE.Vector3(0, -1, -3).applyQuaternion(headQuat); // tuo offset
        this.generatedModel.position.copy(headPos).add(offsetDir);
        this.generatedModel.quaternion.copy(headQuat);
}


    ThreeMeshUI.update();
    handleIntersections(this.renderer, interactive);
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}