let scene, camera, renderer, bottleGroup, ringMesh, ropeLine;
let audioCtx = null;

const state = {
    active: false,
    level: 1,
    score: 0,
    lives: 3,
    bestScore: localStorage.getItem("standByMeBest") || 0,
    
    // Physics Logic
    bottleAngle: 0,       // 0 is flat on table
    bottleBaseX: 300, 
    baseVel: 0,
    
    ringX: 300,
    ringY: 100,
    ringVX: 0,
    ringVY: 0,
    mouseX: 300,
    mouseY: 50,
    
    isHooked: false,
    isDragging: false,
    windForce: 0,
    windTarget: 0,
    shakeTime: 0
};

function init3D() {
    const canvas = document.getElementById("gameCanvas");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);

    camera = new THREE.PerspectiveCamera(45, 600 / 400, 1, 1000);
    camera.position.set(0, 60, 480);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(600, 400);

    // Neon Lights
    const p1 = new THREE.PointLight(0xff2d75, 3, 500);
    p1.position.set(-250, 150, 100);
    scene.add(p1);
    const p2 = new THREE.PointLight(0x00d2ff, 3, 500);
    p2.position.set(250, 150, 100);
    scene.add(p2);
    scene.add(new THREE.AmbientLight(0x444444));

    // Table Floor
    const grid = new THREE.GridHelper(1000, 40, 0x333333, 0x111111);
    grid.position.y = -81;
    scene.add(grid);

    // Bottle Group (Pivot at base)
    bottleGroup = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(18, 22, 130, 32),
        new THREE.MeshPhysicalMaterial({ color: 0x00d2ff, transmission: 0.5, transparent: true, thickness: 2 })
    );
    body.rotation.z = Math.PI/2; 
    body.position.x = 65; // Pivot offset
    bottleGroup.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 20), new THREE.MeshStandardMaterial({color: 0xff0000}));
    cap.rotation.z = Math.PI/2;
    cap.position.x = 140;
    bottleGroup.add(cap);
    scene.add(bottleGroup);

    // Ring & Rope
    ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(20, 3, 16, 64),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 })
    );
    scene.add(ringMesh);

    ropeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x888888 }));
    scene.add(ropeLine);
}

function updatePhysics() {
    if (!state.active) return;

    // 1. Wind Sway
    if (state.level >= 2) {
        if (Math.random() > 0.98) state.windTarget = (Math.random() - 0.5) * (0.1 + state.level * 0.02);
        state.windForce += (state.windTarget - state.windForce) * 0.05;
    }

    // 2. Ring Pendulum
    state.ringVX += (state.mouseX - state.ringX) * 0.05 + (state.windForce * 15);
    state.ringVY += (state.mouseY - state.ringY) * 0.05 + 0.85; 
    state.ringX += state.ringVX; 
    state.ringY += state.ringVY;
    state.ringVX *= 0.92; state.ringVY *= 0.92;

    // 3. Current Cap Position in 2D Space
    const capX = state.bottleBaseX + Math.cos(state.bottleAngle) * 160;
    const capY = 320 + Math.sin(state.bottleAngle) * 160;

    if (state.isHooked) {
        const dist = Math.hypot(state.ringX - capX, state.ringY - capY);
        if (dist > 110) { // Hook broke
            state.isHooked = false;
        } else {
            // FIX: atan2 targets the angle from bottle base to ring
            let target = Math.atan2(state.ringY - 320, state.ringX - state.bottleBaseX);
            
            // Constrain rotation to prevent the 360-degree flip
            if (target > 0) target = 0; 
            if (target < -1.7) target = -1.7;

            state.bottleAngle += (target - state.bottleAngle) * 0.15;
            state.baseVel += (state.ringX - capX) * 0.045;
        }
    } else {
        // Gravity pulls bottle back to flat (0 radians)
        if (state.bottleAngle < 0) state.bottleAngle += (0.05 + (state.level * 0.005));
        if (state.bottleAngle > 0) state.bottleAngle = 0;
        
        // If tipped too far forward (toward player), it falls
        if (state.bottleAngle < -0.9) resetRound("BOTTLE TOPPLED!");
        
        state.baseVel += (300 - state.bottleBaseX) * 0.04;
    }

    state.bottleBaseX += state.baseVel;
    state.baseVel *= 0.95;

    if (state.bottleBaseX < 60 || state.bottleBaseX > 540) resetRound("SLID OFF TABLE!");
}

function checkWin() {
    if (!state.active) return;
    // Standing up is roughly -1.57 radians (90 degrees)
    if (state.bottleAngle <= -1.5 && Math.abs(state.baseVel) < 0.2) {
        state.score += 100;
        state.level++;
        if (state.score > state.bestScore) {
            state.bestScore = state.score;
            localStorage.setItem("standByMeBest", state.bestScore);
        }
        updateUI();
        state.active = false;
        setTimeout(() => { resetPositions(); state.active = true; }, 1000);
    }
}

function render() {
    bottleGroup.position.set(state.bottleBaseX - 300, -75, 0);
    bottleGroup.rotation.z = state.bottleAngle;
    
    ringMesh.position.set(state.ringX - 300, -(state.ringY - 200), 0);
    ringMesh.material.emissiveIntensity = state.isHooked ? 2.0 : 0.4;

    const points = [new THREE.Vector3(0, 200, 0), ringMesh.position.clone()];
    ropeLine.geometry.setFromPoints(points);

    if (state.shakeTime > 0) {
        camera.position.x = (Math.random() - 0.5) * 5;
        state.shakeTime--;
    } else { camera.position.x = 0; }

    renderer.render(scene, camera);
}

function updateUI() {
    document.getElementById("scoreText").innerText = state.score;
    document.getElementById("bestText").innerText = state.bestScore;
    document.getElementById("levelText").innerText = state.level;
    document.getElementById("livesText").innerText = "❤️".repeat(Math.max(0, state.lives));
}

function resetRound(reason) {
    state.lives--;
    updateUI();
    state.shakeTime = 15;
    if (state.lives <= 0) {
        state.active = false;
        document.getElementById("ui-over").classList.remove("hidden");
    } else {
        resetPositions();
    }
}

function resetPositions() {
    state.bottleBaseX = 300; state.bottleAngle = 0; state.baseVel = 0;
    state.ringX = 300; state.ringY = 100; state.isHooked = false;
}

// Global functions for HTML
window.startGame = () => {
    state.active = true;
    document.getElementById("ui-start").classList.add("hidden");
};

const canvas = document.getElementById("gameCanvas");
canvas.addEventListener('mousedown', () => state.isDragging = true);
window.addEventListener('mouseup', () => state.isDragging = false);
window.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.mouseX = (e.clientX - r.left) * (600 / r.width);
    state.mouseY = (e.clientY - r.top) * (400 / r.height);
    
    if (state.isDragging && !state.isHooked && state.active) {
        const capX = state.bottleBaseX + Math.cos(state.bottleAngle) * 160;
        const capY = 320 + Math.sin(state.bottleAngle) * 160;
        if (Math.hypot(state.ringX - capX, state.ringY - capY) < 40) {
            state.isHooked = true;
        }
    }
});

window.onload = () => {
    init3D();
    updateUI();
    function loop() {
        updatePhysics();
        checkWin();
        render();
        requestAnimationFrame(loop);
    }
    loop();
};
