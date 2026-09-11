/* ============================================================
   PENYUSUP — social deduction 2D ala Among Us. Port 3500.
   Server owns everything that can be cheated: roles, who is where,
   kills, task progress and votes. The client only draws and sends
   intent. Diskusi saat rapat pakai voice chat kantor yang tetap
   jalan di halaman induk — game ini tidak punya kode audio.
   ============================================================ */
const express = require('express');
const path = require('path');
const { createServer, announce } = require('../serve');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = createServer(app);
// Tighter heartbeats than the default 25s/20s: a tab that navigates away without
// closing its socket cleanly should stop occupying a seat within ~20s, not a minute.
const io = new Server(server, { pingInterval: 10000, pingTimeout: 10000 });
const PORT = process.env.PORT || 3500;

// ---------------------------------------------------------------- map
const W = 1400, H = 860;

const ROOMS = [
  { name: 'Reaktor',     x: 60,   y: 40,  w: 240, h: 170 },
  { name: 'Kafetaria',   x: 560,  y: 40,  w: 300, h: 230 },
  { name: 'Senjata',     x: 980,  y: 60,  w: 200, h: 160 },
  { name: 'Navigasi',    x: 1140, y: 340, w: 200, h: 160 },
  { name: 'Perisai',     x: 940,  y: 600, w: 220, h: 180 },
  { name: 'Komunikasi',  x: 620,  y: 620, w: 220, h: 160 },
  { name: 'Gudang',      x: 330,  y: 560, w: 220, h: 200 },
  { name: 'Kelistrikan', x: 60,   y: 520, w: 220, h: 180 },
  { name: 'Medbay',      x: 100,  y: 240, w: 220, h: 200 },
  { name: 'Admin',       x: 600,  y: 340, w: 200, h: 140 },
];

// Corridors. Each one overlaps the two rooms it joins by ~20px so walking
// between them is continuous — the walkable area is just the union of rects.
const HALLS = [
  { x: 280,  y: 100, w: 300, h: 60 },   // Reaktor    - Kafetaria
  { x: 160,  y: 190, w: 80,  h: 80 },   // Reaktor    - Medbay
  { x: 160,  y: 420, w: 80,  h: 120 },  // Medbay     - Kelistrikan
  { x: 260,  y: 580, w: 90,  h: 60 },   // Kelistrikan- Gudang
  { x: 530,  y: 660, w: 110, h: 60 },   // Gudang     - Komunikasi
  { x: 820,  y: 660, w: 140, h: 60 },   // Komunikasi - Perisai
  { x: 1120, y: 480, w: 80,  h: 140 },  // Perisai    - Navigasi
  { x: 1100, y: 200, w: 80,  h: 170 },  // Senjata    - Navigasi
  { x: 840,  y: 110, w: 160, h: 60 },   // Kafetaria  - Senjata
  { x: 660,  y: 250, w: 80,  h: 110 },  // Kafetaria  - Admin
  { x: 300,  y: 380, w: 320, h: 60 },   // Medbay     - Admin
];

const STATIONS = [
  { id: 'reactor', name: 'Mulai ulang reaktor', room: 'Reaktor',     x: 150,  y: 120, kind: 'sequence' },
  { id: 'cafe',    name: 'Buang sampah',        room: 'Kafetaria',   x: 620,  y: 225, kind: 'hold' },
  { id: 'weapons', name: 'Kalibrasi senjata',   room: 'Senjata',     x: 1080, y: 130, kind: 'sequence' },
  { id: 'nav',     name: 'Atur jalur',          room: 'Navigasi',    x: 1250, y: 420, kind: 'wires' },
  { id: 'shields', name: 'Aktifkan perisai',    room: 'Perisai',     x: 1050, y: 690, kind: 'sequence' },
  { id: 'comms',   name: 'Unduh data',          room: 'Komunikasi',  x: 720,  y: 700, kind: 'hold' },
  { id: 'storage', name: 'Isi bahan bakar',     room: 'Gudang',      x: 430,  y: 650, kind: 'hold' },
  { id: 'elec',    name: 'Sambung kabel',       room: 'Kelistrikan', x: 130,  y: 600, kind: 'wires' },
  { id: 'medbay',  name: 'Pindai tubuh',        room: 'Medbay',      x: 200,  y: 330, kind: 'hold' },
  { id: 'admin',   name: 'Gesek kartu',         room: 'Admin',       x: 700,  y: 410, kind: 'wires' },
];

