// Canvas & Context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRID_SIZE = 20; // 20px per cell
let tileCountX = 0;
let tileCountY = 0;

// Set constant canvas dimensions or adjust container
// CRITICAL FIX: Phải đo từ container khi nó đã VISIBLE.
// Nếu container đang bị ẩn (display:none), clientWidth = 0 → sai hoàn toàn.
const CANVAS_BORDER = 4; // border: 2px mỗi bên × 2 = 4px — trừ ra để canvas không tràn container
function resizeCanvas() {
    const container = document.querySelector('.canvas-container');
    
    // Nếu container chưa visible (width = 0), thoát ra, sẽ được gọi lại sau
    if (!container || container.clientWidth === 0) return;

    // Trừ border trước khi tính số ô để canvas + border vừa khít container
    const maxCols = Math.floor((container.clientWidth  - CANVAS_BORDER) / GRID_SIZE);
    const maxRows = Math.floor((container.clientHeight - CANVAS_BORDER) / GRID_SIZE);
    
    tileCountX = maxCols;
    tileCountY = maxRows;
    
    // Ép lại kích thước thực — canvas luôn khớp 100% với số ô lưới, không dư pixel
    canvas.width  = maxCols * GRID_SIZE;
    canvas.height = maxRows * GRID_SIZE;
}

// Khi window resize, tính lại map. Nếu đang chơi, tái spawn mồi để tránh ra ngoài lề.
window.addEventListener('resize', () => {
    resizeCanvas();
    if (currentState === STATE.PLAYING) generateFood();
});
// Không gọi resizeCanvas() tại đây — screen-game đang ẩn, container.clientWidth = 0

