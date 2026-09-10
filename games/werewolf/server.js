/* ============================================================
   WEREWOLF — social deduction, 6–12 players.
   Standalone server (like the other games/ apps). Port 3400.
   Discussion happens over the Virtual Office's own proximity
   voice, which keeps running in the parent page while this
   game is open in the overlay — this server has no audio code.
   ============================================================ */
const express = require('express');
const path = require('path');
const { createServer, announce } = require('../serve');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3400;

const MIN = 6, MAX = 12;
const DUR = { NIGHT: 35, DAY: 75, VOTE: 30, RESULT: 6, OVER: 30 };

const ROLES = {
  wolf:     { team: 'wolf',    name: 'Werewolf', emoji: '🐺', blurb: 'Tiap malam, mangsa satu warga bersama kawanan. Menang bila jumlah werewolf ≥ warga.' },
  seer:     { team: 'village', name: 'Peramal',  emoji: '🔮', blurb: 'Tiap malam, terawang satu pemain untuk tahu apakah dia werewolf.' },
  doctor:   { team: 'village', name: 'Dokter',   emoji: '💉', blurb: 'Tiap malam, lindungi satu pemain dari serangan werewolf (boleh diri sendiri).' },
  villager: { team: 'village', name: 'Warga',    emoji: '🧑‍🌾', blurb: 'Tanpa kekuatan khusus. Bongkar werewolf lewat diskusi dan voting.' },
};

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

let G = null; // { phase, day, host, players:Map, order:[], endsAt, dur, timer, night, votes:Map, log:[], winner }

function fresh() {
  return { phase: 'LOBBY', day: 0, host: null, players: new Map(), order: [], endsAt: 0, dur: 0, timer: null, night: null, votes: new Map(), log: [], winner: null };
}
function ensureGame() { if (!G) G = fresh(); return G; }
const byId = (id) => G && G.players.get(id);
const roster = () => G.order.map(byId).filter(Boolean);
const aliveAll = () => roster().filter((p) => p.alive);
const aliveConn = () => aliveAll().filter((p) => p.connected !== false);
const wolves = () => aliveAll().filter((p) => p.role === 'wolf');
const roleHolder = (r) => aliveAll().find((p) => p.role === r);

function pushLog(kind, text) {
  G.log.push({ t: Date.now(), kind, text });
  if (G.log.length > 80) G.log.shift();
}

// ---- who may see whose role ----
function reveal(targetId, viewerId) {
  const viewer = byId(viewerId), target = byId(targetId);
  if (!viewer || !target) return false;
  if (targetId === viewerId) return true;
  if (G.phase === 'OVER') return true;
  if (!viewer.alive) return true;                                    // the dead see all
  if (viewer.role === 'wolf' && target.role === 'wolf') return true; // wolves know wolves
  return false;
}

function nightActed(p) {
  if (!G.night) return null;
  if (p.role === 'wolf') return G.night.kill.get(p.id) || null;
  if (p.role === 'seer') return G.night.seer || null;
  if (p.role === 'doctor') return G.night.doctor || null;
  return null;
}

function viewFor(id) {
  const me = byId(id);
  const players = G.order.map((pid) => {
    const p = byId(pid); if (!p) return null;
    return {
      id: pid, name: p.name, color: p.color,
      alive: p.alive, connected: p.connected !== false, spectator: !!p.spectator,
      isHost: pid === G.host, isYou: pid === id,
      role: reveal(pid, id) ? p.role : null,
      voteCount: G.phase === 'VOTE' ? [...G.votes.values()].filter((t) => t === pid).length : 0,
      myVote: G.phase === 'VOTE' && G.votes.get(id) === pid,
    };
  }).filter(Boolean);

  return {
    phase: G.phase, day: G.day, host: G.host,
    endsAt: G.endsAt, dur: G.dur,
    minPlayers: MIN, maxPlayers: MAX,
    aliveCount: aliveAll().length,
    you: me ? {
      role: me.role,
      roleInfo: me.role ? ROLES[me.role] : null,
      alive: me.alive,
      spectator: !!me.spectator,
      canAct: G.phase === 'NIGHT' && me.alive && ['wolf', 'seer', 'doctor'].includes(me.role),
      acted: me.role ? nightActed(me) : null,
    } : null,
    players,
    log: G.log.slice(-26),
    mySkipVote: G.phase === 'VOTE' && G.votes.get(id) === 'skip',
    winner: G.winner,
    reveal: G.phase === 'OVER'
      ? G.order.filter((pid) => byId(pid).role)
        .map((pid) => ({ name: byId(pid).name, role: byId(pid).role, alive: byId(pid).alive }))
      : null,
  };
}

function broadcast() {
  if (!G) return;
  for (const id of G.order) io.to(id).emit('ww:state', viewFor(id));
}

// ---- phase machine ----
function setPhase(phase, dur) {
  clearTimeout(G.timer);
  G.phase = phase;
  G.dur = dur || 0;
  G.endsAt = dur ? Date.now() + dur * 1000 : 0;
  if (dur) G.timer = setTimeout(() => onTimeout(phase), dur * 1000 + 150);
}

