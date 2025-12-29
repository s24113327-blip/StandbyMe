import * as THREE from 'three';

let scene, camera, renderer, bottle, ring, rope, lightFlash, bottleMaterial, ropeMaterial, rainSystem;
let clock = new THREE.Clock();

// Game State - Fully Restored
const gameState = {
    level: 1,
    lives: 3,
    score: 0,
    bottleAngle: 1.57, // 90 degrees (laying flat)
    bottleX: 0,
    bottleVX: 0,
    windForce: 0,
    windTarget: 0,
    isHooked: false,
    paused: true, // Start paused for tutorial/start
    timeLeft: 20,
    maxTime: 20,
    flashAlpha: 0,
    ringPos: new THREE.Vector3(0, 3, 2),
    ringVel: new THREE.Vector3(0, 0, 0),
    mousePos: new THREE.Vector2(),
    skins: {
        1: { name: "EMERALD", color: 0x10b981, emissive: 0x064e3b },
        5: { name: "SAPPHIRE", color: 0x0077ff, emissive: 0x002244 },
        10: { name: "RUBY", color: 0xff0044, emissive: 0x440011 },
        15: { name: "OBSIDIAN", color: 0x444444, emissive: 0x111111 },
        20: { name: "VOID", color: 0x8800ff, emissive: 0x220044 }
    }
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.FogExp2(0x020205, 0.05);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3, 8);
    camera.lookAt(0, 0, 0);

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
    createRain();
    updateUI();
    updateLevelList();
    
    // Start the game loop
    animate();
    
    // Auto-resume logic if you have a start button
    gameState.paused = false; 
}

function createWorld() {
    // 1. Table with neon rim
    const tableGeo = new THREE.BoxGeometry(15, 0.5, 6);
    const tableMat = new THREE.MeshStandardMaterial({ 
        color: 0x111111, 
        emissive: 0x00f2ff, 
        emissiveIntensity: 0.2,
        roughness: 0.1
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -1.25;
    scene.add(table);

    // 2. The Bottle (Pivot Point at base)
    bottle = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 32);
    bodyGeo.translate(0, 1, 0); 
    bottleMaterial = new THREE.MeshPhongMaterial(gameState.skins[1]);
    const body = new THREE.Mesh(bodyGeo, bottleMaterial);
    bottle.add(body);
    
    const capGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.4);
    capGeo.translate(0, 2.2, 0);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    bottle.add(cap);
    
    bottle.position.y = -1;
    bottle.rotation.z = gameState.bottleAngle;
    scene.add(bottle);

    // 3. The Ring
    ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.08, 16, 100), 
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(ring);

    // 4. The Rope (Glows with skin)
    ropeMaterial = new THREE.LineBasicMaterial({ color: 0x00f2ff });
    rope = new THREE.Line(new THREE.BufferGeometry(), ropeMaterial);
    scene.add(rope);
}

function createRain() {
    const rainCount = 1500;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 30; // Spread x, y, z
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0x00f2ff, size: 0.05, transparent: true, opacity: 0.5 });
    rainSystem = new THREE.Points(geo, rainMat);
    scene.add(rainSystem);
}

