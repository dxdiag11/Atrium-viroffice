/* ============================================================
   TUMBLE RUSH — battle royale rintangan ala Fall Guys
   Satu pertandingan global. Slot kosong diisi bot.
   ============================================================ */
const express = require('express');
const path = require('path');
const { createServer, announce } = require('../serve');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3300;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RACE_W = 2600, RACE_H = 880;

// ---- Definisi ronde. Urut dari mudah ke sulit; kuota lolos mengecil. ----
function makeRounds() {
  return [
    {
      name: 'Gerbang Gila', type: 'race', world: { w: RACE_W, h: RACE_H },
      finishX: RACE_W - 150, lane: { top: 70, bot: RACE_H - 70 },
      duration: 80, ratio: 0.68, slime: { start: -600, speed: 60, delay: 5 },
      spinners: [560, 940, 1320, 1700, 2080, 2380].map((x, i) => ({
        x, y: RACE_H / 2 + (i % 2 ? 110 : -110), arm: 175, av: (i % 2 ? 1 : -1) * 1.5, a0: i * 0.9,
      })),
      hammers: [],
      pushers: [
        { x: 760, y0: 130, y1: RACE_H - 130, w: 150, h: 150, wv: 1.3, phase: 0 },
        { x: 1520, y0: 130, y1: RACE_H - 130, w: 150, h: 150, wv: 1.6, phase: 2.2 },
      ],
    },
    {
      name: 'Palu Godam', type: 'race', world: { w: RACE_W, h: RACE_H },
      finishX: RACE_W - 150, lane: { top: 70, bot: RACE_H - 70 },
      duration: 76, ratio: 0.6, slime: { start: -450, speed: 84, delay: 4 },
      spinners: [720, 1360, 2000].map((x, i) => ({ x, y: RACE_H / 2, arm: 160, av: (i % 2 ? -1 : 1) * 2.2, a0: i * 1.6 })),
      hammers: [480, 780, 1080, 1380, 1680, 1980, 2280].map((x, i) => ({
        x, pivotY: 55, len: RACE_H - 150, swing: 1.15, w: 2.5 + (i % 2 ? 0.35 : 0), phase: i * 0.85,
      })),
      pushers: [],
    },
    {
      name: 'Lantai Runtuh', type: 'survival', world: { w: 1240, h: 1240 },
      grid: { cols: 10, rows: 10, size: 96, ox: 140, oy: 140 },
      fuseDelay: 1.15, duration: 95, ratio: 0.42, shrinkStart: 24, shrinkEvery: 4.5,
    },
    {
      name: 'Adu Bertahan Terakhir', type: 'survival', final: true, world: { w: 780, h: 780 },
      grid: { cols: 6, rows: 6, size: 104, ox: 78, oy: 78 },
      fuseDelay: 0.8, duration: 62, ratio: 0, shrinkStart: 10, shrinkEvery: 2.6,
    },
  ];
}

const BOT_NAMES = ['Bagas', 'Sari', 'Rizki', 'Putri', 'Dimas', 'Ayu', 'Fajar', 'Nadia', 'Yoga', 'Intan',
  'Bayu', 'Wulan', 'Reza', 'Tari', 'Galih', 'Mega', 'Arif', 'Dewi', 'Kevin', 'Lia',
  'Hadi', 'Sinta', 'Andi', 'Vina', 'Toni', 'Rara', 'Eko', 'Mila', 'Joko', 'Fira'];
const COLORS = ['#ff5b6e', '#ffb03a', '#ffd93d', '#5bd96a', '#3ec8d8', '#4d8bff', '#a06bff', '#ff6bd5'];
const FACES = ['^^', 'oo', '--', 'UU'];
const PATTERNS = ['polos', 'garis', 'titik'];
const rnd = (a) => a[(Math.random() * a.length) | 0];

const players = {};                 // id -> player
const match = {
  phase: 'LOBBY', round: -1, rounds: [], participants: [], eliminationOrder: [],
  qualifyCount: 0, t0: 0, last: 0, botSeq: 0,
  startAt: null, startTimer: null, cd: null, tick: null, timer: null,
  qualOrder: [], removed: new Set(), fuse: new Map(), ring: 0, slimeX: -1e9,
};