function onTimeout(phase) {
  if (!G || G.phase !== phase) return;
  if (phase === 'NIGHT') resolveNight();
  else if (phase === 'DAY') beginVote();
  else if (phase === 'VOTE') resolveVote();
  else if (phase === 'RESULT') beginNight();
  else if (phase === 'OVER') resetToLobby();
}

function startGame() {
  if (!G || G.phase !== 'LOBBY') return;
  const ids = G.order.filter((id) => byId(id) && byId(id).connected !== false && !byId(id).spectator);
  if (ids.length < MIN || ids.length > MAX) return;

  const nWolf = ids.length <= 7 ? 1 : ids.length <= 11 ? 2 : 3;
  const bag = [];
  for (let i = 0; i < nWolf; i++) bag.push('wolf');
  bag.push('seer', 'doctor');
  while (bag.length < ids.length) bag.push('villager');
  shuffle(bag);
  ids.forEach((id, i) => { const p = byId(id); p.role = bag[i]; p.alive = true; p.spectator = false; });

  G.day = 0;
  pushLog('sys', `Permainan dimulai — ${ids.length} pemain, ${nWolf} werewolf.`);
  beginNight();
}

function beginNight() {
  G.day += 1;
  G.night = { kill: new Map(), seer: null, doctor: null };
  G.votes = new Map();
  setPhase('NIGHT', DUR.NIGHT);
  pushLog('night', `🌙 Malam ${G.day}. Kota tertidur. Werewolf memilih mangsa…`);
  broadcast();
}

function resolveNight() {
  const tally = {};
  for (const t of G.night.kill.values()) tally[t] = (tally[t] || 0) + 1;
  const entries = Object.entries(tally);
  let best = 0;
  for (const [, c] of entries) if (c > best) best = c;
  const tied = entries.filter(([, c]) => c === best).map(([t]) => t);
  const victim = best > 0 && tied.length ? tied[(Math.random() * tied.length) | 0] : null;

  let died = null;
  if (victim && victim !== G.night.doctor && byId(victim) && byId(victim).alive) {
    byId(victim).alive = false;
    died = victim;
  }
  if (died) {
    const p = byId(died);
    pushLog('death', `🌅 Pagi ${G.day}. ${p.name} ditemukan tewas — dia ${ROLES[p.role].emoji} ${ROLES[p.role].name}.`);
  } else if (victim) {
    pushLog('safe', `🌅 Pagi ${G.day}. Serangan digagalkan Dokter — tidak ada korban.`);
  } else {
    pushLog('safe', `🌅 Pagi ${G.day}. Malam berlalu tanpa korban.`);
  }

  if (checkWin()) return;
  beginDay();
}

function beginDay() {
  setPhase('DAY', DUR.DAY);
  pushLog('day', `☀️ Siang ${G.day}. Diskusikan lewat voice chat kantor. Host memulai voting bila siap.`);
  broadcast();
}

function beginVote() {
  if (!G || G.phase !== 'DAY') return;
  G.votes = new Map();
  setPhase('VOTE', DUR.VOTE);
  pushLog('vote', `🗳️ Voting dibuka. Pilih siapa yang dieliminasi.`);
  broadcast();
}

function resolveVote() {
  const tally = {};
  for (const t of G.votes.values()) if (t !== 'skip') tally[t] = (tally[t] || 0) + 1;
  const entries = Object.entries(tally);
  let best = 0;
  for (const [, c] of entries) if (c > best) best = c;
  const tied = entries.filter(([, c]) => c === best).map(([t]) => t);
  const skips = [...G.votes.values()].filter((v) => v === 'skip').length;

  const out = tied.length === 1 && best > skips ? tied[0] : null;
  if (out && byId(out) && byId(out).alive) {
    byId(out).alive = false;
    const p = byId(out);
    pushLog('death', `${p.name} dieliminasi lewat voting — dia ${ROLES[p.role].emoji} ${ROLES[p.role].name}.`);
  } else {
    pushLog('safe', tied.length > 1 ? `Suara seri — tidak ada yang dieliminasi.` : `Warga memilih tidak mengeliminasi siapa pun.`);
  }

  if (checkWin()) return;
  setPhase('RESULT', DUR.RESULT);
  broadcast();
}

function checkWin() {
  const w = wolves().length;
  const v = aliveAll().length - w;
  if (w === 0) return endGame('village');
  if (w >= v) return endGame('wolf');
  return false;
}

function endGame(winner) {
  G.winner = winner;
  setPhase('OVER', DUR.OVER);
  pushLog('over', winner === 'wolf' ? '🐺 Werewolf menang — mereka menguasai kota.' : '🏡 Warga menang — semua werewolf tumpas.');
  broadcast();
  return true;
}