const EMERGENCY = { x: 770, y: 150 };            // Kafetaria
const LIGHTS_FIX = { x: 235, y: 650 };           // Kelistrikan
const SPAWN = { x: 700, y: 150 };

const COLORS = ['#f0463c', '#3b7cf0', '#37b36a', '#e85fb0', '#f08a2c',
  '#f2df52', '#3f4756', '#e9eef5', '#7d4fd1', '#4bc6c6'];
const BOT_NAMES = ['Bagas', 'Sari', 'Rizki', 'Putri', 'Dimas', 'Ayu', 'Fajar', 'Nadia', 'Yoga', 'Intan'];

// ---------------------------------------------------------------- tuning
const MIN_PLAYERS = 4, MAX_PLAYERS = 10, BOT_FILL_TO = 6;
const PLAYER_R = 16;
const SPEED = 190;                 // px/s, used by bots and to bound human moves
const KILL_RANGE = 74, KILL_COOLDOWN = 25, FIRST_KILL_DELAY = 12;
const REPORT_RANGE = 95, USE_RANGE = 78;
const MEETING_SECS = 45, TASKS_EACH = 4;
const SABOTAGE_COOLDOWN = 35;
const TICK_MS = 66;                // ~15 Hz

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a) => a[(Math.random() * a.length) | 0];

const RECTS = [...ROOMS, ...HALLS];
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const walkable = (x, y) => RECTS.some((r) => inRect(r, x, y));

// Waypoint graph so bots can actually get somewhere: one node per rect, an edge
// wherever two rects overlap (which is exactly where you can walk between them).
const NODES = RECTS.map((r) => ({ r, x: r.x + r.w / 2, y: r.y + r.h / 2 }));
const EDGES = NODES.map(() => []);
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    const a = NODES[i].r, b = NODES[j].r;
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    if (overlap) { EDGES[i].push(j); EDGES[j].push(i); }
  }
}
const nodeAt = (x, y) => NODES.findIndex((n) => inRect(n.r, x, y));

// Waypoints are doorway centres -- the middle of where two rects overlap -- not room
// centres. Both ends of every segment then sit inside one convex rect, so walking the
// straight line between them can never clip a corner and wedge a bot.
function overlapCenter(a, b) {
  const x1 = Math.max(a.x, b.x), x2 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y, b.y), y2 = Math.min(a.y + a.h, b.y + b.h);
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

function routeTo(fromX, fromY, toX, toY) {
  const s = nodeAt(fromX, fromY), t = nodeAt(toX, toY);
  if (s < 0 || t < 0 || s === t) return [{ x: toX, y: toY }];
  const prev = new Map([[s, -1]]);
  const q = [s];
  while (q.length) {
    const cur = q.shift();
    if (cur === t) break;
    for (const nx of EDGES[cur]) if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); }
  }
  if (!prev.has(t)) return [{ x: toX, y: toY }];
  const idx = [];
  for (let cur = t; cur !== -1; cur = prev.get(cur)) idx.unshift(cur);
  const path = [];
  for (let i = 0; i + 1 < idx.length; i++) path.push(overlapCenter(NODES[idx[i]].r, NODES[idx[i + 1]].r));
  path.push({ x: toX, y: toY });
  return path;
}

// ---------------------------------------------------------------- state
let G = null;

