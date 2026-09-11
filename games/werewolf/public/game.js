/* ===========================================================
   WEREWOLF (client). Own socket; identity comes from the office
   via ?name= & ?color= when launched from the games menu.
   =========================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const COLORS = ['#e0533f', '#3f8ee0', '#3fbf6f', '#d8a13a', '#a55fd0', '#3fc4c4', '#e06fa8', '#7a8ff0'];

  let name = (params.get('name') || '').slice(0, 16);
  let color = params.get('color') || COLORS[(Math.random() * COLORS.length) | 0];

  const socket = io();
  let myId = null;
  let joined = false;
  let state = null;
  let wolfChat = [];
  let seerNote = null;
  let tick = null;

  const PHASE_LABEL = { LOBBY: 'Lobi', NIGHT: '🌙 Malam', DAY: '☀️ Siang', VOTE: '🗳️ Voting', RESULT: 'Hasil', OVER: 'Selesai' };
  const RE = { wolf: '🐺', seer: '🔮', doctor: '💉', villager: '🧑‍🌾' };
  const RN = { wolf: 'Werewolf', seer: 'Peramal', doctor: 'Dokter', villager: 'Warga' };

  // ---------- pre-join ----------
  $('nameInput').value = name;
  $('joinBtn').onclick = doJoin;
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  if (name) setTimeout(doJoin, 250); // auto-join when the office passed a name

  function doJoin() {
    if (joined) return;
    name = ($('nameInput').value || 'Pemain').slice(0, 16);
    joined = true;
    $('prejoinMsg').textContent = 'Menghubungkan…';
    socket.emit('ww:join', { name, color });
    clearInterval(tick);
    tick = setInterval(paintTimer, 250);
  }

  function backToOffice() {
    socket.emit('ww:leave');
    // if we're inside the office overlay, ask it to close; otherwise just reset
    try { window.parent.postMessage('atrium:exit-game', '*'); } catch (e) {}
    joined = false;
    state = null;
    show('prejoin');
    $('prejoinMsg').textContent = '';
  }
  $('lobbyBack').onclick = backToOffice;
  $('gameBack').onclick = backToOffice;
  $('startBtn').onclick = () => socket.emit('ww:start');

  // ---------- socket ----------
  socket.on('connect', () => { myId = socket.id; });
  socket.on('ww:full', () => { $('prejoinMsg').textContent = 'Room penuh (maks 12). Coba lagi nanti.'; joined = false; });
  socket.on('ww:wolfchat', (m) => { wolfChat.push(m); if (wolfChat.length > 40) wolfChat.shift(); render(); });
  socket.on('ww:private', (m) => {
    if (m && m.kind === 'seer') seerNote = { day: state ? state.day : 0, text: m.text };
    toast(m && m.text);
    render();
  });
  socket.on('ww:state', (s) => {
    const prevDay = state && state.day;
    state = s;
    if (s.day !== prevDay) { wolfChat = []; }
    render();
  });

  // ---------- screens ----------
  function show(which) {
    for (const id of ['prejoin', 'lobby', 'game']) $(id).classList.toggle('hidden', id !== which);
  }

  function render() {
    if (!state) return;
    if (state.phase === 'LOBBY') { renderLobby(); show('lobby'); $('over').classList.add('hidden'); return; }
    show('game');
    renderGame();
  }

  function renderLobby() {
    const ppl = state.players.filter((p) => !p.spectator);
    $('lobbyCount').textContent = '(' + ppl.length + '/' + state.maxPlayers + ')';
    $('lobbyList').innerHTML = ppl.map((p) =>
      '<li><span class="dot" style="background:' + p.color + '"></span>' +
      '<span>' + esc(p.name) + (p.isYou ? ' (kamu)' : '') + '</span>' +
      (p.isHost ? '<span class="host">★ host</span>' : '') + '</li>').join('');
    const canStart = state.host === myId && ppl.length >= state.minPlayers && ppl.length <= state.maxPlayers;
    $('startBtn').classList.toggle('hidden', state.host !== myId);
    $('startBtn').disabled = !canStart;
    $('lobbyMsg').textContent = ppl.length < state.minPlayers
      ? 'Menunggu pemain… butuh minimal ' + state.minPlayers + '.'
      : (state.host === myId ? 'Siap dimulai!' : 'Menunggu host memulai…');
  }

  function paintTimer() {
    if (!state || !state.endsAt) { $('timer').textContent = ''; return; }
    const s = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    $('timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function targetMode() {
    if (!state.you) return null;
    if (state.phase === 'VOTE' && state.you.alive) return 'vote';
    if (state.phase === 'NIGHT' && state.you.canAct) {
      return state.you.role === 'wolf' ? 'kill' : state.you.role === 'seer' ? 'see' : 'heal';
    }
    return null;
  }

  function pick(pid) {
    const mode = targetMode();
    if (!mode) return;
    const row = state.players.find((p) => p.id === pid);
    if (!row || !row.alive) return;
    if (mode === 'vote') socket.emit('ww:vote', { target: pid });
    else socket.emit('ww:night', { action: mode, target: pid });
  }

  function renderGame() {
    // header
    const badge = $('phaseBadge');
    badge.textContent = PHASE_LABEL[state.phase] + (['NIGHT', 'DAY'].includes(state.phase) ? ' ' + state.day : '');
    badge.className = 'badge ' + state.phase.toLowerCase();
    paintTimer();

    // role card
    const rc = $('roleCard');
    if (state.you && state.you.role) {
      const r = state.you.roleInfo;
      rc.hidden = false;
      rc.className = 'rolecard team-' + r.team + (state.you.alive ? '' : ' dead');
      rc.innerHTML = '<div class="rc-emoji">' + r.emoji + '</div><div>' +
        '<div class="rc-name">' + r.name + (state.you.alive ? '' : ' · 💀 kamu sudah mati') + '</div>' +
        '<div class="rc-blurb">' + r.blurb + '</div></div>';
    } else rc.hidden = true;

    // player grid
    const mode = targetMode();
    const ul = $('players');
    ul.className = 'grid' + (mode ? ' targeting' : '');
    ul.innerHTML = '';
    for (const p of state.players) {
      const li = document.createElement('li');
      li.className = (p.alive ? 'alive' : 'dead') + (p.isYou ? ' me' : '');
      const canTarget = mode && p.alive && !(mode === 'kill' && p.role === 'wolf');
      if (canTarget) { li.classList.add('pick'); li.onclick = () => pick(p.id); }
      const mark = state.phase === 'VOTE' && p.myVote ? '<span class="mine">▶ vote</span>'
        : (state.you && state.you.acted === p.id ? '<span class="mine">✓ pilih</span>' : '');
      li.innerHTML =
        (p.isHost ? '<span class="crown">★</span>' : '') +
        (p.alive ? '' : '<span class="skull">💀</span>') +
        '<span class="avatar" style="background:' + (p.color || '#8a90a0') + '"></span>' +
        '<span class="pname">' + esc(p.name) + (p.isYou ? ' (kamu)' : '') + '</span>' +
        (p.role ? '<span class="rtag">' + RE[p.role] + ' ' + RN[p.role] + '</span>' : '<span class="rtag">&nbsp;</span>') +
        (state.phase === 'VOTE' && p.voteCount ? '<span class="vcount">' + p.voteCount + '</span>' : '') +
        mark;
      ul.appendChild(li);
    }

    // action zone
    $('action').innerHTML = actionHTML();
    wireAction();

    // log
    const log = $('log');
    log.innerHTML = state.log.map((e) => '<div class="le ' + e.kind + '">' + esc(e.text) + '</div>').join('');
    log.scrollTop = log.scrollHeight;

    // winner overlay
    const over = $('over');
    if (state.phase === 'OVER' && state.reveal) {
      const win = state.winner === 'wolf';
      over.classList.remove('hidden');
      over.innerHTML = '<div class="wo-card ' + (win ? 'wolf' : 'village') + '">' +
        '<div class="wo-title">' + (win ? '🐺 WEREWOLF MENANG' : '🏡 WARGA MENANG') + '</div>' +
        '<ul class="wo-list">' + state.reveal.filter((r) => r.role).map((r) =>
          '<li><span>' + (RE[r.role] || '·') + ' ' + esc(r.name) + '</span>' +
          '<span class="' + (r.role === 'wolf' ? 'w' : 'v') + '">' + (RN[r.role] || '?') + (r.alive ? '' : ' †') + '</span></li>').join('') +
        '</ul><div class="wo-btns">' +
        (state.host === myId ? '<button id="againBtn" class="btn primary">Main lagi</button>' : '') +
        '<button id="overBack" class="btn ghost">Kembali ke Virtual Office</button></div></div>';
      $('overBack').onclick = backToOffice;
      if ($('againBtn')) $('againBtn').onclick = () => socket.emit('ww:again');
    } else {
      over.classList.add('hidden');
    }
  }

  function actionHTML() {
    const s = state, y = s.you;
    if (!y) return '';
    if (!y.alive) return '<div class="hint dim">💀 Kamu sudah mati. Menonton saja — tidak bisa voting atau memakai kemampuan.</div>';

    if (s.phase === 'NIGHT') {
      if (y.role === 'wolf') return '<div class="hint">🐺 Klik seorang pemain di papan untuk dijadikan mangsa.</div>' +
        (y.acted ? '<div class="hint dim">Pilihanmu: <b>' + esc(nameOf(y.acted)) + '</b></div>' : '') + wolfChatHTML();
      if (y.role === 'seer') return '<div class="hint">🔮 Klik seorang pemain untuk diterawang.</div>' +
        (seerNote && seerNote.day === s.day ? '<div class="hint reveal">' + esc(seerNote.text) + '</div>'
          : y.acted ? '<div class="hint dim">Menerawang <b>' + esc(nameOf(y.acted)) + '</b>…</div>' : '');
      if (y.role === 'doctor') return '<div class="hint">💉 Klik pemain yang ingin kamu lindungi (boleh dirimu).</div>' +
        (y.acted ? '<div class="hint dim">Melindungi <b>' + esc(nameOf(y.acted)) + '</b>.</div>' : '');
      return '<div class="hint dim">💤 Kamu Warga. Malam akan berlalu — tunggu pagi.</div>';
    }
    if (s.phase === 'DAY') return '<div class="hint">☀️ Diskusikan lewat <b>voice chat kantor</b>. Cari siapa werewolf-nya.</div>' +
      (s.host === myId ? '<button id="voteBtn" class="btn primary">Mulai voting sekarang</button>'
        : '<div class="hint dim">Voting mulai otomatis saat waktu habis.</div>');
    if (s.phase === 'VOTE') return '<div class="hint">🗳️ Klik pemain untuk dieliminasi.</div>' +
      '<button id="skipBtn" class="btn' + (s.mySkipVote ? ' primary' : '') + '">Lewati (tanpa eliminasi)</button>';
    if (s.phase === 'RESULT') { const l = s.log[s.log.length - 1]; return '<div class="hint">' + esc(l ? l.text : 'Menghitung…') + '</div>'; }
    return '';
  }

  function wolfChatHTML() {
    return '<div class="wc"><div class="wc-log" id="wcLog">' +
      wolfChat.map((m) => '<div><b>' + esc(m.from) + ':</b> ' + esc(m.text) + '</div>').join('') +
      '</div><input id="wcIn" maxlength="200" placeholder="pesan rahasia werewolf…" autocomplete="off"></div>';
  }

  function wireAction() {
    if ($('voteBtn')) $('voteBtn').onclick = () => socket.emit('ww:startvote');
    if ($('skipBtn')) $('skipBtn').onclick = () => socket.emit('ww:vote', { target: 'skip' });
    const wc = $('wcIn');
    if (wc) {
      wc.onkeydown = (e) => {
        if (e.key === 'Enter' && wc.value.trim()) { socket.emit('ww:wolfchat', { text: wc.value.trim() }); wc.value = ''; }
      };
      const l = $('wcLog'); if (l) l.scrollTop = l.scrollHeight;
    }
  }

  function nameOf(id) { const p = state.players.find((x) => x.id === id); return p ? p.name : '?'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  let toastT = null;
  function toast(text) {
    if (!text) return;
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, 4200);
  }
})();
