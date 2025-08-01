import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import ThreeMeshUI from 'three-mesh-ui';

// MSDF font assets (adjust the path if needed)
import FontJSON from '../fonts/Roboto-msdf.json';
import FontImage from '../fonts/Roboto-msdf.png';

let scene, camera, renderer;
let raycaster;
const tempMatrix = new THREE.Matrix4();

// UI refs
let userText, keyboard, submitButton;
const interactive = [];

// typed text cache
let typedText = '';

init();

// ───────────────────────────────────────────────────────────────────────────────
// INITIALISATION
// ───────────────────────────────────────────────────────────────────────────────
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.6, 3);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x606060);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 3, 2);
  scene.add(dir);

  raycaster = new THREE.Raycaster();

  createUI();
  setupControllers();

  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(loop);
}

// ───────────────────────────────────────────────────────────────────────────────
// UI CREATION
// ───────────────────────────────────────────────────────────────────────────────
function createUI() {
  const root = new THREE.Group();
  root.position.set(0, 1.4, -1.2);
  scene.add(root);

  // Text panel --------------------------------------------------------------
  const panel = new ThreeMeshUI.Block({
    width: 1,
    height: 0.25,
    padding: 0.02,
    justifyContent: 'center',
    fontFamily: FontJSON,
    fontTexture: FontImage,
    backgroundColor: new THREE.Color(0x222222),
    backgroundOpacity: 0.9,
  });
  root.add(panel);

  userText = new ThreeMeshUI.Text({ content: '', fontSize: 0.04 });
  panel.add(userText);

  // Keyboard ---------------------------------------------------------------
  keyboard = new ThreeMeshUI.Keyboard({
    language: 'eng',
    fontFamily: FontJSON,
    fontTexture: FontImage,
  });
  keyboard.position.set(0, -0.28, 0);
  root.add(keyboard);

  // Submit button -----------------------------------------------------------
  submitButton = new ThreeMeshUI.Block({
    width: 0.32,
    height: 0.09,
    margin: 0.02,
    justifyContent: 'center',
    backgroundColor: new THREE.Color(0x0084ff),
    fontFamily: FontJSON,
    fontTexture: FontImage,
  });
  submitButton.add(new ThreeMeshUI.Text({ content: 'INVIA', fontSize: 0.04 }));
  submitButton.position.set(0, -0.58, 0);
  root.add(submitButton);

  setupKeyboardStates();
  setupButtonStates(submitButton, () => {
    console.log('Invia:', typedText);
  });
  interactive.push(submitButton);
}

function setupKeyboardStates() {
  keyboard.keys.forEach((keyBlock) => {
    keyBlock.userData.isPressed = false; // track own pressed state

    // visual states ---------------------------------------------------------
    keyBlock.setupState({ state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x444444) } });
    keyBlock.setupState({ state: 'hovered', attributes: { offset: -0.004, backgroundColor: new THREE.Color(0x666666) } });
    keyBlock.setupState({
      state: 'selected',
      attributes: { offset: -0.008, backgroundColor: new THREE.Color(0x2a4dff) },
      onSet: () => handleKey(keyBlock),
    });
    interactive.push(keyBlock);
  });
}

function setupButtonStates(btn, onSelect) {
  btn.setupState({ state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x0084ff) } });
  btn.setupState({ state: 'hovered', attributes: { offset: -0.004, backgroundColor: new THREE.Color(0x0064c8) } });
  btn.setupState({ state: 'selected', attributes: { offset: -0.008, backgroundColor: new THREE.Color(0x004c9c) }, onSet: onSelect });
}

// ---------------------------------------------------------------------------
// KEY INPUT LOGIC
// ---------------------------------------------------------------------------
function handleKey(keyBlock) {
  const info = keyBlock.info || {};

  // prevent double trigger in same press
  if (keyBlock.userData.isPressed) return;
  keyBlock.userData.isPressed = true;

  // Command keys
  if (info.command) {
    switch (info.command) {
      case 'enter':
        console.log('Invia:', typedText);
        break;
      case 'space':
        typedText += ' ';
        break;
      case 'backspace':
        typedText = typedText.slice(0, -1);
        break;
      case 'shift':
        keyboard.toggleCase();
        break;
      case 'switch':
        keyboard.setNextPanel();
        break;
      case 'switch-set':
        keyboard.setNextCharset();
        break;
      default:
        break;
    }
  } else if (info.input) {
    // Printable character
    typedText += info.input;
  }

  userText.set({ content: typedText });
}

// ───────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ───────────────────────────────────────────────────────────────────────────────
function setupControllers() {
  const factory = new XRControllerModelFactory();
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    controller.userData.selecting = false;
    controller.userData.pressedKey = null;

    controller.addEventListener('selectstart', () => {
      controller.userData.selecting = true;
    });

    controller.addEventListener('selectend', () => {
      controller.userData.selecting = false;
      if (controller.userData.pressedKey) {
        controller.userData.pressedKey.userData.isPressed = false;
        controller.userData.pressedKey = null;
      }
    });

    scene.add(controller);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    line.name = 'ray';
    line.scale.z = 5;
    controller.add(line);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(factory.createControllerModel(grip));
    scene.add(grip);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// RAYCASTING
// ───────────────────────────────────────────────────────────────────────────────
function handleIntersections() {
  // reset visuals for keys not currently pressed ---------------------------
  interactive.forEach((obj) => {
    if (obj.states?.idle && obj.currentState !== 'idle' && !obj.userData.isPressed) {
      obj.setState('idle');
    }
  });

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    if (!controller) continue;

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(interactive, true);
    if (!hits.length) continue;

    let target = hits[0].object;
    while (target && !target.states) target = target.parent;
    if (!target) continue;

    // hover visual ----------------------------------------------------------
    if (!target.userData.isPressed && target.states.hovered) target.setState('hovered');

    // selection -------------------------------------------------------------
    if (
      controller.userData.selecting &&
      target.states.selected &&
      !target.userData.isPressed
    ) {
      controller.userData.pressedKey = target;
      target.setState('selected');
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// LOOP & RESIZE
// ───────────────────────────────────────────────────────────────────────────────
function loop() {
  ThreeMeshUI.update();
  handleIntersections();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