const humans = () => Object.values(players).filter((p) => !p.bot && !p.gone);
const current = () => match.rounds[match.round];
const aliveIds = () => match.participants.filter((id) => players[id] && players[id].alive && !players[id].gone);
const brief = (id) => ({ id, name: players[id] ? players[id].name : '?', look: players[id] ? players[id].look : null, bot: !!(players[id] && players[id].bot) });

function makeBot(id) {
  return {
    id, bot: true, name: rnd(BOT_NAMES), ready: false,
    look: { color: rnd(COLORS), face: rnd(FACES), pattern: rnd(PATTERNS) },
    x: 0, y: 0, vx: 0, vy: 0, skill: 0.62 + Math.random() * 0.46,
    stillIn: false, alive: false, finished: false, qualified: false, fallingSince: null,
    roundsCleared: 0, place: null,
  };
}

// ---------- LOBBY ----------
function sendLobby() {
  io.emit('lobby', {
    phase: match.phase,
    players: humans().map((p) => ({ id: p.id, name: p.name, look: p.look, ready: p.ready })),
    startIn: match.startAt ? Math.max(0, Math.ceil((match.startAt - Date.now()) / 1000)) : null,
  });
}

function maybeStart() {
  const ready = humans().filter((p) => p.ready);
  if (ready.length === 0) {
    clearTimeout(match.startTimer); match.startTimer = null; match.startAt = null;
    return;
  }
  if (match.startTimer) return;
  const all = ready.length === humans().length;
  const wait = all ? 6000 : 18000;
  match.startAt = Date.now() + wait;
  match.startTimer = setTimeout(startMatch, wait);
}

function startMatch() {
  match.startTimer = null; match.startAt = null;
  const parts = humans().filter((p) => p.ready).map((p) => p.id);
  if (parts.length === 0) { match.phase = 'LOBBY'; return sendLobby(); }
  const target = Math.min(24, Math.max(14, parts.length + 8));
  while (parts.length < target) {
    const id = 'bot_' + (++match.botSeq);
    players[id] = makeBot(id);
    parts.push(id);
  }
  match.participants = parts;
  match.rounds = makeRounds();
  match.eliminationOrder = [];
  match.round = -1;
  parts.forEach((id) => { const p = players[id]; p.stillIn = true; p.roundsCleared = 0; p.place = null; });
  nextRound();
}

// ---------- RONDE ----------
function qualifyCountFor(def, n) {
  if (def.final) return 1;
  return Math.min(n - 1, Math.max(2, Math.ceil(n * def.ratio)));
}

function nextRound() {
  clearTimers();
  match.round++;
  const stillIn = match.participants.filter((id) => players[id] && players[id].stillIn);
  if (match.round >= match.rounds.length || stillIn.length <= 1) return finalize();

  const def = current();
  match.qualifyCount = qualifyCountFor(def, stillIn.length);
  match.qualOrder = [];
  match.removed = new Set(); match.fuse = new Map(); match.ring = 0; match.slimeX = -1e9;

  stillIn.forEach((id, k) => {
    const p = players[id];
    p.alive = true; p.finished = false; p.qualified = false; p.fallingSince = null;
    p.vx = 0; p.vy = 0; p._hitUntil = 0; p._elimT = 0; p._elimRound = -1;
    p._stumble = 0; p._bt = 0; p._target = null;
    if (def.type === 'race') {
      p.x = 45 + (k % 6) * 20;
      p.y = def.lane.top + 50 + ((k * 113) % (def.lane.bot - def.lane.top - 100));
    } else {
      const a = (k / stillIn.length) * Math.PI * 2;
      const r = def.grid.size * (0.8 + (k % 3) * 0.9);
      p.x = def.world.w / 2 + Math.cos(a) * r;
      p.y = def.world.h / 2 + Math.sin(a) * r;
    }
  });

  const roster = match.participants.map((id) => ({
    id, name: players[id].name, look: players[id].look, bot: players[id].bot, in: players[id].stillIn,
  }));
  const spawns = match.participants.map((id) => [Math.round(players[id].x), Math.round(players[id].y)]);

  match.phase = 'COUNTDOWN';
  humans().forEach((p) => {
    const idx = match.participants.indexOf(p.id);
    io.to(p.id).emit('round-start', {
      index: match.round, total: match.rounds.length, need: match.qualifyCount,
      duration: def.duration, def, roster, spawns,
      you: { idx, spawn: idx >= 0 ? spawns[idx] : null, spectator: !(players[p.id] && players[p.id].stillIn) },
    });
  });

  let n = 5;
  io.emit('countdown', { n });
  match.cd = setInterval(() => {
    n--;
    if (n > 0) io.emit('countdown', { n });
    else { clearInterval(match.cd); match.cd = null; beginRound(); }
  }, 1000);
}

