// UI handler
document.getElementById('generateBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) return alert("Inserisci un prompt valido!");

    try {
        const response = await fetch('http://localhost:5000/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) throw new Error('Errore dal server');
        else
            console.log("the server is ok");

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        // Mostra immagine nella UI
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '300px';
        document.body.appendChild(img);

        // Carica immagine come texture in Three.js
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(url, texture => {
            const geometry = new THREE.PlaneGeometry(2, 2);
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const plane = new THREE.Mesh(geometry, material);
            scene.add(plane);
        });
    } catch (err) {
        console.error("Errore:", err);
        alert("Errore durante la generazione o il caricamento dell'immagine.");
    }
});


// 🔽 Setup base Three.js + WebXR (puoi modificare o estendere)

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight(0xffffff);
scene.add(light);

function animate() {
    renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
    });
}

animate();
