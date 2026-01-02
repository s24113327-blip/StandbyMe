/**
 * STAND-BY-ME 3D: COMPLETE GAME SCRIPT
 * Preserves: Swing Physics, Hooking Logic, Wind, Leveling, and UI.
 * Adds: Three.js WebGL Rendering, Neon Lighting, and 3D Rope.
 */

// --- 3D ENGINE GLOBALS ---
let scene, camera, renderer, bottleGroup, ringMesh, ropeLine, pointLight;
let audioCtx = null;

// --- CORE GAME STATE (Original Physics Logic) ---
const gameState = {
    paused: true,
    gameOver: false,
    hasWon: false,
    level: 1,
    score: 0,
    lives: 3,
    bestScore: localStorage.getItem("standByMeBest") || 0,
    
    // Bottle Physics
    bottleAngle: 0,
    bottleBaseX: 400,
    originalBaseX: 400,
    baseVelocity: 0,
    
    // Ring Physics (Pendulum)
    ringX: 400,
    ringY: 150,
    ringVX: 0,
    ringVY: 0,
    mouseX: 400,
    mouseY: 50,
    
    // Interaction States
    isDragging: false,
    isHooked: false,
    
    // Mechanics & FX
    timeLeft: 20,
    lastTime: 0,
    shakeTime: 0,
    shakeIntensity: 0,
    windForce: 0,
    windTarget: 0,
    
    // Visuals
    currentPalette: ["#064e3b", "#10b981", "#064e3b"]
};

// --- INITIALIZE 3D ENVIRONMENT ---
function init3D() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0c, 0.002); // Cyberpunk atmosphere

    camera = new THREE.PerspectiveCamera(45, 800 / 450, 1, 1000);
    camera.position.set(0, 70, 500);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById("gameCanvas"), 
        antialias: true 
    });
    renderer.setSize(800, 450);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Neon Market Lighting
    const pinkLight = new THREE.PointLight(0xff007f, 3, 500);
    pinkLight.position.set(-300, 200, 100);
    scene.add(pinkLight);

    const blueLight = new THREE.PointLight(0x00f2ff, 3, 500);
    blueLight.position.set(300, 200, 100);
    scene.add(blueLight);

    pointLight = new THREE.PointLight(0xffffff, 0.5, 1000);
    scene.add(pointLight);

    // Reflective Floor (Night Market Street)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -140;
    scene.add(floor);

    // Wooden Game Table
    const table = new THREE.Mesh(
        new THREE.BoxGeometry(650, 15, 220),
        new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 0.9 })
    );
    table.position.y = -105;
    scene.add(table);

    // 3D Bottle Assembly
    bottleGroup = new THREE.Group();
    const bottleBody = new THREE.Mesh(
        new THREE.CylinderGeometry(22, 24, 135, 32),
        new THREE.MeshPhysicalMaterial({ 
            color: 0x10b981, 
            transmission: 0.5, 
            transparent: true, 
            thickness: 3 
        })
    );
    bottleBody.rotation.z = Math.PI / 2;
    bottleBody.position.x = 67; // Pivot from the bottom
    bottleGroup.add(bottleBody);

    const bottleCap = new THREE.Mesh(
        new THREE.CylinderGeometry(10, 10, 25, 16),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    bottleCap.rotation.z = Math.PI / 2;
    bottleCap.position.x = 155;
    bottleGroup.add(bottleCap);
    scene.add(bottleGroup);

    // Ring & Rope
    ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(22, 2.8, 16, 64),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 })
    );
    scene.add(ringMesh);

    ropeLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x888888 })
    );
    scene.add(ropeLine);
}

