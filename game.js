/* ===================================
   FLAPPY BIRD — Complete Game Logic
   Canvas-based, smooth 60fps engine
   =================================== */

'use strict';

// ─────────────────────────────────────────────────────────────
//  CONSTANTS & CONFIG
// ─────────────────────────────────────────────────────────────
const CFG = {
  GRAVITY:        0.42,
  FLAP_STRENGTH: -8.5,
  PIPE_SPEED:     3.2,
  PIPE_GAP:       170,
  PIPE_INTERVAL:  1600,   // ms between pipe spawns
  PIPE_WIDTH:     64,
  BIRD_SIZE:      34,
  BIRD_X_RATIO:   0.22,
  CANVAS_W:       420,
  CANVAS_H:       640,
  GROUND_H:       80,
  SKY_SCROLL_SPD: 0.4,
  BG_SCROLL_SPD:  0.8,
  PIPE_SPEED_INC: 0.0003, // speed increases gradually
};

// ─────────────────────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────────────────────
const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
const scoreDisplay  = document.getElementById('scoreDisplay');
const bestDisplay   = document.getElementById('bestDisplay');
const startScreen   = document.getElementById('startScreen');
const gameOverScreen= document.getElementById('gameOverScreen');
const startBtn      = document.getElementById('startBtn');
const restartBtn    = document.getElementById('restartBtn');
const menuBtn       = document.getElementById('menuBtn');
const finalScore    = document.getElementById('finalScore');
const finalBest     = document.getElementById('finalBest');
const medalArea     = document.getElementById('medalArea');
const scorePopup    = document.getElementById('scorePopup');
const bgParticles   = document.getElementById('bgParticles');

// ─────────────────────────────────────────────────────────────
//  CANVAS SIZING
// ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const maxH = window.innerHeight - 90;
  const maxW = window.innerWidth  - 32;
  const scale = Math.min(maxW / CFG.CANVAS_W, maxH / CFG.CANVAS_H, 1);
  canvas.width  = CFG.CANVAS_W;
  canvas.height = CFG.CANVAS_H;
  canvas.style.width  = Math.floor(CFG.CANVAS_W * scale) + 'px';
  canvas.style.height = Math.floor(CFG.CANVAS_H * scale) + 'px';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
let state = 'idle'; // idle | playing | dead
let score = 0;
let best  = parseInt(localStorage.getItem('flappy_best') || '0');
bestDisplay.textContent = best;

let bird, pipes, lastPipeTime, bgX, groundX, frameCount, pipeSpeed;
let animFrame;
let popupTimeout;

// ─────────────────────────────────────────────────────────────
//  BIRD OBJECT
// ─────────────────────────────────────────────────────────────
function createBird() {
  return {
    x:        CFG.CANVAS_W * CFG.BIRD_X_RATIO,
    y:        CFG.CANVAS_H * 0.42,
    vy:       0,
    angle:    0,
    alive:    true,
    // Wing animation
    wingPhase: 0,
    // Trail particles
    trail:    [],
  };
}

function flapBird() {
  if (!bird.alive) return;
  bird.vy = CFG.FLAP_STRENGTH;
  bird.wingPhase = 0;
  // Flap SFX (Web Audio API)
  playTone(440, 0.05, 'triangle');
}

// ─────────────────────────────────────────────────────────────
//  WEB AUDIO
// ─────────────────────────────────────────────────────────────
let audioCtx;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.18) {
  try {
    const ctx2 = getAudioCtx();
    const osc  = ctx2.createOscillator();
    const gain = ctx2.createGain();
    osc.connect(gain);
    gain.connect(ctx2.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx2.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + dur);
    osc.start(ctx2.currentTime);
    osc.stop(ctx2.currentTime + dur);
  } catch(e) {}
}

function playScoreSound() {
  playTone(660, 0.1, 'sine', 0.15);
  setTimeout(() => playTone(880, 0.1, 'sine', 0.12), 80);
}

function playDeathSound() {
  playTone(200, 0.3, 'sawtooth', 0.2);
  setTimeout(() => playTone(120, 0.4, 'sawtooth', 0.15), 150);
}

