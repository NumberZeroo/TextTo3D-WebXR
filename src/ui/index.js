/* ========================================================================== */
/*  File: src/ui/index.js                                                    */
/* ========================================================================== */
import * as THREE from 'three';
import ThreeMeshUI from 'three-mesh-ui';
import { createKeyboard } from './keyboard.js';
import { createSubmitButton } from './submitButton.js';
import { FontJSON, FontImage } from '../utils/constants.js';

export const interactive = []; // shared with controllers.js

export function createUI(rootScene, store) {
  const root = new THREE.Group();
  root.position.set(0, 1.4, -1.2);
  root.name = 'uiRoot';
  rootScene.add(root);

  // pannello testo --------------------------------------------------------
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
  const userText = new ThreeMeshUI.Text({ content: '', fontSize: 0.04 });
  panel.add(userText);
  store.on('typedText', (val) => userText.set({ content: val }));

  // tastiera --------------------------------------------------------------
  const keyboard = createKeyboard(store, interactive);
  keyboard.position.set(0, -0.28, 0);
  root.add(keyboard);

  // bottone INVIA ---------------------------------------------------------
  const submit = createSubmitButton(store);
  submit.position.set(0, -0.58, 0);
  root.add(submit);
  interactive.push(submit);

  return root; // ⬅︎ restituiamo il gruppo UI
}