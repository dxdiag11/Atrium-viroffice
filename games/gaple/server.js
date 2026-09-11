/* ============================================================
   GAPLE — server. 4 seats, real players first, empty seats filled
   with bots so the table can always start. This is what makes
   people opening Gaple from the office actually land at the same
   table instead of each getting a private game against AI.
   ============================================================ */
const express = require('express');
const path = require('path');
const { createServer, announce } = require('../serve');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3200;
const server = createServer(app);
const io = new Server(server);

const COLORS = ['#10b981', '#60a5fa', '#f472b6', '#fb923c'];
const BOT_NAMES = ['Bot Rizki', 'Bot Sari', 'Bot Bagas', 'Bot Putri'];
const botDelay = () => 650 + Math.random() * 550;

// ---- table state: 4 seats, lives for as long as the server runs ----
let seats = [null, null, null, null];   // {id, name, color, bot, connected} | null
let spectators = [];                     // socket ids waiting for a free seat
let phase = 'LOBBY';                     // LOBBY | ROUND | ROUND_OVER
let scores = [0, 0, 0, 0];
let roundNum = 0;
let log = [];
let hands, chain, chainLeft, chainRight, currentPlayer, consecutivePasses, gameOver, winner, blocked;
let botTimer = null;

resetRound();

function pushLog(msg, type) {
  log.unshift({ msg, type: type || 'normal' });
  if (log.length > 40) log.pop();
}
function nameOf(i) { return seats[i] ? seats[i].name : '?'; }
function seatOf(socketId) { return seats.findIndex((s) => s && s.id === socketId); }
function humanCount() { return seats.filter((s) => s && !s.bot).length; }

function resetRound() {
  hands = [[], [], [], []];
  chain = [];
  chainLeft = null;
  chainRight = null;
  currentPlayer = 0;
  consecutivePasses = 0;
  gameOver = false;
  winner = null;
  blocked = false;
}

function resetTable() {
  phase = 'LOBBY';
  scores = [0, 0, 0, 0];
  roundNum = 0;
  log = [];
  spectators = [];
  resetRound();
}

// A spectator who's been waiting takes an empty seat as soon as one opens up —
// this is what seats late joiners into the very next round instead of leaving
// them watching forever.
function fillFromSpectators(i) {
  while (spectators.length) {
    const sid = spectators.shift();
    const sock = io.sockets.sockets.get(sid);
    if (!sock || !sock.data.pending) continue; // stale entry, try the next one
    seats[i] = { id: sid, name: sock.data.pending.name, color: COLORS[i], bot: false, connected: true };
    sock.data.pending = null;
    pushLog(`${seats[i].name} duduk di kursi ${i + 1}.`);
    return true;
  }
  return false;
}

function fillBotsForStart() {
  for (let i = 0; i < 4; i++) {
    if (!seats[i]) seats[i] = { id: null, name: BOT_NAMES[i], color: COLORS[i], bot: true, connected: true };
  }
}

function promoteSpectatorsIntoBotSeats() {
  for (let i = 0; i < 4; i++) if (seats[i] && seats[i].bot) fillFromSpectators(i);
}

function startRound() {
  fillBotsForStart();
  resetRound();
  roundNum++;

  const tiles = [];
  let id = 0;
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ a, b, id: id++ });
  for (let i = tiles.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  for (let p = 0; p < 4; p++) hands[p] = tiles.slice(p * 7, (p + 1) * 7);

  outer:
  for (let v = 6; v >= 0; v--) {
    for (let p = 0; p < 4; p++) {
      if (hands[p].some((t) => t.a === v && t.b === v)) { currentPlayer = p; break outer; }
    }
  }

  phase = 'ROUND';
  pushLog(`Ronde ${roundNum} dimulai — ${nameOf(currentPlayer)} mulai.`);
  broadcast();
  maybeBotTurn();
}