// ─────────────────────────────────────────────────────────────
//  PIPES
// ─────────────────────────────────────────────────────────────
function spawnPipe() {
  const minTop = 80;
  const maxTop = CFG.CANVAS_H - CFG.GROUND_H - CFG.PIPE_GAP - 80;
  const topH   = minTop + Math.random() * (maxTop - minTop);
  pipes.push({
    x:      CFG.CANVAS_W + CFG.PIPE_WIDTH,
    topH:   topH,
    scored: false,
    // glow color cycling
    hue:    Math.floor(Math.random() * 360),
  });
}

// ─────────────────────────────────────────────────────────────
//  GAME INIT / RESET
// ─────────────────────────────────────────────────────────────
function initGame() {
  bird        = createBird();
  pipes       = [];
  bgX         = 0;
  groundX     = 0;
  frameCount  = 0;
  score       = 0;
  pipeSpeed   = CFG.PIPE_SPEED;
  lastPipeTime= performance.now() + 1000; // 1s delay before first pipe
  scoreDisplay.textContent = '0';
}

// ─────────────────────────────────────────────────────────────
//  DRAWING HELPERS
// ─────────────────────────────────────────────────────────────

/* Sky gradient */
function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, CFG.CANVAS_H - CFG.GROUND_H);
  grad.addColorStop(0,    '#04060f');
  grad.addColorStop(0.4,  '#060d1f');
  grad.addColorStop(1,    '#0a1830');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CFG.CANVAS_W, CFG.CANVAS_H - CFG.GROUND_H);
}

/* Stars */
const STARS = Array.from({length: 80}, () => ({
  x: Math.random() * CFG.CANVAS_W,
  y: Math.random() * (CFG.CANVAS_H - CFG.GROUND_H - 20),
  r: Math.random() * 1.5 + 0.3,
  twinkle: Math.random() * Math.PI * 2,
  speed: 0.03 + Math.random() * 0.04,
}));

function drawStars(t) {
  STARS.forEach(s => {
    s.twinkle += s.speed;
    const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fill();
  });
}

/* Neon city skyline (background buildings) */
const BUILDINGS = Array.from({length: 14}, (_, i) => ({
  x: (i / 14) * CFG.CANVAS_W + Math.random() * 20,
  w: 24 + Math.random() * 38,
  h: 60 + Math.random() * 110,
  hue: Math.floor(Math.random() * 360),
  windows: Array.from({length: 12}, () => ({
    on: Math.random() > 0.45,
    wy: Math.random(),
    wx: Math.random(),
  })),
}));

function drawCityscape() {
  BUILDINGS.forEach(b => {
    const yBase = CFG.CANVAS_H - CFG.GROUND_H;
    const bx = ((b.x - bgX * 0.3) % CFG.CANVAS_W + CFG.CANVAS_W) % CFG.CANVAS_W;

    // Building body
    ctx.fillStyle = `hsl(${b.hue}, 30%, 8%)`;
    ctx.fillRect(bx, yBase - b.h, b.w, b.h);

    // Neon edge glow
    ctx.strokeStyle = `hsla(${b.hue}, 80%, 60%, 0.35)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, yBase - b.h, b.w, b.h);

    // Windows
    b.windows.forEach(w => {
      if (!w.on) return;
      const wx = bx + 5 + w.wx * (b.w - 12);
      const wy = (yBase - b.h) + 8 + w.wy * (b.h - 16);
      ctx.fillStyle = `hsla(${b.hue}, 80%, 70%, 0.5)`;
      ctx.fillRect(wx, wy, 5, 4);
    });

    // Antenna
    if (b.h > 120) {
      ctx.fillStyle = `hsla(${b.hue}, 100%, 70%, 0.8)`;
      ctx.fillRect(bx + b.w / 2 - 1, yBase - b.h - 14, 2, 14);
      ctx.beginPath();
      ctx.arc(bx + b.w / 2, yBase - b.h - 14, 3, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${b.hue}, 100%, 70%)`;
      ctx.fill();
    }
  });
}

