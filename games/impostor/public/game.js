'use strict';
/* ===========================================================
   PENYUSUP — client. Server is the referee; this draws the ship,
   predicts your own movement, and turns clicks into intents.
   =========================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  const socket = io();
  let MAP = null;
  let state = null;
  let joined = false;
  let me = { x: 0, y: 0 };          // locally predicted position — drawing only
  let srv = null;                    // the server's position for us — decides every action
  let facing = 1;
  let bump = 0;                      // walk animation phase
  let roleShownFor = null;
  let killFlashUntil = 0;            // wall-clock, so a backgrounded tab can't freeze it on

  // ---------------------------------------------------------- pre-join
  let myName = (params.get('name') || '').slice(0, 14);
  $('nameInput').value = myName;
  $('joinBtn').onclick = doJoin;
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  if (myName) setTimeout(doJoin, 200);

  function doJoin() {
    if (joined) return;
    myName = ($('nameInput').value || 'Pemain').slice(0, 14) || 'Pemain';
    joined = true;
    $('prejoinMsg').textContent = 'Menghubungkan…';
    socket.emit('us:join', { name: myName });
  }

  function backToOffice() {
    socket.emit('us:leave');
    try { window.parent.postMessage('atrium:exit-game', '*'); } catch (e) {}
    joined = false; state = null;
    show('prejoin');
    $('prejoinMsg').textContent = '';
  }
  $('backBtn1').onclick = backToOffice;
  $('leaveBtn').onclick = backToOffice;
  $('startBtn').onclick = () => socket.emit('us:start');
  $('practiceBox').onchange = (e) => socket.emit('us:practice', e.target.checked);

  socket.on('us:map', (m) => { MAP = m; });
  socket.on('us:busy', () => { joined = false; $('prejoinMsg').textContent = 'Permainan sedang berjalan — coba lagi sebentar lagi.'; });
  socket.on('us:full', () => { joined = false; $('prejoinMsg').textContent = 'Kapal penuh (maks 10 pemain).'; });
  socket.on('us:killed', () => { killFlashUntil = Date.now() + 800; });
  socket.on('us:state', (s) => {
    const prev = state;
    state = s;
    const my = s.players.find((p) => p.you);
    if (my) {
      srv = { x: my.x, y: my.y };
      // Snap on teleports (round start, meeting, being killed); otherwise trust local.
      // Kept tight: prediction that drifts far would put the action buttons at odds
      // with the server, which is the only thing that decides whether a kill lands.
      if (!prev || Math.hypot(my.x - me.x, my.y - me.y) > 45) { me.x = my.x; me.y = my.y; }
    }
    if (s.phase === 'PLAYING' && s.you && roleShownFor !== s.you.impostor) {
      roleShownFor = s.you.impostor;
      showRole(s.you.impostor);
    }
    if (s.phase === 'LOBBY') roleShownFor = null;
    render();
  });

  // ---------------------------------------------------------- screens
  function show(which) {
    $('prejoin').classList.toggle('hidden', which !== 'prejoin');
    $('lobby').classList.toggle('hidden', which !== 'lobby');
    $('game').classList.toggle('hidden', which !== 'game');
    if (which !== 'game') {
      $('meeting').classList.add('hidden');
      $('taskModal').classList.add('hidden');
      $('endScreen').classList.add('hidden');
    }
  }

  function showRole(imp) {
    const b = $('roleBanner');
    b.className = 'role-banner ' + (imp ? 'imp' : 'crew');
    b.innerHTML = (imp ? 'PENYUSUP' : 'KRU') +
      '<small>' + (imp ? 'Bunuh kru dan jangan ketahuan.' : 'Selesaikan tugas, cari penyusupnya.') + '</small>';
    b.classList.remove('hidden');
    setTimeout(() => b.classList.add('hidden'), 3500);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  const bean = (c) => '<span class="bean" style="background:' + c + '"></span>';

  function render() {
    if (!state) return;
    if (state.phase === 'LOBBY') { show('lobby'); renderLobby(); return; }
    show('game');
    renderHud();
    renderMeeting();
    renderEnd();
  }

  function renderLobby() {
    const ps = state.players;
    $('lobbyCount').textContent = '(' + ps.length + '/' + state.max + ')';
    $('crewList').innerHTML = ps.map((p) =>
      '<li class="' + (p.you ? 'me' : '') + '">' + bean(p.color) +
      '<span class="nm">' + esc(p.name) + (p.you ? ' (kamu)' : '') + '</span>' +
      '<span class="tag">' + (p.bot ? 'bot' : 'siap') + '</span></li>').join('');
    // Anyone can start, and empty seats become bots, so there is never a wait on
    // one particular person being present.
    $('startBtn').classList.remove('hidden');
    // Alone with bots there is nobody to deceive, so offer the impostor side directly
    // rather than making someone reroll a 1-in-6 chance to try it.
    const solo = state.humans === 1;
    $('practiceRow').classList.toggle('hidden', !solo);
    $('practiceBox').checked = !!state.practice;
    $('lobbyMsg').textContent = ps.length < state.min
      ? 'Bisa langsung mulai — sisanya diisi bot sampai 6 pemain.'
      : 'Siap dimulai — siapa saja boleh menekan mulai.';
  }

  // ---------------------------------------------------------- HUD
  function renderHud() {
    const you = state.you;
    const pr = state.progress;
    const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
    $('taskFill').style.width = pct + '%';
    $('taskPct').textContent = pct + '%';

    if (you) {
      $('taskPanel').innerHTML = '<h4>' + (you.impostor ? 'TUGAS PALSU' : 'TUGAS KAMU') + '</h4>' +
        you.tasks.map((t) => '<div class="' + (t.done ? 'done' : '') + (you.impostor ? ' fake' : '') + '">' +
          (t.done ? '✔ ' : '• ') + esc(t.name) + ' <span class="dim">(' + esc(t.room) + ')</span></div>').join('');
    }
    $('logPanel').innerHTML = (state.log || []).slice(0, 5).map((l) => '<div>' + esc(l) + '</div>').join('');
    updateActions();
  }

  // Every proximity test below uses the server's position, never the predicted one:
  // the server is what actually validates the action, so the buttons must agree with it.
  const at = () => srv || me;

  function nearestTask() {
    if (!state.you || !MAP) return null;
    const p = at();
    for (const t of state.you.tasks) {
      if (t.done) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) < 74) return t;
    }
    return null;
  }
  function nearBody() {
    const p = at();
    return (state.bodies || []).find((b) => Math.hypot(b.x - p.x, b.y - p.y) < 90);
  }
  function nearEmergency() { const p = at(); return MAP && Math.hypot(MAP.emergency.x - p.x, MAP.emergency.y - p.y) < 74; }
  function nearLightsFix() { const p = at(); return MAP && Math.hypot(MAP.lightsFix.x - p.x, MAP.lightsFix.y - p.y) < 74; }
  function nearVent() {
    if (!MAP || !MAP.vents || !state.you || !state.you.impostor) return null;
    const p = at();
    return MAP.vents.find((v) => Math.hypot(v.x - p.x, v.y - p.y) < 92) || null;
  }
  function killTarget() {
    if (!state.you || !state.you.impostor || !state.you.alive) return null;
    const p = at();
    return state.players
      .filter((q) => !q.you && q.alive && q.impostor !== true && Math.hypot(q.x - p.x, q.y - p.y) < 92)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || null;
  }

  function updateActions() {
    const you = state.you;
    const playing = state.phase === 'PLAYING';
    const alive = you && you.alive;

    const task = nearestTask();
    const fixing = !state.lights && nearLightsFix() && alive;
    const emerg = playing && alive && nearEmergency() && you.meetings > 0;
    const useBtn = $('useBtn');
    useBtn.disabled = !playing || !(task || fixing || emerg);
    useBtn.textContent = fixing ? 'LAMPU' : emerg ? 'DARURAT' : 'PAKAI';

    $('reportBtn').disabled = !playing || !alive || !nearBody();

    // The impostor's three buttons are shown or hidden here and nowhere else: doing it
    // in two places is how the vent button used to survive into a round as crewmate,
    // sitting there permanently greyed out.
    const imp = !!(you && you.impostor);
    for (const id of ['killBtn', 'sabotageBtn', 'ventBtn']) $(id).classList.toggle('hidden', !imp);
    $('killWhy').classList.toggle('hidden', !imp);
    if (imp) {
      const kb = $('killBtn');
      const target = killTarget();
      // Mirror every condition the server checks, the vent rule included, or the
      // button can look ready while the kill is silently refused.
      kb.disabled = !playing || !alive || !!you.vent || you.killIn > 0 || !target;
      kb.textContent = you.killIn > 0 ? you.killIn + 's' : 'BUNUH';
      kb.style.borderColor = target ? target.color : '';
      $('killWhy').textContent = !alive ? '' : you.vent ? 'keluar vent dulu'
        : you.killIn > 0 ? 'tunggu ' + you.killIn + 's'
        : target ? esc(target.name) : 'terlalu jauh';

      const sb = $('sabotageBtn');
      sb.disabled = !playing || !alive || !state.lights || you.sabotageIn > 0;
      sb.textContent = you.sabotageIn > 0 ? you.sabotageIn + 's' : 'SABOTASE';

      const vb = $('ventBtn');
      vb.disabled = !playing || !alive || !(you.vent || nearVent());
      vb.textContent = you.vent ? 'KELUAR' : 'VENT';
    }
    renderVentPanel();
  }

  // While inside a vent you can hop to any other vent on the same network.
  function renderVentPanel() {
    const panel = $('ventPanel');
    const you = state.you;
    if (!you || !you.vent || !MAP.vents) { panel.classList.add('hidden'); return; }
    const here = MAP.vents.find((v) => v.id === you.vent);
    if (!here) { panel.classList.add('hidden'); return; }
    const others = MAP.vents.filter((v) => v.net === here.net && v.id !== here.id);
    panel.classList.remove('hidden');
    panel.innerHTML = '<span>Dari ' + esc(here.room) + ' ke:</span>' +
      others.map((v) => '<button data-vent="' + v.id + '">' + esc(v.room) + '</button>').join('');
    panel.querySelectorAll('[data-vent]').forEach((b) => {
      b.onclick = () => socket.emit('us:vent-move', { to: b.dataset.vent });
    });
  }

  $('useBtn').onclick = () => {
    if (!state || state.phase !== 'PLAYING') return;
    if (!state.lights && nearLightsFix()) return socket.emit('us:fix-lights');
    if (nearEmergency() && state.you.meetings > 0) return socket.emit('us:emergency');
    const t = nearestTask();
    if (t) openTask(t);
  };
  $('reportBtn').onclick = () => socket.emit('us:report');
  $('killBtn').onclick = () => socket.emit('us:kill');
  $('sabotageBtn').onclick = () => socket.emit('us:sabotage');
  $('ventBtn').onclick = () => {
    if (!state || !state.you) return;
    socket.emit(state.you.vent ? 'us:vent-exit' : 'us:vent-enter');
  };

  // ---------------------------------------------------------- task minigames
  let taskOpen = null;
  $('taskClose').onclick = closeTask;
  function closeTask() { taskOpen = null; $('taskModal').classList.add('hidden'); $('taskBody').innerHTML = ''; }
  function finishTask() {
    if (!taskOpen) return;
    socket.emit('us:task-done', { id: taskOpen.id });
    closeTask();
  }

  function openTask(t) {
    taskOpen = t;
    $('taskTitle').textContent = t.name + ' — ' + t.room;
    $('taskModal').classList.remove('hidden');
    const body = $('taskBody');
    if (t.kind === 'hold') body.innerHTML = holdHTML(), wireHold();
    else if (t.kind === 'wires') body.innerHTML = wiresHTML(), wireWires();
    else body.innerHTML = seqHTML(), wireSeq();
  }

  function holdHTML() {
    return '<button class="hold-btn" id="holdBtn">TAHAN</button><div class="hold-track"><i id="holdFill"></i></div>';
  }
  function wireHold() {
    const btn = $('holdBtn'), fill = $('holdFill');
    let t0 = 0, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); t0 = 0; fill.style.width = '0%'; };
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 2500);
      fill.style.width = (p * 100) + '%';
      if (p >= 1) return finishTask();
      raf = requestAnimationFrame(step);
    };
    const start = (e) => { e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(step); };
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchend', stop);
  }

  const WIRE_COLORS = ['#f0463c', '#3b7cf0', '#f2df52', '#37b36a'];
  function wiresHTML() {
    const right = WIRE_COLORS.slice().sort(() => Math.random() - 0.5);
    return '<div class="wires"><div class="col">' +
      WIRE_COLORS.map((c, i) => '<button data-l="' + i + '" style="background:' + c + '"></button>').join('') +
      '</div><div class="col">' +
      right.map((c) => '<button data-r="' + WIRE_COLORS.indexOf(c) + '" style="background:' + c + '"></button>').join('') +
      '</div></div>';
  }
  function wireWires() {
    let sel = null, done = 0;
    const body = $('taskBody');
    body.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => {
      if (b.classList.contains('ok')) return;
      body.querySelectorAll('[data-l]').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel'); sel = b;
    });
    body.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => {
      if (!sel || b.classList.contains('ok')) return;
      if (b.dataset.r === sel.dataset.l) {
        b.classList.add('ok'); sel.classList.add('ok'); sel.classList.remove('sel'); sel = null;
        if (++done === WIRE_COLORS.length) setTimeout(finishTask, 250);
      }
    });
  }

  function seqHTML() {
    const order = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
    return '<div class="seq">' + order.map((n) => '<button data-n="' + n + '">' + n + '</button>').join('') + '</div>';
  }
  function wireSeq() {
    let next = 1;
    const body = $('taskBody');
    body.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => {
      if (+b.dataset.n === next) {
        b.classList.add('ok'); next++;
        if (next > 8) setTimeout(finishTask, 250);
      } else {
        next = 1;
        body.querySelectorAll('[data-n]').forEach((x) => x.classList.remove('ok'));
      }
    });
  }

  // ---------------------------------------------------------- meeting
  function renderMeeting() {
    const m = state.meeting;
    const box = $('meeting');
    if (state.phase !== 'MEETING' || !m) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');

    $('meetHead').innerHTML = m.reason === 'report'
      ? '🚨 MAYAT DILAPORKAN<br><span class="dim small">oleh ' + esc(m.by) + '</span>'
      : '🔔 RAPAT DARURAT<br><span class="dim small">oleh ' + esc(m.by) + '</span>';

    const left = Math.max(0, Math.ceil((m.endsAt - Date.now()) / 1000));
    $('meetTimer').textContent = m.result ? '' : left + ' detik';

    const counts = {};
    for (const v of m.votes) counts[v.target] = (counts[v.target] || 0) + 1;
    const alive = state.you && state.you.alive;

    $('voteList').innerHTML = state.players.map((p) =>
      '<li data-id="' + p.id + '" class="' + (!p.alive ? 'dead' : '') + (m.myVote === p.id ? ' mine' : '') + '">' +
      bean(p.color) + '<span class="nm">' + esc(p.name) + (p.you ? ' (kamu)' : '') + (p.alive ? '' : ' 💀') + '</span>' +
      (counts[p.id] ? '<span class="cnt">' + counts[p.id] + '</span>' : '') + '</li>').join('');

    if (alive && !m.result) {
      $('voteList').querySelectorAll('li:not(.dead)').forEach((li) => {
        li.onclick = () => socket.emit('us:vote', { target: li.dataset.id });
      });
    }
    $('skipBtn').classList.toggle('hidden', !alive || !!m.result);
    $('skipBtn').textContent = 'Lewati voting' + (counts.skip ? ' (' + counts.skip + ')' : '');
    $('skipBtn').onclick = () => socket.emit('us:vote', { target: 'skip' });

    const res = $('meetResult');
    if (m.result) {
      res.classList.remove('hidden');
      res.innerHTML = m.result.skipped
        ? '<div class="who">Tidak ada yang dilempar</div><div class="dim small">' + m.result.left + ' penyusup masih berkeliaran</div>'
        : '<div class="who">' + esc(m.result.name) + ' dilempar ke luar angkasa</div>' +
          '<div class="' + (m.result.impostor ? 'imp' : 'not') + '">' +
          (m.result.impostor ? 'Dia PENYUSUP.' : 'Dia bukan penyusup.') + '</div>' +
          '<div class="dim small">' + m.result.left + ' penyusup masih berkeliaran</div>';
    } else res.classList.add('hidden');
  }

  // ---------------------------------------------------------- end
  function renderEnd() {
    const el = $('endScreen');
    if (state.phase !== 'ENDED' || !state.reveal) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const imp = state.winner === 'impostor';
    el.innerHTML = '<div class="end-card ' + (imp ? 'imp' : 'crew') + '">' +
      '<div class="end-title">' + (imp ? '🔪 PENYUSUP MENANG' : '🚀 KRU MENANG') + '</div>' +
      '<div class="end-why">' + esc((state.log && state.log[0]) || '') + '</div>' +
      '<ul class="end-list">' + state.reveal.map((r) =>
        '<li>' + bean(r.color) + '<span class="nm">' + esc(r.name) + (r.alive ? '' : ' 💀') + '</span>' +
        '<span class="role ' + (r.impostor ? 'imp' : 'crew') + '">' + (r.impostor ? 'PENYUSUP' : 'KRU') + '</span></li>').join('') +
      '</ul>' +
      '<button id="againBtn" class="btn primary">Main lagi</button>' +
      '<button id="endBack" class="btn ghost">Kembali ke Virtual Office</button></div>';
    $('endBack').onclick = backToOffice;
    $('againBtn').onclick = () => socket.emit('us:again');
  }

  // ---------------------------------------------------------- input
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (!state || state.phase !== 'PLAYING') return;
    if (k === 'e' && !$('useBtn').disabled) $('useBtn').click();
    if (k === 'r' && !$('reportBtn').disabled) $('reportBtn').click();
    if (k === 'q' && !$('killBtn').classList.contains('hidden') && !$('killBtn').disabled) $('killBtn').click();
    if (k === 'f' && !$('ventBtn').classList.contains('hidden') && !$('ventBtn').disabled) $('ventBtn').click();
    if (k === 'escape' && taskOpen) closeTask();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function axis() {
    let x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    const m = Math.hypot(x, y);
    if (m) { x /= m; y /= m; }
    return { x, y, moving: m > 0 };
  }

  const walkable = (x, y) => !MAP || [...MAP.rooms, ...MAP.halls]
    .some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

  // ---------------------------------------------------------- canvas
  const cv = $('stage'), g = cv.getContext('2d');
  let DPR = Math.min(window.devicePixelRatio || 1, 2), VW = 0, VH = 0;
  function resize() {
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = VW * DPR; cv.height = VH * DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const SCALE = 1.9;
  const cam = { x: 0, y: 0 };

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // Each room draws its own furniture from its style, so 15 rooms don't need 15
  // hand-placed prop lists.
  function drawRoomDecor(r, now) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const A = r.accent;
    const box = (x, y, w, h, fill, stroke) => {
      g.fillStyle = fill; roundRect(g, x, y, w, h, 5); g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; roundRect(g, x, y, w, h, 5); g.stroke(); }
    };
    const consoles = (n) => {
      for (let i = 0; i < n; i++) {
        const x = r.x + 24 + i * ((r.w - 48) / n);
        box(x, r.y + 34, (r.w - 48) / n - 12, 26, '#131b30', hexA(A, .45));
        g.fillStyle = hexA(A, .5);
        g.fillRect(x + 6, r.y + 42, ((r.w - 48) / n - 24) * (0.4 + 0.5 * Math.abs(Math.sin(now / 700 + i))), 4);
      }
    };
    switch (r.style) {
      case 'reactor': {
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 520));
        g.fillStyle = hexA(A, 0.12 * pulse);
        g.beginPath(); g.arc(cx, cy + 12, 68, 0, 7); g.fill();
        box(cx - 34, cy - 26, 68, 78, '#141c2e', hexA(A, .6));
        g.fillStyle = hexA(A, 0.55 + 0.4 * pulse);
        roundRect(g, cx - 20, cy - 12, 40, 50, 8); g.fill();
        for (const sx of [-1, 1]) box(cx + sx * 62 - 10, cy - 4, 20, 56, '#131b30', hexA(A, .3));
        break;
      }
      case 'engine': {
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 400));
        box(r.x + 26, cy - 34, r.w - 52, 68, '#141c2e', hexA(A, .45));
        g.fillStyle = hexA(A, 0.3 + 0.4 * pulse);
        roundRect(g, r.x + 36, cy - 18, r.w - 72, 36, 16); g.fill();
        g.strokeStyle = hexA(A, .35); g.lineWidth = 3;
        for (let i = 1; i <= 3; i++) { g.beginPath(); g.moveTo(r.x + 26 + i * 22, r.y + r.h - 26); g.lineTo(r.x + 26 + i * 22, r.y + r.h - 8); g.stroke(); }
        break;
      }
      case 'med': {
        for (let i = 0; i < 2; i++) box(r.x + 30 + i * 84, cy - 6, 64, 34, '#141c2e', hexA(A, .45));
        box(r.x + r.w - 66, r.y + 40, 44, 40, '#131b30', hexA(A, .4));
        g.strokeStyle = hexA(A, .7); g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < 40; i++) g.lineTo(r.x + r.w - 62 + i, r.y + 62 + Math.sin(i / 3 + now / 300) * 8 * (i % 9 === 0 ? 1.8 : 1));
        g.stroke();
        break;
      }
      case 'security': {
        for (let i = 0; i < 4; i++) {
          const x = r.x + 26 + (i % 2) * 82, y = r.y + 52 + Math.floor(i / 2) * 58;
          box(x, y, 70, 46, '#0f1626', hexA(A, .45));
          g.fillStyle = hexA(A, .18 + 0.12 * Math.abs(Math.sin(now / 600 + i)));
          g.fillRect(x + 5, y + 5, 60, 36);
        }
        break;
      }
      case 'power': {
        for (let i = 0; i < 5; i++) {
          const x = r.x + 24 + i * ((r.w - 48) / 5);
          box(x, r.y + 44, (r.w - 48) / 5 - 10, 54, '#141c2e', hexA(A, .4));
          g.fillStyle = state.lights ? hexA(A, .7) : 'rgba(120,130,160,.35)';
          g.beginPath(); g.arc(x + ((r.w - 48) / 5 - 10) / 2, r.y + 60, 5, 0, 7); g.fill();
        }
        break;
      }
      case 'storage': {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          if ((i + j) % 3 === 2) continue;
          box(r.x + 28 + i * 82, r.y + 58 + j * 78, 64, 62, '#182136', hexA(A, .4));
          g.strokeStyle = hexA(A, .25); g.lineWidth = 2;
          g.beginPath(); g.moveTo(r.x + 28 + i * 82, r.y + 89 + j * 78); g.lineTo(r.x + 92 + i * 82, r.y + 89 + j * 78); g.stroke();
        }
        break;
      }
      case 'social': {
        g.fillStyle = '#141c2e';
        g.beginPath(); g.ellipse(cx, cy + 20, 92, 58, 0, 0, 7); g.fill();
        g.strokeStyle = hexA(A, .45); g.lineWidth = 3; g.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          box(cx + Math.cos(a) * 118 - 14, cy + 20 + Math.sin(a) * 84 - 14, 28, 28, '#182136', hexA(A, .3));
        }
        consoles(3);
        break;
      }
      case 'command': { consoles(3); box(cx - 44, cy + 14, 88, 44, '#141c2e', hexA(A, .45)); break; }
      case 'comms': {
        box(cx - 50, cy - 16, 100, 58, '#141c2e', hexA(A, .45));
        g.strokeStyle = hexA(A, .5); g.lineWidth = 2.5;
        for (let i = 1; i <= 3; i++) {
          g.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(now / 500 - i));
          g.beginPath(); g.arc(cx, cy - 16, 14 * i, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        }
        g.globalAlpha = 1;
        break;
      }
      case 'shield': {
        g.strokeStyle = hexA(A, .4); g.lineWidth = 4;
        for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(cx, cy + 40, 26 * i, Math.PI, Math.PI * 2); g.stroke(); }
        box(cx - 30, cy + 30, 60, 34, '#141c2e', hexA(A, .5));
        break;
      }
      case 'o2': {
        for (let i = 0; i < 3; i++) {
          box(r.x + 26 + i * 56, cy - 30, 38, 74, '#141c2e', hexA(A, .45));
          g.fillStyle = hexA(A, .35);
          roundRect(g, r.x + 32 + i * 56, cy - 6 + Math.sin(now / 600 + i) * 4, 26, 44, 10); g.fill();
        }
        break;
      }
      case 'lab': {
        for (let i = 0; i < 4; i++) {
          const x = r.x + 26 + i * 48;
          box(x, cy - 4, 32, 44, '#141c2e', hexA(A, .4));
          g.fillStyle = hexA(A, .45 + 0.25 * Math.abs(Math.sin(now / 450 + i)));
          roundRect(g, x + 6, cy + 12, 20, 24, 6); g.fill();
        }
        break;
      }
      case 'weapons': {
        box(cx - 40, cy - 8, 80, 52, '#141c2e', hexA(A, .5));
        g.strokeStyle = hexA(A, .55); g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy + 18, 30, Math.PI, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx, cy - 34); g.stroke();
        break;
      }
      default: consoles(2);
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = (v) => Math.max(0, Math.min(255, v));
    const r = cl((n >> 16) + amt), gg = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  function drawBean(x, y, color, opt) {
    const o = opt || {};
    const w = 26, h = 34;
    g.save();
    g.translate(x, y + (o.bob || 0));
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.flip) g.scale(-1, 1);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(0, h / 2 + 3, 12, 4.5, 0, 0, 7); g.fill();
    g.fillStyle = shade(color, -34);
    roundRect(g, -w / 2 - 6, -h / 2 + 10, 8, 15, 4); g.fill();
    g.fillStyle = shade(color, -22);
    roundRect(g, -w / 2 + 2, h / 2 - 7, 9, 9, 3); g.fill();
    roundRect(g, w / 2 - 11, h / 2 - 7, 9, 9, 3); g.fill();
    g.fillStyle = color;
    roundRect(g, -w / 2, -h / 2, w, h - 4, 12); g.fill();
    g.fillStyle = '#bfe6ff';
    roundRect(g, -w / 2 + 6, -h / 2 + 6, 21, 11, 5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    roundRect(g, -w / 2 + 8, -h / 2 + 8, 7, 4, 2); g.fill();
    g.restore();
  }

  function drawBody(b) {
    g.save();
    g.translate(b.x, b.y);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(0, 10, 18, 6, 0, 0, 7); g.fill();
    g.fillStyle = shade(b.color, -18);
    roundRect(g, -18, -6, 26, 20, 10); g.fill();
    g.fillStyle = '#bfe6ff';
    roundRect(g, -14, -2, 14, 9, 4); g.fill();
    g.strokeStyle = '#e9eef5'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(10, 4); g.lineTo(20, 4); g.stroke();
    g.fillStyle = '#e9eef5';
    g.beginPath(); g.arc(10, 1, 3.2, 0, 7); g.arc(10, 7, 3.2, 0, 7);
    g.arc(21, 1, 3.2, 0, 7); g.arc(21, 7, 3.2, 0, 7); g.fill();
    g.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (state && state.phase === 'PLAYING' && state.you) simulate(dt);
    if (state && (state.phase === 'PLAYING' || state.phase === 'MEETING' || state.phase === 'ENDED')) draw(now);
    if (state && state.phase === 'MEETING' && state.meeting && !state.meeting.result) {
      const left = Math.max(0, Math.ceil((state.meeting.endsAt - Date.now()) / 1000));
      $('meetTimer').textContent = left + ' detik';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let sendAt = 0;
  function simulate(dt) {
    const a = axis();
    const ghost = !state.you.alive;
    if (a.moving && !taskOpen) {
      const sp = 190 * dt;
      const nx = me.x + a.x * sp, ny = me.y + a.y * sp;
      if (ghost) { me.x = nx; me.y = ny; }
      else {
        if (walkable(nx, me.y)) me.x = nx;
        if (walkable(me.x, ny)) me.y = ny;
      }
      if (a.x) facing = a.x > 0 ? 1 : -1;
      bump += dt * 11;
    } else bump = 0;
    if (MAP) { me.x = Math.max(16, Math.min(MAP.w - 16, me.x)); me.y = Math.max(16, Math.min(MAP.h - 16, me.y)); }

    const t = performance.now();
    if (t - sendAt > 50) { socket.emit('us:move', { x: me.x, y: me.y }); sendAt = t; updateActions(); }
  }

  function draw(now) {
    if (!MAP) return;
    g.clearRect(0, 0, VW, VH);
    g.fillStyle = '#05070f';
    g.fillRect(0, 0, VW, VH);

    const viewW = VW / SCALE, viewH = VH / SCALE;
    // Follow the player, but centre the map on any axis where the view is the bigger
    // of the two — otherwise clamping pins you to a screen edge on wide monitors.
    const tx = viewW >= MAP.w ? (MAP.w - viewW) / 2 : Math.max(0, Math.min(MAP.w - viewW, me.x - viewW / 2));
    const ty = viewH >= MAP.h ? (MAP.h - viewH) / 2 : Math.max(0, Math.min(MAP.h - viewH, me.y - viewH / 2));
    cam.x += (tx - cam.x) * 0.2;
    cam.y += (ty - cam.y) * 0.2;

    g.save();
    g.scale(SCALE, SCALE);
    g.translate(-cam.x, -cam.y);

    // ---- floor: walls first, then rooms and corridors on top ----
    for (const r of [...MAP.halls, ...MAP.rooms]) {
      g.fillStyle = '#0b1020';
      roundRect(g, r.x - 7, r.y - 7, r.w + 14, r.h + 14, 18); g.fill();
    }
    for (const r of MAP.halls) {
      g.fillStyle = '#171f36';
      roundRect(g, r.x, r.y, r.w, r.h, 8); g.fill();
      g.strokeStyle = 'rgba(120,145,205,.10)'; g.lineWidth = 1;
      const along = r.w > r.h;
      for (let d = 40; d < (along ? r.w : r.h); d += 40) {
        g.beginPath();
        if (along) { g.moveTo(r.x + d, r.y + 6); g.lineTo(r.x + d, r.y + r.h - 6); }
        else { g.moveTo(r.x + 6, r.y + d); g.lineTo(r.x + r.w - 6, r.y + d); }
        g.stroke();
      }
    }
    for (const r of MAP.rooms) {
      g.fillStyle = '#1b2540';
      roundRect(g, r.x, r.y, r.w, r.h, 14); g.fill();
      // floor grid
      g.save();
      roundRect(g, r.x, r.y, r.w, r.h, 14); g.clip();
      g.strokeStyle = 'rgba(120,145,205,.07)'; g.lineWidth = 1;
      for (let x = r.x + 44; x < r.x + r.w; x += 44) { g.beginPath(); g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); g.stroke(); }
      for (let y = r.y + 44; y < r.y + r.h; y += 44) { g.beginPath(); g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); g.stroke(); }
      drawRoomDecor(r, now);
      g.restore();
      // accent trim + label
      g.strokeStyle = hexA(r.accent, 0.35); g.lineWidth = 3;
      roundRect(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 13); g.stroke();
      g.fillStyle = hexA(r.accent, 0.5);
      g.font = '700 13px Rubik, sans-serif';
      g.textAlign = 'center';
      g.fillText(r.name.toUpperCase(), r.x + r.w / 2, r.y + 24);
    }

    // ---- vents (impostors and ghosts see them highlighted) ----
    const showVents = state.you && (state.you.impostor || !state.you.alive);
    for (const v of MAP.vents || []) {
      g.fillStyle = showVents ? '#2f6f8f' : '#202a44';
      roundRect(g, v.x - 15, v.y - 11, 30, 22, 5); g.fill();
      g.strokeStyle = showVents ? '#7fd4f0' : '#2c3a5c'; g.lineWidth = 2;
      roundRect(g, v.x - 15, v.y - 11, 30, 22, 5); g.stroke();
      g.strokeStyle = showVents ? 'rgba(180,235,255,.7)' : 'rgba(140,165,220,.35)'; g.lineWidth = 1.5;
      for (let i = -6; i <= 6; i += 6) { g.beginPath(); g.moveTo(v.x - 10, v.y + i); g.lineTo(v.x + 10, v.y + i); g.stroke(); }
    }

    // stations
    const mine = new Set((state.you ? state.you.tasks : []).filter((t) => !t.done).map((t) => t.id));
    for (const s of MAP.stations) {
      const hot = mine.has(s.id);
      g.fillStyle = hot ? '#2d6b46' : '#26304e';
      roundRect(g, s.x - 17, s.y - 13, 34, 26, 6); g.fill();
      g.strokeStyle = hot ? '#5ee08f' : '#3d4a74'; g.lineWidth = 2;
      roundRect(g, s.x - 17, s.y - 13, 34, 26, 6); g.stroke();
      if (hot) {
        const p = 0.5 + 0.5 * Math.sin(now / 260);
        g.globalAlpha = 0.35 + p * 0.4;
        g.strokeStyle = '#7ff0ad'; g.lineWidth = 3;
        roundRect(g, s.x - 22, s.y - 18, 44, 36, 9); g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = '#9dffc8';
        g.font = '700 10px Rubik, sans-serif'; g.textAlign = 'center';
        g.fillText('TUGAS', s.x, s.y + 28);
      }
    }

    // emergency button + lights panel
    const em = MAP.emergency;
    g.fillStyle = '#3a1f28'; roundRect(g, em.x - 22, em.y - 16, 44, 32, 8); g.fill();
    g.fillStyle = '#f0463c'; g.beginPath(); g.arc(em.x, em.y, 11, 0, 7); g.fill();
    g.strokeStyle = '#ff8d84'; g.lineWidth = 2; g.stroke();

    const lf = MAP.lightsFix;
    g.fillStyle = state.lights ? '#26304e' : '#4a3a16';
    roundRect(g, lf.x - 18, lf.y - 14, 36, 28, 6); g.fill();
    g.strokeStyle = state.lights ? '#3d4a74' : '#f0a92c'; g.lineWidth = 2;
    roundRect(g, lf.x - 18, lf.y - 14, 36, 28, 6); g.stroke();

    // bodies
    for (const b of state.bodies || []) drawBody(b);

    // players
    const iAmGhost = state.you && !state.you.alive;
    for (const p of state.players) {
      if (p.you) continue;
      if (!p.alive && !iAmGhost) continue;                 // ghosts are invisible to the living
      // Someone inside a vent is out of sight unless you are an impostor or dead.
      if (p.vented && !iAmGhost && !(state.you && state.you.impostor)) continue;
      const bob = Math.abs(Math.sin(now / 130 + p.x)) * 1.5;
      drawBean(p.x, p.y, p.color, { alpha: p.alive ? 1 : 0.45, bob });
      g.fillStyle = p.alive ? '#dbe3f5' : 'rgba(219,227,245,.5)';
      g.font = '600 12px Rubik, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)';
      g.strokeText(p.name, p.x, p.y - 26);
      g.fillText(p.name, p.x, p.y - 26);
      if (p.impostor === true && state.you && (state.you.impostor || iAmGhost)) {
        g.fillStyle = '#ff6a5e'; g.font = '700 10px Rubik, sans-serif';
        g.fillText('PENYUSUP', p.x, p.y + 30);
      }
    }

    // An impostor should be able to see how close is close enough, rather than
    // guessing why the kill button is grey.
    if (state.you && state.you.impostor && state.you.alive && state.phase === 'PLAYING' && !state.you.vent) {
      const reach = 95;
      g.save();
      g.setLineDash([7, 7]);
      g.strokeStyle = 'rgba(240,70,60,.30)'; g.lineWidth = 2;
      g.beginPath(); g.arc(me.x, me.y, reach, 0, 7); g.stroke();
      g.restore();
      const t = killTarget();
      if (t) {
        g.strokeStyle = '#ff4d3d'; g.lineWidth = 3;
        g.beginPath(); g.arc(t.x, t.y, 28, 0, 7); g.stroke();
      }
    }

    // you
    const myColor = (state.players.find((p) => p.you) || {}).color || '#fff';
    drawBean(me.x, me.y, myColor, { flip: facing < 0, alpha: iAmGhost ? 0.5 : 1, bob: Math.abs(Math.sin(bump)) * 2 });

    g.restore();

    // vision — ghosts and the end screen see everything
    if (!iAmGhost && state.phase === 'PLAYING') {
      const imp = state.you && state.you.impostor;
      const r = (state.lights ? (imp ? 310 : 230) : (imp ? 260 : 105)) * SCALE;
      const sx = (me.x - cam.x) * SCALE, sy = (me.y - cam.y) * SCALE;
      // A gradient that is clear on you and opaque further out. (Punching a hole with
      // destination-out would erase the ship underneath instead of just shading it.)
      const grad = g.createRadialGradient(sx, sy, r * 0.5, sx, sy, r);
      grad.addColorStop(0, 'rgba(3,5,12,0)');
      grad.addColorStop(1, 'rgba(3,5,12,0.95)');
      g.fillStyle = grad;
      g.fillRect(0, 0, VW, VH);
    }

    const flash = (killFlashUntil - Date.now()) / 800;
    if (flash > 0) {
      g.fillStyle = 'rgba(240,70,60,' + (flash * 0.55).toFixed(3) + ')';
      g.fillRect(0, 0, VW, VH);
    }
  }
})();
