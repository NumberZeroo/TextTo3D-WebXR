import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

/**
 * Dati persistenti per lo scaling a due mani
 */
let twoHandScaleActive = false;
let initialHandDist = 1;
let initialScale = 1;

/* ------------------------------------------------------------------------- */
/* Setup                                                                      */
/* ------------------------------------------------------------------------- */
export function setupControllers(renderer, scene, interactive) {
  const factory = new XRControllerModelFactory();

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    controller.userData = {
      selecting: false,
      pressedKey: null,
      firedThisPress: false,
      grabbed: null,
      grabOffset: new THREE.Vector3(),
    };

    controller.addEventListener('selectstart', () => {
      controller.userData.selecting = true;
      controller.userData.firedThisPress = false;
      attemptGrab(controller, scene);
      checkTwoHandStart(renderer);
    });

    controller.addEventListener('selectend', () => {
      controller.userData.selecting = false;
      controller.userData.firedThisPress = false;
      if (controller.userData.pressedKey) {
        controller.userData.pressedKey.userData.isPressed = false;
        controller.userData.pressedKey = null;
      }
      if (controller.userData.grabbed) {
        controller.userData.grabbed.userData.isGrabbed = false;
        controller.userData.grabbed = null;
      }
      checkTwoHandEnd(renderer);
    });

    // Laser + modello mano
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    line.name = 'ray';
    line.scale.z = 5;
    controller.add(line);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(factory.createControllerModel(grip));
    scene.add(controller, grip);
  }
}

/* Grab logic */
function attemptGrab(controller, scene) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const target = scene.getObjectByName('generatedModel');
  if (!target) return;
  if (raycaster.intersectObject(target, true).length) {
    controller.userData.grabbed = target;
    target.userData.isGrabbed = true;
    // offset locale per distanza costante
    controller.userData.grabOffset.copy(target.position).applyMatrix4(new THREE.Matrix4().copy(controller.matrixWorld).invert());
  }
}

function checkTwoHandStart(renderer) {
  const c0 = renderer.xr.getController(0).userData;
  const c1 = renderer.xr.getController(1).userData;
  if (c0.grabbed && c1.grabbed && c0.grabbed === c1.grabbed) {
    twoHandScaleActive = true;
    const p0 = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getController(0).matrixWorld);
    const p1 = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getController(1).matrixWorld);
    initialHandDist = p0.distanceTo(p1);
    initialScale = c0.grabbed.scale.x; // assume uniform
  }
}

function checkTwoHandEnd(renderer) {
  const c0 = renderer.xr.getController(0).userData;
  const c1 = renderer.xr.getController(1).userData;
  if (!(c0.grabbed && c1.grabbed && c0.grabbed === c1.grabbed)) {
    twoHandScaleActive = false;
  }
}

/* ------------------------------------------------------------------------- */
/* Main per‑frame handler                                                     */
/* ------------------------------------------------------------------------- */
export function handleIntersections(renderer, interactive) {
  const pressedThis = new Set();
  const hoveredThis = new Set();

  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    if (!ctrl) continue;

    // -------------------------------- drag / grab ------------------------
    if (ctrl.userData.grabbed) {
      const obj = ctrl.userData.grabbed;
      const offset = ctrl.userData.grabOffset;
      obj.position.copy(offset).applyMatrix4(ctrl.matrixWorld);
      obj.quaternion.copy(ctrl.quaternion);
    }

    // raycast tastiera solo se non grab
    if (ctrl.userData.grabbed) continue;

    tempMatrix.identity().extractRotation(ctrl.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObjects(interactive, true);
    if (!hits.length) continue;

    let target = hits[0].object;
    while (target && !target.states) target = target.parent;
    if (!target) continue;

    hoveredThis.add(target);
    if (!target.userData.isPressed && target.states.hovered) target.setState('hovered');

    if (
      ctrl.userData.selecting &&
      !ctrl.userData.firedThisPress &&
      target.states.selected &&
      !target.userData.isPressed
    ) {
      ctrl.userData.pressedKey = target;
      ctrl.userData.firedThisPress = true;
      target.setState('selected');
      target.userData.isPressed = true;
    }

    if (target.userData.isPressed) pressedThis.add(target);
  }

  // reset tastiera
  interactive.forEach((obj) => {
    if (obj.userData.isPressed && !pressedThis.has(obj)) {
      obj.userData.isPressed = false;
      if (obj.states?.idle) obj.setState('idle');
    }
    if (!obj.userData.isPressed) {
      if (hoveredThis.has(obj)) {
        if (obj.states?.hovered && obj.currentState !== 'hovered') obj.setState('hovered');
      } else if (obj.currentState !== 'idle' && obj.states?.idle) obj.setState('idle');
    }
  });

  // two‑hand scale
  if (twoHandScaleActive) {
    const c0 = renderer.xr.getController(0);
    const c1 = renderer.xr.getController(1);
    const obj = c0.userData.grabbed;
    if (obj) {
      const p0 = new THREE.Vector3().setFromMatrixPosition(c0.matrixWorld);
      const p1 = new THREE.Vector3().setFromMatrixPosition(c1.matrixWorld);
      const currentDist = p0.distanceTo(p1);
      const scaleFactor = currentDist / initialHandDist;
      const s = initialScale * scaleFactor;
      obj.scale.setScalar(THREE.MathUtils.clamp(s, 0.1, 10));

      // ---- Haptic feedback --------------------------------------------
      const now = performance.now();
      if (!obj.userData.lastHapticTime) {          // prima vibrazione immediata
        //pulseController(c0, 0.1, 50);
        //pulseController(c1, 0.1, 50);
        obj.userData.lastHapticTime = now;
        obj.userData.lastScaleFactor = scaleFactor;
      } else if (Math.abs(scaleFactor - (obj.userData.lastScaleFactor || scaleFactor)) > 0.02 &&
                 now - obj.userData.lastHapticTime > 100) {
        // vibra ogni ±2 % con debounce 100 ms
        //pulseController(c0, 0.1, 50);
        //pulseController(c1, 0.1, 50);
        obj.userData.lastHapticTime = now;
        obj.userData.lastScaleFactor = scaleFactor;
      }
    }
  }
}

/*function pulseController(controller, strength = 0.4, duration = 60) {
  // 1. ottieni SEMPRE il gamepad aggiornato
  const index = controller.inputSource?.gamepad?.index;
  const gp     = (index !== undefined) ? navigator.getGamepads()[index] : controller.gamepad;
  if (!gp) return;

  // 2. Nuova API standard
  const act = gp.hapticActuators?.[0];
  if (act?.pulse) { act.pulse(strength, duration).catch(()=>{}); return; }

  // 3. Fallback legacy (Chrome <M114)
  const vib = gp.vibrationActuator;
  if (vib?.playEffect) {
    vib.playEffect('dual-rumble', {
      duration,
      startDelay: 0,
      strongMagnitude: strength,
      weakMagnitude:  strength,
    }).catch(()=>{});
  }*/