function beginRound() {
  match.phase = 'ROUND';
  match.t0 = Date.now();
  match.last = Date.now();
  io.emit('round-go');
  match.tick = setInterval(step, 33);
  match.timer = setTimeout(() => endRound(true), current().duration * 1000);
}

function step() {
  const def = current();
  const now = Date.now();
  const t = (now - match.t0) / 1000;
  const dt = clamp((now - match.last) / 1000, 0, 0.1);
  match.last = now;

  for (const id of aliveIds()) {
    if (players[id].bot) botStep(def, players[id], t, dt);
  }
  if (def.type === 'race') raceStep(def, t);
  else survivalStep(def, t);

  broadcastTick(def, t);
}

function raceStep(def, t) {
  const slimeX = t > def.slime.delay ? def.slime.start + (t - def.slime.delay) * def.slime.speed : -1e9;
  match.slimeX = slimeX;
  let allDone = true;

  for (const id of aliveIds()) {
    const p = players[id];
    if (p.y < def.lane.top + 16) { p.y = def.lane.top + 16; p.vy = Math.abs(p.vy) * 0.3; }
    if (p.y > def.lane.bot - 16) { p.y = def.lane.bot - 16; p.vy = -Math.abs(p.vy) * 0.3; }

    if (!p.finished && p.x >= def.finishX) { qualify(p); continue; }
    if (!p.finished) allDone = false;
    if (slimeX > -1e8 && p.x < slimeX - 12) { knockOut(id, 'slime'); continue; }

    if (t >= p._hitUntil) {
      const hit = obstacleHit(def, p, t);
      if (hit) {
        p._hitUntil = t + 0.4;
        if (p.bot) { p.x += hit.x * 30; p.y += hit.y * 30; p.vx = hit.x * 120; p.vy = hit.y * 120; }
        else io.to(id).emit('hit', { vx: hit.x * 660, vy: hit.y * 660 });
      }
    }
  }
  if (match.qualOrder.length >= match.qualifyCount || (allDone && aliveIds().length)) endRound(false);
}

function survivalStep(def, t) {
  const g = def.grid;
  if (t > def.shrinkStart) {
    const due = Math.floor((t - def.shrinkStart) / def.shrinkEvery) + 1;
    while (match.ring < due && match.ring <= Math.floor(Math.min(g.cols, g.rows) / 2)) {
      removeRing(g, match.ring); match.ring++;
    }
  }
  for (const [k, s] of match.fuse) {
    if (t - s >= def.fuseDelay) { match.removed.add(k); match.fuse.delete(k); }
  }
  for (const id of aliveIds()) {
    const p = players[id];
    const k = tileKey(g, p.x, p.y);
    if (k === null || match.removed.has(k)) {
      if (p.fallingSince == null) p.fallingSince = t;
      else if (t - p.fallingSince > 0.45) knockOut(id, 'jatuh');
    } else {
      p.fallingSince = null;
      if (!match.fuse.has(k)) match.fuse.set(k, t);
    }
  }
  if (aliveIds().length <= match.qualifyCount) endRound(false);
}

