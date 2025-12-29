import * as THREE from 'three';

let scene, camera, renderer, bottle, ring, rope, lightFlash, bottleMaterial, ropeMaterial;
let clock = new THREE.Clock();

const gameState = {
    level: 1,
    lives: 3,
    score: 0,
    // 1.57 radians = 90 degrees (laying flat on the table)
    bottleAngle: 1.57, 
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
        10: { name: "RUBY", color: 0xff0044, emissive: 0x440011 }
    }
};

function init() {
    // Scene & Camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights
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
    // 1. The Table
    const table = new THREE.Mesh(
        new THREE.BoxGeometry(15, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x002233, metalness: 0.8, roughness: 0.2 })
    );
    table.position.y = -1.25;
    scene.add(table);

    // 2. The Bottle (Pivot Point at Base)
    bottle = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 32);
    bodyGeo.translate(0, 1, 0); // Shifts geometry so the bottom of the bottle is at (0,0,0)
    
    bottleMaterial = new THREE.MeshPhongMaterial(gameState.skins[1]);
    const body = new THREE.Mesh(bodyGeo, bottleMaterial);
    bottle.add(body);
    
    const capGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.4);
    capGeo.translate(0, 2.2, 0);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    bottle.add(cap);
    
    bottle.position.y = -1; // Align with table surface
    bottle.rotation.z = gameState.bottleAngle; // Force lay flat
    scene.add(bottle);

    // 3. The Ring (Hook)
    ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.07, 16, 100), 
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(ring);

    // 4. The Rope
    ropeMaterial = new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.7 });
    rope = new THREE.Line(new THREE.BufferGeometry(), ropeMaterial);
    scene.add(rope);

    camera.position.set(0, 1.5, 7);
}

function updatePhysics() {
    if (gameState.paused) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    // Timer Logic
    gameState.timeLeft -= dt;
    const timerBar = document.getElementById('timerBar');
    if (timerBar) timerBar.style.width = (gameState.timeLeft / gameState.maxTime * 100) + "%";
    if (gameState.timeLeft <= 0) loseLife("TIME EXPIRED");

    // Wind Logic
    if (Math.random() > 0.98) gameState.windTarget = (Math.random() - 0.5) * (gameState.level * 0.15);
    gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;

    // Ring Pendulum Movement
    const tx = gameState.mousePos.x * 9;
    const ty = (gameState.mousePos.y * 5) + 2;
    gameState.ringVel.x += (tx - gameState.ringPos.x) * 0.12 + (gameState.windForce * 0.5);
    gameState.ringVel.y += (ty - gameState.ringPos.y) * 0.12;
    gameState.ringVel.multiplyScalar(0.88);
    gameState.ringPos.add(gameState.ringVel.clone().multiplyScalar(dt * 10));
    ring.position.copy(gameState.ringPos);

    // Rope Visual (Anchor at top)
    rope.geometry.setFromPoints([new THREE.Vector3(0, 7, 0), gameState.ringPos]);

    // Collision/Hook Detection
    const capWorldPos = new THREE.Vector3(0, 2.2, 0).applyMatrix4(bottle.matrixWorld);
    const distToCap = ring.position.distanceTo(capWorldPos);

    // Proximity feedback: Ring turns green when close
    if (distToCap < 0.7) {
        ring.material.color.set(0x39ff14); 
        if (distToCap < 0.4) gameState.isHooked = true;
    } else {
        ring.material.color.set(0xffffff);
    }

    if (gameState.isHooked) {
        // Bottle follows ring angle
        const targetAngle = Math.atan2(ring.position.x - bottle.position.x, ring.position.y - bottle.position.y);
        gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.15;
        
        // Let go if pulled too far or fast
        if (distToCap > 1.3) gameState.isHooked = false;
    } else {
        // Gravity pulls bottle back to flat position (1.57 rad)
        if (gameState.bottleAngle < 1.57) {
            gameState.bottleAngle += 0.04 + (gameState.level * 0.005);
        }
        // Friction and wind sliding
        gameState.bottleVX += gameState.windForce * 0.01;
        gameState.bottleX += gameState.bottleVX;
        gameState.bottleVX *= 0.95;
    }

    // Constraints
    if (gameState.bottleAngle < -0.1) gameState.bottleAngle = -0.1; // Forward tilt limit
    if (gameState.bottleAngle > 1.57) gameState.bottleAngle = 1.57; // Flat limit

    bottle.rotation.z = gameState.bottleAngle;
    bottle.position.x = gameState.bottleX;

    // Win/Lose Checks
    if (Math.abs(gameState.bottleX) > 6.5) loseLife("BOTTLE SLID OFF");
    
    // WIN: Bottle is upright (angle near 0) and ring is let go
    if (Math.abs(gameState.bottleAngle) < 0.08 && !gameState.isHooked && Math.abs(gameState.windForce) < 0.05) {
        winLevel();
    }
}



function updateUI() {
    const scoreEl = document.getElementById("score");
    const levelEl = document.getElementById("level");
    const livesEl = document.getElementById("livesDisplay");
    const skinNameEl = document.getElementById("skin-name");

    if (scoreEl) scoreEl.textContent = gameState.score;
    if (levelEl) levelEl.textContent = gameState.level;
    if (livesEl) livesEl.textContent = "❤️".repeat(gameState.lives);
    
    // Apply Skins based on Level
    const skinSet = gameState.level >= 10 ? 10 : (gameState.level >= 5 ? 5 : 1);
    const skin = gameState.skins[skinSet];
    if (skinNameEl) skinNameEl.textContent = skin.name;
    
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
    if (!list) return;
    list.innerHTML = "";
    for(let i = 1; i <= gameState.level + 2; i++) {
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
        const reasonEl = document.getElementById('deathReason');
        const finalScoreEl = document.getElementById('finalScore');
        const overlay = document.getElementById('gameOverOverlay');
        
        if (reasonEl) reasonEl.innerText = reason;
        if (finalScoreEl) finalScoreEl.innerText = gameState.score;
        if (overlay) overlay.classList.remove('hidden');
        gameState.paused = true;
    } else {
        resetPosition();
        gameState.timeLeft = gameState.maxTime;
    }
}

function resetPosition() {
    gameState.bottleX = 0;
    gameState.bottleVX = 0;
    gameState.bottleAngle = 1.57; // Reset to laying flat
    gameState.isHooked = false;
    gameState.ringPos.set(0, 3, 2);
    gameState.ringVel.set(0, 0, 0);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    renderer.render(scene, camera);
}

// Event Listeners
window.addEventListener('mousemove', (e) => {
    gameState.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    gameState.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');

if (pauseBtn) pauseBtn.onclick = () => { gameState.paused = true; document.getElementById('pauseOverlay').classList.remove('hidden'); };
if (resumeBtn) resumeBtn.onclick = () => { gameState.paused = false; document.getElementById('pauseOverlay').classList.add('hidden'); };
if (restartBtn) restartBtn.onclick = () => location.reload();

init();
