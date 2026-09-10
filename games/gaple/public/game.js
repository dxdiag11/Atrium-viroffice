'use strict';
/* ============================================================
   GAPLE — game.js
   Complete game logic + UI for a 4-player Gaple domino game.
   Player 0 = human (bottom), Players 1-3 = AI.
   ============================================================ */

// ──────────────────────────────────────────
//  1. DOMINO SVG RENDERER
// ──────────────────────────────────────────

// Pip (dot) positions in a 36×36 half-tile.
// Each half has 6px border padding; usable 24×24 in a 3×3 grid (8px cell).
// Centers: 6+4=10, 6+12=18, 6+20=26
const P = [10, 18, 26];

const PIPS = {
  0: [],
  1: [[1,1]],
  2: [[0,2],[2,0]],
  3: [[0,2],[1,1],[2,0]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],
};

/** Render dot circles for one half of a domino tile as SVG string. */
function dots(val, ox, oy, color) {
  return PIPS[val].map(([r, c]) =>
    `<circle cx="${ox + P[c]}" cy="${oy + P[r]}" r="3.4" fill="${color}"/>`
  ).join('');
}

/**
 * Returns an SVG string for a horizontal domino tile.
 * @param {number} leftVal  - value of the left half (0-6)
 * @param {number} rightVal - value of the right half (0-6)
 * @param {object} opts     - { faceDown, selected, playable }
 */
