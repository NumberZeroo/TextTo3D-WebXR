import * as THREE from 'three';
import ThreeMeshUI from 'three-mesh-ui';
import { FontJSON, FontImage } from '../utils/constants.js';

export function createKeyboard(store, interactive) {
  const keyboard = new ThreeMeshUI.Keyboard({
    language: 'eng',
    fontFamily: FontJSON,
    fontTexture: FontImage,
  });

  keyboard.keys.forEach((keyBlock) => {
    keyBlock.userData.isPressed = false;

    // Visual states
    keyBlock.setupState({ state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x444444) } });
    keyBlock.setupState({ state: 'hovered', attributes: { offset: -0.004, backgroundColor: new THREE.Color(0x666666) } });
    keyBlock.setupState({
      state: 'selected',
      attributes: { offset: -0.008, backgroundColor: new THREE.Color(0x2a4dff) },
      onSet: () => handleKey(keyBlock, store),
    });

    interactive.push(keyBlock);
  });

  return keyboard;
}

function handleKey(keyBlock, store) {
  const info = keyBlock.info || {};
  if (keyBlock.userData.isPressed) return;
  keyBlock.userData.isPressed = true;

  let typedText = store.get('typedText');

  if (info.command) {
    switch (info.command) {
      case 'enter':
        store.emit('submit', typedText);
        break;
      case 'space':
        typedText += ' ';
        break;
      case 'backspace':
        typedText = typedText.slice(0, -1);
        break;
      case 'shift':
        // rinvia di un frame ─ evita il lock del main-thread
        //requestAnimationFrame(() => keyBlock.getRoot().toggleCase());
        break;
      case 'switch':
        keyBlock.getRoot().setNextPanel();
        break;
      case 'switch-set':
        keyBlock.getRoot().setNextCharset();
        break;
    }
  } else if (info.input) {
    typedText += info.input;
  }

  store.set('typedText', typedText);
  store.set('needsLayout', true);
}