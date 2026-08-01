const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  wave: document.getElementById("wave"),
  light: document.getElementById("light"),
  health: document.getElementById("health"),
  score: document.getElementById("score"),
  message: document.getElementById("message"),
  bestScore: document.getElementById("best-score"),
  bestScoreNote: document.getElementById("best-score-note"),
  upgrade: document.getElementById("upgrade"),
  upgradeButtons: [...document.querySelectorAll("[data-upgrade]")],
};

const bestScoreKey = "lumen-grove-best-score";
const keys = new Set();
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

let game;
let lastTime = performance.now();
let toastTimer = 0;
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);

function resetGame() {
  game = {
    state: "playing",
    w: 960,
    h: 640,
    wave: 1,
    score: 0,
    targetLight: 6,
    deposited: 0,
    motes: [],
    enemies: [],
    particles: [],
    treePulse: 0,
    scoreSubmitted: false,
    player: {
      x: 480,
      y: 340,
      r: 15,
      speed: 245,
      health: 3,
      carry: 0,
      carryMax: 3,
      dashCooldown: 0,
      dashCooldownMax: 1.25,
      dashTime: 0,
      invuln: 0,
      vx: 0,
      vy: 0,
    },
  };
  spawnWave();
  showMessage("Aduna lumina si du-o la copacul din centru.");
  syncHud();
}

function spawnWave() {
  game.deposited = 0;
  game.targetLight = 5 + game.wave;
  game.motes = [];
  game.enemies = [];
  for (let i = 0; i < game.targetLight + 4; i += 1) spawnMote();
  for (let i = 0; i < 2 + Math.floor(game.wave * 0.75); i += 1) spawnEnemy(i);
}

function spawnMote() {
  const tree = getTree();
  let mote;
  do {
    mote = { x: rand(64, game.w - 64), y: rand(92, game.h - 64), r: 8 };
  } while (dist(mote, tree) < 120);
  game.motes.push(mote);
}

function spawnEnemy(index) {
  const side = Math.floor(Math.random() * 4);
  const enemy = {
    x: side === 0 ? 30 : side === 1 ? game.w - 30 : rand(40, game.w - 40),
    y: side === 2 ? 90 : side === 3 ? game.h - 30 : rand(90, game.h - 40),
    r: 14,
    speed: 82 + game.wave * 8 + index * 3,
    wobble: Math.random() * Math.PI * 2,
  };
  game.enemies.push(enemy);
}

function update(dt) {
  if (game.state !== "playing") {
    updateParticles(dt);
    return;
  }

  const p = game.player;
  let ax = 0;
  let ay = 0;
  if (keys.has("arrowleft") || keys.has("a")) ax -= 1;
  if (keys.has("arrowright") || keys.has("d")) ax += 1;
  if (keys.has("arrowup") || keys.has("w")) ay -= 1;
  if (keys.has("arrowdown") || keys.has("s")) ay += 1;

  const len = Math.hypot(ax, ay) || 1;
  const dashBoost = p.dashTime > 0 ? 2.65 : 1;
  p.vx = (ax / len) * p.speed * dashBoost;
  p.vy = (ay / len) * p.speed * dashBoost;
  p.x = clamp(p.x + p.vx * dt, 24, game.w - 24);
  p.y = clamp(p.y + p.vy * dt, 86, game.h - 24);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.dashTime = Math.max(0, p.dashTime - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  for (const enemy of game.enemies) {
    enemy.wobble += dt * 3.4;
    const angle = Math.atan2(p.y - enemy.y, p.x - enemy.x) + Math.sin(enemy.wobble) * 0.36;
    enemy.x += Math.cos(angle) * enemy.speed * dt;
    enemy.y += Math.sin(angle) * enemy.speed * dt;
    if (dist(enemy, p) < enemy.r + p.r && p.invuln <= 0 && p.dashTime <= 0) hurtPlayer();
  }

  for (let i = game.motes.length - 1; i >= 0; i -= 1) {
    const mote = game.motes[i];
    if (dist(mote, p) < mote.r + p.r + 5 && p.carry < p.carryMax) {
      game.motes.splice(i, 1);
      p.carry += 1;
      game.score += 25;
      addParticles(mote.x, mote.y, "#f3cf59", 14);
      showMessage(p.carry >= p.carryMax ? "Plin. Du lumina la copac." : "Lumina culeasa.");
    }
  }

  const tree = getTree();
  if (p.carry > 0 && dist(p, tree) < tree.r + p.r + 10) {
    game.deposited += p.carry;
    game.score += p.carry * 120;
    addParticles(tree.x, tree.y, "#67d99c", 24 + p.carry * 6);
    game.treePulse = 0.45;
    p.carry = 0;
    while (game.motes.length < 6) spawnMote();
    if (game.deposited >= game.targetLight) completeWave();
    else showMessage("Copacul prinde viata.");
  }

  game.treePulse = Math.max(0, game.treePulse - dt);
  updateParticles(dt);
  syncHud();
}

function completeWave() {
  game.state = "upgrade";
  game.score += 350 + game.wave * 80;
  ui.upgrade.hidden = false;
  showMessage(`Nivelul ${game.wave} curatat.`);
}

function applyUpgrade(kind) {
  const p = game.player;
  if (kind === "speed") p.speed += 28;
  if (kind === "dash") p.dashCooldownMax = Math.max(0.55, p.dashCooldownMax - 0.18);
  if (kind === "carry") p.carryMax += 1;
  game.wave += 1;
  game.state = "playing";
  ui.upgrade.hidden = true;
  spawnWave();
  showMessage("Nivel nou. Ritmul creste.");
  syncHud();
}

function dash() {
  const p = game.player;
  if (game.state !== "playing" || p.dashCooldown > 0) return;
  p.dashTime = 0.16;
  p.invuln = 0.22;
  p.dashCooldown = p.dashCooldownMax;
  addParticles(p.x, p.y, "#8fe9ff", 18);
}

function hurtPlayer() {
  const p = game.player;
  p.health -= 1;
  p.invuln = 1.25;
  p.carry = Math.max(0, p.carry - 1);
  addParticles(p.x, p.y, "#ff6685", 30);
  showMessage(p.health > 0 ? "Ai pierdut lumina. Foloseste dash-ul." : "Game over. Apasa R.");
  if (p.health <= 0) {
    game.state = "lost";
    submitScore();
  }
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
}

function addParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const force = rand(50, 220);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: rand(0.35, 0.85),
      color,
    });
  }
}

