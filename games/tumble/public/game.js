/* ===========================================================
   TUMBLE RUSH — client
   =========================================================== */
(function () {
  'use strict';

  var COLORS = ['#ff5b6e', '#ffb03a', '#ffd93d', '#5bd96a', '#3ec8d8', '#4d8bff', '#a06bff', '#ff6bd5'];
  var FACES = ['^^', 'oo', '--', 'UU'];
  var PATTERNS = ['polos', 'garis', 'titik'];
  var FACE_LABEL = { '^^': 'Riang', 'oo': 'Kaget', '--': 'Santai', 'UU': 'Senyum' };
  var PAT_LABEL = { 'polos': 'Polos', 'garis': 'Garis', 'titik': 'Titik' };
  var R = 22; // radius pemain (unit dunia)

  // ---------- profil (localStorage) ----------
  var profile = load();
  function load() {
    try {
      var p = JSON.parse(localStorage.getItem('tumble.profile') || '{}');
      return {
        name: p.name || '', coins: p.coins || 0, xp: p.xp || 0,
        wins: p.wins || 0, matches: p.matches || 0, best: p.best || 0,
        look: p.look || { color: COLORS[(Math.random() * 8) | 0], face: '^^', pattern: 'polos' },
      };
    } catch (e) {
      return { name: '', coins: 0, xp: 0, wins: 0, matches: 0, best: 0, look: { color: COLORS[0], face: '^^', pattern: 'polos' } };
    }
  }
  function save() { try { localStorage.setItem('tumble.profile', JSON.stringify(profile)); } catch (e) {} }
  function level(xp) { return Math.floor(Math.sqrt(xp / 60)) + 1; }
  function xpInto(xp) { var l = level(xp); var base = (l - 1) * (l - 1) * 60; var next = l * l * 60; return { cur: xp - base, need: next - base }; }

  // ---------- elemen ----------
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), ctx = stage.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var VW = 0, VH = 0;
  function resize() {
    VW = window.innerWidth; VH = window.innerHeight;
    stage.width = VW * DPR; stage.height = VH * DPR;
    stage.style.width = VW + 'px'; stage.style.height = VH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cf = $('confetti');
    cf.width = VW * DPR; cf.height = VH * DPR;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- state ----------
  var socket = io();
  var myId = null;
  var phase = 'LOBBY';
  var def = null, roster = [], parts = [], need = 0, roundIdx = 0, roundTotal = 4;
  var srvT = 0, srvAt = 0, roundDur = 0;
  var slimeX = -1e9, removed = {}, fuses = {}, aliveCount = 0, qualCount = 0;
  var spectator = false;
  var lp = null; // local player sim
  var cam = { x: 0, y: 0, s: 1 };
  var shake = 0;
  var keys = {};
  var lastFrame = performance.now();
  var lastSend = 0;

  // ---------- audio (opsional, kecil) ----------
  var AC = null;
  function beep(freq, dur, type, vol) {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.value = vol || 0.05;
      o.connect(g); g.connect(AC.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (dur || 0.12));
      o.stop(AC.currentTime + (dur || 0.12));
    } catch (e) {}
  }

  // ================= LOBBY UI =================
  var nameInput = $('nameInput');
  nameInput.value = profile.name || '';
  nameInput.addEventListener('input', function () {
    profile.name = nameInput.value.slice(0, 14); save(); pushLook(); drawChar();
  });

  buildChips($('colorRow'), COLORS, 'color', true);
  buildChips($('patternRow'), PATTERNS, 'pattern', false);
  buildChips($('faceRow'), FACES, 'face', false);

  function buildChips(row, list, key, swatch) {
    row.innerHTML = '';
    list.forEach(function (val) {
      var b = document.createElement('button');
      if (swatch) { b.className = 'sw'; b.style.background = val; }
      else b.textContent = key === 'face' ? FACE_LABEL[val] : PAT_LABEL[val];
      if (profile.look[key] === val) b.classList.add('sel');
      b.onclick = function () {
        profile.look[key] = val; save();
        [].forEach.call(row.children, function (c) { c.classList.remove('sel'); });
        b.classList.add('sel');
        pushLook(); drawChar();
      };
      row.appendChild(b);
    });
  }

  function pushLook() {
    socket.emit('setLook', {
      name: profile.name || 'Pemain',
      color: profile.look.color, face: profile.look.face, pattern: profile.look.pattern,
    });
  }

  // preview karakter
  var pcv = $('charPreview'), pctx = pcv.getContext('2d');
  function drawChar() {
    pctx.clearRect(0, 0, 200, 200);
    pctx.save(); pctx.translate(100, 108);
    var t = performance.now() / 400;
    pctx.translate(0, Math.sin(t) * 4);
    drawBlob(pctx, 0, 0, 46, profile.look, 0, 1);
    pctx.restore();
    pctx.fillStyle = '#23204a'; pctx.font = '600 15px Fredoka, sans-serif';
    pctx.textAlign = 'center';
    pctx.fillText(profile.name || 'Pemain', 100, 190);
  }

  function renderProfile() {
    var xi = xpInto(profile.xp);
    $('profile').innerHTML =
      '<span class="stat">🏅 Level ' + level(profile.xp) + '</span>' +
      '<span class="stat">🪙 ' + profile.coins + '</span>' +
      '<span class="stat">🏆 ' + profile.wins + ' menang</span>' +
      '<span class="stat">🎮 ' + profile.matches + ' main</span>' +
      '<div class="xpbar"><i style="width:' + Math.round(xi.cur / xi.need * 100) + '%"></i></div>';
  }

  var ready = false;
  $('readyBtn').onclick = function () {
    ready = !ready;
    socket.emit('ready', ready);
    this.classList.toggle('on', ready);
    this.textContent = ready ? 'BATAL SIAP' : 'SIAP!';
  };

  $('leaveBtn').onclick = function () { socket.emit('leave-match'); showScreen('lobby'); };
  $('backBtn').onclick = function () { showScreen('lobby'); };

  // ================= SOCKET =================
  socket.on('connect', function () {
    myId = socket.id;
    socket.emit('join', { name: profile.name || 'Pemain', look: profile.look });
  });
  socket.on('hello', function (d) { myId = d.id; phase = d.phase; });

  socket.on('lobby', function (d) {
    if (d.phase === 'LOBBY' && phase !== 'LOBBY') showScreen('lobby');
    phase = d.phase;
    renderRoster(d.players);
    var msg = $('startMsg');
    if (d.startIn != null) msg.textContent = 'Pertandingan mulai dalam ' + d.startIn + '…';
    else if (d.phase !== 'LOBBY') msg.textContent = 'Pertandingan sedang berlangsung — bersiaplah untuk ronde berikutnya';
    else msg.textContent = ready ? 'Menunggu pemain lain siap…' : 'Klik SIAP untuk ikut pertandingan berikutnya';
  });

  function renderRoster(list) {
    $('roomCount').textContent = '(' + list.length + ' online)';
    var ul = $('roster'); ul.innerHTML = '';
    list.forEach(function (p) {
      var li = document.createElement('li');
      if (p.id === myId) li.className = 'me';
      li.innerHTML = '<span class="dot" style="background:' + p.look.color + '"></span>' +
        '<span class="rn">' + esc(p.name) + (p.id === myId ? ' (kamu)' : '') + '</span>' +
        '<span class="rr ' + (p.ready ? 'y' : 'n') + '">' + (p.ready ? '✔ siap' : 'santai') + '</span>';
      ul.appendChild(li);
    });
  }

  socket.on('round-start', function (d) {
    def = d.def; roster = d.roster; need = d.need;
    roundIdx = d.index; roundTotal = d.total; roundDur = d.duration;
    spectator = d.you.spectator;
    slimeX = -1e9; removed = {}; fuses = {}; qualCount = 0;
    aliveCount = roster.filter(function (r) { return r.in; }).length;

    parts = roster.map(function (r, i) {
      var sp = (d.spawns && d.spawns[i]) || [def.world.w / 2, def.world.h / 2];
      return { id: r.id, look: r.look, name: r.name, bot: r.bot, x: sp[0], y: sp[1], rx: sp[0], ry: sp[1], s: r.in ? 0 : 2 };
    });

    var myIdx = -1;
    for (var i = 0; i < roster.length; i++) if (roster[i].id === myId) myIdx = i;
    if (!spectator && myIdx >= 0) {
      var sp = d.spawns[myIdx];
      lp = { idx: myIdx, x: sp[0], y: sp[1], vx: 0, vy: 0, state: 'run', dashCd: 0, dashUntil: 0, hitUntil: 0 };
    } else {
      lp = { idx: -1, x: def.world.w / 2, y: def.world.h / 2, vx: 0, vy: 0, state: 'spectate', dashCd: 0, dashUntil: 0, hitUntil: 0 };
      spectator = true;
    }
    cam.s = camScale();
    var cv = camClamp(camTarget());
    cam.x = cv.x; cam.y = cv.y;

    showScreen('game');
    $('hudName').textContent = def.name;
    $('hudRound').textContent = 'RONDE ' + (roundIdx + 1) + '/' + roundTotal;
    $('leaveBtn').classList.toggle('hidden', !spectator);
    phase = 'COUNTDOWN';
  });

  socket.on('countdown', function (d) {
    var el = $('countdown'); el.classList.remove('hidden');
    $('cdNum').textContent = d.n;
    $('cdNum').style.animation = 'none'; void $('cdNum').offsetWidth; $('cdNum').style.animation = '';
    beep(440 + (5 - d.n) * 60, 0.1);
  });
  socket.on('round-go', function () {
    $('countdown').classList.add('hidden');
    $('cdNum').textContent = 'MULAI!';
    $('countdown').classList.remove('hidden');
    setTimeout(function () { $('countdown').classList.add('hidden'); }, 650);
    beep(880, 0.18, 'sawtooth', 0.06);
    phase = 'ROUND'; srvAt = performance.now();
  });

  socket.on('tick', function (d) {
    srvT = d.t; srvAt = performance.now();
    aliveCount = d.alive; need = d.need;
    if (d.slime != null) slimeX = d.slime;
    if (d.qual != null) qualCount = d.qual;
    if (d.removed) { removed = {}; d.removed.forEach(function (k) { removed[k] = 1; }); }
    if (d.fuses) { fuses = {}; d.fuses.forEach(function (f) { fuses[f[0]] = f[1]; }); }
    for (var i = 0; i < d.p.length && i < parts.length; i++) {
      var s = d.p[i];
      parts[i].x = s[0]; parts[i].y = s[1]; parts[i].s = s[2];
    }
  });

  socket.on('hit', function (d) {
    if (!lp || lp.state !== 'run') return;
    lp.vx = d.vx; lp.vy = d.vy; lp.hitUntil = performance.now() + 320;
    shake = 12; beep(160, 0.16, 'square', 0.06);
  });

  socket.on('event', function (d) {
    if (d.id === myId) return;
  });

  socket.on('you', function (d) {
    if (!lp) return;
    if (d.state === 'qualified') {
      lp.state = 'done';
      flash('LOLOS!', 'ok'); beep(1046, 0.2, 'triangle', 0.06);
    } else if (d.state === 'eliminated') {
      lp.state = 'out'; spectator = true;
      $('leaveBtn').classList.remove('hidden');
      flash('TERSINGKIR', 'bad'); beep(120, 0.3, 'sawtooth', 0.06);
    }
  });

  socket.on('round-end', function (d) {
    phase = 'INTERMISSION';
    $('interTitle').textContent = 'RONDE ' + (d.index + 1) + ' SELESAI';
    fillMini($('qualList'), d.qualified);
    fillMini($('elimList'), d.eliminated);
    showScreen('inter');
    var n = d.nextIn;
    $('interNext').textContent = 'Lanjut dalam ' + n + '…';
    var iv = setInterval(function () {
      n--; if (n <= 0) { clearInterval(iv); $('interNext').textContent = 'Bersiap…'; }
      else $('interNext').textContent = 'Lanjut dalam ' + n + '…';
    }, 1000);
  });

  function fillMini(ul, list) {
    ul.innerHTML = '';
    list.forEach(function (p) {
      var li = document.createElement('li');
      if (p.id === myId) li.className = 'me';
      li.innerHTML = '<span class="dot" style="background:' + (p.look ? p.look.color : '#ccc') + '"></span>' + esc(p.name) + (p.id === myId ? ' (kamu)' : '');
      ul.appendChild(li);
    });
  }

  socket.on('podium', function (d) {
    phase = 'PODIUM';
    showScreen('podium');
    var slots = [1, 2, 3];
    slots.forEach(function (pl) {
      var e = d.podium.filter(function (x) { return x.place === pl; })[0];
      $('fig' + pl).style.background = e ? e.look.color : 'var(--line)';
      $('pn' + pl).textContent = e ? e.name : '—';
    });
    var box = $('rewardBox');
    if (d.you) {
      profile.matches++;
      profile.coins += d.you.coins;
      profile.xp += d.you.xp;
      if (d.you.champion) profile.wins++;
      if (!profile.best || d.you.place < profile.best) profile.best = d.you.place;
      save(); renderProfile();
      $('podiumTitle').textContent = d.you.champion ? '🎉 JUARA! 🎉' : 'HASIL AKHIR';
      box.innerHTML =
        '<div class="big-place">Peringkat #' + d.you.place + ' dari ' + d.you.of + '</div>' +
        '<div class="gain">+' + d.you.coins + ' 🪙 &nbsp;·&nbsp; +' + d.you.xp + ' XP &nbsp;·&nbsp; ' + d.you.rounds + ' ronde dilewati</div>';
      if (d.you.champion) { flash('JUARA!', 'win'); confettiBurst(); beep(660, 0.15, 'triangle', 0.06); setTimeout(function () { beep(880, 0.15, 'triangle', 0.06); }, 140); setTimeout(function () { beep(1174, 0.3, 'triangle', 0.06); }, 300); }
    } else {
      $('podiumTitle').textContent = 'HASIL AKHIR';
      box.innerHTML = '<div class="gain">Kamu menonton pertandingan ini. Klik SIAP untuk ikut berikutnya!</div>';
    }
  });

  socket.on('back-to-lobby', function () {
    phase = 'LOBBY'; ready = false;
    $('readyBtn').classList.remove('on'); $('readyBtn').textContent = 'SIAP!';
    showScreen('lobby');
  });

  // ================= SCREENS =================
  function showScreen(name) {
    ['lobby', 'inter', 'podium'].forEach(function (s) { $(s).classList.toggle('hidden', s !== name); });
    $('hud').classList.toggle('hidden', name !== 'game');
    if (name !== 'game') { $('countdown').classList.add('hidden'); $('banner').classList.add('hidden'); }
    if (name === 'lobby') { renderProfile(); }
  }

  function flash(text, kind) {
    var b = $('banner');
    b.textContent = text; b.className = 'banner ' + kind;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { b.classList.add('hidden'); }, 1400);
  }

  // ================= INPUT =================
  window.addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
    if (e.key === ' ' && lp && lp.state === 'run') tryDash();
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

  function axis() {
    var x = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
    var y = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
    var m = Math.hypot(x, y);
    if (m > 0) { x /= m; y /= m; }
    return { x: x, y: y, moving: m > 0 };
  }
  function tryDash() {
    var now = performance.now();
    if (now < lp.dashCd) return;
    var a = axis();
    if (!a.moving) return;
    lp.vx += a.x * 540; lp.vy += a.y * 540;
    lp.dashUntil = now + 170; lp.dashCd = now + 2600;
    beep(300, 0.09, 'square', 0.04);
  }

  // ================= LOOP =================
  function frame(now) {
    var dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    if (phase === 'ROUND' && lp && lp.state === 'run') simLocal(dt, now);
    if (phase === 'ROUND' || phase === 'COUNTDOWN') {
      lerpOthers(dt);
      render(now);
      updateHUD(now);
      if (phase === 'ROUND' && lp && lp.state === 'run' && now - lastSend > 50) {
        socket.emit('input', { x: lp.x, y: lp.y });
        lastSend = now;
      }
    }
    if (shake > 0) shake *= 0.85;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function simLocal(dt, now) {
    var ACC = 1500, MAXV = 250, FRIC = 9;
    var a = axis();
    lp.vx += a.x * ACC * dt;
    lp.vy += a.y * ACC * dt;
    var damp = Math.exp(-FRIC * dt);
    lp.vx *= damp; lp.vy *= damp;
    var sp = Math.hypot(lp.vx, lp.vy);
    var cap = now < lp.dashUntil ? 820 : (now < lp.hitUntil ? 900 : MAXV);
    if (sp > cap) { lp.vx *= cap / sp; lp.vy *= cap / sp; }
    lp.x += lp.vx * dt; lp.y += lp.vy * dt;
    lp.x = Math.max(0, Math.min(def.world.w, lp.x));
    lp.y = Math.max(0, Math.min(def.world.h, lp.y));
    if (def.type === 'race') {
      if (lp.y < def.lane.top + 16) { lp.y = def.lane.top + 16; lp.vy = Math.abs(lp.vy) * 0.3; }
      if (lp.y > def.lane.bot - 16) { lp.y = def.lane.bot - 16; lp.vy = -Math.abs(lp.vy) * 0.3; }
    }
    if (lp.idx >= 0) { parts[lp.idx].x = lp.x; parts[lp.idx].y = lp.y; parts[lp.idx].rx = lp.x; parts[lp.idx].ry = lp.y; }
  }

  function lerpOthers(dt) {
    var k = 1 - Math.pow(0.001, dt);
    for (var i = 0; i < parts.length; i++) {
      if (i === lp.idx && lp.state === 'run') continue;
      parts[i].rx += (parts[i].x - parts[i].rx) * k;
      parts[i].ry += (parts[i].y - parts[i].ry) * k;
    }
  }

  // ---------- camera ----------
  function camScale() {
    var s;
    if (def.type === 'race') s = VH / def.world.h;
    else {
      var g = def.grid, m = g.size * 2.4;
      s = Math.min(VW / (g.cols * g.size + m), VH / (g.rows * g.size + m));
    }
    return Math.max(0.3, Math.min(s, 1.4));
  }
  function camTarget() {
    if (lp && (lp.state === 'run' || lp.state === 'done')) return { x: lp.x, y: lp.y };
    var best = null;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].s === 2) continue;
      if (!best) best = parts[i];
      else if (def.type === 'race') { if (parts[i].x > best.x) best = parts[i]; }
      else if (Math.hypot(parts[i].rx - def.world.w / 2, parts[i].ry - def.world.h / 2) <
               Math.hypot(best.rx - def.world.w / 2, best.ry - def.world.h / 2)) best = parts[i];
    }
    return best ? { x: best.rx, y: best.ry } : { x: def.world.w / 2, y: def.world.h / 2 };
  }
  function camClamp(t) {
    var s = cam.s || camScale();
    var vw = VW / s, vh = VH / s;
    var x = def.type === 'race' ? t.x - vw * 0.42 : t.x - vw / 2;
    var y = t.y - vh / 2;
    if (vw >= def.world.w) x = (def.world.w - vw) / 2;
    else x = Math.max(0, Math.min(def.world.w - vw, x));
    if (vh >= def.world.h) y = (def.world.h - vh) / 2;
    else y = Math.max(0, Math.min(def.world.h - vh, y));
    return { x: x, y: y };
  }
  function updateCam() {
    cam.s += (camScale() - cam.s) * 0.12;
    var v = camClamp(camTarget());
    cam.x += (v.x - cam.x) * 0.16;
    cam.y += (v.y - cam.y) * 0.16;
  }

  // ---------- render ----------
  function render(now) {
    updateCam(now);
    ctx.save();
    ctx.clearRect(0, 0, VW, VH);
    var sx = shake > 0.4 ? (Math.random() - 0.5) * shake : 0;
    var sy = shake > 0.4 ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);
    ctx.scale(cam.s, cam.s);
    ctx.translate(-cam.x, -cam.y);

    var t = srvT + (now - srvAt) / 1000;
    if (def.type === 'race') renderRace(t);
    else renderSurvival(t);

    // pemain
    var ordered = parts.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return a.p.ry - b.p.ry; });
    ordered.forEach(function (o) {
      var p = o.p;
      var isMe = o.i === lp.idx;
      var px = isMe && lp.state === 'run' ? lp.x : p.rx;
      var py = isMe && lp.state === 'run' ? lp.y : p.ry;
      if (p.s === 2 && !isMe) return; // tersingkir: hilang dari arena
      var squash = 0;
      if (isMe && now < lp.dashUntil) squash = 0.35;
      var alpha = p.s === 1 ? 0.95 : 1;
      drawBlob(ctx, px, py, R, p.look, p.s === 3 ? (now / 60) : 0, alpha, squash);
      // nama
      ctx.font = '600 13px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.strokeText(p.name, px, py - R - 10);
      ctx.fillStyle = isMe ? '#fff2a8' : '#fff';
      ctx.fillText(p.name, px, py - R - 10);
      if (p.s === 1) { ctx.font = '16px serif'; ctx.fillText('✅', px, py - R - 26); }
    });

    ctx.restore();
  }

  function renderRace(t) {
    var w = def.world.w, h = def.world.h, lt = def.lane.top, lb = def.lane.bot;
    // lantai lane
    ctx.fillStyle = '#7bd8ff';
    ctx.fillRect(0, lt, w, lb - lt);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (var gx = 0; gx < w; gx += 120) ctx.fillRect(gx, lt, 60, lb - lt);
    // dinding
    ctx.fillStyle = '#ffcf5c';
    ctx.fillRect(0, lt - 26, w, 26); ctx.fillRect(0, lb, w, 26);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.fillRect(0, lt - 6, w, 6); ctx.fillRect(0, lb, w, 6);

    // garis start
    stripes(30, lt, 16, lb - lt);
    // garis finish
    stripes(def.finishX, lt, 26, lb - lt);
    ctx.fillStyle = '#fff';
    ctx.font = '700 44px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(def.finishX + 60, (lt + lb) / 2); ctx.rotate(Math.PI / 2);
    ctx.fillText('FINISH', 0, 0); ctx.restore();

    // pushers
    (def.pushers || []).forEach(function (pu) {
      var cy = pu.y0 + (pu.y1 - pu.y0) * (0.5 + 0.5 * Math.sin(t * pu.wv + pu.phase));
      ctx.fillStyle = '#ff8fb3';
      roundRect(pu.x - pu.w / 2, cy - pu.h / 2, pu.w, pu.h, 18); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      roundRect(pu.x - pu.w / 2, cy + pu.h / 2 - 14, pu.w, 14, 8); ctx.fill();
    });
    // spinners
    (def.spinners || []).forEach(function (s) {
      var ang = t * s.av + (s.a0 || 0);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
      ctx.fillStyle = '#ff5b9e';
      roundRect(-s.arm, -18, s.arm * 2, 36, 18); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#c0348c';
      ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, 7); ctx.fill();
    });
    // hammers
    (def.hammers || []).forEach(function (hm) {
      var ang = hm.swing * Math.sin(t * hm.w + hm.phase);
      var hx = hm.x + Math.sin(ang) * hm.len, hy = hm.pivotY + Math.cos(ang) * hm.len;
      ctx.strokeStyle = '#b98cff'; ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hm.x, hm.pivotY); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = '#7b5bff';
      ctx.beginPath(); ctx.arc(hx, hy, 34, 0, 7); ctx.fill();
      ctx.fillStyle = '#5f3fe0';
      ctx.beginPath(); ctx.arc(hm.x, hm.pivotY, 10, 0, 7); ctx.fill();
    });

    // slime
    if (slimeX > -1e8) {
      var edge = Math.max(0, slimeX);
      ctx.fillStyle = 'rgba(120,225,70,.55)';
      ctx.beginPath();
      ctx.moveTo(-50, lt - 26);
      for (var y = lt - 26; y <= lb + 26; y += 20) ctx.lineTo(edge + Math.sin(y * 0.05 + t * 3) * 12, y);
      ctx.lineTo(-50, lb + 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(180,255,120,.8)';
      for (var i = 0; i < 6; i++) {
        var by = lt + ((i * 137 + t * 60) % (lb - lt));
        ctx.beginPath(); ctx.arc(edge - 20 - (i % 3) * 25, by, 4 + (i % 3), 0, 7); ctx.fill();
      }
    }
  }

  function stripes(x, y, w, h) {
    var n = Math.ceil(h / 24);
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#1a1147' : '#fff';
      ctx.fillRect(x, y + i * 24, w / 2, 24);
      ctx.fillStyle = i % 2 ? '#fff' : '#1a1147';
      ctx.fillRect(x + w / 2, y + i * 24, w / 2, 24);
    }
  }

  function renderSurvival(t) {
    var g = def.grid;
    // lubang / latar
    ctx.fillStyle = 'rgba(10,4,30,.55)';
    ctx.fillRect(-40, -40, def.world.w + 80, def.world.h + 80);
    for (var c = 0; c < g.cols; c++) {
      for (var r = 0; r < g.rows; r++) {
        var k = c + ',' + r;
        if (removed[k]) continue;
        var x = g.ox + c * g.size, y = g.oy + r * g.size, pad = 5;
        var f = fuses[k];
        if (f != null) {
          var col = f < 0.5 ? '#ffd93d' : '#ff5b6e';
          ctx.fillStyle = col;
          var jx = (Math.random() - 0.5) * f * 4, jy = (Math.random() - 0.5) * f * 4;
          roundRect(x + pad + jx, y + pad + jy, g.size - pad * 2, g.size - pad * 2, 12); ctx.fill();
        } else {
          ctx.fillStyle = ((c + r) % 2) ? '#8f7bff' : '#a58fff';
          roundRect(x + pad, y + pad, g.size - pad * 2, g.size - pad * 2, 12); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          roundRect(x + pad, y + pad, g.size - pad * 2, 10, 8); ctx.fill();
        }
      }
    }
  }

  // ---------- gambar karakter ----------
  function drawBlob(g, x, y, r, look, spin, alpha, squash) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y);
    if (spin) g.rotate(spin);
    // bayangan
    g.globalAlpha *= 0.9;
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.ellipse(0, r * 0.85, r * 0.9, r * 0.35, 0, 0, 7); g.fill();
    g.globalAlpha = alpha == null ? 1 : alpha;
    var sx = 1 + (squash || 0), sy = 1 - (squash || 0) * 0.6;
    g.scale(sx, sy);
    drawBlob._body(g, r, look);
    g.restore();
  }
  drawBlob._body = function (g, r, look) {
    // badan
    g.fillStyle = look.color;
    g.beginPath();
    g.moveTo(-r, r * 0.4);
    g.quadraticCurveTo(-r, -r, 0, -r);
    g.quadraticCurveTo(r, -r, r, r * 0.4);
    g.quadraticCurveTo(r, r, 0, r);
    g.quadraticCurveTo(-r, r, -r, r * 0.4);
    g.closePath();
    g.fill();
    // corak
    g.save();
    g.clip();
    if (look.pattern === 'garis') {
      g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 6;
      for (var i = -r; i < r * 2; i += 12) { g.beginPath(); g.moveTo(i, -r); g.lineTo(i - r * 2, r); g.stroke(); }
    } else if (look.pattern === 'titik') {
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (var a = -r; a < r; a += 13) for (var b = -r; b < r; b += 13) { g.beginPath(); g.arc(a, b, 2.6, 0, 7); g.fill(); }
    }
    g.restore();
    // kaki
    g.fillStyle = look.color;
    g.beginPath(); g.ellipse(-r * 0.45, r * 0.95, r * 0.28, r * 0.2, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(r * 0.45, r * 0.95, r * 0.28, r * 0.2, 0, 0, 7); g.fill();
    // mata
    var f = look.face || '^^';
    g.fillStyle = '#241a12';
    var ey = -r * 0.12, ex = r * 0.32;
    if (f === 'oo') {
      g.beginPath(); g.arc(-ex, ey, 4.2, 0, 7); g.arc(ex, ey, 4.2, 0, 7); g.fill();
    } else if (f === '--') {
      g.lineWidth = 3.4; g.strokeStyle = '#241a12'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-ex - 4, ey); g.lineTo(-ex + 4, ey); g.moveTo(ex - 4, ey); g.lineTo(ex + 4, ey); g.stroke();
    } else if (f === 'UU') {
      g.lineWidth = 3.4; g.strokeStyle = '#241a12';
      g.beginPath(); g.arc(-ex, ey - 2, 4, 0.2, Math.PI - 0.2); g.arc(ex, ey - 2, 4, 0.2, Math.PI - 0.2); g.stroke();
    } else { // ^^
      g.lineWidth = 3.4; g.strokeStyle = '#241a12';
      g.beginPath(); g.arc(-ex, ey + 3, 4, Math.PI + 0.2, -0.2); g.arc(ex, ey + 3, 4, Math.PI + 0.2, -0.2); g.stroke();
    }
    // pipi
    g.fillStyle = 'rgba(255,120,150,.4)';
    g.beginPath(); g.arc(-ex - 3, ey + 8, 4, 0, 7); g.arc(ex + 3, ey + 8, 4, 0, 7); g.fill();
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- HUD ----------
  function updateHUD(now) {
    var left = Math.max(0, roundDur - (srvT + (now - srvAt) / 1000));
    var m = Math.floor(left / 60), s = Math.floor(left % 60);
    $('hudTimer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (def.type === 'race') $('hudGoal').textContent = 'LOLOS ' + qualCount + ' / ' + need;
    else $('hudGoal').textContent = 'BERTAHAN ' + aliveCount + '  ·  target ' + Math.max(1, need);
    var st = $('hudState');
    st.className = 'hud-pill';
    if (!lp) return;
    if (lp.state === 'done') { st.textContent = 'LOLOS ✓'; st.classList.add('ok'); }
    else if (lp.state === 'out') { st.textContent = 'TERSINGKIR'; st.classList.add('bad'); }
    else if (lp.state === 'spectate') { st.textContent = 'MENONTON'; }
    else st.textContent = def.type === 'race' ? 'BERLARI' : 'BERTAHAN';
    var cd = Math.max(0, Math.min(1, 1 - (lp.dashCd - now) / 2600));
    $('dashBar').style.width = (cd * 100) + '%';
  }

  // ---------- confetti ----------
  function confettiBurst() {
    var cf = $('confetti'), cx = cf.getContext('2d');
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var ps = [];
    for (var i = 0; i < 160; i++) ps.push({
      x: VW / 2 + (Math.random() - 0.5) * 200, y: VH / 2 - 40,
      vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4,
      c: COLORS[(Math.random() * COLORS.length) | 0], r: 3 + Math.random() * 5, a: 1,
    });
    var end = performance.now() + 2600;
    function step() {
      cx.clearRect(0, 0, VW, VH);
      ps.forEach(function (p) {
        p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.a -= 0.006;
        cx.globalAlpha = Math.max(0, p.a);
        cx.fillStyle = p.c;
        cx.fillRect(p.x, p.y, p.r, p.r * 1.6);
      });
      if (performance.now() < end) requestAnimationFrame(step);
      else cx.clearRect(0, 0, VW, VH);
    }
    step();
  }

  function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  // preview animasi
  setInterval(drawChar, 60);
  renderProfile();
})();