function dominoSVG(leftVal, rightVal, opts = {}) {
  const { faceDown = false, selected = false, playable = false } = opts;
  const W = 78, H = 40;
  const HALF = 39; // each half is 39px wide within 78px tile

  const tileFill   = faceDown ? '#0c2218' : '#0d1224';
  const dotColor   = '#dde8e0';
  const borderClr  = selected ? '#fbbf24' : playable ? '#10b981' : '#1e3a2c';
  const divClr     = '#1e3a2c';

  let inner = '';
  if (faceDown) {
    // Diagonal hatching pattern for back-face
    inner = `
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff08" stroke-width="2"/>
        </pattern>
      </defs>
      <rect x="3" y="3" width="${W-6}" height="${H-6}" rx="4" fill="url(#hatch)"/>`;
  } else {
    inner = `
      <line x1="${HALF}" y1="5" x2="${HALF}" y2="${H-5}" stroke="${divClr}" stroke-width="1.5"/>
      ${dots(leftVal,  1,       1, dotColor)}
      ${dots(rightVal, HALF,    1, dotColor)}`;
  }

  const glow = selected
    ? `filter: drop-shadow(0 0 8px #fbbf24);`
    : playable
    ? `filter: drop-shadow(0 0 5px #10b981);`
    : '';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="domino-svg" style="${glow}">
    <rect width="${W}" height="${H}" rx="7" fill="${tileFill}" stroke="${borderClr}" stroke-width="2"/>
    ${inner}
  </svg>`;
}

// ──────────────────────────────────────────
//  2. PURE GAME LOGIC — GapleGame
// ──────────────────────────────────────────

class GapleGame {
  constructor() {
    this.scores   = [0, 0, 0, 0];
    this.names    = ['Anda', 'Pemain 2', 'Pemain 3', 'Pemain 4'];
    this.colors   = ['#10b981', '#60a5fa', '#f472b6', '#fb923c'];
    this.roundNum = 0;
    this.log      = [];
    this._resetRound();
  }

  _resetRound() {
    this.hands             = [[], [], [], []];
    this.chain             = [];   // [{leftVal, rightVal, a, b, id}]
    this.chainLeft         = null;
    this.chainRight        = null;
    this.currentPlayer     = 0;
    this.consecutivePasses = 0;
    this.gameOver          = false;
    this.winner            = null;
    this.blocked           = false;
  }

  startRound() {
    this._resetRound();
    this.roundNum++;

    // Build and shuffle all 28 tiles
    const tiles = [];
    let id = 0;
    for (let a = 0; a <= 6; a++)
      for (let b = a; b <= 6; b++)
        tiles.push({ a, b, id: id++ });

    // Fisher-Yates
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }

    // Deal 7 tiles to each player
    for (let p = 0; p < 4; p++)
      this.hands[p] = tiles.slice(p * 7, (p + 1) * 7);

    // Starting player = whoever holds the highest double
    outer:
    for (let v = 6; v >= 0; v--) {
      for (let p = 0; p < 4; p++) {
        if (this.hands[p].some(t => t.a === v && t.b === v)) {
          this.currentPlayer = p;
          break outer;
        }
      }
    }

    this._log(`Ronde ${this.roundNum} dimulai — ${this.names[this.currentPlayer]} mulai.`);
  }

  /** Can the given tile be placed on the current chain? */
  canPlay(tile) {
    if (this.chainLeft === null) return true; // first move
    return (
      tile.a === this.chainLeft  || tile.b === this.chainLeft ||
      tile.a === this.chainRight || tile.b === this.chainRight
    );
  }

  /** Which ends of the chain can this tile be played on? */
  validEnds(tile) {
    if (this.chainLeft === null) return ['left', 'right'];
    const e = [];
    if (tile.a === this.chainLeft  || tile.b === this.chainLeft)  e.push('left');
    if (tile.a === this.chainRight || tile.b === this.chainRight) e.push('right');
    return e;
  }

  /** All tiles in player p's hand that can be played. */
  validMoves(p) {
    return this.hands[p].filter(t => this.canPlay(t));
  }

  /**
   * Place a tile on the chain.
   * @param {number} playerIdx
   * @param {number} tileId    - tile's unique id
   * @param {string} end       - 'left' | 'right'
   * @returns {boolean} true on success
   */
  play(playerIdx, tileId, end) {
    const idx = this.hands[playerIdx].findIndex(t => t.id === tileId);
    if (idx === -1) return false;
    const tile = this.hands[playerIdx][idx];
    if (!this.canPlay(tile)) return false;

    let chainTile;

    if (this.chainLeft === null) {
      // First tile — place as-is
      chainTile = { ...tile, leftVal: tile.a, rightVal: tile.b };
      this.chainLeft  = tile.a;
      this.chainRight = tile.b;
      this.chain.push(chainTile);

    } else if (end === 'left') {
      if (tile.b === this.chainLeft) {
        chainTile = { ...tile, leftVal: tile.a, rightVal: tile.b };
        this.chainLeft = tile.a;
      } else {
        chainTile = { ...tile, leftVal: tile.b, rightVal: tile.a };
        this.chainLeft = tile.b;
      }
      this.chain.unshift(chainTile);

    } else { // right
      if (tile.a === this.chainRight) {
        chainTile = { ...tile, leftVal: tile.a, rightVal: tile.b };
        this.chainRight = tile.b;
      } else {
        chainTile = { ...tile, leftVal: tile.b, rightVal: tile.a };
        this.chainRight = tile.a;
      }
      this.chain.push(chainTile);
    }

    this.hands[playerIdx].splice(idx, 1);
    this.consecutivePasses = 0;
    this._log(`${this.names[playerIdx]} main [${tile.a}|${tile.b}] ke ${end === 'left' ? 'kiri' : 'kanan'}`);

    if (this.hands[playerIdx].length === 0) {
      this.gameOver = true;
      this.winner   = playerIdx;
      this.scores[playerIdx]++;
      this._log(`🏆 ${this.names[playerIdx]} menang!`, 'win');
    } else {
      this.currentPlayer = (playerIdx + 1) % 4;
    }
    return true;
  }

  /** Current player cannot play — pass turn. */
  pass(playerIdx) {
    this.consecutivePasses++;
    this._log(`${this.names[playerIdx]} pas (tidak ada kartu)`);

    if (this.consecutivePasses >= 4) {
      // Deadlock — lowest pip total wins
      this.gameOver = true;
      this.blocked  = true;
      let min = Infinity, winnerIdx = 0;
      for (let p = 0; p < 4; p++) {
        const pip = this.hands[p].reduce((s, t) => s + t.a + t.b, 0);
        if (pip < min) { min = pip; winnerIdx = p; }
      }
      this.winner = winnerIdx;
      this.scores[winnerIdx]++;
      this._log(`🔒 Jalan buntu! ${this.names[winnerIdx]} menang (pip: ${min})`, 'win');
    } else {
      this.currentPlayer = (playerIdx + 1) % 4;
    }
  }

  /** Simple AI: prefer doubles; then highest pip tile. */
  aiMove() {
    const valid = this.validMoves(this.currentPlayer);
    if (valid.length === 0) { this.pass(this.currentPlayer); return; }

    // Sort: doubles first, then by total pips desc
    valid.sort((a, b) => {
      const ad = a.a === a.b, bd = b.a === b.b;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return (b.a + b.b) - (a.a + a.b);
    });

    const tile = valid[0];
    const ends = this.validEnds(tile);
    this.play(this.currentPlayer, tile.id, ends[0]);
  }

  _log(msg, type = 'normal') {
    this.log.unshift({ msg, type });
    if (this.log.length > 40) this.log.pop();
  }
}

// ──────────────────────────────────────────
//  3. UI STATE
// ──────────────────────────────────────────

const game     = new GapleGame();
let selectedId  = null;   // currently selected tile id (human player)
let awaitEnd    = false;  // waiting for human to choose which end
let aiRunning   = false;  // AI turn in progress (prevents double scheduling)

// ──────────────────────────────────────────
//  4. EVENT HANDLERS (exposed as globals)
// ──────────────────────────────────────────

/** Human clicks a tile in their hand. */
function onTileClick(tileId) {
  if (game.currentPlayer !== 0 || game.gameOver || aiRunning) return;

  const tile = game.hands[0].find(t => t.id === tileId);
  if (!tile || !game.canPlay(tile)) return;

  // Toggle deselect
  if (selectedId === tileId) {
    selectedId = null;
    awaitEnd   = false;
    render();
    return;
  }

  selectedId = tileId;

  // First tile of the round — no end to choose, just play
  if (game.chainLeft === null) {
    game.play(0, tileId, 'left');
    _clearSelection();
    render();
    scheduleAI();
    return;
  }

  const ends = game.validEnds(tile);
  if (ends.length === 1) {
    // Only one valid end — play immediately
    game.play(0, tileId, ends[0]);
    _clearSelection();
    render();
    scheduleAI();
  } else {
    // Both ends valid — ask player
    awaitEnd = true;
    render();
  }
}

/** Human chooses which end to play to. */
function onChooseEnd(end) {
  if (!selectedId) return;
  game.play(0, selectedId, end);
  _clearSelection();
  render();
  scheduleAI();
}

/** Human passes (no valid moves). */
function onPass() {
  if (game.currentPlayer !== 0 || game.gameOver || aiRunning) return;
  game.pass(0);
  _clearSelection();
  render();
  scheduleAI();
}

/** Start a new round. */
function onNewRound() {
  game.startRound();
  _clearSelection();
  aiRunning = false;
  render();
  scheduleAI();
}

function _clearSelection() {
  selectedId = null;
  awaitEnd   = false;
}

/** Schedule an AI turn with a realistic delay. */
function scheduleAI() {
  if (game.gameOver || game.currentPlayer === 0 || aiRunning) return;
  aiRunning = true;
  render(); // show "thinking" state
  const delay = 600 + Math.random() * 500; // 600–1100ms feels natural
  setTimeout(() => {
    game.aiMove();
    aiRunning = false;
    render();
    scheduleAI(); // chain next AI turn if needed
  }, delay);
}

// ──────────────────────────────────────────
//  5. RENDER
// ──────────────────────────────────────────

function render() {
  renderHeader();
  renderOpponents();
  renderChain();
  renderMyHand();
  renderControls();
  renderLog();
  renderModal();
}

/* ---- Header ---- */
function renderHeader() {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`score-${i}`).textContent = game.scores[i];
    document.getElementById(`chip-${i}`).classList.toggle(
      'active-chip', game.currentPlayer === i && !game.gameOver
    );
  }

  const ind = document.getElementById('turn-indicator');
  if (game.gameOver) {
    ind.textContent = '🏁 Ronde selesai';
    ind.className   = 'turn-over';
  } else if (game.currentPlayer === 0) {
    ind.textContent = '🎯 Giliran Anda!';
    ind.className   = 'turn-me';
  } else {
    ind.textContent = `⏳ ${game.names[game.currentPlayer]}...`;
    ind.className   = 'turn-ai';
  }
}

/* ---- Opponents ---- */
function renderOpponents() {
  // map: domId → playerIndex
  const opp = [['p1', 1], ['p2', 2], ['p3', 3]];
  for (const [domId, pi] of opp) {
    const wrap = document.getElementById(domId);
    const count = game.hands[pi].length;

    document.getElementById(`cnt-${pi}`).textContent  = `${count} kartu`;
    wrap.classList.toggle('active-player', game.currentPlayer === pi && !game.gameOver);

    const handEl = document.getElementById(`hand-${pi}`);
    handEl.innerHTML = '';
    const shown = Math.min(count, 7);

    for (let i = 0; i < shown; i++) {
      const div = document.createElement('div');
      div.className = 'tile-back';
      handEl.appendChild(div);
    }
  }
}


/* ---- Chain ---- */

/**
 * Render a vertical domino SVG (topVal on top half, bottomVal on bottom half).
 * Tile size: 40px wide × 78px tall.
 */
function dominoSVGVertical(topVal, bottomVal) {
  const W = 40, H = 78, HALF = 39;
  const FILL   = '#0d1224';
  const DOT    = '#dde8e0';
  const BORDER = '#1e3a2c';
  const DIV    = '#1e3a2c';

  // Pip grid for a 40×39 half — 3×3 positions with 7px margin
  // x: 7, 20, 33  (across 40px width)
  // y: 7, 19.5≈20, 32 (down 39px height, relative to half-top)
  const PX = [7, 20, 33];
  const PY = [7, 20, 32];

  // Pip patterns: [row, col] pairs in 3×3 grid
  const PATS = [
    [],                                               // 0
    [[1,1]],                                          // 1 — center
    [[0,0],[2,2]],                                    // 2 — diagonal
    [[0,0],[1,1],[2,2]],                              // 3
    [[0,0],[0,2],[2,0],[2,2]],                        // 4 — corners
    [[0,0],[0,2],[1,1],[2,0],[2,2]],                  // 5
    [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],            // 6
  ];

  function dots(val, yOffset) {
    return (PATS[val] || []).map(([r, c]) =>
      `<circle cx="${PX[c]}" cy="${yOffset + PY[r]}" r="3.2" fill="${DOT}"/>`
    ).join('');
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="domino-svg" style="display:block">
    <rect width="${W}" height="${H}" rx="7" fill="${FILL}" stroke="${BORDER}" stroke-width="2"/>
    <line x1="4" y1="${HALF}" x2="${W-4}" y2="${HALF}" stroke="${DIV}" stroke-width="1.5"/>
    ${dots(topVal, 0)}
    ${dots(bottomVal, HALF)}
  </svg>`;
}

