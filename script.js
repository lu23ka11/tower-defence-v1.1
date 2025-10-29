const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

/* ----------------------
   State & constants
   ---------------------- */
let enemies = [];
let towers = [];
let bullets = [];
let pulses = [];

let speed = 0.002;
let spawnTimer = 0;
const spawnInterval = 200;

const shopHeight = 100;
const shopMargin = 20;
const towerRadius = 15;
const towerRange = 100;

let holdingTower = false;
let selectedTowerType = 'shooter';
let mousePos = { x: 0, y: 0 };

const slotSize = 70;
const gap = 20;
const slotStartX = 200;
const slotStartY = canvas.height - shopHeight / 2 - slotSize / 2;
const cancelBtn = { x: 400, y: canvas.height - shopHeight + 10, width: 80, height: 30 };

// Resources
let kills = 0;          // used to buy towers (increments by 1 when an enemy is defeated or when enemy escapes)
let defeatedCount = 0;  // total defeated count (used for boss spawn condition)
let currency = 0;       // used to buy upgrades
let playerHP = 30;
const maxPlayerHP = 30;
let gameOver = false;

// Purchase counters (used to increment buy cost)
let greenBoughtCount = 0; // first green free only once
let slowBoughtCount = 0;

/* Tower upgrade specs */
const shooterTowerSpecs = [
  { rate: 0.5, cost: 0 },   // base rate (level 0)
  { rate: 0.4, cost: 20 },  // upgrade -> level1 cost 20
  { rate: 0.2, cost: 50 },  // level2 cost 50
  { rate: 0.075, cost: 150 } // level3 cost 150
];

const slowTowerSpecs = [
  { cooldown: 5.0, slowPct: 0.30, duration: 2.0, cost: 0 },    // base
  { cooldown: 2.5, slowPct: 0.35, duration: 2.0, cost: 10 },   // upgrade1
  { cooldown: 1.5, slowPct: 0.37, duration: 2.0, cost: 30 },   // upgrade2
  { cooldown: 0.0, slowPct: 0.325, duration: Infinity, cost: 50 } // upgrade3 permanent slow
];

/* ----------------------
   Path (cubic bezier)
   ---------------------- */
function getPointOnCurve(t) {
  const p0 = { x: -100, y: 200 };
  const p1 = { x: 200, y: 100 };
  const p2 = { x: 600, y: canvas.height - shopHeight - shopMargin - 50 };
  const p3 = { x: 900, y: 200 };
  const x =
    Math.pow(1 - t, 3) * p0.x +
    3 * Math.pow(1 - t, 2) * t * p1.x +
    3 * (1 - t) * Math.pow(t, 2) * p2.x +
    Math.pow(t, 3) * p3.x;
  const y =
    Math.pow(1 - t, 3) * p0.y +
    3 * Math.pow(1 - t, 2) * t * p1.y +
    3 * (1 - t) * Math.pow(t, 2) * p2.y +
    Math.pow(t, 3) * p3.y;
  return { x, y };
}

