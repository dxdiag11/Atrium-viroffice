// Map, movement, rendering, and the socket wiring. Globals used: io, canMove, RADIUS, NEAR, FAR.

const SPEED = 200;      // px per second
const SEND_HZ = 15;     // position updates per second
const LERP = 12;        // remote position smoothing per second

const socket = io();
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const players = {};     // id -> { id, name, color, x, y, rx, ry }
const speaking = new Map(); // id -> smoothed mic level, 0..1, for the speaking ring
const held = new Set();

let myId = null;
let map = null;
let background = null;
let showRange = false;
let radioHolder = null; // socket id currently holding the walkie channel
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

socket.on('players', (all, id, holder) => {
  myId = id;
  radioHolder = holder || null;
  setSelfId(id);
  for (const p of Object.values(all)) addPlayer(p);
  for (const otherId of Object.keys(all)) {
    if (otherId !== myId) connectPeer(otherId);
  }
  document.getElementById('gate').hidden = true;
  document.getElementById('hud').hidden = false;
  renderRadio();

  // Someone may already be mid-transmission when we walk in: the 'radio' event that
  // raises the handset fired before we were here to hear it.
  if (radioHolder) {
    const talker = players[radioHolder];
    showWalkie(talker ? talker.name : '', radioHolder === myId);
  }
  document.getElementById('chat').hidden = false;
});

socket.on('player-joined', (p) => {
  addPlayer(p);
  connectPeer(p.id);
  refreshSuggest(); // an open @-list must show whoever just walked in
});

socket.on('player-seat', ({ id, seat, x, y }) => {
  const p = players[id];
  if (!p) return;
  p.seat = seat;
  p.x = x;
  p.y = y;
  if (id === myId) {
    p.rx = x;
    p.ry = y;
    sentX = x; // the server already knows this position, don't echo it back
    sentY = y;
  }
});

socket.on('player-moved', ({ id, x, y }) => {
  const p = players[id];
  if (!p) return;
  p.x = x;
  p.y = y;
});

socket.on('player-left', (id) => {
  delete players[id];
  speaking.delete(id);
  closePeer(id);
  refreshSuggest();
});

socket.on('radio', ({ id, on }) => {
  radioHolder = on ? id : null;
  playSquelch(on);
  renderRadio();

  if (on) {
    const who = players[id];
    showWalkie(who ? who.name : '', id === myId);
  } else {
    hideWalkie();
  }
});

socket.on('radio-busy', () => {
  const el = document.getElementById('radio');
  el.textContent = 'channel busy';
  el.className = 'busy';
  setTimeout(renderRadio, 1000);
});

function renderRadio() {
  const el = document.getElementById('radio');
  const hud = document.getElementById('hud');
  const mine = radioHolder === myId;
  const who = players[radioHolder];

  el.textContent = !radioHolder ? 'hold T to talk' : mine ? 'ON AIR' : 'on air - ' + (who ? who.name : '?');
  el.className = radioHolder ? 'live' : '';
  hud.classList.toggle('on-air', mine);
}
socket.on('chat', (msg) => addMessage(msg));
socket.on('chat-history', addHistory);

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
  const key = e.key.toLowerCase();
  if (e.key === 'Enter') {
    e.preventDefault();
    // Movement keys are only released by a keyup, and the input swallows nothing, but
    // clearing here means a key held while jumping into chat can never stay stuck.
    held.clear();
    return focusChat();
  }
  if (e.key === '`') showRange = !showRange;
  if (key === 'e' && players[myId]) toggleSit(players[myId]);
  // keydown repeats while a key is held, so ask the channel only on the first one.
  if (key === 't' && !held.has('t') && myId) socket.emit('ptt-down');
  held.add(key);
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 't') socket.emit('ptt-up');
  held.delete(key);
});

// Alt-tabbing mid-transmission is the likeliest way to strand the channel: the browser
// never sends the keyup. The server's timeout is the backstop, not the mechanism.
window.addEventListener('blur', () => {
  if (held.has('t')) socket.emit('ptt-up');
  held.clear();
});

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

