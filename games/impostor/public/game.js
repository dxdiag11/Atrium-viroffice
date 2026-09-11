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
      $('killBtn').classList.toggle('hidden', !you.impostor);
      $('sabotageBtn').classList.toggle('hidden', !you.impostor);
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
  function killTarget() {
    if (!state.you || !state.you.impostor || !state.you.alive) return null;
    const p = at();
    return state.players
      .filter((q) => !q.you && q.alive && q.impostor !== true && Math.hypot(q.x - p.x, q.y - p.y) < 70)
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

    if (you && you.impostor) {
      const kb = $('killBtn');
      kb.disabled = !playing || !alive || you.killIn > 0 || !killTarget();
      kb.textContent = you.killIn > 0 ? you.killIn + 's' : 'BUNUH';
      const sb = $('sabotageBtn');
      sb.disabled = !playing || !alive || !state.lights || you.sabotageIn > 0;
    }
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

    // floor
    for (const r of MAP.halls) {
      g.fillStyle = '#182036';
      roundRect(g, r.x, r.y, r.w, r.h, 8); g.fill();
    }
    for (const r of MAP.rooms) {
      g.fillStyle = '#1d2742';
      roundRect(g, r.x, r.y, r.w, r.h, 14); g.fill();
      g.strokeStyle = '#31406b'; g.lineWidth = 3;
      roundRect(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 13); g.stroke();
      g.fillStyle = 'rgba(150,170,220,.28)';
      g.font = '600 13px Rubik, sans-serif';
      g.textAlign = 'center';
      g.fillText(r.name.toUpperCase(), r.x + r.w / 2, r.y + 22);
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