// --- CORE PHYSICS LOOP ---
function updatePhysics() {
    if (gameState.paused || gameState.gameOver) return;
    
    const now = performance.now();
    const dt = (now - (gameState.lastTime || now)) / 1000;
    gameState.lastTime = now;

    if (!gameState.hasWon) {
        gameState.timeLeft -= dt;
        if (gameState.timeLeft <= 0) loseLife("TIME EXPIRED!");

        // 1. Ring Pendulum Physics
        // Pull towards mouse, apply gravity and wind
        gameState.ringVX += (gameState.mouseX - gameState.ringX) * 0.05 + (gameState.windForce * 22);
        gameState.ringVY += (gameState.mouseY - gameState.ringY) * 0.05 + 0.85; // Gravity
        
        gameState.ringX += gameState.ringVX;
        gameState.ringY += gameState.ringVY;
        
        gameState.ringVX *= 0.92; // Friction
        gameState.ringVY *= 0.92;

        // 2. Bottle Collision & Hooking
        // Determine where the "cap" is in 2D space based on bottle angle
        const capX = gameState.bottleBaseX + Math.cos(gameState.bottleAngle) * 170;
        const capY = 350 + Math.sin(gameState.bottleAngle) * 170;

        if (gameState.isHooked) {
            const dist = Math.hypot(gameState.ringX - capX, gameState.ringY - capY);
            if (dist > 95) { // Hook broke
                gameState.isHooked = false;
                playClink(0.1, 400);
            } else {
                // Bottle follows the ring's angle
                const targetAngle = Math.atan2(gameState.ringY - 350, gameState.ringX - gameState.bottleBaseX);
                gameState.bottleAngle += (targetAngle - gameState.bottleAngle) * 0.14;
                // Ring pulls the base of the bottle (sliding)
                gameState.baseVelocity += (gameState.ringX - capX) * 0.045;
            }
        } else {
            // Bottle falling back down logic
            const grav = 0.06 + (gameState.level * 0.005);
            if (gameState.bottleAngle < 0) gameState.bottleAngle += grav;
            
            // Check if toppled over (Too far tilted without being hooked)
            if (gameState.bottleAngle < -0.75) { loseLife("BOTTLE TOPPLED!"); return; }
            if (gameState.bottleAngle > 0) gameState.bottleAngle = 0; // Ground stop
            
            // Slide back to center slowly if not hooked
            gameState.baseVelocity += (400 - gameState.bottleBaseX) * 0.04;
        }

        // Apply Sliding
        gameState.bottleBaseX += gameState.baseVelocity;
        gameState.baseVelocity *= 0.95;

        // Table Boundary Check
        if (gameState.bottleBaseX < 85 || gameState.bottleBaseX > 715) {
            loseLife("SLID OFF THE TABLE!");
        }

        // 3. Weather / Wind Logic
        if (gameState.level >= 2) {
            if (Math.random() > 0.97) {
                gameState.windTarget = (Math.random() - 0.5) * (0.15 + gameState.level * 0.02);
            }
            gameState.windForce += (gameState.windTarget - gameState.windForce) * 0.05;
        }
    }
}

// --- RENDER BRIDGE ---
function drawGame() {
    // Map 2D State to 3D Scene
    
    // Update Bottle
    bottleGroup.position.x = gameState.bottleBaseX - 400;
    bottleGroup.position.y = -100;
    bottleGroup.rotation.z = gameState.bottleAngle;
    
    // Update Ring
    ringMesh.position.x = gameState.ringX - 400;
    ringMesh.position.y = -(gameState.ringY - 225);
    ringMesh.material.emissiveIntensity = gameState.isHooked ? 2.5 : 0.4;
    ringMesh.material.color.set(gameState.isHooked ? 0x39ff14 : 0xffffff);

    // Update 3D Rope (Bezier Curve)
    const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 225, 0), // Anchor
        new THREE.Vector3(gameState.windForce * 600, 100, 0), // Sway
        ringMesh.position.clone() // Ring attachment
    );
    ropeLine.geometry.dispose();
    ropeLine.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));

    // Screen Shake Handling
    if (gameState.shakeTime > 0) {
        camera.position.x = (Math.random() - 0.5) * gameState.shakeIntensity;
        gameState.shakeTime--;
    } else { camera.position.x = 0; }

    renderer.render(scene, camera);
}

// --- GAMEPLAY HELPERS ---
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playClink(volume, freq) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    gameState.shakeTime = 8; gameState.shakeIntensity = 5;
}

function loseLife(reason) {
    gameState.lives--;
    updateUI();
    if (gameState.lives <= 0) {
        gameState.gameOver = true;
        document.getElementById("deathReason").textContent = reason;
        document.getElementById("finalScore").textContent = gameState.score;
        document.getElementById("gameOverOverlay").classList.remove("hidden");
    } else {
        resetPositions();
    }
}