/* Ground */
function drawGround() {
  const y = CFG.CANVAS_H - CFG.GROUND_H;
  // Ground base
  const gGrad = ctx.createLinearGradient(0, y, 0, CFG.CANVAS_H);
  gGrad.addColorStop(0,   '#0d1a0d');
  gGrad.addColorStop(0.15,'#122612');
  gGrad.addColorStop(1,   '#050a05');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, y, CFG.CANVAS_W, CFG.GROUND_H);

  // Neon line
  ctx.strokeStyle = 'rgba(57, 255, 20, 0.6)';
  ctx.lineWidth   = 2;
  ctx.shadowColor = '#39ff14';
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(CFG.CANVAS_W, y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Ground stripes (scrolling)
  ctx.fillStyle = 'rgba(57, 255, 20, 0.06)';
  const stripeW = 40;
  const offset  = groundX % (stripeW * 2);
  for (let x = -stripeW * 2 + offset; x < CFG.CANVAS_W + stripeW; x += stripeW * 2) {
    ctx.fillRect(x, y + 2, stripeW, CFG.GROUND_H - 2);
  }
}

/* Pipes */
function drawPipes() {
  pipes.forEach(p => {
    const botY = p.topH + CFG.PIPE_GAP;
    drawPipe(p.x, p.topH, true, p.hue);
    drawPipe(p.x, botY, false, p.hue);
  });
}

function drawPipe(x, yEnd, isTop, hue) {
  const w = CFG.PIPE_WIDTH;
  const y = isTop ? 0 : yEnd;
  const h = isTop ? yEnd : (CFG.CANVAS_H - CFG.GROUND_H - yEnd);
  const capH = 22;
  const capW = w + 10;
  const capX = x - 5;
  const capY = isTop ? yEnd - capH : yEnd;

  // Body gradient
  const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
  bodyGrad.addColorStop(0,    `hsl(${hue}, 70%, 10%)`);
  bodyGrad.addColorStop(0.3,  `hsl(${hue}, 70%, 28%)`);
  bodyGrad.addColorStop(0.65, `hsl(${hue}, 80%, 35%)`);
  bodyGrad.addColorStop(1,    `hsl(${hue}, 60%, 18%)`);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, w, h);

  // Neon edge glow
  ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 0.8)`;
  ctx.lineWidth   = 2;
  ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
  ctx.shadowBlur  = 12;
  ctx.strokeRect(x, y, w, h);

  // Cap
  const capGrad = ctx.createLinearGradient(capX, 0, capX + capW, 0);
  capGrad.addColorStop(0,   `hsl(${hue}, 70%, 18%)`);
  capGrad.addColorStop(0.3, `hsl(${hue}, 80%, 40%)`);
  capGrad.addColorStop(1,   `hsl(${hue}, 60%, 20%)`);
  ctx.fillStyle = capGrad;
  roundRect(capX, capY, capW, capH, isTop ? [0,0,6,6] : [6,6,0,0]);
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue}, 90%, 70%, 0.9)`;
  ctx.lineWidth   = 1.5;
  roundRect(capX, capY, capW, capH, isTop ? [0,0,6,6] : [6,6,0,0]);
  ctx.stroke();
  ctx.shadowBlur  = 0;
}