function drawPath() {
  ctx.strokeStyle = 'gray';
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0; i <= 1; i += 0.01) {
    const p = getPointOnCurve(i);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

/* ----------------------
   Shop & HUD drawing
   ---------------------- */
function drawShopArea() {
  ctx.fillStyle = '#333';
  ctx.fillRect(0, canvas.height - shopHeight, canvas.width, shopHeight);

  // slots
  for (let i = 0; i < 4; i++) {
    const x = slotStartX + i * (slotSize + gap);
    const y = slotStartY;
    ctx.fillStyle = '#555';
    ctx.fillRect(x, y, slotSize, slotSize);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, slotSize, slotSize);
  }

  // shooter icon (slot 0)
  const shooterX = slotStartX + slotSize / 2;
  const shooterY = slotStartY + slotSize / 2;
  ctx.fillStyle = 'green';
  ctx.beginPath();
  ctx.arc(shooterX, shooterY, towerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('1', shooterX, shooterY + 30);

  // slow icon (slot 1)
  const slowX = slotStartX + (slotSize + gap) + slotSize / 2;
  const slowY = slotStartY + slotSize / 2;
  ctx.fillStyle = 'blue';
  ctx.beginPath();
  ctx.arc(slowX, slowY, towerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.fillText('2', slowX, slowY + 30);

  // cancel button hint
  if (holdingTower) {
    ctx.fillStyle = '#800';
    ctx.fillRect(cancelBtn.x, cancelBtn.y, cancelBtn.width, cancelBtn.height);
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cancel (Esc/C)', cancelBtn.x + cancelBtn.width / 2, cancelBtn.y + 20);
  }

  // currency square (top-right)
  ctx.fillStyle = '#0b0';
  ctx.fillRect(canvas.width - 110, 10, 100, 34);
  ctx.fillStyle = 'black';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(currency, canvas.width - 60, 32);

  // kills (used for buying towers)
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Kills (buy): ${kills}`, 10, canvas.height - shopHeight + 28);
}

/* ----------------------
   Towers draw & hover info
   ---------------------- */
function drawTowers() {
  for (const t of towers) {
    ctx.fillStyle = t.type === 'shooter' ? 'green' : 'blue';
    ctx.beginPath();
    ctx.arc(t.x, t.y, towerRadius, 0, Math.PI * 2);
    ctx.fill();

    // level indicator
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('L' + (t.level || 0), t.x, t.y + 4);
  }

  // hover info: upgrade cost & sell refund for the tower hovered
  for (const t of towers) {
    const d = Math.hypot(mousePos.x - t.x, mousePos.y - t.y);
    if (d < towerRadius + 10) {
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';

      // upgrade cost
      if (t.type === 'shooter') {
        const next = (t.level || 0) + 1;
        if (next < shooterTowerSpecs.length) ctx.fillText(`Upgrade: ${shooterTowerSpecs[next].cost} currency`, t.x, t.y - 22);
      } else {
        const next = (t.level || 0) + 1;
        if (next < slowTowerSpecs.length) ctx.fillText(`Upgrade: ${slowTowerSpecs[next].cost} currency`, t.x, t.y - 22);
      }

      // sell refund = floor(0.3 * upgradeSpent)
      const refund = Math.floor((t.upgradeSpent || 0) * 0.3);
      if (refund > 0) ctx.fillText(`Sell: ${refund} currency`, t.x, t.y + 24);
    }
  }
}

function drawHoldingTower() {
  if (!holdingTower) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,255,0,0.08)';
  ctx.beginPath();
  ctx.arc(mousePos.x, mousePos.y, towerRange, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = selectedTowerType === 'shooter' ? 'green' : 'blue';
  ctx.beginPath();
  ctx.arc(mousePos.x, mousePos.y, towerRadius, 0, Math.PI * 2);
  ctx.fill();
}

/* ----------------------
   Enemy spawn & draw
   ---------------------- */
function spawnEnemies() {
  spawnTimer++;
  if (spawnTimer < spawnInterval) return;
  spawnTimer = 0;

  // Boss every 25 defeated enemies (defeatedCount)
  if (defeatedCount > 0 && defeatedCount % 25 === 0 && !enemies.some(e => e.isBoss)) {
    const hp = 50;
    enemies.push({ t: 0, hp, maxHp: hp, isBoss: true, slowMultiplier: 1, slowExpires: 0 });
    return;
  }

  // normal spawn
  const hp = defeatedCount >= 10 ? Math.floor(Math.random() * 11) + 10 : Math.floor(Math.random() * 5) + 3;
  enemies.push({ t: 0, hp, maxHp: hp, slowMultiplier: 1, slowExpires: 0 });
}

function drawEnemies() {
  const now = Date.now();
  for (const e of enemies) {
    const pos = getPointOnCurve(e.t);
    e.x = pos.x + (e.xOffset || 0);
    e.y = pos.y + (e.yOffset || 0);

    // draw
    if (e.isBoss) {
      const ratio = 1 - e.hp / e.maxHp;
      const red = Math.min(255, Math.floor(255 * ratio));
      ctx.fillStyle = `rgb(${red},0,0)`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 30, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.maxHp >= 10) {
      const blueTone = Math.max(50, 255 - (e.hp - 10) * 20);
      ctx.fillStyle = `rgb(0,0,${blueTone})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const redTone = Math.max(50, 255 - (e.hp - 3) * 30);
      ctx.fillStyle = `rgb(${redTone},0,0)`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
      ctx.fill();
    }

    // hover HP number & green bar
    const distToMouse = Math.hypot(mousePos.x - e.x, mousePos.y - e.y);
    const hoverRadius = e.isBoss ? 30 : 15;
    if (distToMouse < hoverRadius) {
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`HP: ${e.hp}`, e.x, e.y - (e.isBoss ? 40 : 25));

      const barWidth = e.isBoss ? 60 : 30;
      const barHeight = 6;
      const barX = e.x - barWidth / 2;
      const barY = e.y + (e.isBoss ? 35 : 20);
      ctx.fillStyle = 'black';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = 'lime';
      ctx.fillRect(barX, barY, barWidth * (Math.max(0, e.hp) / e.maxHp), barHeight);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    // apply slow expiry
    if (e.slowExpires && e.slowExpires !== Infinity && now > e.slowExpires) {
      e.slowMultiplier = 1;
      e.slowExpires = 0;
    }
  }
}

