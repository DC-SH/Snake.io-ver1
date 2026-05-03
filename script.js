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
    PAUSED: 3,
    READY: 4
};
let currentState = STATE.MENU;
let goTimer = null;
let showGoText = false;

// Game Data
let snake = [
    { x: 10, y: 10 }, // Head
    { x: 9, y: 10 },  // Body 1
    { x: 8, y: 10 }   // Body 2
];

let food = { x: 15, y: 10 };
let score = 0;
let obstacles = []; // Mảng chứa các toạ độ chướng ngại vật
let windmills = []; // Mảng quản lý các cối xay gió level 2
let pillars  = []; // Mảng chứa tọa độ pixel tâm của pillar (Level 3)
let bullets  = []; // Mảng chứa đạn (Level 3)
let guards   = []; // Mảng chứa lính canh (Level 3)
let sliders  = []; // Mảng thanh trượt (Level 3)
let bulletTimer = 0; // Biến đếm thời gian bắn


// UI Manager for SPA
const UIManager = {
    switchScreen: function(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        // Show target screen
        document.getElementById(screenId).classList.remove('hidden');

        // Toggle HUD score chip: only visible on game screen
        const hudChip = document.getElementById('hudChip');
        const headerHs = document.getElementById('headerHighScore');
        if (screenId === 'screen-game') {
            if (hudChip) hudChip.style.display = 'flex';
            if (headerHs) headerHs.style.display = 'none';
        } else {
            if (hudChip) hudChip.style.display = 'none';
            if (headerHs) headerHs.style.display = 'block';
            updateHighScoreUI();
        }

        // Sync sidebar active state
        const sideMap = {
            'screen-menu':        'side-play',
            'screen-leaderboard': 'side-leaderboard',
            'screen-settings':    'side-settings',
            'screen-game':        'side-play',
        };
        document.querySelectorAll('.side-nav-item').forEach(el => el.classList.remove('active'));
        const activeId = sideMap[screenId];
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) el.classList.add('active');
        }

        // Sync top nav active state
        const navMap = {
            'screen-menu':        'nav-play',
            'screen-game':        'nav-play',
            'screen-leaderboard': 'nav-leaderboard',
            'screen-settings':    'nav-settings',
        };
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        const activeNavId = navMap[screenId];
        if (activeNavId) {
            const el = document.getElementById(activeNavId);
            if (el) el.classList.add('active');
        }
    },

    // UIManager: Render leaderboard UI (Step 4)
    renderLeaderboard: function(level, difficulty) {
        // Update active Level tabs
        document.querySelectorAll('.lb-level-tab').forEach(tab => {
            if (parseInt(tab.dataset.level, 10) === level) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update active Difficulty tabs
        document.querySelectorAll('.lb-diff-tab').forEach(tab => {
            if (tab.dataset.mode === difficulty) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Render List
        const list = document.getElementById('leaderboardList');
        list.innerHTML = '';
        
        const data = StorageManager.getLeaderboard(level, difficulty);
        
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
        return {}; // Dynamic generation `{ "lvl1_easy": [], ... }`
    },
    
    saveStorage: function(data) {
        localStorage.setItem(this.getKey(), JSON.stringify(data));
    },
    
    getLeaderboard: function(level, difficulty) {
        const data = this.getStorage();
        const fullMode = `lvl${level}_${difficulty}`;
        return data[fullMode] || [];
    },
    
    checkIfTop10: function(score, level, difficulty) {
        if (score <= 0) return false;
        const leaderboard = this.getLeaderboard(level, difficulty);
        if (leaderboard.length < 10) return true;
        return score > leaderboard[leaderboard.length - 1].score;
    },
    
    saveScore: function(name, score, level, difficulty) {
        const data = this.getStorage();
        const fullMode = `lvl${level}_${difficulty}`;
        if (!data[fullMode]) data[fullMode] = [];
        
        data[fullMode].push({
            name: name || "Anonymous",
            score: parseInt(score, 10),
            timestamp: Date.now() // BONUS: Lưu timestamp
        });
        
        // Gọi hàm sort được yêu cầu
        this.sortLeaderboard(data[fullMode]);
        
        // Retain only top 10
        data[fullMode] = data[fullMode].slice(0, 10);
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

// BUG 1 FIX: Highscore dùng key đồng nhất lvl${level}_${difficulty} (không dùng key cũ)
function getHighScore(level, difficulty) {
    const data = StorageManager.getStorage();
    const key = `lvl${level}_${difficulty}`;
    const list = data[key] || [];
    return list.length > 0 ? list[0].score : 0;
}

function updateHighScoreUI() {
    const hs = getHighScore(settings.level, settings.difficulty);
    document.getElementById('highScore').innerText = hs;
    document.getElementById('highScoreMenu').innerText = hs;
}

function generateFood() {
    // Đảm bảo x trong [0, maxCols - 1] và y trong [0, maxRows - 1]
    const freeSpots = [];
    let maxCols = tileCountX;
    let maxRows = tileCountY;

    for (let x = 0; x < maxCols; x++) {
        for (let y = 0; y < maxRows; y++) {
            // Kiểm tra xem tọa độ này có đang bị thân rắn đè lên không
            let isOccupiedBySnake = snake.some(segment => segment.x === x && segment.y === y);
            // Kiểm tra tọa độ có trùng chướng ngại vật không (Map Level 1)
            let isOccupiedByObstacle = obstacles && obstacles.some(obs => obs.x === x && obs.y === y);
            
            if (!isOccupiedBySnake && !isOccupiedByObstacle) {
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
const defaultSettings = { level: 1, difficulty: 'medium', sound: true };
let settings = JSON.parse(localStorage.getItem('snakeSettings')) || defaultSettings;

// Handle missing fields gracefully for existing users
if (typeof settings.sound === 'undefined') settings.sound = true;
if (typeof settings.level === 'undefined') settings.level = 1;

const DIFF_SPEEDS = {
    easy: 150, // ms per frame (slowest)
    medium: 100, // ms per frame
    hard: 60    // ms per frame (fastest)
};
let lastTick = 0;
let animationId; // BUG 3 FIX: Lưu trữ ID để quản lý vòng lặp (tránh double loop)

// Main Game Loop using requestAnimationFrame
function gameLoop(currentTime) {
    animationId = window.requestAnimationFrame(gameLoop);
    
    // Xoay frame-by-frame mượt mà (Level 2)
    if (windmills && windmills.length > 0 && currentState === STATE.PLAYING) {
        windmills.forEach(w => w.angle += w.speed);
    }

    // Level 3 Bullets Logic (Pixel updates frame-by-frame)
    if (settings.level === 3 && currentState === STATE.PLAYING) {
        const bulletSpeed = settings.difficulty === 'easy' ? 2 : (settings.difficulty === 'medium' ? 4 : 6);
        const fireRate = settings.difficulty === 'easy' ? 90 : (settings.difficulty === 'medium' ? 60 : 40);

        bulletTimer++;
        if (bulletTimer >= fireRate) {
            bulletTimer = 0;
            // Lính canh bắn
            let headPxX = snake[0].x * GRID_SIZE + GRID_SIZE / 2;
            let headPxY = snake[0].y * GRID_SIZE + GRID_SIZE / 2;
            pillars.filter(p => p.isShooter).forEach(shooter => {
                // shooter.x, shooter.y đã là pixel tâm
                let sPxX = shooter.x;
                let sPxY = shooter.y;
                let angle = Math.atan2(headPxY - sPxY, headPxX - sPxX);
                bullets.push({
                    x: sPxX,
                    y: sPxY,
                    vx: Math.cos(angle) * bulletSpeed,
                    vy: Math.sin(angle) * bulletSpeed
                });
            });
        }

        // Cập nhật vị trí đạn & giới hạn
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            
            // Xóa đạn ra khỏi màn hình
            if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
                bullets.splice(i, 1);
                continue;
            }
            
            // Va chạm đạn với rắn (Khoảng cách < GRID_SIZE / 2)
            let hit = false;
            for (let seg of snake) {
                let segPxX = seg.x * GRID_SIZE + GRID_SIZE / 2;
                let segPxY = seg.y * GRID_SIZE + GRID_SIZE / 2;
                let dist = Math.hypot(b.x - segPxX, b.y - segPxY);
                if (dist < GRID_SIZE / 2) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                handleGameOver();
                break; // Dừng check frame này
            }
        }

        // Cập nhật 4 Sliders
        if (typeof sliders !== 'undefined' && sliders.length > 0) {
            sliders.forEach(s => {
                s.x += s.vx;
                s.y += s.vy;
                
                // Đảo chiều nếu chạm viền canvas
                if (s.vx !== 0) {
                    if (s.x <= 0 || s.x + s.w >= canvas.width) {
                        s.vx = -s.vx;
                        s.x = s.x <= 0 ? 0 : canvas.width - s.w;
                    }
                }
                if (s.vy !== 0) {
                    if (s.y <= 0 || s.y + s.h >= canvas.height) {
                        s.vy = -s.vy;
                        s.y = s.y <= 0 ? 0 : canvas.height - s.h;
                    }
                }
            });
            
            // Kiểm tra va chạm slider ngay sau khi di chuyển
            if (checkSliderCollision()) {
                handleGameOver();
            }
        }
    }

    // Cập nhật Grid (Snake Tick): tách biệt logic với Render
    const tickRate = DIFF_SPEEDS[settings.difficulty];
    if (currentTime - lastTick >= tickRate) {
        lastTick = currentTime;
        update();
    }

    // Cập nhật Pixel (Render mọi frame - 60 FPS)
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
    let nextX = snake[0].x + dx;
    let nextY = snake[0].y + dy;
    
    // Level 3 Portal logic (Xuyên viền)
    if (settings.level === 3) {
        if (nextX < 0) nextX = tileCountX - 1;
        else if (nextX >= tileCountX) nextX = 0;
        
        if (nextY < 0) nextY = tileCountY - 1;
        else if (nextY >= tileCountY) nextY = 0;
    }

    const newHead = { x: nextX, y: nextY };
    
    // BUG 1 FIX (Step 1): Kiểm tra Wall Collision và Self Collision ngay TRƯỚC LÚC vẽ hay update body
    let isWallHit = false;
    if (settings.level !== 3) {
        isWallHit = checkWallCollision(nextX, nextY);
    }

    if (isWallHit || checkSelfCollision(newHead) || checkObstacleCollision(newHead) || checkWindmillCollision(newHead)) {
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

// Hàm Test va chạm với chướng ngại vật level map
function checkObstacleCollision(head) {
    if (!obstacles || obstacles.length === 0) return false;
    for (let i = 0; i < obstacles.length; i++) {
        if (head.x === obstacles[i].x && head.y === obstacles[i].y) {
            return true;
        }
    }
    return false;
}

function checkWindmillCollision(head) {
    if (!windmills || windmills.length === 0) return false;

    // Convert đầu grid sang pixel trung tâm
    let headPxX = head.x * GRID_SIZE + GRID_SIZE / 2;
    let headPxY = head.y * GRID_SIZE + GRID_SIZE / 2;
    
    for (let w of windmills) {
        // Tọa độ point của head relative với tâm cối xay
        let dx = headPxX - w.x;
        let dy = headPxY - w.y;
        
        // Phép Transform quay điểm về 0 để xét va chạm OBB theo AABB
        let cosA = Math.cos(-w.angle);
        let sinA = Math.sin(-w.angle);
        let rotX = dx * cosA - dy * sinA;
        let rotY = dx * sinA + dy * cosA;
        
        let hLen = w.length / 2;
        let hThick = w.thickness / 2;
        
        // Kiểm tra nằm trong vạch ngang
        let inHoriz = (Math.abs(rotX) <= hLen) && (Math.abs(rotY) <= hThick);
        // Kiểm tra nằm trong vạch dọc
        let inVert = (Math.abs(rotX) <= hThick) && (Math.abs(rotY) <= hLen);
        
        if (inHoriz || inVert) return true;
    }
    
    return false;
}

// Hàm Test va chạm với thanh trượt Level 3
function checkSliderCollision() {
    if (typeof sliders === 'undefined' || sliders.length === 0) return false;
    
    for (let s of sliders) {
        let sLeft = s.x;
        let sRight = s.x + s.w;
        let sTop = s.y;
        let sBottom = s.y + s.h;
        
        for (let seg of snake) {
            let segLeft = seg.x * GRID_SIZE;
            let segRight = segLeft + GRID_SIZE;
            let segTop = seg.y * GRID_SIZE;
            let segBottom = segTop + GRID_SIZE;
            
            // Va chạm AABB
            if (segRight > sLeft && segLeft < sRight && segBottom > sTop && segTop < sBottom) {
                return true;
            }
        }
    }
    return false;
}

function handleGameOver() {
    currentState = STATE.GAMEOVER;
    
    // BUG 3 FIX: Hủy requestAnimationFrame đang tồn tại phòng loop chạy nền vô nghĩa sau khi Game Over
    cancelAnimationFrame(animationId);
    
    // BUG 1 FIX: Highscore theo key đồng nhất lvl_diff
    const newHighScoreMsg = document.getElementById('newHighScoreMsg');
    const currentHighScore = getHighScore(settings.level, settings.difficulty);
    if (score > currentHighScore) {
        newHighScoreMsg.classList.remove('hidden');
    } else {
        newHighScoreMsg.classList.add('hidden');
    }
    updateHighScoreUI();

    // Leaderboard logic: Ask for name
    const isTop10 = StorageManager.checkIfTop10(score, settings.level, settings.difficulty);
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
    
    // 2. Draw Obstacles (Level Map)
    if (obstacles && obstacles.length > 0) {
        ctx.fillStyle = '#1e3d59'; // Màu khối gạch xanh đen trầm
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#00f3ff'; // Viền Neon mờ cho chướng ngại vật
        obstacles.forEach(obs => {
            ctx.fillRect(obs.x * GRID_SIZE + 1, obs.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
        });
    }

    // 4 Shooters (Lvl 3)
    if (settings.level === 3 && pillars && pillars.length > 0) {
        ctx.fillStyle = '#ff3300'; // Màu Đỏ Cam chỉ định Shooter
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff3300';
        
        let shooters = pillars.filter(p => p.isShooter);
        shooters.forEach(s => {
            // Vẽ đè lại cụm 2x2 bằng màu đỏ cam
            ctx.fillRect(s.px * GRID_SIZE + 1, s.py * GRID_SIZE + 1, GRID_SIZE * 2 - 2, GRID_SIZE * 2 - 2);
            
            // Tính góc súng hướng về tâm đầu rắn
            let headPxX = snake[0].x * GRID_SIZE + GRID_SIZE / 2;
            let headPxY = snake[0].y * GRID_SIZE + GRID_SIZE / 2;
            let angle = Math.atan2(headPxY - s.y, headPxX - s.x);
            
            // Vẽ nòng súng nhỏ chỉa về rắn
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, GRID_SIZE / 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + Math.cos(angle) * (GRID_SIZE * 1.5), s.y + Math.sin(angle) * (GRID_SIZE * 1.5));
            ctx.stroke();

            ctx.fillStyle = '#ff3300'; // Trả lại màu để vẽ tiếp shooter sau
        });

        // Bullets
        ctx.fillStyle = '#ffff00'; // Vàng neon
        ctx.shadowColor = '#ffff00';
        bullets.forEach(b => {
            ctx.beginPath();
            ctx.arc(b.x, b.y, GRID_SIZE / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
        });
    }
    
    // Draw Level 2 Windmills
    if (windmills && windmills.length > 0) {
        ctx.fillStyle = '#ff5722'; // Màu cam cảnh báo
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff5722';
        
        windmills.forEach(w => {
            ctx.save(); // Checkpoint state
            ctx.translate(w.x, w.y);
            ctx.rotate(w.angle);
            
            let cxLen = w.length;
            let cThick = w.thickness;
            
            // Vẽ Hình chữ nhật ngang
            ctx.fillRect(-cxLen / 2, -cThick / 2, cxLen, cThick);
            // Vẽ Hình chữ nhật dọc
            ctx.fillRect(-cThick / 2, -cxLen / 2, cThick, cxLen);
            
            ctx.restore(); // Khôi phục state chưa rotate
        });
    }
    
    // Draw Level 3 Sliders
    if (typeof sliders !== 'undefined' && sliders.length > 0) {
        ctx.fillStyle = '#ffaa00'; // Vàng cam neon
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffaa00';
        
        sliders.forEach(s => {
            ctx.fillRect(s.x, s.y, s.w, s.h);
        });
    }
    
    // 3. Draw Food (Neon Red/Pink)
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
    
    // Draw Overlay Text (READY / GO)
    if (currentState === STATE.READY || showGoText) {
        ctx.fillStyle = currentState === STATE.READY ? '#ffff00' : '#39ff14'; // Vàng cho READY, Xanh cho GO
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.font = 'bold ' + Math.floor(GRID_SIZE * 3) + 'px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let msg = currentState === STATE.READY ? 'READY...' : 'GO!';
        ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
    }

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
    lastTick = document.timeline ? document.timeline.currentTime : performance.now(); // Sync timer so no skipped frames
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

// Generate Map & Obstacles
function generateLevelMap() {
    // BUG 2 FIX: Hard-reset tất cả entity arrays trước khi setup map mới
    obstacles = [];
    windmills = [];
    pillars   = [];
    bullets   = [];
    sliders   = [];
    guards    = [];
    bulletTimer = 0;
    
    if (settings.level === 1) {
        let cx = Math.floor(tileCountX / 2);
        let cy = Math.floor(tileCountY / 2);
        
        // 1. Chữ thập ở giữa (Độ dài = 30% map)
        let crossLenX = Math.floor(tileCountX * 0.3);
        let crossLenY = Math.floor(tileCountY * 0.3);
        
        // Vẽ đường ngang
        for (let i = -Math.floor(crossLenX / 2); i <= Math.floor(crossLenX / 2); i++) {
            obstacles.push({ x: cx + i, y: cy });
        }
        // Vẽ đường dọc
        for (let j = -Math.floor(crossLenY / 2); j <= Math.floor(crossLenY / 2); j++) {
            if (j !== 0) obstacles.push({ x: cx, y: cy + j }); // Tránh đè lại tâm
        }
        
        // 2. Các ô vuông 4 góc (3x3 grid)
        let blockSize = 3;
        // Top-left
        for (let i = 0; i < blockSize; i++) {
            for (let j = 0; j < blockSize; j++) {
                obstacles.push({ x: i, y: j });
            }
        }
        // Top-right
        for (let i = 0; i < blockSize; i++) {
            for (let j = 0; j < blockSize; j++) {
                obstacles.push({ x: tileCountX - 1 - i, y: j });
            }
        }
        // Bottom-left
        for (let i = 0; i < blockSize; i++) {
            for (let j = 0; j < blockSize; j++) {
                obstacles.push({ x: i, y: tileCountY - 1 - j });
            }
        }
        // Bottom-right
        for (let i = 0; i < blockSize; i++) {
            for (let j = 0; j < blockSize; j++) {
                obstacles.push({ x: tileCountX - 1 - i, y: tileCountY - 1 - j });
            }
        }
    } else if (settings.level === 2) {
        // Tốc độ phụ thuộc độ khó
        let curSpeed = 0.02;
        if (settings.difficulty === 'medium') curSpeed = 0.04;
        if (settings.difficulty === 'hard') curSpeed = 0.06;

        let centerLen = Math.min(canvas.width, canvas.height) * 0.4;
        let cornerLen = centerLen * 0.6; // Ngắn hơn xíu ở các góc
        let thick = GRID_SIZE * 1.5;

        windmills = [
            { x: canvas.width / 2, y: canvas.height / 2, angle: 0, speed: curSpeed, length: centerLen, thickness: thick },
            { x: canvas.width * 0.25, y: canvas.height * 0.25, angle: 0, speed: curSpeed * 1.2, length: cornerLen, thickness: thick },
            { x: canvas.width * 0.75, y: canvas.height * 0.25, angle: 0, speed: -curSpeed * 1.2, length: cornerLen, thickness: thick },
            { x: canvas.width * 0.25, y: canvas.height * 0.75, angle: 0, speed: -curSpeed * 1.2, length: cornerLen, thickness: thick },
            { x: canvas.width * 0.75, y: canvas.height * 0.75, angle: 0, speed: curSpeed * 1.2, length: cornerLen, thickness: thick }
        ];
    } else if (settings.level === 3) {
        pillars = [];
        let maxCols = tileCountX;
        let maxRows = tileCountY;

        // Vòng lặp chia grid 4x4 để đặt 16 pillar đối xứng
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let px = Math.floor((i + 0.5) * (maxCols / 4));
                let py = Math.floor((j + 0.5) * (maxRows / 4));

                // Thêm 4 ô (2x2) vào obstacles
                obstacles.push({ x: px, y: py });
                obstacles.push({ x: px + 1, y: py });
                obstacles.push({ x: px, y: py + 1 });
                obstacles.push({ x: px + 1, y: py + 1 });
                
                // Push tọa độ pixel tâm của pillar vào mảng pillars
                let centerPxX = (px + 1) * GRID_SIZE;
                let centerPxY = (py + 1) * GRID_SIZE;
                
                // Gắn cờ isShooter cho 4 pillar ở trung tâm (i và j là 1 hoặc 2)
                let isShooter = (i === 1 || i === 2) && (j === 1 || j === 2);
                pillars.push({ x: centerPxX, y: centerPxY, px: px, py: py, isShooter: isShooter });
            }
        }
        
        guards = []; // Reset lính canh (chưa gán ở bước này)
        bullets = [];
        bulletTimer = 0;
        
        // Khởi tạo 4 sliders (Thanh trượt)
        let sliderSpeed = settings.difficulty === 'easy' ? 2 : (settings.difficulty === 'medium' ? 4 : 6);
        sliders = [
            // Top (ngang)
            { x: 0, y: 0, w: GRID_SIZE * 4, h: GRID_SIZE, vx: sliderSpeed, vy: 0 },
            // Bottom (ngang)
            { x: canvas.width - GRID_SIZE * 4, y: canvas.height - GRID_SIZE, w: GRID_SIZE * 4, h: GRID_SIZE, vx: -sliderSpeed, vy: 0 },
            // Left (dọc)
            { x: 0, y: 0, w: GRID_SIZE, h: GRID_SIZE * 4, vx: 0, vy: sliderSpeed },
            // Right (dọc)
            { x: canvas.width - GRID_SIZE, y: canvas.height - GRID_SIZE * 4, w: GRID_SIZE, h: GRID_SIZE * 4, vx: 0, vy: -sliderSpeed }
        ];
    } else {
        // Clear object nếu là Level khác
        windmills = [];
        guards = [];
        bullets = [];
        pillars = [];
        sliders = [];
    }
}

function resetGame() {
    // HARD RESET: Dọn sạch toàn bộ mảng entity để tránh State Leak giữa các lần chơi
    obstacles = [];
    windmills = [];
    pillars  = [];
    bullets  = [];
    sliders  = [];
    guards   = [];
    bulletTimer = 0;

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
        generateLevelMap(); // Sinh map cho level hiện tại

        const cx = Math.floor(tileCountX / 2);
        let cy = Math.floor(tileCountY / 2);
        
        let startDx = 1;
        let startDy = 0;

        // Tránh đoạn chặn Level 1 & 2 (Dịch rắn xuống dưới, quay đầu lên trên)
        if (settings.level === 1 || settings.level === 2) {
            cy = Math.floor(tileCountY * 0.8);
            startDx = 0;
            startDy = -1; // Đi lên
        } else if (settings.level === 3) {
            // Spawn sát cạnh dưới cùng, an toàn cho Level 3
            cy = Math.floor(tileCountY * 0.9);
            startDx = 0;
            startDy = -1; // Đi lên
        }

        snake = [
            { x: cx,                 y: cy },
            { x: cx - startDx,       y: cy - startDy },
            { x: cx - startDx * 2,   y: cy - startDy * 2 }
        ];
        score = 0;
        dx = startDx;
        dy = startDy;
        inputQueue = [];
        
        // Spawn mồi sau khi đã biết kích thước map thực
        generateFood();
        
        // Khởi động trạng thái READY
        currentState = STATE.READY;
        showGoText = false;
        
        // Vẽ frame đầu tiên để user thấy map và text "READY..."
        draw();
        
        // Hủy timeout cũ nếu spam reset
        if (goTimer) clearTimeout(goTimer);
        
        // Đếm ngược 1 giây trước khi chạy
        goTimer = setTimeout(() => {
            currentState = STATE.PLAYING;
            showGoText = true;
            lastTick = document.timeline ? document.timeline.currentTime : performance.now();
            
            // Xóa text GO sau 500ms
            setTimeout(() => showGoText = false, 500);
            
        }, 1000);

        // Animation Loop cứ chạy liên tục nhưng logic update bị block bởi currentState
        lastTick = document.timeline ? document.timeline.currentTime : performance.now();
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
    StorageManager.saveScore(name, score, settings.level, settings.difficulty);
    
    // Switch to Leaderboard
    document.getElementById('gameOverScreen').classList.remove('active');
    currentState = STATE.MENU;
    UIManager.renderLeaderboard(settings.level, settings.difficulty);
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
    UIManager.renderLeaderboard(settings.level, settings.difficulty); // default to current settings
    UIManager.switchScreen('screen-leaderboard');
});

// Leaderboard Tabs Clicking
document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const isLevelTab = e.target.classList.contains('lb-level-tab');
        
        let activeLevel = isLevelTab ? parseInt(e.target.dataset.level, 10) : parseInt(document.querySelector('.lb-level-tab.active').dataset.level, 10);
        let activeDiff = !isLevelTab ? e.target.dataset.mode : document.querySelector('.lb-diff-tab.active').dataset.mode;
        
        UIManager.renderLeaderboard(activeLevel, activeDiff);
    });
});

// Settings Logic & Events
const levelSelect = document.getElementById('levelSelect');
const difficultySelect = document.getElementById('difficultySelect');
const soundToggle = document.getElementById('soundToggle');

function renderSettingsUI() {
    levelSelect.value = settings.level;
    difficultySelect.value = settings.difficulty;
    soundToggle.checked = settings.sound;
}

// Save Settings Button
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    settings.level = parseInt(levelSelect.value, 10);
    settings.difficulty = difficultySelect.value;
    settings.sound = soundToggle.checked;
    localStorage.setItem('snakeSettings', JSON.stringify(settings));
    updateHighScoreUI(); // Refresh highscore display for new level/difficulty
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