function renderChain() {
  const chainEl = document.getElementById('chain');
  const wrapEl  = document.getElementById('chain-wrap');
  const endsEl  = document.getElementById('chain-ends');

  chainEl.innerHTML = '';
  chainEl.style.position = 'relative';
  chainEl.style.width    = '100%';

  if (game.chain.length === 0) {
    chainEl.innerHTML    = '<div class="chain-empty">Letakkan kartu pertama...</div>';
    chainEl.style.height = '80px';
    endsEl.style.display = 'none';
    return;
  }

  endsEl.style.display = 'flex';
  document.getElementById('cl').textContent = game.chainLeft;
  document.getElementById('cr').textContent = game.chainRight;

  // ── Tile dimensions ─────────────────────────────────────────────────
  const TW = 78, TH = 40, G = 4;  // horizontal tile
  const VW = 40, VH = 78;          // vertical corner tile

  const PAD  = 10;
  const rawW = wrapEl.getBoundingClientRect().width || wrapEl.clientWidth || 700;
  const AW   = rawW - 2 * PAD;

  // How many horizontal tiles fit per row
  // Layout from left: [PAD] [left-corner: VW+G] [tiles: TPR*(TW+G)-G] [G] [right-corner: VW] [PAD]
  // Total = 2*PAD + 2*(VW+G) + TPR*(TW+G)-G
  const TPR = Math.max(2, Math.floor((AW - 2 * (VW + G) + G) / (TW + G)));

  // ── X anchors ───────────────────────────────────────────────────────
  const xHStart = PAD + VW + G;            // left edge of horizontal tile band
  const rowW    = TPR * (TW + G) - G;      // pixel width of horizontal tile band
  const xLC     = PAD;                     // left corner left edge
  const xRC     = xHStart + rowW + G;      // right corner left edge

  // Row Y spacing: corner tile sits at rowY and spans VH=78px downward.
  // The NEXT row starts at rowY + VH + G (just below corner bottom).
  const ROW_STEP = VH + G;

  // ── Snake layout ─────────────────────────────────────────────────────
  const positions = [];
  let chainIdx = 0;
  let rowNum   = 0;

  while (chainIdx < game.chain.length) {
    const goRight = rowNum % 2 === 0;
    const rowY    = PAD + rowNum * ROW_STEP;

    // Horizontal tiles
    let col = 0;
    while (col < TPR && chainIdx < game.chain.length) {
      const tile  = game.chain[chainIdx];
      // L→R starts from xHStart; R→L starts from right of band
      const tileX = goRight
        ? xHStart + col * (TW + G)
        : xHStart + (TPR - 1 - col) * (TW + G);
      positions.push({ tile, x: tileX, y: rowY, vertical: false, flipH: !goRight });
      col++;
      chainIdx++;
    }

    // Corner tile — placed at the edge, SAME Y as horizontal row
    if (chainIdx < game.chain.length) {
      const corner  = game.chain[chainIdx];
      const cornerX = goRight ? xRC : xLC;
      positions.push({ tile: corner, x: cornerX, y: rowY, vertical: true });
      chainIdx++;
    }

    rowNum++;
  }

  // ── Container height ─────────────────────────────────────────────────
  const maxBottom = positions.reduce(
    (m, p) => Math.max(m, p.y + (p.vertical ? VH : TH)), 0
  );
  chainEl.style.height = (maxBottom + PAD) + 'px';

  // ── Render ───────────────────────────────────────────────────────────
  for (const pos of positions) {
    const wrap = document.createElement('div');
    wrap.className = 'chain-tile';
    wrap.style.cssText = `position:absolute; left:${pos.x}px; top:${pos.y}px;`;

    if (!pos.vertical) {
      // Horizontal tile: flip for R→L rows so the connecting value is
      // always on the side closest to the corner.
      if (pos.flipH) wrap.style.transform = 'scaleX(-1)';
      wrap.innerHTML = dominoSVG(pos.tile.leftVal, pos.tile.rightVal);

    } else {
      // Vertical corner tile, rendered with dominoSVGVertical.
      //
      // The corner tile sits at the edge (right or left).
      // Its TOP value is at y=rowY (same as the adjacent horizontal row),
      // so it visually connects to the last/first horizontal tile.
      // Its BOTTOM value is at y=rowY+VH-TH (aligns with the next row).
      //
      // Chain order: ...lastHoriz → corner → firstNextHoriz...
      //   corner.leftVal  connects to lastHoriz.rightVal  (same-row side)
      //   corner.rightVal connects to firstNextHoriz.leftVal (next-row side)
      //
      // For the vertical SVG: TOP = leftVal (connects upward/same-row),
      //                       BOTTOM = rightVal (connects to next row).
      wrap.innerHTML = dominoSVGVertical(pos.tile.leftVal, pos.tile.rightVal);
    }

    chainEl.appendChild(wrap);
  }

  // Scroll to show the latest tiles
  requestAnimationFrame(() => { wrapEl.scrollTop = wrapEl.scrollHeight; });
}