function fresh() {
  return {
    phase: 'LOBBY',                 // LOBBY | PLAYING | MEETING | ENDED
    players: new Map(), order: [], host: null,
    bodies: [], lights: true, sabotageAt: 0,
    startedAt: 0, meeting: null, winner: null, reveal: null,
    botSeq: 0, timer: null, loop: null, log: [],
  };
}
const ensure = () => (G || (G = fresh()));
const P = (id) => G && G.players.get(id);
const roster = () => G.order.map(P).filter(Boolean);
const living = () => roster().filter((p) => p.alive);
const impostors = () => living().filter((p) => p.impostor);
const crew = () => living().filter((p) => !p.impostor);
const humans = () => roster().filter((p) => !p.bot);

function pushLog(text) { G.log.unshift(text); if (G.log.length > 30) G.log.pop(); }
function freeColor() { return COLORS.find((c) => !roster().some((p) => p.color === c)) || rnd(COLORS); }

function makePlayer(id, name, color, bot) {
  return {
    id, name, color, bot: !!bot,
    x: SPAWN.x, y: SPAWN.y, alive: true, impostor: false,
    tasks: [], killAt: 0, meetings: 1, connected: true,
    path: null, goal: null, actAt: 0, voteAt: 0,
  };
}

// ---------------------------------------------------------------- round
function startRound() {
  if (!G || G.phase !== 'LOBBY') return;
  while (G.order.length < Math.min(BOT_FILL_TO, MAX_PLAYERS)) {
    const id = 'bot_' + (++G.botSeq);
    const used = roster().map((p) => p.name);
    const name = BOT_NAMES.find((n) => !used.includes(n)) || 'Bot ' + G.botSeq;
    G.players.set(id, makePlayer(id, name, freeColor(), true));
    G.order.push(id);
  }
  const ids = [...G.order];
  if (ids.length < MIN_PLAYERS) return;

  const nImp = ids.length >= 7 ? 2 : 1;
  const bag = shuffle([...ids]);
  const impIds = bag.slice(0, nImp);

  ids.forEach((id) => {
    const p = P(id);
    p.alive = true;
    p.impostor = impIds.includes(id);
    p.x = SPAWN.x + (Math.random() - 0.5) * 90;
    p.y = SPAWN.y + (Math.random() - 0.5) * 60;
    p.killAt = Date.now() + FIRST_KILL_DELAY * 1000;
    p.meetings = 1;
    p.path = null; p.goal = null; p.actAt = 0;
    // Impostors get the same list so they can fake it; only crew progress counts.
    p.tasks = shuffle([...STATIONS]).slice(0, TASKS_EACH).map((s) => ({ id: s.id, done: false }));
  });

  G.bodies = [];
  G.lights = true;
  G.sabotageAt = 0;
  G.meeting = null;
  G.winner = null; G.reveal = null;
  G.phase = 'PLAYING';
  G.startedAt = Date.now();
  G.log = [];
  pushLog(`Permainan dimulai — ${ids.length} pemain, ${nImp} penyusup.`);
  broadcast();
  startLoop();
}

function taskProgress() {
  let done = 0, total = 0;
  for (const p of roster()) {
    if (p.impostor) continue;        // fake tasks never count
    for (const t of p.tasks) { total++; if (t.done) done++; }
  }
  return { done, total };
}

function checkEnd() {
  if (!G || (G.phase !== 'PLAYING' && G.phase !== 'MEETING')) return false;
  const imp = impostors().length, cr = crew().length;
  const prog = taskProgress();
  if (imp === 0) return endRound('crew', 'Semua penyusup tersingkir.');
  if (imp >= cr) return endRound('impostor', 'Penyusup menguasai kapal.');
  if (prog.total > 0 && prog.done >= prog.total) return endRound('crew', 'Semua tugas selesai.');
  return false;
}

function endRound(winner, why) {
  clearTimeout(G.timer); G.timer = null;
  stopLoop();
  G.phase = 'ENDED';
  G.winner = winner;
  G.meeting = null;
  G.reveal = G.order.map((id) => P(id)).filter(Boolean)
    .map((p) => ({ name: p.name, color: p.color, impostor: p.impostor, alive: p.alive }));
  pushLog(why);
  broadcast();
  G.timer = setTimeout(backToLobby, 15000);
  return true;
}