function removeRing(g, r) {
  for (let c = 0; c < g.cols; c++) {
    for (let rw = 0; rw < g.rows; rw++) {
      if (Math.min(c, rw, g.cols - 1 - c, g.rows - 1 - rw) === r) {
        const k = c + ',' + rw;
        match.removed.add(k); match.fuse.delete(k);
      }
    }
  }
}
function tileColRow(g, x, y) {
  return { col: Math.floor((x - g.ox) / g.size), row: Math.floor((y - g.oy) / g.size) };
}
function tileKey(g, x, y) {
  const { col, row } = tileColRow(g, x, y);
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return null;
  return col + ',' + row;
}

function stateCode(p) {
  if (!p.stillIn && !p.alive) return 2;      // tersingkir
  if (p.finished || p.qualified) return 1;    // lolos
  if (p.fallingSince != null) return 3;       // jatuh
  return 0;                                   // aktif
}

function broadcastTick(def, t) {
  const p = match.participants.map((id) => {
    const q = players[id];
    return [Math.round(q.x), Math.round(q.y), stateCode(q)];
  });
  const base = { t, p, alive: aliveIds().length, need: match.qualifyCount };
  if (def.type === 'race') { base.slime = Math.round(match.slimeX); base.qual = match.qualOrder.length; }
  else {
    base.removed = [...match.removed];
    base.fuses = [...match.fuse].map(([k, s]) => [k, +clamp((t - s) / def.fuseDelay, 0, 1).toFixed(2)]);
  }
  io.emit('tick', base);
}

function qualify(p) {
  p.finished = true; p.qualified = true; p.roundsCleared++;
  match.qualOrder.push(p.id);
  io.emit('event', { type: 'qualify', id: p.id });
  if (!p.bot) io.to(p.id).emit('you', { state: 'qualified', place: match.qualOrder.length });
}

function knockOut(id, reason) {
  const p = players[id];
  if (!p || !p.stillIn) return;
  p.stillIn = false; p.alive = false;
  p._elimT = p._elimT || (Date.now() - match.t0) / 1000;
  p._elimRound = match.round;
  match.eliminationOrder.push(id);
  io.emit('event', { type: 'eliminated', id, reason });
  if (!p.bot) io.to(id).emit('you', { state: 'eliminated', reason });
}

function endRound(timedOut) {
  clearTimers();
  const def = current();
  const qualified = new Set();

  if (def.type === 'race') {
    match.qualOrder.slice(0, match.qualifyCount).forEach((id) => qualified.add(id));
    if (qualified.size < match.qualifyCount) {
      aliveIds().filter((id) => !qualified.has(id))
        .sort((a, b) => players[b].x - players[a].x)
        .forEach((id) => { if (qualified.size < match.qualifyCount) { qualified.add(id); players[id].roundsCleared++; } });
    }
  } else {
    aliveIds().forEach((id) => qualified.add(id));
  }

  const losers = match.participants.filter((id) => players[id] && players[id].stillIn && !qualified.has(id));
  if (def.type === 'race') losers.sort((a, b) => players[a].x - players[b].x);
  else losers.sort((a, b) => (players[a]._elimT || 0) - (players[b]._elimT || 0));
  losers.forEach((id) => knockOut(id, timedOut ? 'waktu habis' : 'tersingkir'));

  // daftar tersingkir ronde ini (survival: pemain gugur saat bermain, bukan di akhir)
  const eliminatedList = match.participants
    .filter((id) => players[id] && players[id]._elimRound === match.round && !qualified.has(id))
    .sort((a, b) => (players[a]._elimT || 0) - (players[b]._elimT || 0));

  match.participants.forEach((id) => {
    const p = players[id];
    if (!p) return;
    p.alive = false;
    p.stillIn = qualified.has(id);
  });

  match.phase = 'INTERMISSION';
  io.emit('round-end', {
    index: match.round,
    qualified: [...qualified].map(brief),
    eliminated: eliminatedList.map(brief),
    nextIn: 5,
  });

  const remain = match.participants.filter((id) => players[id] && players[id].stillIn);
  if (remain.length <= 1 || match.round >= match.rounds.length - 1) setTimeout(finalize, 5500);
  else setTimeout(nextRound, 5500);
}