// Game States
const STATE = {
    MENU: 0,
    PLAYING: 1,
    GAMEOVER: 2,
    PAUSED: 3
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
    },

    // UIManager: Render leaderboard UI (Step 4)
    renderLeaderboard: function(mode) {
        // Update active tab buttons
        document.querySelectorAll('.lb-tab').forEach(tab => {
            if (tab.dataset.mode === mode) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Render List
        const list = document.getElementById('leaderboardList');
        list.innerHTML = '';
        
        const data = StorageManager.getLeaderboard(mode);
        
        if (data.length === 0) {
            list.innerHTML = '<li style="text-align:center; padding: 20px; color: #888;">No scores yet! Be the first!</li>';
            return;
        }

        data.forEach((item, index) => {
            const li = document.createElement('li');
            const rank = index + 1;
            
            if (rank === 1) {
                li.classList.add('rank-1');
            }
            
            li.innerHTML = `
                <span class="rank">#${rank}</span>
                <span class="name">${item.name}</span>
                <span class="score-val">${item.score}</span>
            `;
            list.appendChild(li);
        });
    }
};

// Storage Manager for Leaderboard (Pure Frontend)
const StorageManager = {
    getKey: () => 'snake_leaderboard',
    
    getStorage: function() {
        const data = localStorage.getItem(this.getKey());
        if (data) return JSON.parse(data);
        return { easy: [], medium: [], hard: [] };
    },
    
    saveStorage: function(data) {
        localStorage.setItem(this.getKey(), JSON.stringify(data));
    },
    
    getLeaderboard: function(mode) {
        const data = this.getStorage();
        return data[mode] || [];
    },
    
    checkIfTop10: function(score, mode) {
        if (score <= 0) return false;
        const leaderboard = this.getLeaderboard(mode);
        if (leaderboard.length < 10) return true;
        // List is sorted descending, so the lowest score is at the end
        return score > leaderboard[leaderboard.length - 1].score;
    },
    
    saveScore: function(name, score, mode) {
        const data = this.getStorage();
        if (!data[mode]) data[mode] = [];
        
        data[mode].push({
            name: name || "Anonymous",
            score: parseInt(score, 10),
            timestamp: Date.now() // BONUS: Lưu timestamp
        });
        
        // Gọi hàm sort được yêu cầu
        this.sortLeaderboard(data[mode]);
        
        // Retain only top 10
        data[mode] = data[mode].slice(0, 10);
        this.saveStorage(data);
    },

    // Hàm Sort Leaderboard chuẩn yêu cầu Bug 3
    sortLeaderboard: function(leaderboardArray) {
        leaderboardArray.sort((a, b) => {
            // Tiêu chí 1: Điểm giảm dần
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // Tiêu chí 2 (Tied Score): Ai chơi trước xếp trên (tăng dần)
            return a.timestamp - b.timestamp;
        });
    }
};

function generateFood() {
    // Đảm bảo x trong [0, maxCols - 1] và y trong [0, maxRows - 1]
    const freeSpots = [];
    let maxCols = tileCountX;
    let maxRows = tileCountY;

    for (let x = 0; x < maxCols; x++) {
        for (let y = 0; y < maxRows; y++) {
            // Kiểm tra xem tọa độ này có đang bị thân rắn đè lên không
            let isOccupied = snake.some(segment => segment.x === x && segment.y === y);
            if (!isOccupied) {
                freeSpots.push({ x, y });
            }
        }
    }

    // Edge case: Rắn đã ăn full bản đồ
    if (freeSpots.length === 0) {
        food = { x: -1, y: -1 }; // Giấu mồi hoặc trigger Win Game
        return;
    }

    // Pick ngẫu nhiên 1 ô trong danh sách các ô an toàn
    const randomIndex = Math.floor(Math.random() * freeSpots.length);
    food = freeSpots[randomIndex];
}

// Movement & Input
let dx = 1; // Snake initially moves to the right
let dy = 0;
let inputQueue = [];

// Settings & Game Loop setup
const defaultSettings = { difficulty: 'medium', sound: true };
let settings = JSON.parse(localStorage.getItem('snakeSettings')) || defaultSettings;

// Handle missing fields gracefully for existing users
if (typeof settings.sound === 'undefined') settings.sound = true;

const DIFF_SPEEDS = {
    easy: 150, // ms per frame (slowest)
    medium: 100, // ms per frame
    hard: 60    // ms per frame (fastest)
};

let lastRenderTime = 0;
let animationId; // BUG 3 FIX: Lưu trữ ID để quản lý vòng lặp (tránh double loop)

// Main Game Loop using requestAnimationFrame
function gameLoop(currentTime) {
    animationId = window.requestAnimationFrame(gameLoop);
    
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
    const nextX = snake[0].x + dx;
    const nextY = snake[0].y + dy;
    const newHead = { x: nextX, y: nextY };
    
    // BUG 1 FIX (Step 1): Kiểm tra Wall Collision và Self Collision ngay TRƯỚC LÚC vẽ hay update body
    if (checkWallCollision(nextX, nextY) || checkSelfCollision(newHead)) {
        handleGameOver();
        return; // Dừng lập tức, không delay thêm 1 frame nào
    }
    
    // Add new head if safe
    snake.unshift(newHead);
    
    // Check if food is eaten
    if (newHead.x === food.x && newHead.y === food.y) {
        score += 10;
        generateFood();
        // Do NOT pop the tail to let the snake grow
    } else {
        // Remove tail
        snake.pop();
    }
}

// Hàm Test va chạm với viền (Tách rời theo chuẩn)
function checkWallCollision(nextX, nextY) {
    return (nextX < 0 || nextX >= tileCountX || nextY < 0 || nextY >= tileCountY);
}

// Hàm Test va chạm với thân (Tách rời theo chuẩn)
function checkSelfCollision(head) {
    for (let i = 0; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }
    return false;
}

function handleGameOver() {
    currentState = STATE.GAMEOVER;
    
    // BUG 3 FIX: Hủy requestAnimationFrame đang tồn tại phòng loop chạy nền vô nghĩa sau khi Game Over
    cancelAnimationFrame(animationId);
    
    // High Score logic (General)
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

    // Leaderboard logic: Ask for name
    const isTop10 = StorageManager.checkIfTop10(score, settings.difficulty);
    const nameSection = document.getElementById('nameInputSection');
    const btnSection = document.getElementById('gameOverBtns');

    if (isTop10) {
        nameSection.classList.remove('hidden');
        btnSection.classList.add('hidden'); // Hide normal buttons temporarily
        // Auto focus
        setTimeout(() => document.getElementById('playerNameInput').focus(), 100);
    } else {
        nameSection.classList.add('hidden');
        btnSection.classList.remove('hidden');
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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
    }
    
    // Handle Pause/Resume/Quit
    if (currentState === STATE.PLAYING && (e.key === 'r' || e.key === 'R')) {
        pauseGame();
        return;
    } else if (currentState === STATE.PAUSED && (e.key === 'r' || e.key === 'R')) {
        resumeGame();
        return;
    } else if (currentState === STATE.PLAYING && (e.key === 'q' || e.key === 'Q')) {
        quitGame();
        return;
    }

    // Only accept movement input if the game is playing
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

function pauseGame() {
    currentState = STATE.PAUSED;
    document.getElementById('pauseOverlay').classList.add('active');
    cancelAnimationFrame(animationId); // BUG 3 FIX: ngắt Loop khi nghỉ
}

function resumeGame() {
    currentState = STATE.PLAYING;
    document.getElementById('pauseOverlay').classList.remove('active');
    lastRenderTime = document.timeline ? document.timeline.currentTime : performance.now(); // Sync timer so no skipped frames
    animationId = window.requestAnimationFrame(gameLoop); // Gọi lại
}

function quitGame() {
    currentState = STATE.MENU;
    document.getElementById('pauseOverlay').classList.remove('active');
    document.getElementById('gameOverScreen').classList.remove('active');
    UIManager.switchScreen('screen-menu');
    
    // BUG 3 FIX: Cleanup Ghosting + Clear interval hoàn toàn
    cancelAnimationFrame(animationId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resetGame() {
    // Dọn dẹp Animation cũ trước khi tạo lại để ngăn tốc độ bị double
    if (animationId) cancelAnimationFrame(animationId);
    
    // Reset UI trước — screen-game phải VISIBLE trước khi đo kích thước canvas
    document.getElementById('currentScore').innerText = 0;
    document.getElementById('gameOverScreen').classList.remove('active');
    document.getElementById('pauseOverlay').classList.remove('active');
    document.getElementById('nameInputSection').classList.add('hidden');
    UIManager.switchScreen('screen-game');

    // Dùng requestAnimationFrame để đảm bảo DOM đã render và container đã visible
    // trước khi đo clientWidth/clientHeight
    requestAnimationFrame(() => {
        // CRITICAL: Gọi resizeCanvas() SAU khi screen-game đã visible
        resizeCanvas();

        // Rắn spawn ở giữa map
        const cx = Math.floor(tileCountX / 2);
        const cy = Math.floor(tileCountY / 2);
        snake = [
            { x: cx,     y: cy },
            { x: cx - 1, y: cy },
            { x: cx - 2, y: cy }
        ];
        score = 0;
        dx = 1;
        dy = 0;
        inputQueue = [];
        
        // Spawn mồi sau khi đã biết kích thước map thực
        generateFood();
        
        // Khởi động Game Loop
        currentState = STATE.PLAYING;
        lastRenderTime = document.timeline ? document.timeline.currentTime : performance.now();
        animationId = window.requestAnimationFrame(gameLoop);
    });
}

// UI Event Listeners - Start/Play triggers
document.getElementById('playMenuBtn').addEventListener('click', resetGame);
document.getElementById('playAgainBtn').addEventListener('click', resetGame);

// Leaderboard Input Submit Event
document.getElementById('submitNameBtn').addEventListener('click', () => {
    let name = document.getElementById('playerNameInput').value;
    // Basic sanitization
    name = name.replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 10);
    if (!name) name = "Anonymous";
    
    // Save to local storage
    StorageManager.saveScore(name, score, settings.difficulty);
    
    // Switch to Leaderboard
    document.getElementById('gameOverScreen').classList.remove('active');
    currentState = STATE.MENU;
    UIManager.renderLeaderboard(settings.difficulty);
    UIManager.switchScreen('screen-leaderboard');
});

// Additional Screen Switches
document.getElementById('backToMenuBtn').addEventListener('click', () => {
    document.getElementById('gameOverScreen').classList.remove('active');
    currentState = STATE.MENU;
    UIManager.switchScreen('screen-menu');
});

// Pause Menu Events
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('restartBtn').addEventListener('click', resetGame);
document.getElementById('quitBtn').addEventListener('click', quitGame);

// Menu -> Leaderboard
document.getElementById('leaderboardMenuBtn').addEventListener('click', () => {
    UIManager.renderLeaderboard(settings.difficulty); // default to current settings
    UIManager.switchScreen('screen-leaderboard');
});

// Leaderboard Tabs Clicking
document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const mode = e.target.dataset.mode;
        UIManager.renderLeaderboard(mode);
    });
});

// Settings Logic & Events
const difficultySelect = document.getElementById('difficultySelect');
const soundToggle = document.getElementById('soundToggle');

function renderSettingsUI() {
    difficultySelect.value = settings.difficulty;
    soundToggle.checked = settings.sound;
}

// Save Settings Button
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    settings.difficulty = difficultySelect.value;
    settings.sound = soundToggle.checked;
    localStorage.setItem('snakeSettings', JSON.stringify(settings));
    UIManager.switchScreen('screen-menu');
});

// Cancel Settings Button
document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
    // Revert without saving
    UIManager.switchScreen('screen-menu');
});

// Open Settings Menu
document.getElementById('settingsMenuBtn').addEventListener('click', () => {
    renderSettingsUI();
    UIManager.switchScreen('screen-settings');
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => UIManager.switchScreen('screen-menu'));
});

// Start visual loop
window.requestAnimationFrame(gameLoop);