function backToLobby() {
  if (!G) return;
  clearTimeout(G.timer); G.timer = null;
  stopLoop();
  for (const id of [...G.order]) {
    const p = P(id);
    if (!p || p.bot || !p.connected) { G.players.delete(id); G.order = G.order.filter((x) => x !== id); continue; }
    p.alive = true; p.impostor = false; p.tasks = []; p.x = SPAWN.x; p.y = SPAWN.y;
  }
  if (G.order.length === 0) { G = null; return; }
  G.phase = 'LOBBY'; G.bodies = []; G.lights = true; G.meeting = null;
  G.winner = null; G.reveal = null; G.log = [];
  if (!P(G.host)) G.host = G.order[0];
  broadcast();
}

// ---------------------------------------------------------------- meeting
function callMeeting(by, reason, bodyColor) {
  if (!G || G.phase !== 'PLAYING') return;
  stopLoop();
  G.bodies = [];
  G.lights = true;
  G.phase = 'MEETING';
  G.meeting = { by: by.name, reason, bodyColor: bodyColor || null, votes: new Map(), endsAt: Date.now() + MEETING_SECS * 1000, result: null };
  for (const p of roster()) {
    if (p.alive) { p.x = SPAWN.x + (Math.random() - 0.5) * 120; p.y = SPAWN.y + (Math.random() - 0.5) * 80; }
    p.path = null; p.goal = null;
    p.voteAt = Date.now() + 5000 + Math.random() * 22000;   // bots make up their minds
  }
  pushLog(reason === 'report' ? `${by.name} melaporkan mayat.` : `${by.name} menekan tombol darurat.`);
  broadcast();
  clearTimeout(G.timer);
  G.timer = setTimeout(resolveMeeting, MEETING_SECS * 1000 + 200);
  G.loop = setInterval(meetingTick, 500);
}

function meetingTick() {
  if (!G || G.phase !== 'MEETING') return;
  const now = Date.now();
  for (const p of roster()) {
    if (!p.bot || !p.alive || G.meeting.votes.has(p.id) || now < p.voteAt) continue;
    const others = living().filter((q) => q.id !== p.id && (!p.impostor || !q.impostor));
    const skip = Math.random() < (p.impostor ? 0.3 : 0.4) || others.length === 0;
    G.meeting.votes.set(p.id, skip ? 'skip' : rnd(others).id);
  }
  if (living().every((p) => G.meeting.votes.has(p.id))) return resolveMeeting();
  broadcast();
}

function resolveMeeting() {
  if (!G || G.phase !== 'MEETING') return;
  clearTimeout(G.timer); G.timer = null;
  stopLoop();

  const tally = {};
  for (const v of G.meeting.votes.values()) if (v !== 'skip') tally[v] = (tally[v] || 0) + 1;
  const skips = [...G.meeting.votes.values()].filter((v) => v === 'skip').length;
  const entries = Object.entries(tally);
  let best = 0;
  for (const [, c] of entries) if (c > best) best = c;
  const tied = entries.filter(([, c]) => c === best).map(([id]) => id);

  let out = null;
  if (tied.length === 1 && best > skips) out = P(tied[0]);
  if (out) {
    out.alive = false;
    pushLog(`${out.name} dilempar ke luar angkasa — ${out.impostor ? 'dia PENYUSUP.' : 'dia bukan penyusup.'}`);
  } else {
    pushLog(tied.length > 1 ? 'Suara seri — tidak ada yang dilempar.' : 'Tidak ada yang dilempar.');
  }
  G.meeting.result = out
    ? { name: out.name, color: out.color, impostor: out.impostor, left: impostors().length }
    : { name: null, skipped: true, left: impostors().length };

  G.phase = 'MEETING';           // hold on the result card for a beat
  broadcast();
  G.timer = setTimeout(() => {
    if (!G) return;
    if (checkEnd()) return;
    G.phase = 'PLAYING';
    G.meeting = null;
    const t = Date.now() + 10000;
    for (const p of roster()) { p.killAt = Math.max(p.killAt, t); p.path = null; p.goal = null; }
    broadcast();
    startLoop();
  }, 5000);
}

