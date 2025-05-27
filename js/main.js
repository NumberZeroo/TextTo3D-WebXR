// UI handler + Three.js + WebXR image prompt renderer

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let scene, camera, renderer, controller, raycaster;
let vrUIPanel = null, vrButtonMesh = null, isVRUIVisible = false;
let tempMatrix = new THREE.Matrix4();

init();
animate();

function init() {
    // Scene setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    scene.add(new THREE.AmbientLight(0xffffff));

    raycaster = new THREE.Raycaster();
    setupController();

    document.getElementById('generateBtn').addEventListener('click', handlePromptSubmit);
}

async function handlePromptSubmit() {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) return alert("Inserisci un prompt valido!");

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) throw new Error('Errore dal server');

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        // UI 2D
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '300px';
        document.body.appendChild(img);

        // Load as texture
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(url, texture => {
            if (scene.getObjectByName("generatedImage")) {
                scene.remove(scene.getObjectByName("generatedImage"));
            }
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const geometry = new THREE.PlaneGeometry(2, 2);
            const plane = new THREE.Mesh(geometry, material);
            plane.name = "generatedImage";
            scene.add(plane);
        });
    } catch (err) {
        console.error("Errore:", err);
        alert("Errore durante la generazione o il caricamento dell'immagine.");
    }
}

function setupController() {
    controller = renderer.xr.getController(0);
    scene.add(controller);

    controller.addEventListener('selectstart', () => {
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        let intersects = [];
        if (vrButtonMesh) {
            intersects = raycaster.intersectObjects([vrButtonMesh]);
        }


        if (intersects.length > 0 && intersects[0].object.name === "vr_generate_button") {
            console.log("VR Button clicked!");
            document.getElementById('generateBtn').click();
        } else {
            toggleVRPromptUI();
        }
    });
}

function toggleVRPromptUI() {
    if (isVRUIVisible) {
        disposeVRUI();
        isVRUIVisible = false;
        return;
    }

    createVRPanel();
    createVRButton();
    isVRUIVisible = true;
}

function createVRPanel() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(30,30,30,0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.fillText("Prompt pronto!", 20, 130);
    ctx.fillText("Premi il bottone sotto", 20, 170);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.PlaneGeometry(1.5, 0.75);
    vrUIPanel = new THREE.Mesh(geometry, material);

    camera.getWorldPosition(vrUIPanel.position);
    vrUIPanel.position.z -= 2;
    vrUIPanel.position.y += 1.5;
    vrUIPanel.quaternion.copy(camera.quaternion);

    scene.add(vrUIPanel);
}

function createVRButton() {
    const buttonGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.05);
    const buttonMaterial = new THREE.MeshBasicMaterial({ color: 0x007bff });
    vrButtonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);

    vrButtonMesh.name = "vr_generate_button";
    camera.getWorldPosition(vrButtonMesh.position);
    vrButtonMesh.position.z -= 2;
    vrButtonMesh.position.y += 0.9;
    vrButtonMesh.quaternion.copy(camera.quaternion);

    scene.add(vrButtonMesh);
}

function disposeVRUI() {
    if (vrUIPanel) {
        vrUIPanel.material.map.dispose();
        vrUIPanel.material.dispose();
        vrUIPanel.geometry.dispose();
        scene.remove(vrUIPanel);
        vrUIPanel = null;
    }
    if (vrButtonMesh) {
        vrButtonMesh.material.dispose();
        vrButtonMesh.geometry.dispose();
        scene.remove(vrButtonMesh);
        vrButtonMesh = null;
    }
}

function animate() {
    renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
    });
}