function finalize() {
  clearTimers();
  match.phase = 'PODIUM';
  const remain = match.participants.filter((id) => players[id] && players[id].stillIn);
  let champ;
  if (remain.length === 1) champ = remain[0];
  else if (remain.length > 1) {
    champ = remain[(Math.random() * remain.length) | 0];
    remain.filter((id) => id !== champ).forEach((id) => match.eliminationOrder.push(id));
  } else champ = match.eliminationOrder[match.eliminationOrder.length - 1];

  const order = [champ, ...match.eliminationOrder.filter((id) => id !== champ).reverse()];
  const seen = new Set(); const places = [];
  for (const id of order) { if (!id || seen.has(id) || !players[id]) continue; seen.add(id); places.push(id); }
  const N = places.length;
  const podium = places.slice(0, 5).map((id, i) => ({ place: i + 1, name: players[id].name, look: players[id].look, bot: players[id].bot }));

  places.forEach((id, i) => {
    const p = players[id];
    p.place = i + 1;
    if (p.bot) return;
    const place = i + 1;
    const rc = p.roundsCleared || 0;
    const coins = 40 + Math.max(0, N - place) * 8 + rc * 22 + (place === 1 ? 260 : place <= 3 ? 90 : 0);
    const xp = 16 + rc * 13 + (place === 1 ? 120 : 0);
    io.to(id).emit('podium', { podium, you: { place, of: N, coins, xp, rounds: rc, champion: place === 1 } });
  });
  humans().forEach((p) => {
    if (!match.participants.includes(p.id)) io.to(p.id).emit('podium', { podium, you: null });
  });

  setTimeout(resetToLobby, 13000);
}

function resetToLobby() {
  clearTimers();
  for (const id of Object.keys(players)) {
    if (players[id].bot || players[id].gone) { delete players[id]; continue; }
    const p = players[id];
    p.ready = false; p.stillIn = false; p.alive = false; p.finished = false;
    p.qualified = false; p.place = null; p.roundsCleared = 0;
  }
  match.phase = 'LOBBY'; match.round = -1; match.participants = []; match.eliminationOrder = [];
  match.startAt = null; match.startTimer = null;
  io.emit('back-to-lobby');
  sendLobby();
}

function clearTimers() {
  clearInterval(match.tick); match.tick = null;
  clearInterval(match.cd); match.cd = null;
  clearTimeout(match.timer); match.timer = null;
}

// ---------- BOT AI ----------
function dangerVec(def, x, y, t) {
  let rx = 0, ry = 0;
  for (const s of def.spinners || []) {
    const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    const reach = s.arm + 48;
    if (d < reach) {
      const w = 1 - d / reach;
      rx += (dx / (d || 1)) * w; ry += (dy / (d || 1)) * w;
      ry += Math.sin(t * s.av) * w * 0.4;
    }
  }
  for (const h of def.hammers || []) {
    const ang = h.swing * Math.sin(t * h.w + h.phase);
    const hx = h.x + Math.sin(ang) * h.len, hy = h.pivotY + Math.cos(ang) * h.len;
    const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy);
    if (d < 100) { const w = 1 - d / 100; rx += (dx / (d || 1)) * w * 1.5; ry += (dy / (d || 1)) * w * 1.5; }
  }
  for (const pu of def.pushers || []) {
    const cy = pu.y0 + (pu.y1 - pu.y0) * (0.5 + 0.5 * Math.sin(t * pu.wv + pu.phase));
    if (Math.abs(x - pu.x) < pu.w / 2 + 44 && Math.abs(y - cy) < pu.h / 2 + 44) rx += (x < pu.x ? -0.9 : 0.9);
  }
  return { x: rx, y: ry };
}