// ---------------------------------------------------------------- bots
function botStep(p, dt) {
  const now = Date.now();
  if (!p.alive && p.impostor) return;        // dead impostors are done; crew ghosts keep working

  // Nothing should be able to wedge a bot for good: if one stops making progress
  // along its path, throw the plan away and pick a new one.
  if (p.path && p.path.length) {
    if (!p.stuck) p.stuck = { x: p.x, y: p.y, at: now };
    else if (Math.hypot(p.x - p.stuck.x, p.y - p.stuck.y) > 25) { p.stuck = { x: p.x, y: p.y, at: now }; }
    else if (now - p.stuck.at > 5000) { p.path = null; p.goal = null; p.stuck = null; return; }
  } else p.stuck = null;

  if (p.impostor) {
    const prey = crew().filter((q) => q.id !== p.id);
    const target = prey.sort((a, b) => dist(p, a) - dist(p, b))[0];
    if (target) {
      if (dist(p, target) < KILL_RANGE && now >= p.killAt) { doKill(p, target); p.goal = null; p.path = null; return; }
      if (!p.goal || p.goal.kind !== 'hunt' || p.goal.id !== target.id || !p.path || !p.path.length) {
        p.goal = { kind: 'hunt', id: target.id };
        p.path = routeTo(p.x, p.y, target.x, target.y);
      }
    }
  } else {
    // A living crewmate bot walking past a body raises the alarm — keeps solo games moving.
    if (p.alive) {
      const body = G.bodies.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < REPORT_RANGE);
      if (body && Math.random() < 0.25) return callMeeting(p, 'report', body.color);
    }

    const todo = p.tasks.filter((t) => !t.done);
    if (!p.goal || p.goal.kind !== 'task' || !p.path) {
      const pick = todo.length ? rnd(todo) : null;
      const st = pick ? STATIONS.find((s) => s.id === pick.id) : rnd(NODES);
      p.goal = { kind: 'task', id: pick ? pick.id : null };
      p.path = routeTo(p.x, p.y, st.x, st.y);
      p.actAt = 0;
    }
    if (p.path && p.path.length === 0) {
      if (!p.actAt) p.actAt = now + 2500 + Math.random() * 2000;
      else if (now >= p.actAt) {
        const t = p.tasks.find((x) => x.id === p.goal.id && !x.done);
        if (t) t.done = true;
        p.goal = null; p.path = null; p.actAt = 0;
        checkEnd();
      }
      return;
    }
  }

  if (!p.path || !p.path.length) {
    p.path = routeTo(p.x, p.y, rnd(NODES).x, rnd(NODES).y);
    return;
  }
  const wp = p.path[0];
  const dx = wp.x - p.x, dy = wp.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const step = SPEED * 0.82 * dt;
  if (d <= step + 4) { p.path.shift(); p.x = wp.x; p.y = wp.y; return; }
  const nx = p.x + (dx / d) * step, ny = p.y + (dy / d) * step;
  if (walkable(nx, ny)) { p.x = nx; p.y = ny; }
  else if (walkable(nx, p.y)) p.x = nx;      // slide along whichever axis is still clear
  else if (walkable(p.x, ny)) p.y = ny;
  else { p.path = null; p.goal = null; }
}

// ---------------------------------------------------------------- actions
function doKill(killer, victim) {
  if (!killer.impostor || !killer.alive || !victim.alive || victim.impostor) return;
  if (Date.now() < killer.killAt) return;
  victim.alive = false;
  G.bodies.push({ id: victim.id, name: victim.name, color: victim.color, x: victim.x, y: victim.y });
  killer.x = victim.x; killer.y = victim.y;          // step onto the body, like the real thing
  killer.killAt = Date.now() + KILL_COOLDOWN * 1000;
  io.to(victim.id).emit('us:killed', {});
  pushLog(`${victim.name} terbunuh.`);
  if (!checkEnd()) broadcast();
}

