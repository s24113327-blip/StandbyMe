let scene, camera, renderer, bottle, ring, rope, rainSystem, lightFlash;
let clock = new THREE.Clock();

const gameState = {
    level: 1, lives: 3, score: 0,
    // -1.57 is laying flat, 0 is standing upright
    bottleAngle: -1.57, bottleX: 0, bottleVX: 0,
    windForce: 0, windTarget: 0,
    isHooked: false, paused: false,
    ringPos: new THREE.Vector3(0, 3, 0),
    ringVel: new THREE.Vector3(0, 0, 0),
    mousePos: new THREE.Vector2()
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.FogExp2(0x020205, 0.1);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    
    lightFlash = new THREE.PointLight(0xffffff, 0, 50);
    lightFlash.position.set(0, 5, 2);
    scene.add(lightFlash);

    createWorld();
    updateUI();
    animate();
}

function createWorld() {
    // 3D Table
    const tableGeo = new THREE.BoxGeometry(12, 0.4, 4);
    const tableMat = new THREE.MeshStandardMaterial({ 
        color: 0x00f2ff, 
        emissive: 0x002233,
        roughness: 0.1 
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -1.2;
    scene.add(table);

    // 3D Neon Bottle
    bottle = new THREE.Group();
    // Geometry: We shift the cylinder up so its "pivot point" is at the base
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 32);
    bodyGeo.translate(0, 1, 0); 
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhongMaterial({ color: 0x10b981, emissive: 0x064e3b, shininess: 100 }));
    bottle.add(body);
    
    const capGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.4);
    capGeo.translate(0, 2.2, 0);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    bottle.add(cap);
    
    bottle.position.y = -1; // Place base on table
    scene.add(bottle);

    // Ring
    const ringGeo = new THREE.TorusGeometry(0.3, 0.06, 16, 100);
    ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(ring);

    // Rope
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x666666 });
    const ropeGeo = new THREE.BufferGeometry();
    rope = new THREE.Line(ropeGeo, ropeMat);
    scene.add(rope);

    createRain();
    camera.position.set(0, 1, 7);
}

function createRain() {
    const geo = new THREE.BufferGeometry();
    const points = [];
    for(let i=0; i<1000; i++) {
        points.push((Math.random()-0.5)*20, Math.random()*10, (Math.random()-0.5)*10);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    rainSystem = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x00f2ff, size: 0.05 }));
    scene.add(rainSystem);
}

function updatePhysics() {
    if (gameState.paused) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    // 1. Wind & Weather
    if (Math.random() > 0.98) gameState.windTarget = (Math.random() - 0.5) * (gameState.level * 0.15);
    gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;
    
    if (gameState.level >= 5 && Math.random() > 0.998) lightFlash.intensity = 50;
    lightFlash.intensity *= 0.95;

    // 2. Ring Pendulum Physics
    const targetX = gameState.mousePos.x * 8;
    const targetY = (gameState.mousePos.y * 4) + 2;
    
    gameState.ringVel.x += (targetX - gameState.ringPos.x) * 0.1 + (gameState.windForce * 0.4);
    gameState.ringVel.y += (targetY - gameState.ringPos.y) * 0.1;
    gameState.ringVel.multiplyScalar(0.9);
    gameState.ringPos.add(gameState.ringVel.clone().multiplyScalar(dt * 10));
    ring.position.copy(gameState.ringPos);

    // 3. Rope Visual
    rope.geometry.setFromPoints([new THREE.Vector3(0, 6, 0), gameState.ringPos]);

    // 4. Bottle Physics
    // Calculate Cap Position in World Space
    const capLocalPos = new THREE.Vector3(0, 2.2, 0);
    const capWorldPos = capLocalPos.applyMatrix4(bottle.matrixWorld);
    const dist = ring.position.distanceTo(capWorldPos);

    if (dist < 0.5) {
        if (!gameState.isHooked) {
            gameState.isHooked = true;
            // Play sound logic here if desired
        }
    }

    if (gameState.isHooked) {
        // Pull bottle toward ring
        const targetAngle = Math.atan2(ring.position.x - bottle.position.x, ring.position.y - bottle.position.y);
        gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.1;
        
        // Let go if pulled too far
        if (dist > 1.5) gameState.isHooked = false;
    } else {
        // Gravity pulls bottle back to flat (-1.57)
        if (gameState.bottleAngle > -1.57) {
            gameState.bottleAngle -= 0.03 + (gameState.level * 0.005);
        }
        // Friction/Wind sliding
        gameState.bottleVX += gameState.windForce * 0.01;
        gameState.bottleX += gameState.bottleVX;
        gameState.bottleVX *= 0.95;
    }

    // Constraints
    if (gameState.bottleAngle > 0.1) gameState.bottleAngle = 0.1; // Don't over-rotate forward
    if (gameState.bottleAngle < -1.57) gameState.bottleAngle = -1.57;

    bottle.rotation.z = -gameState.bottleAngle;
    bottle.position.x = gameState.bottleX;

    // Fail Conditions
    if (Math.abs(gameState.bottleX) > 6) loseLife("BOTTLE SLID OFF");
    
    // Win Condition: Upright (Close to 0) and Stable
    if (gameState.bottleAngle > -0.05 && Math.abs(gameState.windForce) < 0.05 && !gameState.isHooked) {
        winLevel();
    }

    // Rain Animation
    const rainArr = rainSystem.geometry.attributes.position.array;
    for(let i=1; i<rainArr.length; i+=3) {
        rainArr[i] -= 0.15;
        rainArr[i-1] += gameState.windForce;
        if(rainArr[i] < -2) {
            rainArr[i] = 10;
            rainArr[i-1] = (Math.random()-0.5)*20;
        }
    }
    rainSystem.geometry.attributes.position.needsUpdate = true;
}

function winLevel() {
    gameState.score += 100;
    gameState.level++;
    resetPosition();
    updateUI();
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
    }
}

function resetPosition() {
    gameState.bottleX = 0;
    gameState.bottleAngle = -1.57;
    gameState.isHooked = false;
    gameState.ringPos.set(0, 3, 0);
    gameState.ringVel.set(0,0,0);
}

function updateUI() {
    document.getElementById("score").textContent = gameState.score;
    document.getElementById("level").textContent = gameState.level;
    const livesDisplay = document.getElementById("livesDisplay");
    if (livesDisplay) livesDisplay.textContent = "❤️".repeat(gameState.lives);
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

document.getElementById('restartBtn').onclick = () => location.reload();

init();
