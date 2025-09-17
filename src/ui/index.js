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

  // pannello testo
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

  // tastiera
  const keyboard = createKeyboard(store, interactive);
  keyboard.position.set(0, -0.28, 0);
  root.add(keyboard);

  // bottone INVIA
  const submit = createSubmitButton(store);
  submit.position.set(0, -0.58, 0);
  root.add(submit);
  interactive.push(submit);

  // bottone MUTE
  const muteBtn = new ThreeMeshUI.Block({
    width: 0.32,
    height: 0.09,
    margin: 0.02,
    justifyContent: 'center',
    backgroundColor: new THREE.Color(0x888888),
    fontFamily: FontJSON,
    fontTexture: FontImage,
  });
  muteBtn.add(new ThreeMeshUI.Text({ content: 'Audio', fontSize: 0.04 }));
  muteBtn.setupState({ state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x888888) } });
  muteBtn.setupState({ state: 'hovered', attributes: { offset: -0.004, backgroundColor: new THREE.Color(0xaaaaaa) } });
  muteBtn.setupState({
    state: 'selected',
    attributes: { offset: -0.008, backgroundColor: new THREE.Color(0x555555) },
    onSet: () => {
      store.emit('toggleSound');
    },
  });
  muteBtn.position.set(0.7, 0, 0);
  root.add(muteBtn);
  interactive.push(muteBtn);

  //Bottone per passare da VR ad AR
    const arVrBtn = new ThreeMeshUI.Block({
    width: 0.32,
    height: 0.09,
    margin: 0.02,
    justifyContent: 'center',
    backgroundColor: new THREE.Color(0x888888),
    fontFamily: FontJSON,
    fontTexture: FontImage,
    });
    arVrBtn.add(new ThreeMeshUI.Text({ content: 'AR/VR', fontSize: 0.04 }));
    arVrBtn.setupState({ state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x888888) } });
    arVrBtn.setupState({ state: 'hovered', attributes: { offset: -0.004, backgroundColor: new THREE.Color(0xaaaaaa) } });
    arVrBtn.setupState({
    state: 'selected',
    attributes: { offset: -0.008, backgroundColor: new THREE.Color(0x555555) },
    onSet: () => {
        store.emit('toggleARVR');
    }
    });
    arVrBtn.position.set(0.7, -0.12, 0);
    root.add(arVrBtn);
    interactive.push(arVrBtn);

  return root;
}