// ---- pure domino rules (ported from the original single-player game) ----
function canPlay(tile) {
  if (chainLeft === null) return true;
  return tile.a === chainLeft || tile.b === chainLeft || tile.a === chainRight || tile.b === chainRight;
}
function validEnds(tile) {
  if (chainLeft === null) return ['left', 'right'];
  const e = [];
  if (tile.a === chainLeft || tile.b === chainLeft) e.push('left');
  if (tile.a === chainRight || tile.b === chainRight) e.push('right');
  return e;
}
function validMoves(p) { return hands[p].filter(canPlay); }

function playTile(p, tileId, end) {
  const idx = hands[p].findIndex((t) => t.id === tileId);
  if (idx === -1) return false;
  const tile = hands[p][idx];
  if (!canPlay(tile)) return false;
  if (chainLeft !== null && !validEnds(tile).includes(end)) return false;

  let chainTile;
  if (chainLeft === null) {
    chainTile = { ...tile, leftVal: tile.a, rightVal: tile.b };
    chainLeft = tile.a; chainRight = tile.b;
    chain.push(chainTile);
  } else if (end === 'left') {
    if (tile.b === chainLeft) { chainTile = { ...tile, leftVal: tile.a, rightVal: tile.b }; chainLeft = tile.a; }
    else { chainTile = { ...tile, leftVal: tile.b, rightVal: tile.a }; chainLeft = tile.b; }
    chain.unshift(chainTile);
  } else {
    if (tile.a === chainRight) { chainTile = { ...tile, leftVal: tile.a, rightVal: tile.b }; chainRight = tile.b; }
    else { chainTile = { ...tile, leftVal: tile.b, rightVal: tile.a }; chainRight = tile.a; }
    chain.push(chainTile);
  }

  hands[p].splice(idx, 1);
  consecutivePasses = 0;
  pushLog(`${nameOf(p)} main [${tile.a}|${tile.b}] ke ${end === 'left' ? 'kiri' : 'kanan'}`);

  if (hands[p].length === 0) {
    gameOver = true; winner = p; scores[p]++; phase = 'ROUND_OVER';
    pushLog(`🏆 ${nameOf(p)} menang!`, 'win');
  } else {
    currentPlayer = (p + 1) % 4;
  }
  return true;
}

function passTurn(p) {
  consecutivePasses++;
  pushLog(`${nameOf(p)} pas (tidak ada kartu)`);
  if (consecutivePasses >= 4) {
    gameOver = true; blocked = true; phase = 'ROUND_OVER';
    let min = Infinity, wi = 0;
    for (let i = 0; i < 4; i++) {
      const pip = hands[i].reduce((s, t) => s + t.a + t.b, 0);
      if (pip < min) { min = pip; wi = i; }
    }
    winner = wi; scores[wi]++;
    pushLog(`🔒 Jalan buntu! ${nameOf(wi)} menang (pip: ${min})`, 'win');
  } else {
    currentPlayer = (p + 1) % 4;
  }
}

function botMove() {
  const valid = validMoves(currentPlayer);
  if (valid.length === 0) { passTurn(currentPlayer); return; }
  valid.sort((a, b) => {
    const ad = a.a === a.b, bd = b.a === b.b;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return (b.a + b.b) - (a.a + a.b);
  });
  const tile = valid[0];
  const ends = chainLeft === null ? ['left'] : validEnds(tile);
  playTile(currentPlayer, tile.id, ends[0]);
}

function maybeBotTurn() {
  clearTimeout(botTimer);
  if (phase !== 'ROUND' || gameOver) return;
  const seat = seats[currentPlayer];
  if (!seat || !seat.bot) return;
  botTimer = setTimeout(() => { botMove(); broadcast(); maybeBotTurn(); }, botDelay());
}

// ---- state broadcast (each socket only ever sees its own hand) ----
function publicSeats() {
  return seats.map((s, i) => s && {
    seat: i, name: s.name, color: s.color, bot: !!s.bot, connected: s.connected !== false,
    count: hands[i] ? hands[i].length : 0,
  });
}