/* ----------------------
   Tower behavior
   ---------------------- */
function towerShoot() {
  const now = Date.now();
  for (const t of towers) {
    if (t.type !== 'shooter') continue;
    if (!t.level && t.level !== 0) t.level = 0;
    if (!t.lastShot) t.lastShot = 0;
    const rate = shooterTowerSpecs[t.level || 0].rate * 1000;
    if (now - t.lastShot < rate) continue;

    const target = enemies.find(e => typeof e.x !== 'undefined' && Math.hypot(e.x - t.x, e.y - t.y) <= towerRange);
    if (target) {
      bullets.push({ x: t.x, y: t.y, enemyRef: target, speed: 3, targetPos: null });
      t.lastShot = now;
    }
  }
}

function updateSlowTowersAndPulses() {
  const now = Date.now();
  for (const t of towers) {
    if (t.type !== 'slow') continue;
    if (t.level === undefined) t.level = 0;
    if (!t.lastPulse) t.lastPulse = 0;
    const spec = slowTowerSpecs[t.level];

    // permanent effect if duration == Infinity
    if (spec.duration === Infinity) {
      for (const e of enemies) {
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d <= towerRange) {
          e.slowMultiplier = 1 - spec.slowPct;
          e.slowExpires = Infinity;
        } else if (e.slowExpires === Infinity) {
          e.slowMultiplier = 1;
          e.slowExpires = 0;
        }
      }
      continue;
    }

    if (now - t.lastPulse >= spec.cooldown * 1000) {
      t.lastPulse = now;
      for (const e of enemies) {
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d <= towerRange) {
          e.slowMultiplier = 1 - spec.slowPct;
          e.slowExpires = now + spec.duration * 1000;
        }
      }
      pulses.push({ x: t.x, y: t.y, start: now, duration: 800, maxRadius: towerRange });
    }
  }

  // cleanup pulses
  const now2 = Date.now();
  for (let i = pulses.length - 1; i >= 0; i--) {
    if (now2 - pulses[i].start > pulses[i].duration) pulses.splice(i, 1);
  }
}

/* ----------------------
   Bullets update/draw
   ---------------------- */
function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let targetX, targetY;
    if (b.enemyRef && enemies.includes(b.enemyRef)) {
      targetX = b.enemyRef.x;
      targetY = b.enemyRef.y;
    } else if (b.targetPos) {
      targetX = b.targetPos.x;
      targetY = b.targetPos.y;
    } else {
      bullets.splice(i, 1);
      continue;
    }

    const dx = targetX - b.x;
    const dy = targetY - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < (b.speed || 3)) {
      if (b.enemyRef && enemies.includes(b.enemyRef)) b.enemyRef.hp -= 1;
      bullets.splice(i, 1);
    } else {
      b.x += (dx / dist) * (b.speed || 3);
      b.y += (dy / dist) * (b.speed || 3);
    }
  }
}
function drawBullets() {
  ctx.fillStyle = 'yellow';
  for (const b of bullets) ctx.fillRect(b.x - 4, b.y - 4, 8, 8);
}
function drawPulses() {
  const now = Date.now();
  for (const p of pulses) {
    const elapsed = now - p.start;
    const t = Math.min(1, elapsed / p.duration);
    const r = p.maxRadius * t;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = `rgba(0,150,255,${1 - t})`;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ----------------------
   Handle Deaths & Splits
   ---------------------- */
function processDeath(e, countAsEscape = false) {
  // e is the enemy object that died (or was escaped counted as kill)
  // countAsEscape: true if this was the escaping enemy (we treat it as a kill for kills & defeatedCount,
  // but DO NOT give currency or spawn splits)
  if (countAsEscape) {
    defeatedCount++;
    kills++;
    return;
  }

  // normal death: award currency + counts
  defeatedCount++;
  kills++;

  if (e.isBoss) currency += 7;
  else if (e.maxHp >= 10) currency += 3;
  else currency += 2;

  // boss splits: spawn 3 red minis at death spot (spread)
  if (e.isBoss) {
    for (let j = 0; j < 3; j++) {
      enemies.push({
        t: e.t,
        hp: 5,
        maxHp: 5,
        xOffset: (j - 1) * 40,
        yOffset: (Math.random() - 0.5) * 30,
        slowMultiplier: 1,
        slowExpires: 0
      });
    }
  } else if (e.maxHp >= 10) {
    // blue split into 2 red with ceil(max/4) HP
    const newHP = Math.ceil(e.maxHp / 4);
    for (let j = 0; j < 2; j++) {
      enemies.push({
        t: e.t,
        hp: newHP,
        maxHp: newHP,
        xOffset: j === 0 ? -20 : 20,
        yOffset: (Math.random() - 0.5) * 20,
        slowMultiplier: 1,
        slowExpires: 0
      });
    }
  }
}

function handleEnemyDeaths() {
  // iterate backwards and process enemies with hp <= 0
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0) continue;

    // record death position
    const deathPos = { x: e.x, y: e.y };

    // reassign bullets tracking this enemy to go to death pos
    for (const b of bullets) {
      if (b.enemyRef === e) {
        b.targetPos = { x: deathPos.x + (Math.random() - 0.5) * 10, y: deathPos.y + (Math.random() - 0.5) * 10 };
        b.enemyRef = null;
      }
    }

    // remove and process death
    enemies.splice(i, 1);
    processDeath(e, false);
  }
}