const seatTaken = (i) => Object.values(players).some((p) => p.seat === i);

function toggleSit(me) {
  if (me.seat !== null) return stand(me);
  const i = nearestSeat(me);
  if (i < 0 || seatTaken(i)) return;
  // The server decides: it is the only one that can see the other person reaching for
  // the same chair. We sit when 'player-seat' comes back.
  socket.emit('sit', i);
}

// step=false when you walk out of the chair: you are already moving, so pushing you
// backwards first would visibly jerk you the wrong way.
function stand(me, step = true) {
  const seat = map.seats[me.seat];
  me.seat = null; // standing always succeeds, so don't wait for the round trip

  if (step) {
    const [ox, oy] = STAND_OFFSET[seat.dir] || [0, 44];
    const nx = clamp(me.x + ox, RADIUS, map.width - RADIUS);
    const ny = clamp(me.y + oy, RADIUS, map.height - RADIUS);
    if (canMove(nx, ny, RADIUS, map.collisions)) {
      me.x = nx;
      me.y = ny;
    }
  }
  socket.emit('stand', { x: me.x, y: me.y });
}

function move(me, dt) {
  let dx = axis(['a', 'arrowleft'], ['d', 'arrowright']);
  let dy = axis(['w', 'arrowup'], ['s', 'arrowdown']);
  if (!dx && !dy) return;
  if (me.seat !== null) stand(me, false); // walking away from a chair gets you out of it

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

// Runs every frame, not just when you press a key: someone can walk into you while you
// are standing still, and you should be the one who gives way.
function separate(me) {
  if (me.seat !== null) return; // someone sitting is furniture, they do not get shoved

  const others = Object.values(players).filter((p) => p.id !== me.id);
  const [px, py] = separateFrom(me.x, me.y, others);
  if (px === me.x && py === me.y) return;

  // Axis by axis, and never into a wall: being pushed should slide you along the wall,
  // not through it.
  const nx = clamp(px, RADIUS, map.width - RADIUS);
  const ny = clamp(py, RADIUS, map.height - RADIUS);
  if (canMove(nx, me.y, RADIUS, map.collisions)) me.x = nx;
  if (canMove(me.x, ny, RADIUS, map.collisions)) me.y = ny;
}

// --- loop ------------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap so a background tab can't teleport
  last = now;

  const me = players[myId];
  if (me) {
    move(me, dt);
    separate(me);
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

  updateWalkieMeter(radioHolder ? micLevel(radioHolder) : 0);

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

  const near = nearestSeat(me);
  const hint =
    me.seat !== null ? 'E to stand' : near < 0 ? null : seatTaken(near) ? 'taken' : 'E to sit';
  if (hint) {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = hint === 'taken' ? '#e0956a' : '#9fe0b0';
    ctx.fillText(hint, me.x, me.y + RADIUS + 20);
  }

  ctx.restore();
}

function drawPlayer(p, isSelf) {
  // Speaking ring. Drawn for everyone, including people too far away to hear -- seeing
  // someone talking across the floor is the cue to walk over.
  const level = smoothLevel(speaking.get(p.id) || 0, micLevel(p.id));
  speaking.set(p.id, level);

  if (level > 0.06) {
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, RADIUS + 5 + level * 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(126, 224, 160, ' + Math.min(0.9, 0.3 + level).toFixed(2) + ')';
    ctx.lineWidth = 2 + level * 3;
    ctx.stroke();
  }

  if (p.id === radioHolder) {
    // Pulsing ring, so a voice on the radio always has a visible source on the map.
    // Sits outside the speaking ring so the two never sit on top of each other.
    const pulse = RADIUS + 18 + Math.sin(performance.now() / 160) * 4;
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0956a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

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
  const audible = updateSpatialAudio(me, players, radioHolder);
  document.getElementById('peers').textContent = audible + ' nearby';
}, 100);

initWalkie();
loadMap().then(() => requestAnimationFrame(frame));