// ---------------------------------------------------------------- loop
function startLoop() {
  stopLoop();
  let last = Date.now();
  G.loop = setInterval(() => {
    if (!G || G.phase !== 'PLAYING') return;
    const now = Date.now();
    const dt = clamp((now - last) / 1000, 0, 0.25);
    last = now;
    for (const p of roster()) if (p.bot) botStep(p, dt);
    broadcast();
  }, TICK_MS);
}
function stopLoop() { if (G && G.loop) { clearInterval(G.loop); G.loop = null; } }

// ---------------------------------------------------------------- views
function viewFor(id) {
  const me = P(id);
  const ghost = me ? !me.alive : false;
  const seeAll = ghost || G.phase === 'ENDED';
  const prog = taskProgress();

  const players = G.order.map((pid) => {
    const p = P(pid); if (!p) return null;
    const known = seeAll || pid === id || (me && me.impostor && p.impostor);
    return {
      id: pid, name: p.name, color: p.color, bot: p.bot,
      x: Math.round(p.x), y: Math.round(p.y),
      alive: p.alive, host: pid === G.host,
      impostor: known ? p.impostor : null,
      you: pid === id,
    };
  }).filter(Boolean);

  const meeting = G.meeting && {
    by: G.meeting.by, reason: G.meeting.reason, bodyColor: G.meeting.bodyColor,
    endsAt: G.meeting.endsAt, result: G.meeting.result,
    votes: [...G.meeting.votes.entries()].map(([voter, target]) => ({ voter, target })),
    myVote: G.meeting.votes.get(id) || null,
  };

  return {
    phase: G.phase, host: G.host, min: MIN_PLAYERS, max: MAX_PLAYERS,
    players, bodies: G.bodies, lights: G.lights, progress: prog,
    log: G.log.slice(0, 8), winner: G.winner, reveal: G.reveal, meeting,
    you: me ? {
      id, alive: me.alive, impostor: me.impostor, ghost,
      tasks: me.tasks.map((t) => ({ ...t, ...STATIONS.find((s) => s.id === t.id) })),
      killIn: Math.max(0, Math.ceil((me.killAt - Date.now()) / 1000)),
      sabotageIn: Math.max(0, Math.ceil((G.sabotageAt - Date.now()) / 1000)),
      meetings: me.meetings,
    } : null,
  };
}

function broadcast() {
  if (!G) return;
  for (const id of G.order) { const p = P(id); if (p && !p.bot) io.to(id).emit('us:state', viewFor(id)); }
}

