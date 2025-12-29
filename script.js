import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

let scene, camera, renderer, bottle, ring, rope, lightFlash, bottleMaterial, ropeMaterial, rainSystem;
let clock = new THREE.Clock();

// FULL GAME STATE RESTORED
const gameState = {
    level: 1,
    lives: 3,
    score: 0,
    bottleAngle: 1.57, // Starts flat (90 degrees)
    bottleX: 0,
    bottleVX: 0,
    windForce: 0,
    windTarget: 0,
    isHooked: false,
    paused: false,
    timeLeft: 20,
    maxTime: 20,
    ringPos: new THREE.Vector3(0, 3, 2),
    ringVel: new THREE.Vector3(0, 0, 0),
    mousePos: new THREE.Vector2(),
    skins: {
        1: { name: "EMERALD", color: 0x10b981, emissive: 0x064e3b },
        5: { name: "SAPPHIRE", color: 0x0077ff, emissive: 0x002244 },
        10: { name: "RUBY", color: 0xff0044, emissive: 0x440011 },
        15: { name: "AMETHYST", color: 0x9d00ff, emissive: 0x220044 }
    }
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.FogExp2(0x020205, 0.05);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3.5, 9); // Centered viewpoint
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    lightFlash = new THREE.PointLight(0xffffff, 0, 150);
    lightFlash.position.set(0, 8, 2);
    scene.add(lightFlash);

    createWorld();
    createRain();
    updateUI();
    updateLevelList();
    animate();
}

function createWorld() {
    // 1. NEON TABLE
    const tableGeo = new THREE.BoxGeometry(16, 0.6, 6);
    const tableMat = new THREE.MeshStandardMaterial({ 
        color: 0x111111, 
        emissive: 0x00f2ff, 
        emissiveIntensity: 0.3 
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -1.3;
    scene.add(table);

    // 2. THE BOTTLE (Pivot at bottom)
    bottle = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 32);
    bodyGeo.translate(0, 1, 0); // Shifts pivot to base
    bottleMaterial = new THREE.MeshPhongMaterial(gameState.skins[1]);
    const body = new THREE.Mesh(bodyGeo, bottleMaterial);
    bottle.add(body);
    
    const capGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.4);
    capGeo.translate(0, 2.2, 0);
    bottle.add(new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 })));
    
    bottle.position.y = -1; 
    bottle.rotation.z = gameState.bottleAngle;
    scene.add(bottle);

    // 3. THE RING
    ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.08, 16, 100), 
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(ring);

    // 4. THE ROPE
    ropeMaterial = new THREE.LineBasicMaterial({ color: 0x00f2ff });
    rope = new THREE.Line(new THREE.BufferGeometry(), ropeMaterial);
    scene.add(rope);
}

function createRain() {
    const rainCount = 1000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i++) pos[i] = (Math.random() - 0.5) * 30;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainSystem = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x00f2ff, size: 0.04, transparent: true, opacity: 0.4 }));
    scene.add(rainSystem);
}