/* ----------------------
   Enemy movement with escape mechanic
   ---------------------- */
function updateEnemiesAndHandleEscapes() {
  const now = Date.now();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const pos = getPointOnCurve(e.t);
    e.x = pos.x + (e.xOffset || 0);
    e.y = pos.y + (e.yOffset || 0);

    if (e.slowExpires && e.slowExpires !== Infinity && now > e.slowExpires) {
      e.slowMultiplier = 1;
      e.slowExpires = 0;
    }

    e.t += speed * (e.slowMultiplier || 1);

    if (e.t > 1) {
      // enemy escapes -> damage player
      const dmg = Math.ceil(e.hp / 2);
      playerHP -= dmg;

      // escaped enemy counts as a kill (increments kills & defeatedCount) but does NOT give currency or spawn splits
      processDeath(e, true);

      // apply same damage to all other enemies on screen
      for (let j = enemies.length - 1; j >= 0; j--) {
        if (enemies[j] === e) continue;
        enemies[j].hp -= dmg;
      }

      // reassign bullets originally targeting this enemy to go to its death location
      const deathPos = { x: e.x, y: e.y };
      for (const b of bullets) {
        if (b.enemyRef === e) {
          b.targetPos = { x: deathPos.x + (Math.random() - 0.5) * 10, y: deathPos.y + (Math.random() - 0.5) * 10 };
          b.enemyRef = null;
        }
      }

      // remove the escaped enemy from list
      enemies.splice(i, 1);

      // now, if any enemies died because of the splash damage, count them & give rewards
      handleEnemyDeaths();

      if (playerHP <= 0) gameOver = true;
    }
  }
}

/* ----------------------
   Input & placement & upgrades & selling (right-click)
   ---------------------- */
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mousePos.x = e.clientX - rect.left;
  mousePos.y = e.clientY - rect.top;
});

// quick placement keys
document.addEventListener('keydown', e => {
  if (e.key === '1') { selectedTowerType = 'shooter'; holdingTower = true; }
  if (e.key === '2') { selectedTowerType = 'slow'; holdingTower = true; }
  if (e.key === 'Escape' || e.key.toLowerCase() === 'c') holdingTower = false;
});