/* ---- Human Hand ---- */
function renderMyHand() {
  const handEl = document.getElementById('my-hand');
  handEl.innerHTML = '';

  const isMyTurn  = game.currentPlayer === 0 && !game.gameOver && !aiRunning;
  const validSet  = new Set(isMyTurn ? game.validMoves(0).map(t => t.id) : []);

  document.getElementById('my-count').textContent = `${game.hands[0].length} kartu`;

  for (const tile of game.hands[0]) {
    const isSelected = tile.id === selectedId;
    const isPlayable = validSet.has(tile.id);

    const div = document.createElement('div');
    div.className = 'hand-tile ' + (
      isSelected  ? 'selected'   :
      isPlayable  ? 'playable'   :
      isMyTurn    ? 'unplayable' : ''
    );

    div.innerHTML = dominoSVG(tile.a, tile.b, {
      selected: isSelected,
      playable: isPlayable && isMyTurn && !isSelected,
    });

    if (isPlayable && isMyTurn) {
      div.addEventListener('click', () => onTileClick(tile.id));
    }

    handEl.appendChild(div);
  }
}

/* ---- Controls ---- */
function renderControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  const isMyTurn = game.currentPlayer === 0 && !game.gameOver && !aiRunning;

  if (game.gameOver) {
    // nothing — modal handles it
    return;
  }

  if (awaitEnd && selectedId) {
    const tile = game.hands[0].find(t => t.id === selectedId);
    el.innerHTML = `
      <span class="ctrl-msg highlight">Taruh kartu [${tile.a}|${tile.b}] di:</span>
      <button class="btn-end" onclick="onChooseEnd('left')">← Kiri (${game.chainLeft})</button>
      <button class="btn-end" onclick="onChooseEnd('right')">Kanan (${game.chainRight}) →</button>
      <button class="btn-cancel" onclick="_cancelSel()">✕ Batal</button>
    `;
    return;
  }

  if (isMyTurn) {
    const hasValid = game.validMoves(0).length > 0;
    if (hasValid) {
      el.innerHTML = `<span class="ctrl-msg highlight">Pilih kartu yang bercahaya untuk dimainkan</span>`;
    } else {
      el.innerHTML = `
        <span class="ctrl-msg">Tidak ada kartu yang bisa dimainkan.</span>
        <button class="btn-pass" onclick="onPass()">Pas →</button>
      `;
    }
    return;
  }

  el.innerHTML = `<span class="ctrl-msg thinking">⏳ ${game.names[game.currentPlayer]} sedang berpikir...</span>`;
}