function roundRect(x, y, w, h, radii) {
  const [tl, tr, br, bl] = radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/* Bird */
function drawBird() {
  const b = bird;
  b.wingPhase += 0.35;
  const wingAngle = Math.sin(b.wingPhase) * 0.55;

  ctx.save();
  ctx.translate(b.x, b.y);

  // Clamp angle between -45° and 90°
  const targetAngle = b.vy * 0.055;
  b.angle += (targetAngle - b.angle) * 0.18;
  const clampedAngle = Math.max(-0.7, Math.min(1.4, b.angle));
  ctx.rotate(clampedAngle);

  const s = CFG.BIRD_SIZE;
  const hs = s / 2;

  // Trail glow
  if (state === 'playing') {
    b.trail.unshift({ x: 0, y: 0, alpha: 0.5 });
    if (b.trail.length > 8) b.trail.pop();
    b.trail.forEach((t, i) => {
      t.alpha -= 0.06;
      ctx.beginPath();
      ctx.arc(-i * 4, 0, hs * (1 - i * 0.1), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 245, 255, ${Math.max(0, t.alpha)})`;
      ctx.fill();
    });
  }

  // Body shadow / glow
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur  = 18;

  // Wing (bottom)
  ctx.save();
  ctx.rotate(wingAngle - 0.3);
  ctx.beginPath();
  ctx.ellipse(-4, 6, hs * 0.6, hs * 0.35, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#00c0c8';
  ctx.fill();
  ctx.restore();

  // Body
  const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, hs);
  bodyGrad.addColorStop(0,   '#fff');
  bodyGrad.addColorStop(0.3, '#00f5ff');
  bodyGrad.addColorStop(0.7, '#0077ff');
  bodyGrad.addColorStop(1,   '#003080');
  ctx.beginPath();
  ctx.ellipse(0, 0, hs, hs * 0.82, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Wing (top)
  ctx.save();
  ctx.rotate(-wingAngle - 0.2);
  ctx.beginPath();
  ctx.ellipse(-4, -7, hs * 0.55, hs * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#7ef4ff';
  ctx.fill();
  ctx.restore();

  // Eye
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(7, -5, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(8.5, -5, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#001a33';
  ctx.fill();
  // Pupil shine
  ctx.beginPath();
  ctx.arc(9.5, -6.5, 1, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Beak
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(22, 0);
  ctx.lineTo(14, 4);
  ctx.closePath();
  const beakGrad = ctx.createLinearGradient(14, -2, 22, 4);
  beakGrad.addColorStop(0, '#ffd700');
  beakGrad.addColorStop(1, '#ff9500');
  ctx.fillStyle = beakGrad;
  ctx.fill();

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
//  COLLISION DETECTION
// ─────────────────────────────────────────────────────────────
function checkCollisions() {
  const bx = bird.x;
  const by = bird.y;
  const br = (CFG.BIRD_SIZE / 2) - 5; // slightly forgiving hitbox

  // Ground & ceiling
  if (by + br >= CFG.CANVAS_H - CFG.GROUND_H || by - br <= 0) return true;

  // Pipes
  for (const p of pipes) {
    const pl = p.x;
    const pr = p.x + CFG.PIPE_WIDTH;
    const botY = p.topH + CFG.PIPE_GAP;

    if (bx + br > pl && bx - br < pr) {
      if (by - br < p.topH || by + br > botY) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
//  SCORE
// ─────────────────────────────────────────────────────────────
function checkScore() {
  pipes.forEach(p => {
    if (!p.scored && p.x + CFG.PIPE_WIDTH < bird.x) {
      p.scored = true;
      score++;
      scoreDisplay.textContent = score;
      playScoreSound();
      showScorePopup();
    }
  });
}

function showScorePopup() {
  if (popupTimeout) clearTimeout(popupTimeout);
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width  / CFG.CANVAS_W;
  const scaleY = rect.height / CFG.CANVAS_H;
  scorePopup.style.left = (rect.left + bird.x * scaleX - 20) + 'px';
  scorePopup.style.top  = (rect.top  + bird.y * scaleY - 30) + 'px';
  scorePopup.classList.remove('hidden');
  void scorePopup.offsetWidth; // reflow
  scorePopup.style.animation = 'none';
  void scorePopup.offsetWidth;
  scorePopup.style.animation = '';
  popupTimeout = setTimeout(() => scorePopup.classList.add('hidden'), 900);
}

// ─────────────────────────────────────────────────────────────
//  DEATH SEQUENCE
// ─────────────────────────────────────────────────────────────
function killBird() {
  bird.alive = false;
  state = 'dead';
  playDeathSound();
  // Screen shake
  shakeCanvas();
  // Update best
  if (score > best) {
    best = score;
    localStorage.setItem('flappy_best', best);
  }
  setTimeout(showGameOver, 700);
}

let shakeAmt = 0;
function shakeCanvas() {
  shakeAmt = 10;
}

function showGameOver() {
  finalScore.textContent = score;
  finalBest.textContent  = best;
  // Medal
  let medal = '';
  if      (score >= 40) medal = '🏆';
  else if (score >= 20) medal = '🥇';
  else if (score >= 10) medal = '🥈';
  else if (score >=  5) medal = '🥉';
  medalArea.textContent = medal;
  bestDisplay.textContent = best;
  gameOverScreen.classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────
//  MAIN GAME LOOP
// ─────────────────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 16.67, 3); // normalized to 60fps
  lastTime = ts;

  frameCount++;

  // Scroll backgrounds
  bgX     += CFG.BG_SCROLL_SPD * dt;
  groundX += pipeSpeed * dt;

  if (state === 'playing') {
    // Gradually increase difficulty
    pipeSpeed = CFG.PIPE_SPEED + frameCount * CFG.PIPE_SPEED_INC;

    // Physics
    bird.vy += CFG.GRAVITY * dt;
    bird.y  += bird.vy * dt;

    // Spawn pipes
    if (ts - lastPipeTime > CFG.PIPE_INTERVAL) {
      spawnPipe();
      lastPipeTime = ts;
    }

    // Move & cull pipes
    pipes.forEach(p => p.x -= pipeSpeed * dt);
    pipes = pipes.filter(p => p.x > -CFG.PIPE_WIDTH - 20);

    // Checks
    checkScore();
    if (checkCollisions()) killBird();
  }

  // ── Draw ──
  ctx.save();
  if (shakeAmt > 0) {
    const sx = (Math.random() - 0.5) * shakeAmt;
    const sy = (Math.random() - 0.5) * shakeAmt;
    ctx.translate(sx, sy);
    shakeAmt *= 0.75;
    if (shakeAmt < 0.5) shakeAmt = 0;
  }

  drawSky();
  drawStars(ts);
  drawCityscape();
  drawPipes();
  drawGround();

  if (state !== 'idle' && bird) drawBird();

  // Idle float animation
  if (state === 'idle' && bird) {
    bird.y = CFG.CANVAS_H * 0.42 + Math.sin(ts * 0.002) * 10;
    drawBird();
  }

  ctx.restore();

  animFrame = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────────
//  INPUT HANDLING
// ─────────────────────────────────────────────────────────────
function handleFlap() {
  if (state === 'playing') {
    flapBird();
  }
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    handleFlap();
  }
});

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  handleFlap();
});

startBtn.addEventListener('click', () => {
  startGame();
});

restartBtn.addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  startGame();
});

menuBtn.addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  state = 'idle';
  initGame();
  bird.y = CFG.CANVAS_H * 0.42;
  startScreen.classList.remove('hidden');
});

// ─────────────────────────────────────────────────────────────
//  START GAME
// ─────────────────────────────────────────────────────────────
function startGame() {
  startScreen.classList.add('hidden');
  initGame();
  state = 'playing';
  flapBird();
}

// ─────────────────────────────────────────────────────────────
//  BACKGROUND PARTICLES (DOM)
// ─────────────────────────────────────────────────────────────
const PARTICLE_COLORS = [
  'rgba(0,245,255,0.6)',
  'rgba(191,90,242,0.5)',
  'rgba(255,0,110,0.4)',
  'rgba(57,255,20,0.4)',
  'rgba(255,223,0,0.4)',
];

function spawnBgParticle() {
  const el = document.createElement('div');
  el.className = 'particle';
  const size = 2 + Math.random() * 4;
  el.style.cssText = `
    width:${size}px; height:${size}px;
    left:${Math.random()*100}%;
    background:${PARTICLE_COLORS[Math.floor(Math.random()*PARTICLE_COLORS.length)]};
    animation-duration:${6+Math.random()*8}s;
    animation-delay:${Math.random()*4}s;
    box-shadow:0 0 ${size*3}px currentColor;
  `;
  bgParticles.appendChild(el);
  setTimeout(() => el.remove(), 14000);
}

setInterval(spawnBgParticle, 600);
for (let i = 0; i < 12; i++) spawnBgParticle();

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
initGame();
state = 'idle';
animFrame = requestAnimationFrame(gameLoop);
