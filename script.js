// Canvas & Context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRID_SIZE = 20; // 20px per cell
const TILE_COUNT = canvas.width / GRID_SIZE;

// Game States
const STATE = {
    MENU: 0,
    PLAYING: 1,
    GAMEOVER: 2
};
let currentState = STATE.MENU;

// Game Data
let snake = [
    { x: 10, y: 10 }, // Head
    { x: 9, y: 10 },  // Body 1
    { x: 8, y: 10 }   // Body 2
];

let food = { x: 15, y: 10 };
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;

// Initialize High Score UI
document.getElementById('highScore').innerText = highScore;
document.getElementById('highScoreMenu').innerText = highScore;

// UI Manager for SPA
const UIManager = {
    switchScreen: function(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        // Show target screen
        document.getElementById(screenId).classList.remove('hidden');
    }
};

function spawnFood() {
    let newFood;
    while (true) {
        newFood = {
            x: Math.floor(Math.random() * TILE_COUNT),
            y: Math.floor(Math.random() * TILE_COUNT)
        };
        // Ensure food does not spawn overlapping the snake
        let onSnake = snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
        if (!onSnake) {
            break;
        }
    }
    food = newFood;
}

// Movement & Input
let dx = 1; // Snake initially moves to the right
let dy = 0;
let inputQueue = [];

// Settings & Game Loop setup
const defaultSettings = { difficulty: 'medium' };
let settings = JSON.parse(localStorage.getItem('snakeSettings')) || defaultSettings;

const DIFF_SPEEDS = {
    easy: 150, // ms per frame (slowest)
    medium: 100, // ms per frame
    hard: 60    // ms per frame (fastest)
};

let lastRenderTime = 0;

// Main Game Loop using requestAnimationFrame
function gameLoop(currentTime) {
    window.requestAnimationFrame(gameLoop);
    
    // Throttle frame rate based on chosen difficulty tick rate
    const tickRate = DIFF_SPEEDS[settings.difficulty];
    const msSinceLastRender = currentTime - lastRenderTime;
    
    if (msSinceLastRender < tickRate) return;
    
    lastRenderTime = currentTime;

    update();
    draw();
}

function update() {
    if (currentState !== STATE.PLAYING) return;
    
    // Process input queue (only process 1 input per frame to avoid bugs)
    if (inputQueue.length > 0) {
        const nextInput = inputQueue.shift();
        
        // Prevent 180-degree turn
        if (nextInput.dx !== 0 && dx !== -nextInput.dx) {
            dx = nextInput.dx;
            dy = nextInput.dy;
        } else if (nextInput.dy !== 0 && dy !== -nextInput.dy) {
            dx = nextInput.dx;
            dy = nextInput.dy;
        }
    }

    // Calculate new head position
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    
    // Check for collisions (Step 5)
    if (checkCollision(head)) {
        handleGameOver();
        return;
    }
    
    // Add new head
    snake.unshift(head);
    
    // Check if food is eaten
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        spawnFood();
        // Do NOT pop the tail to let the snake grow
    } else {
        // Remove tail
        snake.pop();
    }
}

function checkCollision(head) {
    // 1. Wall collision
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        return true;
    }
    
    // 2. Self collision
    for (let i = 0; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }
    
    return false;
}

function handleGameOver() {
    currentState = STATE.GAMEOVER;
    
    // High Score logic
    const newHighScoreMsg = document.getElementById('newHighScoreMsg');
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        document.getElementById('highScore').innerText = highScore;
        document.getElementById('highScoreMenu').innerText = highScore; // Update Main Menu too
        newHighScoreMsg.classList.remove('hidden');
    } else {
        newHighScoreMsg.classList.add('hidden');
    }

    document.getElementById('gameOverScreen').classList.add('active');
    document.getElementById('finalScore').innerText = score;
}

function draw() {
    // Update Score UI
    document.getElementById('currentScore').innerText = score;

    // 1. Clear Canvas
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 2. Draw Food (Neon Red/Pink)
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff0055';
    // Draw smaller square with gap
    ctx.fillRect(food.x * GRID_SIZE + 1, food.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    
    // 3. Draw Snake
    snake.forEach((segment, index) => {
        if (index === 0) {
            // Head (brighter neon green)
            ctx.fillStyle = '#39ff14';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#39ff14';
        } else {
            // Tails/Body (darker green, less glow)
            ctx.fillStyle = '#2ab811';
            ctx.shadowBlur = 2;
            ctx.shadowColor = '#2ab811';
        }
        
        ctx.fillRect(segment.x * GRID_SIZE + 1, segment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    });
    
    // Reset shadow
    ctx.shadowBlur = 0;
}

// Input Handling
window.addEventListener('keydown', e => {
    // Prevent default scrolling for arrow keys
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
    }
    
    // Only accept input if the game is playing
    if (currentState !== STATE.PLAYING) return;

    let newDx = 0;
    let newDy = 0;

    switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            newDx = 0; newDy = -1;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            newDx = 0; newDy = 1;
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            newDx = -1; newDy = 0;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            newDx = 1; newDy = 0;
            break;
        default:
            return; // Exit if not a movement key
    }

    // Add to input queue (limit size to 3 to prevent weird input delays building up)
    if (inputQueue.length < 3) {
        inputQueue.push({ dx: newDx, dy: newDy });
    }
});

function resetGame() {
    // Reset data
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    score = 0;
    dx = 1;
    dy = 0;
    inputQueue = [];
    spawnFood();
    
    // Reset UI
    document.getElementById('currentScore').innerText = score;
    document.getElementById('gameOverScreen').classList.remove('active');
    
    // UI Manager: Switch to Game Screen
    UIManager.switchScreen('screen-game');
    
    // Change State
    currentState = STATE.PLAYING;
}

// UI Event Listeners - Start/Play triggers
document.getElementById('playMenuBtn').addEventListener('click', resetGame);
document.getElementById('playAgainBtn').addEventListener('click', resetGame);

// Additional Screen Switches
document.getElementById('backToMenuBtn').addEventListener('click', () => {
    document.getElementById('gameOverScreen').classList.remove('active');
    currentState = STATE.MENU;
    UIManager.switchScreen('screen-menu');
});
document.getElementById('leaderboardMenuBtn').addEventListener('click', () => UIManager.switchScreen('screen-leaderboard'));

// Settings Logic & Events
const diffBtns = document.querySelectorAll('.diff-btn');

function renderSettingsUI() {
    diffBtns.forEach(btn => {
        if (btn.dataset.diff === settings.difficulty) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Attach click to Difficulty Buttons (Temp change before save)
let tempDifficulty = settings.difficulty;
diffBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        tempDifficulty = e.target.dataset.diff;
        diffBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
    });
});

// Save & Back Button in Settings
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    settings.difficulty = tempDifficulty; // Apply temp selection to real settings
    localStorage.setItem('snakeSettings', JSON.stringify(settings));
    UIManager.switchScreen('screen-menu');
});

// Open Settings Menu
document.getElementById('settingsMenuBtn').addEventListener('click', () => {
    tempDifficulty = settings.difficulty; // Reset temp memory
    renderSettingsUI();
    UIManager.switchScreen('screen-settings');
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => UIManager.switchScreen('screen-menu'));
});

// Start visual loop
window.requestAnimationFrame(gameLoop);