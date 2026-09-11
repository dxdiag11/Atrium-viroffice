'use strict';
/* ============================================================
   GAPLE — game.js (client)
   4 real seats over Socket.IO; the server is the referee and the
   only source of truth. This file renders whatever `gaple:state`
   sends and turns clicks into `gaple:play` / `gaple:pass` intents.
   Kursi kosong ditandai server sebagai bot, jadi meja tetap jalan
   walau belum 4 orang.
   ============================================================ */

// ──────────────────────────────────────────
//  1. DOMINO SVG RENDERER (unchanged — pure presentation)
// ──────────────────────────────────────────

const P = [10, 18, 26];
const PIPS = {
  0: [], 1: [[1, 1]], 2: [[0, 2], [2, 0]], 3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function dots(val, ox, oy, color) {
  return PIPS[val].map(([r, c]) => `<circle cx="${ox + P[c]}" cy="${oy + P[r]}" r="3.4" fill="${color}"/>`).join('');
}

function dominoSVG(leftVal, rightVal, opts = {}) {
  const { selected = false, playable = false } = opts;
  const W = 78, H = 40, HALF = 39;
  const tileFill = '#0d1224', dotColor = '#dde8e0';
  const borderClr = selected ? '#fbbf24' : playable ? '#10b981' : '#1e3a2c';
  const divClr = '#1e3a2c';
  const inner = `<line x1="${HALF}" y1="5" x2="${HALF}" y2="${H - 5}" stroke="${divClr}" stroke-width="1.5"/>
      ${dots(leftVal, 1, 1, dotColor)}${dots(rightVal, HALF, 1, dotColor)}`;
  const glow = selected ? 'filter: drop-shadow(0 0 8px #fbbf24);' : playable ? 'filter: drop-shadow(0 0 5px #10b981);' : '';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="domino-svg" style="${glow}">
    <rect width="${W}" height="${H}" rx="7" fill="${tileFill}" stroke="${borderClr}" stroke-width="2"/>${inner}</svg>`;
}

function dominoSVGVertical(topVal, bottomVal) {
  const W = 40, H = 78, HALF = 39;
  const FILL = '#0d1224', DOT = '#dde8e0', BORDER = '#1e3a2c', DIV = '#1e3a2c';
  const PX = [7, 20, 33], PY = [7, 20, 32];
  const PATS = [[], [[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]],
    [[0, 0], [0, 2], [2, 0], [2, 2]], [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]];
  const dv = (val, yOffset) => (PATS[val] || []).map(([r, c]) => `<circle cx="${PX[c]}" cy="${yOffset + PY[r]}" r="3.2" fill="${DOT}"/>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="domino-svg" style="display:block">
    <rect width="${W}" height="${H}" rx="7" fill="${FILL}" stroke="${BORDER}" stroke-width="2"/>
    <line x1="4" y1="${HALF}" x2="${W - 4}" y2="${HALF}" stroke="${DIV}" stroke-width="1.5"/>
    ${dv(topVal, 0)}${dv(bottomVal, HALF)}</svg>`;
}

// ──────────────────────────────────────────
//  2. IDENTITY + SOCKET
// ──────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let myName = (params.get('name') || '').slice(0, 16);

const socket = io();
let state = null;          // last state from the server
let joined = false;
let selectedId = null;     // locally-selected tile (ephemeral UI)
let awaitEnd = false;

const PALETTE = ['#10b981', '#60a5fa', '#f472b6', '#fb923c'];

$('nameInput').value = myName;
$('joinBtn').onclick = doJoin;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
if (myName) setTimeout(doJoin, 200); // office already gave us a name -> sit down right away

function doJoin() {
  if (joined) return;
  myName = ($('nameInput').value || 'Pemain').slice(0, 16) || 'Pemain';
  joined = true;
  $('prejoinMsg').textContent = 'Menghubungkan…';
  socket.emit('gaple:join', { name: myName });
}

function backToOffice() {
  socket.emit('gaple:leave');
  try { window.parent.postMessage('atrium:exit-game', '*'); } catch (e) {}
  joined = false;
  state = null;
  showScreen('prejoin');
  $('prejoinMsg').textContent = '';
}
$('backBtn1').onclick = backToOffice;
$('backBtn2').onclick = backToOffice;
$('backBtn3').onclick = backToOffice;
$('startBtn').onclick = () => socket.emit('gaple:start');
$('againBtn').onclick = () => socket.emit('gaple:again');

socket.on('gaple:state', (s) => { state = s; render(); });

// ──────────────────────────────────────────
//  3. SEAT ROTATION — you always sit at the bottom
// ──────────────────────────────────────────

// slot 0 = bottom (you), 1 = right, 2 = top, 3 = left
function seatAtSlot(slot) {
  if (!state) return null;
  const base = state.mySeat != null ? state.mySeat : 0;
  return (base + slot) % 4;
}

function canPlay(tile) {
  if (state.chainLeft === null) return true;
  return tile.a === state.chainLeft || tile.b === state.chainLeft || tile.a === state.chainRight || tile.b === state.chainRight;
}
function validEnds(tile) {
  if (state.chainLeft === null) return ['left', 'right'];
  const e = [];
  if (tile.a === state.chainLeft || tile.b === state.chainLeft) e.push('left');
  if (tile.a === state.chainRight || tile.b === state.chainRight) e.push('right');
  return e;
}

// ──────────────────────────────────────────
//  4. EVENT HANDLERS
// ──────────────────────────────────────────

function onTileClick(tileId) {
  if (!isMyTurn()) return;
  const tile = state.myHand.find((t) => t.id === tileId);
  if (!tile || !canPlay(tile)) return;

  if (selectedId === tileId) { selectedId = null; awaitEnd = false; render(); return; }
  selectedId = tileId;

  if (state.chainLeft === null) {
    socket.emit('gaple:play', { tileId, end: 'left' });
    _clearSelection();
    return;
  }
  const ends = validEnds(tile);
  if (ends.length === 1) {
    socket.emit('gaple:play', { tileId, end: ends[0] });
    _clearSelection();
  } else {
    awaitEnd = true;
    render();
  }
}
function onChooseEnd(end) {
  if (!selectedId) return;
  socket.emit('gaple:play', { tileId: selectedId, end });
  _clearSelection();
}
function onPass() { if (isMyTurn()) socket.emit('gaple:pass'); }
function _clearSelection() { selectedId = null; awaitEnd = false; }
function isMyTurn() {
  return !!state && state.mySeat != null && state.phase === 'ROUND' && !state.gameOver && state.currentPlayer === state.mySeat;
}

window.onTileClick = onTileClick;
window.onChooseEnd = onChooseEnd;
window.onPass = onPass;
window._cancelSel = () => { _clearSelection(); render(); };

// ──────────────────────────────────────────
//  5. SCREENS
// ──────────────────────────────────────────

function showScreen(which) {
  $('prejoin').classList.toggle('hidden', which !== 'prejoin');
  $('lobby').classList.toggle('hidden', which !== 'lobby');
  $('app').classList.toggle('hidden', which !== 'app');
  if (which !== 'app') $('modal').classList.add('hidden');
}

function render() {
  if (!state) return;
  if (state.phase === 'LOBBY') { showScreen('lobby'); renderLobby(); return; }
  showScreen('app');
  renderHeader();
  renderBoard();
  renderChain();
  renderMyHand();
  renderControls();
  renderLog();
  renderModal();
}

function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

function renderLobby() {
  const seats = state.seats;
  $('waitingNote').textContent = '(' + state.humanCount + '/4 online' + (state.waitingCount ? ', ' + state.waitingCount + ' menonton' : '') + ')';
  $('seatList').innerHTML = seats.map((s, i) => {
    const mine = i === state.mySeat;
    return '<li' + (mine ? ' class="me"' : '') + '>' +
      '<span class="dot" style="background:' + PALETTE[i] + '"></span>' +
      '<span class="rn">' + (s ? esc(s.name) + (mine ? ' (kamu)' : '') : 'Kosong') + '</span>' +
      '<span class="rr">' + (s ? (s.bot ? 'akan diisi bot' : 'siap') : '—') + '</span></li>';
  }).join('');
  const seated = state.mySeat != null;
  $('startBtn').classList.toggle('hidden', !seated);
  $('lobbyMsg').textContent = seated
    ? 'Klik mulai kapan saja — kursi kosong diisi bot.'
    : 'Meja penuh — kamu akan otomatis dapat kursi begitu ada yang keluar.';
}

// ──────────────────────────────────────────
//  6. GAME RENDER
// ──────────────────────────────────────────

function renderHeader() {
  for (let i = 0; i < 4; i++) {
    const s = state.seats[i];
    $('cname-' + i).textContent = s ? s.name + (i === state.mySeat ? ' (kamu)' : '') : '—';
    $('score-' + i).textContent = state.scores[i];
    $('chip-' + i).classList.toggle('active-chip', state.currentPlayer === i && state.phase === 'ROUND' && !state.gameOver);
  }
  const ind = $('turn-indicator');
  if (state.gameOver) { ind.textContent = '🏁 Ronde selesai'; ind.className = 'turn-over'; }
  else if (state.mySeat == null) { ind.textContent = '👀 Menonton'; ind.className = 'turn-wait'; }
  else if (state.currentPlayer === state.mySeat) { ind.textContent = '🎯 Giliran Anda!'; ind.className = 'turn-me'; }
  else { ind.textContent = `⏳ ${nameAt(state.currentPlayer)}...`; ind.className = 'turn-ai'; }
}

function nameAt(seat) { const s = state.seats[seat]; return s ? s.name : '?'; }

function renderBoard() {
  const opp = [['p1', 1], ['p2', 2], ['p3', 3]];
  for (const [domId, slot] of opp) {
    const seat = seatAtSlot(slot);
    const s = state.seats[seat];
    const wrap = $(domId);
    wrap.classList.toggle('active-player', state.currentPlayer === seat && state.phase === 'ROUND' && !state.gameOver);
    $('name-' + slot).textContent = s ? s.name : '—';
    $('cnt-' + slot).textContent = (s ? s.count : 0) + ' kartu';
    const dotEl = wrap.querySelector('.opp-dot');
    if (dotEl) dotEl.style.background = PALETTE[seat];
    const handEl = $('hand-' + slot);
    handEl.innerHTML = '';
    const shown = Math.min(s ? s.count : 0, 7);
    for (let i = 0; i < shown; i++) { const d = document.createElement('div'); d.className = 'tile-back'; handEl.appendChild(d); }
  }
}

function dominoSVGVerticalWrap(t) { return dominoSVGVertical(t.leftVal, t.rightVal); }

function renderChain() {
  const chainEl = $('chain'), wrapEl = $('chain-wrap'), endsEl = $('chain-ends');
  chainEl.innerHTML = '';
  chainEl.style.position = 'relative';
  chainEl.style.width = '100%';

  if (state.chain.length === 0) {
    chainEl.innerHTML = '<div class="chain-empty">Letakkan kartu pertama...</div>';
    chainEl.style.height = '80px';
    endsEl.style.display = 'none';
    return;
  }
  endsEl.style.display = 'flex';
  $('cl').textContent = state.chainLeft;
  $('cr').textContent = state.chainRight;

  const TW = 78, TH = 40, G = 4, VW = 40, VH = 78, PAD = 10;
  const rawW = wrapEl.getBoundingClientRect().width || wrapEl.clientWidth || 700;
  const AW = rawW - 2 * PAD;
  const TPR = Math.max(2, Math.floor((AW - 2 * (VW + G) + G) / (TW + G)));
  const xHStart = PAD + VW + G;
  const rowW = TPR * (TW + G) - G;
  const xLC = PAD, xRC = xHStart + rowW + G;
  const ROW_STEP = VH + G;

  const positions = [];
  let chainIdx = 0, rowNum = 0;
  while (chainIdx < state.chain.length) {
    const goRight = rowNum % 2 === 0;
    const rowY = PAD + rowNum * ROW_STEP;
    let col = 0;
    while (col < TPR && chainIdx < state.chain.length) {
      const tile = state.chain[chainIdx];
      const tileX = goRight ? xHStart + col * (TW + G) : xHStart + (TPR - 1 - col) * (TW + G);
      positions.push({ tile, x: tileX, y: rowY, vertical: false, flipH: !goRight });
      col++; chainIdx++;
    }
    if (chainIdx < state.chain.length) {
      const corner = state.chain[chainIdx];
      positions.push({ tile: corner, x: goRight ? xRC : xLC, y: rowY, vertical: true });
      chainIdx++;
    }
    rowNum++;
  }

  const maxBottom = positions.reduce((m, p) => Math.max(m, p.y + (p.vertical ? VH : TH)), 0);
  chainEl.style.height = (maxBottom + PAD) + 'px';

  for (const pos of positions) {
    const wrap = document.createElement('div');
    wrap.className = 'chain-tile';
    wrap.style.cssText = `position:absolute; left:${pos.x}px; top:${pos.y}px;`;
    if (!pos.vertical) {
      if (pos.flipH) wrap.style.transform = 'scaleX(-1)';
      wrap.innerHTML = dominoSVG(pos.tile.leftVal, pos.tile.rightVal);
    } else {
      wrap.innerHTML = dominoSVGVerticalWrap(pos.tile);
    }
    chainEl.appendChild(wrap);
  }
  requestAnimationFrame(() => { wrapEl.scrollTop = wrapEl.scrollHeight; });
}

function renderMyHand() {
  const handEl = $('my-hand');
  handEl.innerHTML = '';

  if (state.mySeat == null) {
    $('my-hand-label').textContent = '👀 MENONTON';
    $('my-count').textContent = '';
    return;
  }
  $('my-hand-label').textContent = '🖐 KARTU ANDA';

  const myTurn = isMyTurn();
  const validSet = new Set(myTurn ? state.myHand.filter(canPlay).map((t) => t.id) : []);
  $('my-count').textContent = `${state.myHand.length} kartu`;

  for (const tile of state.myHand) {
    const isSelected = tile.id === selectedId;
    const isPlayable = validSet.has(tile.id);
    const div = document.createElement('div');
    div.className = 'hand-tile ' + (isSelected ? 'selected' : isPlayable ? 'playable' : myTurn ? 'unplayable' : '');
    div.innerHTML = dominoSVG(tile.a, tile.b, { selected: isSelected, playable: isPlayable && myTurn && !isSelected });
    if (isPlayable && myTurn) div.addEventListener('click', () => onTileClick(tile.id));
    handEl.appendChild(div);
  }
}

function renderControls() {
  const el = $('controls');
  el.innerHTML = '';
  if (state.gameOver) return; // modal handles it

  if (state.mySeat == null) {
    el.innerHTML = '<span class="ctrl-msg">👀 Kamu menonton — otomatis dapat kursi di ronde berikutnya.</span>';
    return;
  }
  if (awaitEnd && selectedId) {
    const tile = state.myHand.find((t) => t.id === selectedId);
    if (!tile) { _clearSelection(); return; }
    el.innerHTML = `
      <span class="ctrl-msg highlight">Taruh kartu [${tile.a}|${tile.b}] di:</span>
      <button class="btn-end" onclick="onChooseEnd('left')">← Kiri (${state.chainLeft})</button>
      <button class="btn-end" onclick="onChooseEnd('right')">Kanan (${state.chainRight}) →</button>
      <button class="btn-cancel" onclick="_cancelSel()">✕ Batal</button>`;
    return;
  }
  if (isMyTurn()) {
    const hasValid = state.myHand.some(canPlay);
    el.innerHTML = hasValid
      ? `<span class="ctrl-msg highlight">Pilih kartu yang bercahaya untuk dimainkan</span>`
      : `<span class="ctrl-msg">Tidak ada kartu yang bisa dimainkan.</span><button class="btn-pass" onclick="onPass()">Pas →</button>`;
    return;
  }
  el.innerHTML = `<span class="ctrl-msg thinking">⏳ ${nameAt(state.currentPlayer)} sedang berpikir...</span>`;
}

function renderLog() {
  $('log').innerHTML = state.log.map((entry, i) => {
    const cls = entry.type === 'win' ? 'win-entry' : i === 0 ? 'fresh' : '';
    return `<div class="log-entry ${cls}">${esc(entry.msg)}</div>`;
  }).join('');
}

function renderModal() {
  const modal = $('modal');
  if (!state.gameOver) { modal.classList.add('hidden'); return; }
  modal.classList.remove('hidden');

  const winner = state.winner;
  const isMe = winner === state.mySeat;

  $('modal-icon').textContent = isMe ? '🏆' : state.mySeat == null ? '🏁' : '😔';
  $('modal-title').textContent = isMe ? 'Anda Menang!' : `${nameAt(winner)} Menang!`;
  $('modal-title').className = `modal-title ${isMe ? 'win' : 'lose'}`;

  const rows = state.seats.map((s, i) => `
    <tr class="${i === winner ? 'winner-row' : ''}">
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PALETTE[i]};margin-right:6px;"></span>
        ${esc(s ? s.name : '—')}${i === winner ? ' 🏆' : ''}</td>
      <td style="text-align:right">${state.finalPips ? state.finalPips[i] + ' pip' : '—'}</td>
      <td style="text-align:right">${state.scores[i]} menang</td>
    </tr>`).join('');

  $('modal-body').innerHTML = `
    ${state.blocked ? `<div class="blocked-notice">🔒 Permainan terhenti — semua pemain pas</div>` : ''}
    <table class="result-table">
      <thead><tr><th>Pemain</th><th style="text-align:right">Pip tersisa</th><th style="text-align:right">Total menang</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  $('againBtn').classList.toggle('hidden', state.mySeat == null);
}