function resetPositions() {
    gameState.bottleBaseX = 400;
    gameState.bottleAngle = 0;
    gameState.ringX = 400;
    gameState.ringY = 150;
    gameState.isHooked = false;
    gameState.timeLeft = 20;
    gameState.baseVelocity = 0;
    gameState.ringVX = 0;
    gameState.ringVY = 0;
}

function checkWin() {
    if (gameState.hasWon || gameState.gameOver || gameState.paused) return;
    
    // Stand Up Threshold: ~90 degrees (-1.57 rad)
    if (gameState.bottleAngle <= -1.49 && Math.abs(gameState.baseVelocity) < 0.25) {
        gameState.hasWon = true;
        gameState.score += 100;
        
        // Save Highscore
        if (gameState.score > gameState.bestScore) {
            gameState.bestScore = gameState.score;
            localStorage.setItem("standByMeBest", gameState.bestScore);
        }
        
        updateUI();
        setTimeout(() => {
            gameState.level++;
            gameState.hasWon = false;
            resetPositions();
            updateLevelSidebar();
        }, 1500);
    }
}

// --- UI UPDATES ---
function updateUI() {
    document.getElementById("score").textContent = gameState.score;
    document.getElementById("bestScore").textContent = gameState.bestScore;
    document.getElementById("level").textContent = gameState.level;
    document.getElementById("livesDisplay").textContent = "❤️".repeat(gameState.lives);
}

function updateLevelSidebar() {
    const list = document.getElementById("levelList");
    list.innerHTML = "";
    // Show current level + 2 ahead
    for (let i = 1; i <= Math.max(gameState.level + 2, 5); i++) {
        const li = document.createElement("li");
        li.className = "level-item" + (i < gameState.level ? " cleared" : (i === gameState.level ? " active" : ""));
        li.innerHTML = `<span>STALL #${i.toString().padStart(2,'0')}</span> <span>${i < gameState.level ? '✓' : (i === gameState.level ? 'PLAY' : '🔒')}</span>`;
        list.appendChild(li);
    }
}

// --- INPUT HANDLERS ---
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (800 / rect.width);
    const y = (e.clientY - rect.top) * (450 / rect.height);
    
    // Check if clicking near the ring
    if (Math.hypot(x - gameState.ringX, y - gameState.ringY) < 60) {
        gameState.isDragging = true;
    }
});

window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    gameState.mouseX = (e.clientX - rect.left) * (800 / rect.width);
    gameState.mouseY = (e.clientY - rect.top) * (450 / rect.height);
    
    // Detection for "Hooking" the bottle cap while dragging
    if (gameState.isDragging && !gameState.isHooked && !gameState.paused) {
        const capX = gameState.bottleBaseX + Math.cos(gameState.bottleAngle) * 170;
        const capY = 350 + Math.sin(gameState.bottleAngle) * 170;
        
        if (Math.hypot(gameState.ringX - capX, gameState.ringY - capY) < 30) {
            gameState.isHooked = true;
            initAudio();
            playClink(0.3, 900);
        }
    }
});

window.addEventListener('mouseup', () => {
    gameState.isDragging = false;
});

// --- MENU BUTTONS ---
document.getElementById("startBtn").onclick = () => {
    initAudio();
    gameState.paused = false;
    document.getElementById("tutorialOverlay").classList.add("hidden");
    updateLevelSidebar();
};

document.getElementById("pauseBtn").onclick = () => {
    gameState.paused = true;
    document.getElementById("pauseOverlay").classList.remove("hidden");
};

document.getElementById("resumeBtn").onclick = () => {
    gameState.paused = false;
    document.getElementById("pauseOverlay").classList.add("hidden");
};

document.getElementById("restartBtn").onclick = () => {
    location.reload();
};

// --- START ENGINE ---
window.onload = () => {
    init3D();
    updateUI();
    updateLevelSidebar();
    
    function gameLoop() {
        updatePhysics();
        checkWin();
        drawGame();
        requestAnimationFrame(gameLoop);
    }
    gameLoop();
};