function updatePhysics() {
    if (gameState.paused) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    // 1. Timer Restored
    gameState.timeLeft -= dt;
    const timerBar = document.getElementById('timerBar');
    if (timerBar) timerBar.style.width = (gameState.timeLeft / gameState.maxTime * 100) + "%";
    if (gameState.timeLeft <= 0) loseLife("TIME EXPIRED");

    // 2. Wind & Lightning Logic Restored
    if (Math.random() > 0.98) gameState.windTarget = (Math.random() - 0.5) * (gameState.level * 0.12);
    gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;

    if (gameState.level >= 5 && Math.random() > 0.997) {
        lightFlash.intensity = 100; // Strike!
    }
    lightFlash.intensity *= 0.92;

    // 3. Ring Physics (Pendulum Swing)
    const tx = gameState.mousePos.x * 10;
    const ty = (gameState.mousePos.y * 6) + 2;
    gameState.ringVel.x += (tx - gameState.ringPos.x) * 0.15 + (gameState.windForce * 0.6);
    gameState.ringVel.y += (ty - gameState.ringPos.y) * 0.15;
    gameState.ringVel.multiplyScalar(0.85);
    gameState.ringPos.add(gameState.ringVel.clone().multiplyScalar(dt * 10));
    ring.position.copy(gameState.ringPos);

    // 4. Rope Geometry
    rope.geometry.setFromPoints([new THREE.Vector3(0, 10, 0), gameState.ringPos]);

    // 5. Hooking Mechanics
    const capWorldPos = new THREE.Vector3(0, 2.2, 0).applyMatrix4(bottle.matrixWorld);
    const dist = ring.position.distanceTo(capWorldPos);

    if (dist < 0.6) {
        ring.material.color.set(0x39ff14); // Glow Green when near
        if (dist < 0.35) gameState.isHooked = true;
    } else {
        ring.material.color.set(0xffffff);
    }

    if (gameState.isHooked) {
        const targetAngle = Math.atan2(ring.position.x - bottle.position.x, ring.position.y - bottle.position.y);
        gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.15;
        if (dist > 1.4) gameState.isHooked = false;
    } else {
        // Gravity pulls bottle back to flat position
        if (gameState.bottleAngle < 1.57) gameState.bottleAngle += 0.04 + (gameState.level * 0.005);
        // Friction and wind sliding
        gameState.bottleVX += gameState.windForce * 0.02;
        gameState.bottleX += gameState.bottleVX;
        gameState.bottleVX *= 0.92;
    }

    // Constraints
    if (gameState.bottleAngle < -0.1) gameState.bottleAngle = -0.1;
    if (gameState.bottleAngle > 1.57) gameState.bottleAngle = 1.57;

    bottle.rotation.z = gameState.bottleAngle;
    bottle.position.x = gameState.bottleX;

    // 6. Rain Animation Restored
    const rainArr = rainSystem.geometry.attributes.position.array;
    for (let i = 1; i < rainArr.length; i += 3) {
        rainArr[i] -= 0.2; // Fall speed
        rainArr[i - 1] += gameState.windForce; // Wind push
        if (rainArr[i] < -5) {
            rainArr[i] = 15;
            rainArr[i - 1] = (Math.random() - 0.5) * 30;
        }
    }
    rainSystem.geometry.attributes.position.needsUpdate = true;

    // Fail Conditions
    if (Math.abs(gameState.bottleX) > 7) loseLife("BOTTLE SLID OFF");
    
    // Win Condition
    if (Math.abs(gameState.bottleAngle) < 0.08 && !gameState.isHooked && Math.abs(gameState.windForce) < 0.05) {
        winLevel();
    }
}

function updateUI() {
    document.getElementById("score").textContent = gameState.score;
    document.getElementById("level").textContent = gameState.level;
    document.getElementById("livesDisplay").textContent = "❤️".repeat(gameState.lives);
    
    // Restored Skin Logic
    const skinMilestones = Object.keys(gameState.skins).map(Number).reverse();
    const currentMilestone = skinMilestones.find(m => gameState.level >= m) || 1;
    const skin = gameState.skins[currentMilestone];
    
    document.getElementById("skin-name").textContent = skin.name;
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
        document.getElementById('finalScore').innerText = gameState.score;
        document.getElementById('gameOverOverlay').classList.remove('hidden');
        gameState.paused = true;
    } else {
        resetPosition();
        gameState.timeLeft = gameState.maxTime;
    }
}

function resetPosition() {
    gameState.bottleX = 0;
    gameState.bottleVX = 0;
    gameState.bottleAngle = 1.57;
    gameState.isHooked = false;
    gameState.ringPos.set(0, 3, 2);
    gameState.ringVel.set(0, 0, 0);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    renderer.render(scene, camera);
}

// Controls
window.addEventListener('mousemove', (e) => {
    gameState.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    gameState.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// UI Buttons
document.getElementById('pauseBtn').onclick = () => { 
    gameState.paused = true; 
    document.getElementById('pauseOverlay').classList.remove('hidden'); 
};
document.getElementById('resumeBtn').onclick = () => { 
    gameState.paused = false; 
    document.getElementById('pauseOverlay').classList.add('hidden'); 
};
document.getElementById('restartBtn').onclick = () => location.reload();

init();