function updatePhysics() {
    if (gameState.paused) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    // Timer Logic
    gameState.timeLeft -= dt;
    const timerBar = document.getElementById('timerBar');
    if (timerBar) timerBar.style.width = (gameState.timeLeft / gameState.maxTime * 100) + "%";
    if (gameState.timeLeft <= 0) loseLife("TIME EXPIRED");

    // Weather: Wind & Lightning
    if (Math.random() > 0.98) gameState.windTarget = (Math.random() - 0.5) * (gameState.level * 0.15);
    gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;

    if (gameState.level >= 5 && Math.random() > 0.998) lightFlash.intensity = 150;
    lightFlash.intensity *= 0.9;

    // Ring Pendulum (Follows Mouse)
    const tx = gameState.mousePos.x * 12;
    const ty = (gameState.mousePos.y * 6) + 2;
    gameState.ringVel.x += (tx - gameState.ringPos.x) * 0.15 + (gameState.windForce * 0.5);
    gameState.ringVel.y += (ty - gameState.ringPos.y) * 0.15;
    gameState.ringVel.multiplyScalar(0.85);
    gameState.ringPos.add(gameState.ringVel.clone().multiplyScalar(dt * 10));
    ring.position.copy(gameState.ringPos);

    // Update Rope
    rope.geometry.setFromPoints([new THREE.Vector3(0, 10, 0), gameState.ringPos]);

    // Hooking Detection
    const capWorldPos = new THREE.Vector3(0, 2.2, 0).applyMatrix4(bottle.matrixWorld);
    const dist = ring.position.distanceTo(capWorldPos);

    if (dist < 0.7) {
        ring.material.color.set(0x39ff14); // Proximity feedback
        if (dist < 0.4) gameState.isHooked = true;
    } else {
        ring.material.color.set(0xffffff);
    }

    if (gameState.isHooked) {
        const targetAngle = Math.atan2(ring.position.x - bottle.position.x, ring.position.y - bottle.position.y);
        gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.15;
        if (dist > 1.4) gameState.isHooked = false;
    } else {
        if (gameState.bottleAngle < 1.57) gameState.bottleAngle += 0.05; // Fall down
        gameState.bottleVX += gameState.windForce * 0.02;
        gameState.bottleX += gameState.bottleVX;
        gameState.bottleVX *= 0.95;
    }

    // Constraints & Rotation
    if (gameState.bottleAngle < -0.1) gameState.bottleAngle = -0.1;
    if (gameState.bottleAngle > 1.57) gameState.bottleAngle = 1.57;
    bottle.rotation.z = gameState.bottleAngle;
    bottle.position.x = gameState.bottleX;

    // Rain Movement
    const rainArr = rainSystem.geometry.attributes.position.array;
    for (let i = 1; i < rainArr.length; i += 3) {
        rainArr[i] -= 0.2;
        rainArr[i - 1] += gameState.windForce;
        if (rainArr[i] < -5) {
            rainArr[i] = 15;
            rainArr[i - 1] = (Math.random() - 0.5) * 30;
        }
    }
    rainSystem.geometry.attributes.position.needsUpdate = true;

    // Game Rules
    if (Math.abs(gameState.bottleX) > 7.5) loseLife("BOTTLE SLID OFF");
    if (Math.abs(gameState.bottleAngle) < 0.1 && !gameState.isHooked && Math.abs(gameState.windForce) < 0.06) {
        winLevel();
    }
}

function updateUI() {
    document.getElementById("score").textContent = gameState.score;
    document.getElementById("level").textContent = gameState.level;
    const lDisplay = document.getElementById("livesDisplay");
    if (lDisplay) lDisplay.textContent = "❤️".repeat(gameState.lives);
    
    // Skins Restoration
    const skinSet = gameState.level >= 15 ? 15 : (gameState.level >= 10 ? 10 : (gameState.level >= 5 ? 5 : 1));
    const skin = gameState.skins[skinSet];
    const sName = document.getElementById("skin-name");
    if (sName) sName.textContent = skin.name;
    
    if (bottleMaterial) {
        bottleMaterial.color.setHex(skin.color);
        bottleMaterial.emissive.setHex(skin.emissive);
    }
    if (ropeMaterial) ropeMaterial.color.setHex(skin.color);
}

function updateLevelList() {
    const list = document.getElementById("levelList");
    if (!list) return;
    list.innerHTML = "";
    for(let i = 1; i <= gameState.level + 2; i++) {
        const li = document.createElement("li");
        li.className = `level-item ${i === gameState.level ? 'active' : ''}`;
        li.textContent = `LEVEL ${i} ${i < gameState.level ? '✓' : ''}`;
        list.appendChild(li);
    }
}

function winLevel() {
    gameState.score += 100;
    gameState.level++;
    gameState.timeLeft = gameState.maxTime;
    resetPosition();
    updateUI();
    updateLevelList();
}

function loseLife(reason) {
    gameState.lives--;
    updateUI();
    if (gameState.lives <= 0) {
        document.getElementById('deathReason').innerText = reason;
        document.getElementById('gameOverOverlay').classList.remove('hidden');
        gameState.paused = true;
    } else {
        resetPosition();
        gameState.timeLeft = gameState.maxTime;
    }
}

function resetPosition() {
    gameState.bottleX = 0; gameState.bottleVX = 0;
    gameState.bottleAngle = 1.57; gameState.isHooked = false;
    gameState.ringPos.set(0, 3, 2);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    renderer.render(scene, camera);
}

window.addEventListener('mousemove', (e) => {
    gameState.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    gameState.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// UI Controls
document.getElementById('pauseBtn').onclick = () => { gameState.paused = true; document.getElementById('pauseOverlay').classList.remove('hidden'); };
document.getElementById('resumeBtn').onclick = () => { gameState.paused = false; document.getElementById('pauseOverlay').classList.add('hidden'); };
document.getElementById('restartBtn').onclick = () => location.reload();

init();