function resetToLobby() {
  if (!G) return;
  clearTimeout(G.timer);
  const keep = G.order.filter((id) => byId(id) && byId(id).connected !== false);
  if (keep.length === 0) { G = null; return; }
  const ng = fresh();
  ng.host = keep[0];
  for (const id of keep) {
    const p = byId(id);
    ng.players.set(id, { id, name: p.name, color: p.color, alive: true, role: null, connected: true, spectator: false });
    ng.order.push(id);
  }
  G = ng;
  pushLog('sys', 'Kembali ke lobi. Host bisa memulai ronde baru.');
  broadcast();
}

function nightComplete() {
  const w = wolves();
  const wolvesDone = w.length === 0 || w.every((x) => G.night.kill.has(x.id));
  const seerDone = !roleHolder('seer') || G.night.seer != null;
  const docDone = !roleHolder('doctor') || G.night.doctor != null;
  return wolvesDone && seerDone && docDone;
}

function removePlayer(id, hard) {
  if (!G || !G.players.has(id)) return;
  const p = byId(id);
  const mid = G.phase !== 'LOBBY' && G.phase !== 'OVER';
  if (hard || !mid) {
    G.players.delete(id);
    G.order = G.order.filter((x) => x !== id);
    if (hard && p && mid) pushLog('sys', `${p.name} keluar dari permainan.`);
  } else {
    p.alive = false;
    p.connected = false;
    pushLog('sys', `${p.name} terputus.`);
  }
  if (G.order.length === 0) { clearTimeout(G.timer); G = null; return; }
  if (G.host === id) G.host = G.order[0];
  if (mid && checkWin()) return;
  broadcast();
}

// ---- sockets ----
io.on('connection', (socket) => {
  socket.on('ww:join', (payload) => {
    const name = String((payload && payload.name) || 'Pemain').slice(0, 16) || 'Pemain';
    const color = String((payload && payload.color) || '#8a90a0').slice(0, 24);
    ensureGame();
    if (G.players.has(socket.id)) return broadcast();
    const mid = G.phase !== 'LOBBY';
    if (!mid && G.order.length >= MAX) return io.to(socket.id).emit('ww:full', {});
    G.players.set(socket.id, { id: socket.id, name, color, alive: !mid, role: null, connected: true, spectator: mid });
    G.order.push(socket.id);
    if (!G.host) G.host = socket.id;
    if (mid) io.to(socket.id).emit('ww:private', { text: 'Permainan sedang berjalan — kamu menonton sampai ronde berikutnya.' });
    broadcast();
  });

  socket.on('ww:leave', () => removePlayer(socket.id, true));
  socket.on('ww:start', () => { if (G && socket.id === G.host) startGame(); });
  socket.on('ww:startvote', () => { if (G && socket.id === G.host && G.phase === 'DAY') beginVote(); });
  socket.on('ww:again', () => { if (G && socket.id === G.host && G.phase === 'OVER') resetToLobby(); });

  socket.on('ww:night', (msg) => {
    if (!G || G.phase !== 'NIGHT' || !msg) return;
    const me = byId(socket.id);
    const target = byId(msg.target);
    if (!me || !me.alive || !target || !target.alive) return;
    if (msg.action === 'kill' && me.role === 'wolf') {
      if (target.role === 'wolf') return;
      G.night.kill.set(socket.id, msg.target);
    } else if (msg.action === 'see' && me.role === 'seer') {
      G.night.seer = msg.target;
      io.to(socket.id).emit('ww:private', {
        kind: 'seer', target: msg.target, wolf: target.role === 'wolf',
        text: `🔮 ${target.name} ${target.role === 'wolf' ? 'ADALAH werewolf.' : 'BUKAN werewolf.'}`,
      });
    } else if (msg.action === 'heal' && me.role === 'doctor') {
      G.night.doctor = msg.target;
    } else return;
    broadcast();
    if (nightComplete()) setTimeout(() => { if (G && G.phase === 'NIGHT') resolveNight(); }, 700);
  });

  socket.on('ww:wolfchat', (msg) => {
    if (!G || G.phase !== 'NIGHT' || !msg) return;
    const me = byId(socket.id);
    if (!me || !me.alive || me.role !== 'wolf') return;
    const text = String(msg.text || '').slice(0, 200).trim();
    if (!text) return;
    for (const w of wolves()) io.to(w.id).emit('ww:wolfchat', { from: me.name, text });
  });

  socket.on('ww:vote', (msg) => {
    if (!G || G.phase !== 'VOTE' || !msg) return;
    const me = byId(socket.id);
    if (!me || !me.alive) return;
    const t = msg.target;
    if (t !== 'skip' && (!byId(t) || !byId(t).alive)) return;
    G.votes.set(socket.id, t);
    broadcast();
    const voted = [...G.votes.keys()].filter((id) => byId(id) && byId(id).alive).length;
    if (voted >= aliveConn().length) setTimeout(() => { if (G && G.phase === 'VOTE') resolveVote(); }, 500);
  });

  socket.on('disconnect', () => removePlayer(socket.id, false));
});

server.listen(PORT, '0.0.0.0', () => announce('🐺 Werewolf', server, PORT));