// ---------------------------------------------------------------- sockets
io.on('connection', (socket) => {
  socket.emit('us:map', { w: W, h: H, rooms: ROOMS, halls: HALLS, stations: STATIONS, emergency: EMERGENCY, lightsFix: LIGHTS_FIX });

  socket.on('us:join', (msg) => {
    ensure();
    if (P(socket.id)) return broadcast();
    const name = String((msg && msg.name) || 'Pemain').slice(0, 14) || 'Pemain';
    if (G.phase !== 'LOBBY') return socket.emit('us:busy', {});
    if (humans().length >= MAX_PLAYERS) return socket.emit('us:full', {});
    // A human takes a bot's slot before we add anyone new.
    const botId = G.order.find((x) => P(x) && P(x).bot);
    if (botId && G.order.length >= MAX_PLAYERS) { G.players.delete(botId); G.order = G.order.filter((x) => x !== botId); }
    G.players.set(socket.id, makePlayer(socket.id, name, freeColor(), false));
    G.order.push(socket.id);
    if (!P(G.host)) G.host = socket.id;
    pushLog(`${name} bergabung.`);
    broadcast();
  });

  // Anyone in the room may start or restart. Gating this on a "host" means one stale
  // tab holding that role can lock everybody else out of the game.
  socket.on('us:start', () => { if (G && P(socket.id) && G.phase === 'LOBBY') startRound(); });
  socket.on('us:again', () => { if (G && P(socket.id) && G.phase === 'ENDED') backToLobby(); });

  socket.on('us:move', (msg) => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !msg) return;
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    let x = clamp(msg.x, PLAYER_R, W - PLAYER_R), y = clamp(msg.y, PLAYER_R, H - PLAYER_R);
    const d = Math.hypot(x - p.x, y - p.y);
    const max = SPEED * 0.5;                       // generous, but no teleporting
    if (d > max) { const s = max / d; x = p.x + (x - p.x) * s; y = p.y + (y - p.y) * s; }
    if (p.alive && !walkable(x, y)) return;        // ghosts drift through walls
    p.x = x; p.y = y;
  });

  socket.on('us:kill', () => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !p.alive || !p.impostor) return;
    const target = crew().filter((q) => q.id !== p.id && dist(p, q) < KILL_RANGE).sort((a, b) => dist(p, a) - dist(p, b))[0];
    if (target) doKill(p, target);
  });

  socket.on('us:report', () => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !p.alive) return;
    const body = G.bodies.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < REPORT_RANGE);
    if (body) callMeeting(p, 'report', body.color);
  });

  socket.on('us:emergency', () => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !p.alive || p.meetings <= 0) return;
    if (dist(p, EMERGENCY) > USE_RANGE) return;
    p.meetings--;
    callMeeting(p, 'emergency');
  });

  socket.on('us:task-done', (msg) => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !msg) return;
    const t = p.tasks.find((x) => x.id === msg.id && !x.done);
    const st = STATIONS.find((s) => s.id === (msg && msg.id));
    if (!t || !st || dist(p, st) > USE_RANGE) return;
    t.done = true;
    if (!checkEnd()) broadcast();
  });

  socket.on('us:sabotage', () => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !p.alive || !p.impostor) return;
    if (!G.lights || Date.now() < G.sabotageAt) return;
    G.lights = false;
    G.sabotageAt = Date.now() + SABOTAGE_COOLDOWN * 1000;
    pushLog('Lampu dipadamkan!');
    broadcast();
  });

  socket.on('us:fix-lights', () => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'PLAYING' || !p.alive || G.lights) return;
    if (dist(p, LIGHTS_FIX) > USE_RANGE) return;
    G.lights = true;
    pushLog('Lampu menyala kembali.');
    broadcast();
  });

  socket.on('us:vote', (msg) => {
    const p = P(socket.id);
    if (!p || !G || G.phase !== 'MEETING' || !p.alive || !msg) return;
    if (G.meeting.result) return;
    const t = msg.target;
    if (t !== 'skip' && !(P(t) && P(t).alive)) return;
    G.meeting.votes.set(socket.id, t);
    broadcast();
    if (living().every((q) => G.meeting.votes.has(q.id))) setTimeout(resolveMeeting, 400);
  });

  socket.on('us:leave', () => drop(socket.id, true));
  socket.on('disconnect', () => drop(socket.id, false));
});

function drop(id, hard) {
  if (!G || !P(id)) return;
  const p = P(id);
  const mid = G.phase === 'PLAYING' || G.phase === 'MEETING';
  if (mid) {
    // Leaving mid-round counts as dead, so the win check stays honest.
    p.alive = false; p.connected = false;
    pushLog(`${p.name} keluar.`);
    if (G.meeting) G.meeting.votes.delete(id);
  } else {
    G.players.delete(id);
    G.order = G.order.filter((x) => x !== id);
  }
  if (humans().filter((h) => h.connected).length === 0) {
    clearTimeout(G.timer); stopLoop(); G = null; return;
  }
  if (G.host === id) G.host = (humans().find((h) => h.connected) || {}).id || G.order[0];
  if (mid && checkEnd()) return;
  broadcast();
}

server.listen(PORT, '0.0.0.0', () => announce('🔪 Penyusup', server, PORT));
