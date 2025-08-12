import * as THREE from 'three';
import ThreeMeshUI from 'three-mesh-ui';
import { FontJSON, FontImage } from '../utils/constants.js';

export function createSubmitButton(store) {
  const btn = new ThreeMeshUI.Block({
    width: 0.32,
    height: 0.09,
    margin: 0.02,
    justifyContent: 'center',
    backgroundColor: new THREE.Color(0x0084ff),
    fontFamily: FontJSON,
    fontTexture: FontImage,
  });

  btn.add(new ThreeMeshUI.Text({ content: 'INVIA', fontSize: 0.04 }));

  btn.setupState({ state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x0084ff) } });
  btn.setupState({ state: 'hovered', attributes: { offset: -0.004, backgroundColor: new THREE.Color(0x0064c8) } });
  btn.setupState({
    state: 'selected',
    attributes: { offset: -0.008, backgroundColor: new THREE.Color(0x004c9c) },
    onSet: () => {
      const text = store.get('typedText');
      console.log('Invia:', text);
      store.emit('submit', text);
    },
  });

  return btn;
}