/* ---- Log ---- */
function renderLog() {
  const logEl = document.getElementById('log');
  logEl.innerHTML = game.log.map((entry, i) => {
    const cls = entry.type === 'win' ? 'win-entry' : i === 0 ? 'fresh' : '';
    return `<div class="log-entry ${cls}">${entry.msg}</div>`;
  }).join('');
}

/* ---- Modal ---- */
function renderModal() {
  const modal = document.getElementById('modal');
  if (!game.gameOver) { modal.classList.add('hidden'); return; }
  modal.classList.remove('hidden');

  const winner  = game.winner;
  const isMe    = winner === 0;
  const pips    = game.hands.map(h => h.reduce((s, t) => s + t.a + t.b, 0));

  document.getElementById('modal-icon').textContent  = isMe ? '🏆' : '😔';
  document.getElementById('modal-title').textContent = isMe ? 'Anda Menang!' : `${game.names[winner]} Menang!`;
  document.getElementById('modal-title').className   = `modal-title ${isMe ? 'win' : 'lose'}`;

  const rows = game.names.map((name, i) => `
    <tr class="${i === winner ? 'winner-row' : ''}">
      <td>
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${game.colors[i]};margin-right:6px;"></span>
        ${name}${i === winner ? ' 🏆' : ''}
      </td>
      <td style="text-align:right">${pips[i]} pip</td>
      <td style="text-align:right">${game.scores[i]} menang</td>
    </tr>
  `).join('');

  document.getElementById('modal-body').innerHTML = `
    ${game.blocked ? `<div class="blocked-notice">🔒 Permainan terhenti — semua pemain pas</div>` : ''}
    <table class="result-table">
      <thead>
        <tr>
          <th>Pemain</th>
          <th style="text-align:right">Pip tersisa</th>
          <th style="text-align:right">Total menang</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ──────────────────────────────────────────
//  6. GLOBAL HELPERS (for inline onclick)
// ──────────────────────────────────────────

window.onTileClick  = onTileClick;
window.onChooseEnd  = onChooseEnd;
window.onPass       = onPass;
window.onNewRound   = onNewRound;
window._cancelSel   = () => { _clearSelection(); render(); };

// ──────────────────────────────────────────
//  7. INIT
// ──────────────────────────────────────────

game.startRound();
render();
scheduleAI();
