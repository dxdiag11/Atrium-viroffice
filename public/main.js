// Map, movement, rendering, and the socket wiring. Globals used: io, canMove, RADIUS, NEAR, FAR.

const SPEED = 200;      // px per second
const SEND_HZ = 15;     // position updates per second
const LERP = 12;        // remote position smoothing per second

const socket = io();
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const players = {};     // id -> { id, name, color, x, y, rx, ry }
const held = new Set();

let myId = null;
let map = null;
let background = null;
let showRange = false;
let seated = null;      // index into map.seats, or null when standing
let lastSent = 0;
let sentX = null;
let sentY = null;

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};
window.addEventListener('resize', resize);
resize();

// --- map -------------------------------------------------------------------

async function loadMap() {
  map = buildOffice();
  // Real artwork wins if it is there. Otherwise the office is drawn from the same data
  // the walls come from, so what you see is always exactly what you bump into.
  background = await loadImage('assets/map.png').catch(() => loadImage(officeSvgUrl()));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('cannot load ' + src));
    img.src = src;
  });
}

// --- join ------------------------------------------------------------------

document.getElementById('join').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const error = document.getElementById('error');
  button.disabled = true;
  error.hidden = true;

  try {
    await startVoice(); // myId arrives with the server's player snapshot
    socket.emit('join', { name: document.getElementById('name').value.trim() || 'anon' });
  } catch (err) {
    error.textContent = 'Mic access failed: ' + err.message;
    error.hidden = false;
    button.disabled = false;
  }
});

document.getElementById('mute').addEventListener('click', (e) => {
  const on = e.currentTarget.classList.toggle('on');
  setMuted(on);
  e.currentTarget.textContent = on ? 'Unmute mic' : 'Mute mic';
});

// --- socket ----------------------------------------------------------------

socket.on('players', (all, id) => {
  myId = id;
  setSelfId(id);
  for (const p of Object.values(all)) addPlayer(p);
  for (const otherId of Object.keys(all)) {
    if (otherId !== myId) connectPeer(otherId);
  }
  document.getElementById('gate').hidden = true;
  document.getElementById('hud').hidden = false;
});

socket.on('player-joined', (p) => {
  addPlayer(p);
  connectPeer(p.id);
});

socket.on('player-moved', ({ id, x, y }) => {
  const p = players[id];
  if (!p) return;
  p.x = x;
  p.y = y;
});

socket.on('player-left', (id) => {
  delete players[id];
  closePeer(id);
});

socket.on('signal', ({ from, data }) => handleSignal(from, data));

socket.on('disconnect', () => {
  for (const id of Object.keys(players)) if (id !== myId) closePeer(id);
});

function addPlayer(p) {
  players[p.id] = { ...p, rx: p.x, ry: p.y };
}

// --- input -----------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '`') showRange = !showRange;
  if (e.key.toLowerCase() === 'e' && players[myId]) toggleSit(players[myId]);
  held.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

function axis(negKeys, posKeys) {
  const neg = negKeys.some((k) => held.has(k)) ? -1 : 0;
  const pos = posKeys.some((k) => held.has(k)) ? 1 : 0;
  return neg + pos;
}

// Stepping out of a chair puts you behind it, i.e. opposite the way you were facing.
const STAND_OFFSET = { up: [0, 44], down: [0, -44], left: [44, 0], right: [-44, 0] };