function stateFor(socketId) {
  const mySeat = seatOf(socketId);
  return {
    phase, roundNum, scores, log: log.slice(0, 40),
    seats: publicSeats(),
    mySeat: mySeat >= 0 ? mySeat : null,
    myHand: mySeat >= 0 ? hands[mySeat] : [],
    chain, chainLeft, chainRight, currentPlayer, gameOver, winner, blocked,
    finalPips: gameOver ? hands.map((h) => h.reduce((s, t) => s + t.a + t.b, 0)) : null,
    waitingCount: spectators.length,
    humanCount: humanCount(),
  };
}

function broadcast() {
  for (const [id, sock] of io.sockets.sockets) sock.emit('gaple:state', stateFor(id));
}

function leaveSeat(id) {
  spectators = spectators.filter((s) => s !== id);
  const i = seatOf(id);
  if (i < 0) return;
  const name = seats[i].name;
  if (phase === 'ROUND' && !gameOver) {
    // Round is live — hand the seat to a bot rather than stalling everyone's turn.
    seats[i] = { id: null, name: 'Bot ' + name, color: seats[i].color, bot: true, connected: true };
    pushLog(`${name} keluar — digantikan Bot.`);
  } else {
    seats[i] = null;
    pushLog(`${name} meninggalkan meja.`);
    if (!fillFromSpectators(i) && seats.every((s) => !s)) resetTable();
  }
  broadcast();
  maybeBotTurn();
}

io.on('connection', (socket) => {
  socket.data.pending = null;

  socket.on('gaple:join', (payload) => {
    if (seatOf(socket.id) >= 0) return broadcast();
    const name = String((payload && payload.name) || 'Pemain').slice(0, 16) || 'Pemain';

    if (phase !== 'ROUND') {
      let target = seats.findIndex((s) => !s);
      if (target === -1) target = seats.findIndex((s) => s && s.bot);
      if (target !== -1) {
        seats[target] = { id: socket.id, name, color: COLORS[target], bot: false, connected: true };
        pushLog(`${name} duduk di kursi ${target + 1}.`);
        return broadcast();
      }
    }
    // Mid-round, or all four seats already taken by people — watch until a seat opens.
    socket.data.pending = { name };
    spectators.push(socket.id);
    broadcast();
  });

  socket.on('gaple:start', () => {
    if (seatOf(socket.id) < 0 || phase !== 'LOBBY' || humanCount() < 1) return;
    startRound();
  });

  socket.on('gaple:again', () => {
    if (seatOf(socket.id) < 0 || phase !== 'ROUND_OVER') return;
    promoteSpectatorsIntoBotSeats();
    startRound();
  });

  socket.on('gaple:play', (msg) => {
    const p = seatOf(socket.id);
    if (p < 0 || p !== currentPlayer || phase !== 'ROUND' || gameOver || !msg) return;
    const tile = hands[p].find((t) => t.id === msg.tileId);
    if (!tile) return;
    const end = chainLeft === null ? 'left' : msg.end;
    if (chainLeft !== null && end !== 'left' && end !== 'right') return;
    if (playTile(p, msg.tileId, end)) { broadcast(); maybeBotTurn(); }
  });

  socket.on('gaple:pass', () => {
    const p = seatOf(socket.id);
    if (p < 0 || p !== currentPlayer || phase !== 'ROUND' || gameOver) return;
    if (validMoves(p).length > 0) return; // server is the referee: no passing with a legal move
    passTurn(p);
    broadcast();
    maybeBotTurn();
  });

  socket.on('gaple:leave', () => leaveSeat(socket.id));
  socket.on('disconnect', () => leaveSeat(socket.id));
});

server.listen(PORT, '0.0.0.0', () => announce('🎴 Gaple    ', server, PORT));