function botStep(def, p, t, dt) {
  if (def.type === 'race') {
    const spd = 232 * p.skill * (p._stumble > t ? 0.2 : 1);
    const tx = def.finishX + 90;
    const ty = clamp(p.y + (Math.random() - 0.5) * 44, def.lane.top + 26, def.lane.bot - 26);
    let ax = tx - p.x, ay = ty - p.y;
    const d = Math.hypot(ax, ay) || 1; ax /= d; ay /= d;
    const rv = dangerVec(def, p.x, p.y, t);
    ax += rv.x * 2.5; ay += rv.y * 2.5;
    ax += (Math.random() - 0.5) * 0.4; ay += (Math.random() - 0.5) * 1.0;
    const m = Math.hypot(ax, ay) || 1;
    p.x += (ax / m) * spd * dt + p.vx * dt;
    p.y += (ay / m) * spd * dt + p.vy * dt;
    p.vx *= 0.86; p.vy *= 0.86;
    p.y = clamp(p.y, def.lane.top + 14, def.lane.bot - 14);
    p.x = clamp(p.x, 0, def.world.w);
    if (Math.random() < 0.005 * (1.15 - p.skill)) p._stumble = t + 0.3 + Math.random() * 0.7;
    return;
  }
  // survival
  const g = def.grid;
  if (!p._bt || t > p._bt) {
    p._bt = t + 0.4 + Math.random() * 0.6;
    const cc = tileColRow(g, p.x, p.y);
    let best = null, bestScore = -1e9;
    for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) {
      const col = cc.col + dc, row = cc.row + dr;
      if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) continue;
      const k = col + ',' + row;
      if (match.removed.has(k)) continue;
      const fuse = match.fuse.has(k) ? (t - match.fuse.get(k)) : -1;
      const centerDist = Math.hypot(col - (g.cols - 1) / 2, row - (g.rows - 1) / 2);
      let score = -centerDist * 0.5 - (dc * dc + dr * dr) * 0.15;
      if (fuse >= 0) score -= (fuse / def.fuseDelay) * 3 + 1;
      score += (Math.random() - 0.5) * (2.6 - p.skill * 1.6);
      if (score > bestScore) { bestScore = score; best = { col, row }; }
    }
    if (best) p._target = { x: g.ox + (best.col + 0.5) * g.size, y: g.oy + (best.row + 0.5) * g.size };
  }
  if (p._target) {
    let dx = p._target.x - p.x, dy = p._target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = 205 * p.skill;
    p.x += (dx / d) * spd * dt;
    p.y += (dy / d) * spd * dt;
  }
}

// ---------- Tabrakan rintangan (unit vektor dorong, atau null) ----------
function obstacleHit(def, p, t) {
  for (const s of def.spinners || []) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
    if (d > s.arm + 10 || d < 12) continue;
    const armAng = t * s.av + (s.a0 || 0);
    const toP = Math.atan2(dy, dx);
    const diff = Math.atan2(Math.sin(toP - armAng), Math.cos(toP - armAng));
    const halfW = 0.17 + 24 / (d + 1);
    if (Math.abs(diff) < halfW || Math.abs(Math.abs(diff) - Math.PI) < halfW) {
      const tang = armAng + Math.sign(s.av) * Math.PI / 2;
      return { x: Math.cos(tang) * 0.85 + (dx / (d || 1)) * 0.5, y: Math.sin(tang) * 0.85 + (dy / (d || 1)) * 0.5 };
    }
  }
  for (const h of def.hammers || []) {
    const ang = h.swing * Math.sin(t * h.w + h.phase);
    const hx = h.x + Math.sin(ang) * h.len, hy = h.pivotY + Math.cos(ang) * h.len;
    const dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy);
    if (d < 48) {
      const vel = h.swing * h.w * Math.cos(t * h.w + h.phase);
      const dir = Math.sign(vel) || 1;
      return { x: Math.cos(ang) * dir * 0.9 + (dx / (d || 1)) * 0.4, y: -Math.sin(ang) * dir * 0.3 + (dy / (d || 1)) * 0.5 };
    }
  }
  for (const pu of def.pushers || []) {
    const cy = pu.y0 + (pu.y1 - pu.y0) * (0.5 + 0.5 * Math.sin(t * pu.wv + pu.phase));
    if (Math.abs(p.x - pu.x) < pu.w / 2 + 22 && Math.abs(p.y - cy) < pu.h / 2 + 22) {
      const vy = (pu.y1 - pu.y0) * 0.5 * pu.wv * Math.cos(t * pu.wv + pu.phase);
      return { x: p.x < pu.x ? -0.5 : 0.5, y: (vy > 0 ? 1 : -1) * 0.9 };
    }
  }
  return null;
}

