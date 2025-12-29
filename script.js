let scene, camera, renderer, bottle, ring, rope, rainSystem, lightFlash;
let clock = new THREE.Clock();

const gameState = {
    level: 1, lives: 3, score: 0,
    bottleAngle: 0, bottleX: 0, bottleVX: 0,
    windForce: 0, windTarget: 0,
    isHooked: false, paused: false,
    ringPos: new THREE.Vector3(0, 3, 0),
    ringVel: new THREE.Vector3(0, 0, 0),
    mousePos: new THREE.Vector2()
};

function init() {
    // Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.FogExp2(0x020205, 0.1);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);
    
    lightFlash = new THREE.PointLight(0xffffff, 0, 50);
    lightFlash.position.set(0, 5, 2);
    scene.add(lightFlash);

    createWorld();
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
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 2, 32),
        new THREE.MeshPhongMaterial({ color: 0x10b981, emissive: 0x064e3b, shininess: 100 })
    );
    bottle.add(body);
    
    const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    cap.position.y = 1.2;
    bottle.add(cap);
    scene.add(bottle);

    // Pendulum Ring
    const ringGeo = new THREE.TorusGeometry(0.3, 0.06, 16, 100);
    ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(ring);

    // Rope (Simple Line)
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x666666 });
    const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 0, 0)]);
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
    const dt = clock.getDelta() || 0.016;

    // 1. Wind & Lightning Logic
    if (Math.random() > 0.99) gameState.windTarget = (Math.random() - 0.5) * (gameState.level * 0.2);
    gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;

    if (gameState.level >= 10 && Math.random() > 0.997) {
        lightFlash.intensity = 100; // Strike!
    }
    lightFlash.intensity *= 0.9;

    // 2. Ring Pendulum Physics
    const targetX = (gameState.mousePos.x * 10);
    const targetY = (gameState.mousePos.y * 5) + 2;
    
    const dx = targetX - gameState.ringPos.x;
    const dy = targetY - gameState.ringPos.y;
    
    gameState.ringVel.x += (dx * 0.1) + (gameState.windForce * 0.5);
    gameState.ringVel.y += (dy * 0.1);
    gameState.ringVel.multiplyScalar(0.9); // Damping
    gameState.ringPos.add(gameState.ringVel.clone().multiplyScalar(dt * 10));
    
    ring.position.copy(gameState.ringPos);

    // 3. Rope Update
    const points = [new THREE.Vector3(0, 6, 0), gameState.ringPos];
    rope.geometry.setFromPoints(points);

    // 4. Bottle Interaction
    const capPos = new THREE.Vector3().setFromMatrixPosition(bottle.children[1].matrixWorld);
    const dist = ring.position.distanceTo(capPos);

    if (dist < 0.4 && !gameState.isHooked) gameState.isHooked = true;
    if (dist > 1.2) gameState.isHooked = false;

    if (gameState.isHooked) {
        const targetAngle = Math.atan2(ring.position.x - bottle.position.x, 2);
        gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.1;
    } else {
        gameState.bottleAngle += (0 - gameState.bottleAngle) * 0.05; // Fall flat
        gameState.bottleX += gameState.windForce * 0.1;
        
        if (Math.abs(gameState.bottleAngle) > 0.8) loseLife("TIPPED OVER");
    }

    bottle.position.x = gameState.bottleX;
    bottle.rotation.z = -gameState.bottleAngle;

    // 5. Rain
    const pos = rainSystem.geometry.attributes.position.array;
    for(let i=1; i<pos.length; i+=3) {
        pos[i] -= 0.1;
        pos[i-1] += gameState.windForce;
        if(pos[i] < -2) {
            pos[i] = 10;
            pos[i-1] = (Math.random()-0.5)*20;
        }
    }
    rainSystem.geometry.attributes.position.needsUpdate = true;

    if (Math.abs(gameState.bottleX) > 6) loseLife("SLID OFF");
    checkWin();
}

function checkWin() {
    if (Math.abs(gameState.bottleAngle) > 1.4 && Math.abs(gameState.windForce) < 0.02) {
        gameState.score += 100;
        gameState.level++;
        updateUI();
        resetPosition();
    }
}

function loseLife(reason) {
    gameState.lives--;
    updateUI();
    if(gameState.lives <= 0) {
        gameState.paused = true;
        document.getElementById('deathReason').innerText = reason;
        document.getElementById('gameOverOverlay').classList.remove('hidden');
    } else {
        resetPosition();
    }
}

function resetPosition() {
    gameState.bottleX = 0;
    gameState.bottleAngle = 0;
    gameState.isHooked = false;
    gameState.ringPos.set(0, 3, 0);
}

function updateUI() {
    document.getElementById("score").textContent = gameState.score;
    document.getElementById("level").textContent = gameState.level;
    document.getElementById("livesDisplay").textContent = "❤️".repeat(gameState.lives);
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