// left click: shop, place, or upgrade
canvas.addEventListener('mousedown', e => {
  if (gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // shop slot 0 (shooter)
  const slot0X = slotStartX, slot0Y = slotStartY;
  if (mx >= slot0X && mx <= slot0X + slotSize && my >= slot0Y && my <= slot0Y + slotSize) {
    selectedTowerType = 'shooter';
    holdingTower = true;
    return;
  }
  // shop slot 1 (slow)
  const slot1X = slotStartX + (slotSize + gap), slot1Y = slotStartY;
  if (mx >= slot1X && mx <= slot1X + slotSize && my >= slot1Y && my <= slot1Y + slotSize) {
    selectedTowerType = 'slow';
    holdingTower = true;
    return;
  }

  // cancel button while holding
  if (holdingTower && mx >= cancelBtn.x && mx <= cancelBtn.x + cancelBtn.width &&
    my >= cancelBtn.y && my <= cancelBtn.y + cancelBtn.height) {
    holdingTower = false;
    return;
  }

  // If not holding: check clicking on towers to upgrade
  if (!holdingTower) {
    for (const t of towers) {
      const d = Math.hypot(mx - t.x, my - t.y);
      if (d <= towerRadius + 4) {
        // upgrade logic
        const curLevel = t.level || 0;
        if (t.type === 'shooter') {
          const next = curLevel + 1;
          if (next < shooterTowerSpecs.length && currency >= shooterTowerSpecs[next].cost) {
            currency -= shooterTowerSpecs[next].cost;
            t.upgradeSpent = (t.upgradeSpent || 0) + shooterTowerSpecs[next].cost;
            t.level = next;
          }
        } else if (t.type === 'slow') {
          const next = curLevel + 1;
          if (next < slowTowerSpecs.length && currency >= slowTowerSpecs[next].cost) {
            currency -= slowTowerSpecs[next].cost;
            t.upgradeSpent = (t.upgradeSpent || 0) + slowTowerSpecs[next].cost;
            t.level = next;
          }
        }
        return; // processed a tower click
      }
    }
  }

  // placement: only if holding tower
  if (holdingTower) {
    if (mx < 0 || mx > canvas.width || my < 0 || my > canvas.height - shopHeight) return;
    if (isOnPath(mx, my)) return;
    if (isOnTower(mx, my)) return;

    // compute kills cost (not currency)
    let cost;
    if (selectedTowerType === 'shooter') {
      cost = (greenBoughtCount === 0) ? 0 : (greenBoughtCount + 1); // first free; afterwards 2,3,...
    } else {
      cost = 5 + slowBoughtCount; // slow: 5,6,7...
    }

    if (kills >= cost) {
      // deduct kills, place tower, increment purchase count
      kills -= cost;
      const newTower = { x: mx, y: my, type: selectedTowerType, level: 0, upgradeSpent: 0 };
      towers.push(newTower);
      if (selectedTowerType === 'shooter') greenBoughtCount++;
      else slowBoughtCount++;
      holdingTower = false;
    } else {
      // not enough kills -> do nothing
    }
  }
});

// right-click to sell towers (refund 30% of upgradeSpent)
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (Math.hypot(mx - t.x, my - t.y) <= towerRadius + 4) {
      const refund = Math.floor((t.upgradeSpent || 0) * 0.3);
      if (refund > 0) currency += refund;
      towers.splice(i, 1);
      return;
    }
  }
});

/* ----------------------
   Utilities
   ---------------------- */
function isOnPath(x, y) {
  for (let t = 0; t <= 1; t += 0.01) {
    const p = getPointOnCurve(t);
    if (Math.hypot(x - p.x, y - p.y) < 30) return true;
  }
  return false;
}
function isOnTower(x, y) {
  for (const t of towers) if (Math.hypot(x - t.x, y - t.y) < towerRadius * 2) return true;
  return false;
}

/* Restart handling */
canvas.addEventListener('click', e => {
  if (!gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const btnW = 200, btnH = 50;
  const btnX = canvas.width / 2 - btnW / 2, btnY = canvas.height / 2 + 20;
  if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) resetGame();
});
function resetGame() {
  enemies = [];
  towers = [];
  bullets = [];
  pulses = [];
  speed = 0.002;
  spawnTimer = 0;
  kills = 0;
  defeatedCount = 0;
  currency = 0;
  playerHP = maxPlayerHP;
  gameOver = false;
  holdingTower = false;
  selectedTowerType = 'shooter';
  greenBoughtCount = 0;
  slowBoughtCount = 0;
}

/* ----------------------
   Main loop
   ---------------------- */
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!gameOver) {
    spawnEnemies();
    drawPath();
    updateEnemiesAndHandleEscapes();
    handleEnemyDeaths(); // process any deaths from bullets/pulses earlier
    drawEnemies();

    drawTowers();
    drawShopArea();
    drawHoldingTower();

    towerShoot();
    updateBullets();
    drawBullets();

    updateSlowTowersAndPulses();
    drawPulses();

    drawHUD();
  } else {
    // Game over + restart
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'red';
    ctx.font = '50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

    const btnW = 200, btnH = 50;
    const btnX = canvas.width / 2 - btnW / 2, btnY = canvas.height / 2 + 20;
    ctx.fillStyle = '#0a0';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.fillText('Restart', canvas.width / 2, btnY + 32);
  }

  if (playerHP <= 0) gameOver = true;
  requestAnimationFrame(gameLoop);
}

/* HUD draw (HP, defeated) */
function drawHUD() {
  // HP bar top-left
  const barW = 120, barH = 30;
  ctx.fillStyle = 'black';
  ctx.fillRect(10, 10, barW, barH);
  ctx.fillStyle = 'green';
  ctx.fillRect(10, 10, barW * (playerHP / maxPlayerHP), barH);
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, barW, barH);
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`HP: ${playerHP}`, 10 + barW / 2, 10 + 20);

  // defeated count
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Defeated: ${defeatedCount}`, 10, 60);
}

/* start */
gameLoop();