function render() {
  const m = metrics();
  const sx = m.w / game.w;
  const sy = m.h / game.h;
  ctx.save();
  ctx.scale(sx, sy);
  drawWorld();
  ctx.restore();
}

function drawWorld() {
  const gradient = ctx.createLinearGradient(0, 0, game.w, game.h);
  gradient.addColorStop(0, "#172315");
  gradient.addColorStop(0.55, "#18251d");
  gradient.addColorStop(1, "#211729");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, game.w, game.h);

  drawGround();
  drawTree();
  for (const mote of game.motes) drawMote(mote);
  for (const enemy of game.enemies) drawEnemy(enemy);
  drawPlayer();
  drawParticles();
  if (game.state === "lost") drawGameOver();
}

function drawGround() {
  ctx.strokeStyle = "rgba(247, 241, 221, 0.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x < game.w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 78);
    ctx.lineTo(x, game.h);
    ctx.stroke();
  }
  for (let y = 96; y < game.h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(game.w, y);
    ctx.stroke();
  }
}

function drawTree() {
  const tree = getTree();
  const pulse = 1 + game.treePulse * 0.35;
  ctx.save();
  ctx.translate(tree.x, tree.y);
  ctx.shadowColor = "#67d99c";
  ctx.shadowBlur = 24 + game.treePulse * 38;
  ctx.fillStyle = "#67d99c";
  ctx.beginPath();
  ctx.arc(0, 0, tree.r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 241, 168, 0.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, tree.r + 16, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * game.deposited) / game.targetLight);
  ctx.stroke();
  ctx.restore();
}

function drawMote(mote) {
  ctx.save();
  ctx.translate(mote.x, mote.y);
  ctx.shadowColor = "#f3cf59";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#f3cf59";
  ctx.beginPath();
  ctx.arc(0, 0, mote.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.wobble);
  ctx.shadowColor = "#b44b86";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#7d3c77";
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const radius = i % 2 ? enemy.r * 0.72 : enemy.r * 1.22;
    const angle = (Math.PI * 2 * i) / 8;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0 ? 0.55 : 1;
  ctx.shadowColor = p.dashTime > 0 ? "#8fe9ff" : "#fff1a8";
  ctx.shadowBlur = p.dashTime > 0 ? 26 : 14;
  ctx.fillStyle = p.dashTime > 0 ? "#8fe9ff" : "#fff1a8";
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1b2518";
  ctx.beginPath();
  ctx.arc(5, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < p.carry; i += 1) {
    const angle = (Math.PI * 2 * i) / Math.max(1, p.carry);
    ctx.fillStyle = "#f3cf59";
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 25, Math.sin(angle) * 25, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = clamp(particle.life, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawGameOver() {
  ctx.fillStyle = "rgba(10, 12, 10, 0.58)";
  ctx.fillRect(0, 0, game.w, game.h);
  ctx.fillStyle = "#fff1a8";
  ctx.textAlign = "center";
  ctx.font = "900 64px Inter, sans-serif";
  ctx.fillText("GAME OVER", game.w / 2, game.h / 2 - 24);
  ctx.font = "700 24px Inter, sans-serif";
  ctx.fillText("Apasa R ca sa reincerci", game.w / 2, game.h / 2 + 24);
}

let canvasMetrics;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * scale);
  const height = Math.round(rect.height * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  canvasMetrics = { w: rect.width, h: rect.height };
}

function metrics() {
  return canvasMetrics;
}

function getTree() {
  return { x: game.w / 2, y: game.h / 2 + 16, r: 36 };
}

function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}

function syncHud() {
  setText(ui.wave, game.wave);
  setText(ui.light, `${Math.min(game.deposited, game.targetLight)}/${game.targetLight}`);
  setText(ui.health, game.player.health);
  setText(ui.score, game.score);
  setText(ui.bestScore, bestScore);
}

function showMessage(text) {
  ui.message.textContent = text;
  ui.message.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.message.classList.remove("show"), 2200);
}

function submitScore() {
  if (game.scoreSubmitted) return;
  game.scoreSubmitted = true;

  if (game.score > bestScore) {
    bestScore = game.score;
    localStorage.setItem(bestScoreKey, String(bestScore));
    ui.bestScoreNote.textContent = `Record nou la nivelul ${game.wave}.`;
    syncHud();
    showMessage("Record nou salvat.");
    return;
  }

  ui.bestScoreNote.textContent = `Recordul tau ramane ${bestScore}.`;
  showMessage(`Recordul tau ramane ${bestScore}.`);
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar"].includes(key)) {
    event.preventDefault();
  }
  if (key === " " || key === "spacebar") dash();
  if (key === "r" && game.state === "lost") resetGame();
  keys.add(key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener("resize", resizeCanvas);

ui.upgradeButtons.forEach((button) => {
  button.addEventListener("click", () => applyUpgrade(button.dataset.upgrade));
});

ui.bestScore.textContent = bestScore;
resizeCanvas();
resetGame();
requestAnimationFrame(loop);