// ---------- Socket ----------
io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players[socket.id]) return;
    const name = String((payload && payload.name) || 'Pemain').slice(0, 14) || 'Pemain';
    const lk = (payload && payload.look) || {};
    players[socket.id] = {
      id: socket.id, bot: false, name, ready: false,
      look: {
        color: COLORS.includes(lk.color) ? lk.color : rnd(COLORS),
        face: FACES.includes(lk.face) ? lk.face : FACES[0],
        pattern: PATTERNS.includes(lk.pattern) ? lk.pattern : 'polos',
      },
      x: 0, y: 0, vx: 0, vy: 0,
      stillIn: false, alive: false, finished: false, qualified: false, fallingSince: null,
      roundsCleared: 0, place: null,
    };
    socket.emit('hello', { id: socket.id, phase: match.phase });
    if (match.phase === 'COUNTDOWN' || match.phase === 'ROUND' || match.phase === 'INTERMISSION') {
      const def = current();
      socket.emit('round-start', {
        index: match.round, total: match.rounds.length, need: match.qualifyCount,
        duration: def.duration, def,
        roster: match.participants.map((id) => ({ id, name: players[id].name, look: players[id].look, bot: players[id].bot, in: players[id].stillIn })),
        spawns: match.participants.map((id) => [Math.round(players[id].x), Math.round(players[id].y)]),
        you: { idx: -1, spawn: null, spectator: true },
      });
    }
    sendLobby();
  });

  socket.on('setLook', (lk) => {
    const p = players[socket.id];
    if (!p || match.phase !== 'LOBBY' || !lk) return;
    if (typeof lk.name === 'string') p.name = lk.name.slice(0, 14) || 'Pemain';
    if (COLORS.includes(lk.color)) p.look.color = lk.color;
    if (FACES.includes(lk.face)) p.look.face = lk.face;
    if (PATTERNS.includes(lk.pattern)) p.look.pattern = lk.pattern;
    sendLobby();
  });

  socket.on('ready', (v) => {
    const p = players[socket.id];
    if (!p || match.phase !== 'LOBBY') return;
    p.ready = !!v;
    maybeStart();
    sendLobby();
  });

  socket.on('input', (msg) => {
    const p = players[socket.id];
    if (!p || p.bot || !p.stillIn || p.finished || match.phase !== 'ROUND') return;
    if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const def = current();
    let nx = clamp(msg.x, 0, def.world.w), ny = clamp(msg.y, 0, def.world.h);
    const d = Math.hypot(nx - p.x, ny - p.y);
    const maxStep = 140;
    if (d > maxStep) { const s = maxStep / d; nx = p.x + (nx - p.x) * s; ny = p.y + (ny - p.y) * s; }
    p.x = nx; p.y = ny;
  });

  socket.on('leave-match', () => {
    const p = players[socket.id];
    if (!p) return;
    if (match.phase === 'ROUND' && p.stillIn) knockOut(socket.id, 'menyerah');
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;
    if (match.participants.includes(socket.id)) {
      if (p.stillIn && (match.phase === 'ROUND' || match.phase === 'COUNTDOWN')) knockOut(socket.id, 'keluar');
      p.gone = true;
    } else {
      delete players[socket.id];
    }
    if (match.phase === 'LOBBY') { maybeStart(); }
    sendLobby();
  });
});

server.listen(PORT, '0.0.0.0', () => announce('🏃 Tumble  ', server, PORT));
