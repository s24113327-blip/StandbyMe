import * as THREE from 'three';

let scene, camera, renderer, bottle, ring, rope, lightFlash, bottleMaterial, ropeMaterial;
let clock = new THREE.Clock();

const gameState = {
    level: 1, lives: 3, score: 0,
    bottleAngle: -1.57, bottleX: 0,
    windForce: 0, windTarget: 0,
    isHooked: false, paused: false,
    timeLeft: 20, maxTime: 20,
    ringPos: new THREE.Vector3(0, 3, 0),
    ringVel: new THREE.Vector3(0, 0, 0),
    mousePos: new THREE.Vector2(),
    skins: {
        1: { name: "EMERALD", color: 0x10b981, emissive: 0x064e3b },
        5: { name: "SAPPHIRE", color: 0x0077ff, emissive: 0x002244 },
        10: { name: "RUBY", color: 0xff0044, emissive: 0x440011 }
    }
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Sharper graphics
    document.getElementById('game-container').appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    lightFlash = new THREE.PointLight(0xffffff, 0, 100);
    lightFlash.position.set(0, 5, 2);
    scene.add(lightFlash);

    createWorld();
    updateUI();
    updateLevelList();
    animate();
}

function createWorld() {
    // 3D Table with reflective properties
    const table = new THREE.Mesh(
        new THREE.BoxGeometry(12, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x002233, metalness: 0.8, roughness: 0.2 })
    );
    table.position.y = -1.2;
    scene.add(table);

    // Bottle Setup
    bottle = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 32);
    bodyGeo.translate(0, 1, 0); 
    bottleMaterial = new THREE.MeshPhongMaterial(gameState.skins[1]);
    const body = new THREE.Mesh(bodyGeo, bottleMaterial);
    bottle.add(body);
    
    const capGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.4);
    capGeo.translate(0, 2.2, 0);
    bottle.add(new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 })));
    
    bottle.position.y = -1;
    scene.add(bottle);

    // Ring
    ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.06, 16, 100), 
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(ring);

    // Glowing Rope
    ropeMaterial = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.8 });
    rope = new THREE.Line(new THREE.BufferGeometry(), ropeMaterial);
    scene.add(rope);

    camera.position.set(0, 1, 7);
}



function updatePhysics() {
    if (gameState.paused) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    // Timer
    gameState.timeLeft -= dt;
    document.getElementById('timerBar').style.width = (gameState.timeLeft / gameState.maxTime * 100) + "%";
    if (gameState.timeLeft <= 0) loseLife("TIME EXPIRED");

    // Wind Logic
    if (Math.random() > 0.98) gameState.windTarget = (Math.random() - 0.5) * (gameState.level * 0.15);
    gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;

    // Ring Physics
    const targetX = gameState.mousePos.x * 8;
    const targetY = (gameState.mousePos.y * 4) + 2;
    gameState.ringVel.x += (targetX - gameState.ringPos.x) * 0.12 + (gameState.windForce * 0.4);
    gameState.ringVel.y += (targetY - gameState.ringPos.y) * 0.12;
    gameState.ringVel.multiplyScalar(0.88);
    gameState.ringPos.add(gameState.ringVel.clone().multiplyScalar(dt * 10));
    ring.position.copy(gameState.ringPos);

    // Update Rope Geometry
    const points = [new THREE.Vector3(0, 7, 0), gameState.ringPos];
    rope.geometry.setFromPoints(points);

    // Hooking Mechanics
    const capWorldPos = new THREE.Vector3(0, 2.2, 0).applyMatrix4(bottle.matrixWorld);
    const dist = ring.position.distanceTo(capWorldPos);
    
    if (dist < 0.5) gameState.isHooked = true;

    if (gameState.isHooked) {
        const targetAngle = Math.atan2(ring.position.x - bottle.position.x, ring.position.y - bottle.position.y);
        gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.15;
        if (dist > 1.6) gameState.isHooked = false;
    } else {
        if (gameState.bottleAngle > -1.57) gameState.bottleAngle -= 0.05;
        gameState.bottleX += gameState.windForce * 0.03;
    }

    bottle.rotation.z = -gameState.bottleAngle;
    bottle.position.x = gameState.bottleX;

    // Game Rules
    if (Math.abs(gameState.bottleX) > 6.5) loseLife("FELL OFF PLATFORM");
    if (gameState.bottleAngle > -0.05 && !gameState.isHooked && Math.abs(gameState.windForce) < 0.08) winLevel();
}

function updateUI() {
    document.getElementById("score").textContent = gameState.score;
    document.getElementById("level").textContent = gameState.level;
    document.getElementById("livesDisplay").textContent = "❤️".repeat(gameState.lives);
    
    const skinSet = gameState.level >= 10 ? 10 : (gameState.level >= 5 ? 5 : 1);
    const skin = gameState.skins[skinSet];
    document.getElementById("skin-name").textContent = skin.name;
    
    if (bottleMaterial) {
        bottleMaterial.color.setHex(skin.color);
        bottleMaterial.emissive.setHex(skin.emissive);
    }
    if (ropeMaterial) {
        ropeMaterial.color.setHex(skin.color);
    }
}

function updateLevelList() {
    const list = document.getElementById("levelList");
    list.innerHTML = "";
    for(let i=1; i<=gameState.level+2; i++) {
        const li = document.createElement("li");
        li.className = `level-item ${i === gameState.level ? 'active' : ''}`;
        li.textContent = `LV ${i} ${i < gameState.level ? '✓' : ''}`;
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
    gameState.bottleX = 0; gameState.bottleAngle = -1.57;
    gameState.isHooked = false; gameState.ringPos.set(0, 3, 0);
    gameState.ringVel.set(0,0,0);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    renderer.render(scene, camera);
}

// Mouse and UI Events
window.addEventListener('mousemove', (e) => {
    gameState.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    gameState.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('pauseBtn').onclick = () => { gameState.paused = true; document.getElementById('pauseOverlay').classList.remove('hidden'); };
document.getElementById('resumeBtn').onclick = () => { gameState.paused = false; document.getElementById('pauseOverlay').classList.add('hidden'); };
document.getElementById('restartBtn').onclick = () => location.reload();

init();
