/**
 * STAND-BY-ME 3D: SYNCED TO CURRENT HTML
 */

let scene, camera, renderer, bottleGroup, ringMesh, ropeLine;

// --- GAME STATE ---
const gameState = {
    active: false,
    level: 1,
    score: 0,
    lives: 3,
    bestScore: localStorage.getItem("standByMeBest") || 0,
    
    // Physics (Adjusted for 600px width)
    bottleAngle: 0,
    bottleBaseX: 300, 
    baseVelocity: 0,
    
    ringX: 300,
    ringY: 100,
    ringVX: 0,
    ringVY: 0,
    mouseX: 300,
    mouseY: 50,
    
    isDragging: false,
    isHooked: false
};

function init3D() {
    const canvas = document.getElementById("gameCanvas");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    camera = new THREE.PerspectiveCamera(45, 600 / 400, 1, 1000);
    camera.position.set(0, 50, 450);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(600, 400);

    // Neon Lights
    const light1 = new THREE.PointLight(0xff2d75, 2, 500);
    light1.position.set(-200, 100, 100);
    scene.add(light1);

    const light2 = new THREE.PointLight(0x00d2ff, 2, 500);
    light2.position.set(200, 100, 100);
    scene.add(light2);

    scene.add(new THREE.AmbientLight(0x444444));

    // Floor
    const grid = new THREE.GridHelper(1000, 40, 0x333333, 0x111111);
    grid.position.y = -80;
    scene.add(grid);

    // Bottle Setup
    bottleGroup = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(18, 22, 120, 16),
        new THREE.MeshPhongMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.7 })
    );
    body.rotation.z = Math.PI / 2;
    body.position.x = 60; // Offset so it rotates from the bottom
    bottleGroup.add(body);
    
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 15), new THREE.MeshBasicMaterial({color: 0xff2d75}));
    cap.rotation.z = Math.PI/2;
    cap.position.x = 130;
    bottleGroup.add(cap);
    
    scene.add(bottleGroup);

    // Ring
    ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(18, 3, 16, 40), 
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff })
    );
    scene.add(ringMesh);

    // Rope
    ropeLine = new THREE.Line(
        new THREE.BufferGeometry(), 
        new THREE.LineBasicMaterial({ color: 0x888888 })
    );
    scene.add(ropeLine);
}

function updatePhysics() {
    if (!gameState.active) return;

    // 1. Ring Pendulum Physics
    gameState.ringVX += (gameState.mouseX - gameState.ringX) * 0.05;
    gameState.ringVY += (gameState.mouseY - gameState.ringY) * 0.05 + 0.8; // Gravity
    
    gameState.ringX += gameState.ringVX;
    gameState.ringY += gameState.ringVY;
    
    gameState.ringVX *= 0.92;
    gameState.ringVY *= 0.92;

    // 2. Bottle Collision
    const capX = gameState.bottleBaseX + Math.cos(gameState.bottleAngle) * 150;
    const capY = 320 + Math.sin(gameState.bottleAngle) * 150;

    if (gameState.isHooked) {
        const dist = Math.hypot(gameState.ringX - capX, gameState.ringY - capY);
        if (dist > 80) {
            gameState.isHooked = false;
        } else {
            const target = Math.atan2(gameState.ringY - 320, gameState.ringX - gameState.bottleBaseX);
            gameState.bottleAngle += (target - gameState.bottleAngle) * 0.15;
            gameState.baseVelocity += (gameState.ringX - capX) * 0.05;
        }
    } else {
        // Gravity pulls bottle down
        if (gameState.bottleAngle < 0) gameState.bottleAngle += 0.05;
        // Check if it fell over too far
        if (gameState.bottleAngle < -0.8) resetRound("Tipped!");
        if (gameState.bottleAngle > 0) gameState.bottleAngle = 0;
        
        gameState.baseVelocity += (300 - gameState.bottleBaseX) * 0.04;
    }

    gameState.bottleBaseX += gameState.baseVelocity;
    gameState.baseVelocity *= 0.95;

    // Boundaries
    if (gameState.bottleBaseX < 50 || gameState.bottleBaseX > 550) resetRound("Fell off!");

    // Win Check (Stand upright)
    if (gameState.bottleAngle <= -1.48 && Math.abs(gameState.baseVelocity) < 0.2) {
        gameState.score += 100;
        gameState.level++;
        if(gameState.score > gameState.bestScore) {
            gameState.bestScore = gameState.score;
            localStorage.setItem("standByMeBest", gameState.bestScore);
        }
        updateUI();
        resetPositions();
    }
}

function render() {
    // Sync 3D objects with 2D physics state
    bottleGroup.position.set(gameState.bottleBaseX - 300, -75, 0);
    bottleGroup.rotation.z = gameState.bottleAngle;
    
    ringMesh.position.set(gameState.ringX - 300, -(gameState.ringY - 200), 0);
    
    const points = [new THREE.Vector3(0, 200, 0), ringMesh.position.clone()];
    ropeLine.geometry.setFromPoints(points);

    renderer.render(scene, camera);
}

function updateUI() {
    // Targeting the IDs from your HTML
    document.getElementById("scoreText").innerText = gameState.score;
    document.getElementById("bestText").innerText = gameState.bestScore;
    document.getElementById("levelText").innerText = gameState.level;
    document.getElementById("livesText").innerText = "❤️".repeat(gameState.lives);
}

function startGame() {
    gameState.active = true;
    document.getElementById("ui-start").classList.add("hidden");
}

function resetRound(reason) {
    gameState.lives--;
    updateUI();
    if (gameState.lives <= 0) {
        gameState.active = false;
        document.getElementById("ui-over").classList.remove("hidden");
    } else {
        resetPositions();
    }
}

function resetPositions() {
    gameState.bottleBaseX = 300;
    gameState.bottleAngle = 0;
    gameState.baseVelocity = 0;
    gameState.ringX = 300;
    gameState.ringY = 100;
    gameState.isHooked = false;
}

// Global scope for HTML onclick functions
window.startGame = startGame;

// Input Controls
const canvas = document.getElementById("gameCanvas");
canvas.addEventListener('mousedown', () => gameState.isDragging = true);
window.addEventListener('mouseup', () => gameState.isDragging = false);
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    gameState.mouseX = (e.clientX - rect.left) * (600 / rect.width);
    gameState.mouseY = (e.clientY - rect.top) * (400 / rect.height);
    
    if (gameState.isDragging && !gameState.isHooked && gameState.active) {
        const capX = gameState.bottleBaseX + Math.cos(gameState.bottleAngle) * 150;
        const capY = 320 + Math.sin(gameState.bottleAngle) * 150;
        if (Math.hypot(gameState.ringX - capX, gameState.ringY - capY) < 30) {
            gameState.isHooked = true;
        }
    }
});

window.onload = () => {
    init3D();
    updateUI();
    function loop() {
        updatePhysics();
        render();
        requestAnimationFrame(loop);
    }
    loop();
};