function nearestSeat(me) {
  let best = -1;
  let bestDist = 70;
  map.seats.forEach((seat, i) => {
    const d = Math.hypot(seat.x - me.x, seat.y - me.y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function toggleSit(me) {
  if (seated !== null) return stand(me);
  const i = nearestSeat(me);
  if (i < 0) return;
  seated = i;
  me.x = map.seats[i].x;
  me.y = map.seats[i].y;
}

// step=false when you walk out of the chair: you are already moving, so pushing you
// backwards first would visibly jerk you the wrong way.
function stand(me, step = true) {
  const seat = map.seats[seated];
  seated = null;
  if (!step) return;
  const [ox, oy] = STAND_OFFSET[seat.dir] || [0, 44];
  const nx = clamp(me.x + ox, RADIUS, map.width - RADIUS);
  const ny = clamp(me.y + oy, RADIUS, map.height - RADIUS);
  if (canMove(nx, ny, RADIUS, map.collisions)) {
    me.x = nx;
    me.y = ny;
  }
}

function move(me, dt) {
  let dx = axis(['a', 'arrowleft'], ['d', 'arrowright']);
  let dy = axis(['w', 'arrowup'], ['s', 'arrowdown']);
  if (!dx && !dy) return;
  if (seated !== null) stand(me, false); // walking away from a chair gets you out of it

  if (dx && dy) {
    const inv = Math.SQRT1_2; // keep diagonals the same speed as straight lines
    dx *= inv;
    dy *= inv;
  }
  const step = SPEED * dt;

  // Axis-separated so hitting a wall on one axis still allows sliding on the other.
  const nx = clamp(me.x + dx * step, RADIUS, map.width - RADIUS);
  if (canMove(nx, me.y, RADIUS, map.collisions)) me.x = nx;

  const ny = clamp(me.y + dy * step, RADIUS, map.height - RADIUS);
  if (canMove(me.x, ny, RADIUS, map.collisions)) me.y = ny;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// --- loop ------------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap so a background tab can't teleport
  last = now;

  const me = players[myId];
  if (me) {
    move(me, dt);
    me.rx = me.x;
    me.ry = me.y;

    // Remote positions arrive at SEND_HZ; ease toward them so motion looks continuous.
    const t = Math.min(1, LERP * dt);
    for (const p of Object.values(players)) {
      if (p.id === myId) continue;
      p.rx += (p.x - p.rx) * t;
      p.ry += (p.y - p.ry) * t;
    }

    if (now - lastSent > 1000 / SEND_HZ && (me.x !== sentX || me.y !== sentY)) {
      socket.emit('move', { x: me.x, y: me.y });
      lastSent = now;
      sentX = me.x;
      sentY = me.y;
    }

  }

  draw(me);
  requestAnimationFrame(frame);
}

function draw(me) {
  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!map || !me) return;

  const camX = clamp(me.x - canvas.width / 2, 0, Math.max(0, map.width - canvas.width));
  const camY = clamp(me.y - canvas.height / 2, 0, Math.max(0, map.height - canvas.height));

  ctx.save();
  ctx.translate(-camX, -camY);

  if (background) ctx.drawImage(background, 0, 0, map.width, map.height);

  if (showRange) {
    for (const [radius, color] of [[NEAR, '#4fd08a'], [FAR, '#4f7fd0']]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(me.x, me.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (const p of Object.values(players)) drawPlayer(p, p.id === myId);

  const hint = seated !== null ? 'E to stand' : nearestSeat(me) >= 0 ? 'E to sit' : null;
  if (hint) {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe0b0';
    ctx.fillText(hint, me.x, me.y + RADIUS + 20);
  }

  ctx.restore();
}

function drawPlayer(p, isSelf) {
  ctx.beginPath();
  ctx.arc(p.rx, p.ry, RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = isSelf ? 3 : 2;
  ctx.strokeStyle = isSelf ? '#ffffff' : 'rgba(0,0,0,0.4)';
  ctx.stroke();

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8eaf0';
  ctx.fillText(p.name, p.rx, p.ry - RADIUS - 6);
}

// Audio runs on a timer, not on rAF: a hidden tab pauses rAF entirely, which would
// freeze everyone's volume at whatever it was when you switched away. 10 Hz is plenty
// given the 0.08s smoothing on each gain.
setInterval(() => {
  const me = players[myId];
  if (!me) return;
  const audible = updateSpatialAudio(me, players);
  document.getElementById('peers').textContent = audible + ' nearby';
}, 100);

loadMap().then(() => requestAnimationFrame(frame));
