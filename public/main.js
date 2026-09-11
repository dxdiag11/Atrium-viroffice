// Map, movement, rendering, and the socket wiring. Globals used: io, canMove, RADIUS, NEAR, FAR.

const SPEED = 150;      // px per second
const SEND_HZ = 15;     // position updates per second
const LERP = 12;        // remote position smoothing per second

const socket = io();
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const players = {};     // id -> { id, name, color, x, y, rx, ry }
const held = new Set();

let myId = null;
let map = null;
let background = null;
let showRange = false;
let radioHolder = null; // socket id currently holding the walkie channel
let lastSent = 0;
let sentX = null;
let sentY = null;
let selectedCharacter = 'male-001';
let joining = false;
let dndOn = false;      // Do Not Disturb: mic off, and every incoming voice silenced
let assetsReady = false;
let mapPromise = null;
try {
  selectedCharacter = characterById(localStorage.getItem('atrium.character')).id;
  document.getElementById('name').value = localStorage.getItem('atrium.name') || '';
} catch (_) { /* Storage can be unavailable in private browsing. */ }

const resize = () => {
  canvas.width = Math.round(window.innerWidth * window.devicePixelRatio);
  canvas.height = Math.round(window.innerHeight * window.devicePixelRatio);
};
window.addEventListener('resize', resize);
resize();

// --- map -------------------------------------------------------------------

async function loadMap() {
  map = buildOffice();
  background = await loadImage(map.image);
}

function showError(message) {
  const el=document.getElementById('error');
  el.textContent=message;
  el.hidden=false;
}

// --- join ------------------------------------------------------------------

async function selectCharacter(id) {
  selectedCharacter=id;
  assetsReady=false;
  const button=document.getElementById('join');
  button.disabled=true;
  button.textContent='Loading workspace…';
  document.getElementById('selected-character').textContent=characterById(id).name;
  for (const option of document.querySelectorAll('.character-option')) option.setAttribute('aria-pressed',String(option.dataset.character===id));
  try {
    if (!mapPromise) mapPromise=loadMap().catch(err=>{mapPromise=null;throw err;});
    const [,,portrait]=await Promise.all([mapPromise,loadCharacter(id),loadPortrait(id)]);
    if (id!==selectedCharacter) return;
    const preview=document.getElementById('character-preview');
    preview.style.backgroundImage='url("'+portrait+'")';
    preview.setAttribute('aria-label',characterById(id).name+' preview');
    assetsReady=true;
    button.disabled=joining;
    button.textContent='Enter office · with mic';
    document.getElementById('error').hidden=true;
  } catch (err) {
    if (id!==selectedCharacter) return;
    showError('Workspace asset could not load. Click Enter to retry. '+err.message);
    button.textContent='Retry loading';
    button.disabled=false;
  }
}

for (const character of CHARACTERS) {
  const option=document.createElement('button');
  option.type='button';
  option.className='character-option';
  option.dataset.character=character.id;
  option.setAttribute('aria-label',character.name+' ('+character.id+')');
  const thumb=document.createElement('span');
  thumb.className='character-thumb';
  loadPortrait(character.id).then(portrait=>{
    thumb.style.backgroundImage='url("'+portrait+'")';
    thumb.dataset.loaded='true';
  }).catch(()=>{option.disabled=true;option.title='Character image could not load. Refresh to retry.';});
  thumb.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.className='character-name';
  label.textContent=character.name;
  option.append(thumb,label);
  option.addEventListener('click',()=>{if(!joining) selectCharacter(character.id);});
  document.getElementById('character-list').append(option);
}

document.getElementById('join').addEventListener('click', async (e) => {
  if (!assetsReady) return selectCharacter(selectedCharacter);
  if (!socket.connected) return showError('Connecting to the office. Please try again in a moment.');
  const button = e.currentTarget;
  const error = document.getElementById('error');
  button.disabled = true;
  joining=true;
  error.hidden = true;

  try {
    await startVoice(); // myId arrives with the server's player snapshot
    const name=document.getElementById('name').value.trim() || 'anon';
    try { localStorage.setItem('atrium.character',selectedCharacter); localStorage.setItem('atrium.name',name); } catch (_) {}
    socket.emit('join', { name, characterId:selectedCharacter });
  } catch (err) {
    error.textContent = 'Mic access failed: ' + err.message;
    error.hidden = false;
    button.disabled = false;
    joining=false;
  }
});

// One place decides whether the mic is live, because two switches control it: the mute
// button and Do Not Disturb. Leaving DND must not unmute someone who muted by hand.
function applyMic() {
  setMuted(dndOn || document.getElementById('mute').classList.contains('on'));
}

document.getElementById('mute').addEventListener('click', (e) => {
  const on = e.currentTarget.classList.toggle('on');
  applyMic();
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.setAttribute('aria-label', on ? 'Unmute microphone' : 'Mute microphone');
  document.getElementById('mic-label').textContent = on ? 'Mic off' : 'Mic on';
});

function toggleDnd() {
  const button = document.getElementById('dnd');
  dndOn = button.classList.toggle('on');
  setDnd(dndOn);
  applyMic();
  // Silencing the floor while still holding the channel open would strand everyone
  // else on dead air until the server's timeout.
  if (dndOn && held.has('t')) socket.emit('ptt-up');
  if (dndOn) hideWalkie();
  else if (radioHolder) showWalkie((players[radioHolder]||{}).name||'', radioHolder===myId);
  socket.emit('dnd', dndOn);
  button.setAttribute('aria-pressed', String(dndOn));
  button.setAttribute('aria-label', dndOn ? 'Turn off do not disturb' : 'Turn on do not disturb');
  document.getElementById('dnd-label').textContent = dndOn ? 'Do not disturb on' : 'Do not disturb off';
  document.getElementById('hud').classList.toggle('dnd', dndOn);
}
document.getElementById('dnd').addEventListener('click', toggleDnd);

function toggleRange() {
  showRange = !showRange;
  const button = document.getElementById('range-toggle');
  button.setAttribute('aria-pressed', String(showRange));
  button.setAttribute('aria-label', showRange ? 'Hide audio range' : 'Show audio range');
}
document.getElementById('range-toggle').addEventListener('click', toggleRange);

// --- socket ----------------------------------------------------------------

socket.on('players', (all, id, holder) => {
  joining=false;
  for (const oldId of Object.keys(players)) delete players[oldId];
  resetBubbles();
  resetChat(); // the history that follows is the whole log, not an addition to the old one
  myId = id;
  radioHolder = holder || null;
  setSelfId(id);
  for (const p of Object.values(all)) addPlayer(p);
  for (const otherId of Object.keys(all)) {
    if (otherId !== myId) connectPeer(otherId);
  }
  document.getElementById('gate').hidden = true;
  document.getElementById('hud').hidden = false;
  renderRadio();

  // Someone may already be mid-transmission when we walk in: the 'radio' event that
  // raises the handset fired before we were here to hear it.
  if (radioHolder) {
    const talker = players[radioHolder];
    showWalkie(talker ? talker.name : '', radioHolder === myId);
  }
  document.getElementById('chat').hidden = false;
});

socket.on('player-joined', (p) => {
  addPlayer(p);
  connectPeer(p.id);
  refreshSuggest(); // an open @-list must show whoever just walked in
});

socket.on('player-seat', ({ id, seat, x, y }) => {
  const p = players[id];
  if (!p) return;
  p.seat = seat;
  p.x = x;
  p.y = y;
  if (id === myId) {
    p.rx = x;
    p.ry = y;
    sentX = x; // the server already knows this position, don't echo it back
    sentY = y;
    maybeArcade(p);
  }
});

socket.on('player-moved', ({ id, x, y, direction }) => {
  const p = players[id];
  if (!p) return;
  p.x = x;
  p.y = y;
  p.direction=direction || p.direction;
  p.walkUntil=performance.now()+180;
});

socket.on('player-speaking',({id,on})=>{if(players[id]) players[id].speaking=on;});
socket.on('player-dnd',({id,on})=>{if(players[id]) players[id].dnd=on;});
socket.on('player-typing',({id,on})=>{if(players[id]) setTyping(id,on);});
socket.on('position-corrected',({x,y})=>{
  const me=players[myId];
  if (!me) return;
  me.x=me.rx=sentX=x; me.y=me.ry=sentY=y;
});

socket.on('player-left', (id) => {
  delete players[id];
  clearBubbles(id);
  closePeer(id);
  refreshSuggest();
});

socket.on('radio', ({ id, on }) => {
  radioHolder = on ? id : null;
  renderRadio();
  // The transmission is silenced under Do Not Disturb, so neither the squelch click nor
  // the handset should arrive either: a handset for audio you cannot hear is just noise.
  if (dndOn) return hideWalkie();
  playSquelch(on);

  if (on) {
    const who = players[id];
    showWalkie(who ? who.name : '', id === myId);
  } else {
    hideWalkie();
  }
});

socket.on('radio-busy', () => {
  const el = document.getElementById('radio');
  el.textContent = 'channel busy';
  document.getElementById('walkie-button').classList.add('busy');
  setTimeout(renderRadio, 1000);
});

function renderRadio() {
  const el = document.getElementById('radio');
  const hud = document.getElementById('hud');
  const mine = !!myId && radioHolder === myId;
  const who = players[radioHolder];

  el.textContent = !radioHolder ? 'hold T to talk' : mine ? 'ON AIR' : 'on air - ' + (who ? who.name : '?');
  const button = document.getElementById('walkie-button');
  button.classList.toggle('live', !!radioHolder);
  button.classList.remove('busy');
  button.setAttribute('aria-pressed', String(mine));
  button.title = radioHolder ? el.textContent : 'Hold to talk (T)';
  hud.classList.toggle('on-air', mine);
}
socket.on('chat', (msg) => addMessage(msg));
socket.on('chat-history', addHistory);
socket.on('reacted', applyReaction);
socket.on('voted', applyVote);

socket.on('signal', ({ from, data }) => handleSignal(from, data));

socket.on('disconnect', () => {
  for (const id of Object.keys(players)) if (id !== myId) closePeer(id);
  for (const id of Object.keys(players)) delete players[id];
  myId=null; joining=false; radioHolder=null; held.clear(); sentX=sentY=null;
  resetBubbles();
  setComposing(false);
  document.getElementById('gate').hidden=false;
  document.getElementById('hud').hidden=true;
  document.getElementById('chat').hidden=true;
  document.getElementById('join').disabled=false;
  showError('Connection lost. Re-enter the office when your connection returns.');
});

function addPlayer(p) {
  players[p.id] = { ...p, rx: p.x, ry: p.y, direction:p.direction || 'down', walkUntil:0 };
  loadCharacter(p.characterId).catch(err=>showError(err.message));
}

// --- input -----------------------------------------------------------------

const walkieButton = document.getElementById('walkie-button');
function pressWalkie() {
  if (!myId || held.has('t') || dndOn) return;
  held.add('t');
  socket.emit('ptt-down');
}
function releaseWalkie() {
  if (!held.has('t')) return;
  held.delete('t');
  socket.emit('ptt-up');
}
walkieButton.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !e.isPrimary) return;
  walkieButton.setPointerCapture(e.pointerId);
  pressWalkie();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
  walkieButton.addEventListener(event, releaseWalkie);
}
walkieButton.addEventListener('keydown', (e) => {
  if (!['Enter', ' '].includes(e.key)) return;
  e.preventDefault();
  pressWalkie();
});
walkieButton.addEventListener('keyup', (e) => {
  if (!['Enter', ' '].includes(e.key)) return;
  e.preventDefault();
  releaseWalkie();
});

window.addEventListener('keydown', (e) => {
  if (!myId || ['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.target.closest('button') && ['Enter', ' '].includes(e.key)) return;
  const key = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
  if (e.key === 'Enter') {
    e.preventDefault();
    // Movement keys are only released by a keyup, and the input swallows nothing, but
    // clearing here means a key held while jumping into chat can never stay stuck.
    held.clear();
    return focusChat();
  }
  if (e.key === '`' && !e.repeat) toggleRange();
  if (key === 'v' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.isContentEditable) {
    document.getElementById('mute').click();
  }
  if (key === 'm' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.isContentEditable) {
    toggleDnd();
  }
  if (key === 'e' && !e.repeat && players[myId]) toggleSit(players[myId]);
  // keydown repeats while a key is held, so ask the channel only on the first one.
  if (key === 't' && !held.has('t') && myId && !dndOn) socket.emit('ptt-down');
  held.add(key);
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 't') socket.emit('ptt-up');
  held.delete(key);
});

// Alt-tabbing mid-transmission is the likeliest way to strand the channel: the browser
// never sends the keyup. The server's timeout is the backstop, not the mechanism.
window.addEventListener('blur', () => {
  if (held.has('t')) socket.emit('ptt-up');
  held.clear();
});

function axis(negKeys, posKeys) {
  const neg = negKeys.some((k) => held.has(k)) ? -1 : 0;
  const pos = posKeys.some((k) => held.has(k)) ? 1 : 0;
  return neg + pos;
}

// Stepping out of a chair puts you behind it, i.e. opposite the way you were facing.
const STAND_OFFSET = { up: [0, 24], down: [0, -24], left: [24, 0], right: [-24, 0] };

function nearestSeat(me) {
  let best = -1;
  let bestDist = 48;
  map.seats.forEach((seat, i) => {
    const d = Math.hypot(seat.x - me.x, seat.y - me.y);
    if (d < bestDist && canTraverse(me,seat,RADIUS,map.collisions)) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

const seatTaken = (i) => Object.values(players).some((p) => p.seat === i);

function toggleSit(me) {
  if (me.seat !== null) return stand(me);
  const i = nearestSeat(me);
  if (i < 0 || seatTaken(i)) return;
  // The server decides: it is the only one that can see the other person reaching for
  // the same chair. We sit when 'player-seat' comes back.
  socket.emit('sit', i);
}

// step=false when you walk out of the chair: you are already moving, so pushing you
// backwards first would visibly jerk you the wrong way.
function stand(me, step = true) {
  const seat = map.seats[me.seat];
  me.seat = null; // standing always succeeds, so don't wait for the round trip

  if (step) {
    const [ox, oy] = STAND_OFFSET[seat.dir] || [0, 44];
    const nx = clamp(me.x + ox, RADIUS, map.width - RADIUS);
    const ny = clamp(me.y + oy, RADIUS, map.height - RADIUS);
    if (canTraverse(me,{x:nx,y:ny}, RADIUS, map.collisions)) {
      me.x = nx;
      me.y = ny;
    }
  }
  socket.emit('stand', { x: me.x, y: me.y });
  maybeArcade(me); // seat is null now -> closes the game menu
}

// --- desk games ----------------------------------------------------------------
// Sit at a monitor -> pick a game -> it runs in an overlay, right inside the office.

const GAMES = {
  gaple:    { name: '🀄 Gaple',       port: 3200 },
  tumble:   { name: '🏃 Tumble Rush', port: 3300 },
  werewolf: { name: '🐺 Werewolf',    port: 3400 },
  impostor: { name: '🔪 Penyusup',    port: 3500 },
};

function gameOrigin(port) {
  return location.protocol + '//' + location.hostname + ':' + port;
}

function gameUrl(port) {
  const me = players[myId] || {};
  const q = '?name=' + encodeURIComponent(me.name || '') + '&color=' + encodeURIComponent(me.color || '');
  return gameOrigin(port) + '/' + q;
}

// The self-signed certificate has to be accepted once per port, and a browser will not
// show that prompt inside an iframe -- the overlay would just come up blank. So knock on
// the game first: a rejected fetch means the certificate has not been trusted yet.
async function gameReachable(port) {
  try {
    await fetch(gameOrigin(port) + '/', { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch (err) {
    return false;
  }
}

function maybeArcade(me) {
  const seat = me && me.seat !== null ? map.seats[me.seat] : null;
  const playing = !document.getElementById('gameframe').hidden;
  document.getElementById('arcade').hidden = !(seat && seat.game && !playing);
}

async function openGame(key) {
  const g = GAMES[key];
  if (!g) return;
  const iframe = document.getElementById('gameframe-iframe');
  const hint = document.getElementById('gameframe-hint');

  hint.hidden = true;
  document.getElementById('gameframe-title').textContent = g.name;
  document.getElementById('arcade').hidden = true;
  document.getElementById('gameframe').hidden = false;

  if (await gameReachable(g.port)) {
    iframe.src = gameUrl(g.port);
  } else {
    const origin = gameOrigin(g.port);
    hint.innerHTML =
      'Belum bisa dibuka. Buka <a href="' + origin + '" target="_blank" rel="noopener">' + origin +
      '</a> sekali di tab baru, terima peringatan sertifikatnya, lalu balik ke sini dan pilih lagi.' +
      '<br>Kalau tetap gagal, server game-nya belum jalan: <code>npm run start:all</code>.';
    hint.hidden = false;
  }
  // Release the walkie BEFORE clearing the key set, or the check can never be true and
  // opening a game mid-transmission strands the channel until the server times it out.
  if (held.has('t')) socket.emit('ptt-up');
  held.clear(); // so you are not still "walking" when you come back
}

function closeGame() {
  document.getElementById('gameframe-iframe').src = 'about:blank';
  document.getElementById('gameframe').hidden = true;
  held.clear();
  maybeArcade(players[myId]); // still seated -> show the menu again
}

for (const btn of document.querySelectorAll('#arcade [data-game]')) {
  btn.addEventListener('click', () => openGame(btn.dataset.game));
}
document.getElementById('arcade-close').addEventListener('click', () => {
  document.getElementById('arcade').hidden = true;
});
document.getElementById('gameframe-exit').addEventListener('click', closeGame);

// A game running in the overlay can ask to be closed (its own "back to office" button).
window.addEventListener('message', (e) => {
  if (e.data === 'atrium:exit-game' && !document.getElementById('gameframe').hidden) closeGame();
});

function move(me, dt) {
  me.walking=false;
  let dx = axis(['a', 'arrowleft'], ['d', 'arrowright']);
  let dy = axis(['w', 'arrowup'], ['s', 'arrowdown']);
  if (!dx && !dy) return;
  me.direction=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');
  const oldX=me.x, oldY=me.y;
  if (me.seat !== null) stand(me, false); // walking away from a chair gets you out of it

  if (dx && dy) {
    const inv = Math.SQRT1_2; // keep diagonals the same speed as straight lines
    dx *= inv;
    dy *= inv;
  }
  const step = SPEED * dt;

  // Axis-separated so hitting a wall on one axis still allows sliding on the other.
  const nx = clamp(me.x + dx * step, RADIUS, map.width - RADIUS);
  if (canMove(nx, me.y, RADIUS, map.collisions)) me.x = nx;

  const ny = clamp(me.y + dy * step, RADIUS, map.height - RADIUS);
  if (canMove(me.x, ny, RADIUS, map.collisions)) me.y = ny;
  me.walking=me.x!==oldX || me.y!==oldY;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Runs every frame, not just when you press a key: someone can walk into you while you
// are standing still, and you should be the one who gives way.
function separate(me) {
  if (me.seat !== null) return; // someone sitting is furniture, they do not get shoved

  const others = Object.values(players).filter((p) => p.id !== me.id);
  const [px, py] = separateFrom(me.x, me.y, others);
  if (px === me.x && py === me.y) return;

  // Axis by axis, and never into a wall: being pushed should slide you along the wall,
  // not through it.
  const nx = clamp(px, RADIUS, map.width - RADIUS);
  const ny = clamp(py, RADIUS, map.height - RADIUS);
  if (canMove(nx, me.y, RADIUS, map.collisions)) me.x = nx;
  if (canMove(me.x, ny, RADIUS, map.collisions)) me.y = ny;
}

// --- loop ------------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap so a background tab can't teleport
  last = now;

  const me = players[myId];
  if (me) {
    move(me, dt);
    separate(me);
    me.rx = me.x;
    me.ry = me.y;

    // Remote positions arrive at SEND_HZ; ease toward them so motion looks continuous.
    const t = Math.min(1, LERP * dt);
    for (const p of Object.values(players)) {
      if (p.id === myId) continue;
      p.rx += (p.x - p.rx) * t;
      p.ry += (p.y - p.ry) * t;
    }

    if (now - lastSent > 1000 / SEND_HZ && (me.x !== sentX || me.y !== sentY)) {
      socket.emit('move', { x: me.x, y: me.y });
      lastSent = now;
      sentX = me.x;
      sentY = me.y;
    }

  }

  updateWalkieMeter(radioHolder ? micLevel(radioHolder) : 0);

  draw(me);
  requestAnimationFrame(frame);
}

function draw(me) {
  const viewWidth=window.innerWidth,viewHeight=window.innerHeight;
  ctx.setTransform(canvas.width/viewWidth,0,0,canvas.height/viewHeight,0,0);
  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, viewWidth, viewHeight);
  if (!map || !me) return;

  const camX = viewWidth>map.width?(map.width-viewWidth)/2:clamp(me.x-viewWidth/2,0,map.width-viewWidth);
  const camY = viewHeight>map.height?(map.height-viewHeight)/2:clamp(me.y-viewHeight/2,0,map.height-viewHeight);

  ctx.save();
  ctx.translate(-camX, -camY);

  if (background) ctx.drawImage(background, 0, 0, map.width, map.height);

  if (showRange) {
    // Keep the nearby floor bright and shade the rest using the existing audio
    // falloff. Sample the curve so the transition follows its squared rolloff.
    const shade = ctx.createRadialGradient(me.x, me.y, NEAR, me.x, me.y, FAR);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const distance = NEAR + (FAR - NEAR) * t;
      shade.addColorStop(t, 'rgba(10, 15, 22, ' + (0.88 * (1 - falloff(distance))) + ')');
    }
    ctx.fillStyle = shade;
    ctx.fillRect(camX, camY, viewWidth, viewHeight);
  }

  // Avatars fade with the audio falloff while the range overlay is up; bubbles are drawn
  // afterwards at full strength, so a distant message stays readable even when the person
  // saying it is dimmed out.
  const roster = Object.values(players).sort((a,b)=>a.ry-b.ry);
  for (const p of roster) {
    ctx.save();
    if (showRange && p.id !== myId) {
      const distance = Math.hypot(p.rx - me.x, p.ry - me.y);
      // Radio remains audible outside proximity range, so keep its speaker visible.
      ctx.globalAlpha = Math.max(falloff(distance), radioGain(distance, p.id === radioHolder));
    }
    if (ctx.globalAlpha > 0) drawPlayer(p, p.id === myId);
    ctx.restore();
  }
  drawBubbles(ctx, roster, performance.now());

  const near = nearestSeat(me);
  const hint =
    me.seat !== null ? 'E to stand' : near < 0 ? null : seatTaken(near) ? 'taken' : 'E to sit';
  if (hint) {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = hint === 'taken' ? '#e0956a' : '#9fe0b0';
    ctx.fillText(hint, me.x, me.y + RADIUS + 20);
  }

  ctx.restore();
}

function drawPlayer(p, isSelf) {
  if (p.id === radioHolder) {
    // Pulsing ring, so a voice on the radio always has a visible source on the map.
    const pulse = RADIUS + 18 + Math.sin(performance.now() / 160) * 4;
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0956a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const seated=p.seat!==null;
  const isSpeaking=p.speaking || p.id===radioHolder;
  const direction=seated?map.seats[p.seat].dir:p.direction;
  const walking=isSelf?p.walking:performance.now()<p.walkUntil;
  if (isSelf) {
    ctx.beginPath(); ctx.ellipse(p.rx,p.ry,15,6,0,0,Math.PI*2);
    ctx.strokeStyle='#efd59a';ctx.lineWidth=2;ctx.stroke();
  }
  if (!drawCharacter(ctx,p.characterId,p.rx,p.ry,direction,seated,isSpeaking,walking,performance.now())) {
    ctx.beginPath();ctx.arc(p.rx,p.ry,8,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();
  }

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8eaf0';
  const label=p.name+(p.dnd?' · DND':isSpeaking?' · speaking':'');
  const width=ctx.measureText(label).width+14;
  ctx.fillStyle='rgba(12,24,20,.88)';ctx.fillRect(p.rx-width/2,p.ry-85,width,18);
  ctx.fillStyle=isSelf?'#f4dfb1':'#edf1e6';
  ctx.fillText(label, p.rx, p.ry-72);

  // The same badge the dock shows, above the name: the label alone only reads once you
  // are close enough to squint at it, and the whole point is to be read from across
  // the floor before anyone bothers walking over.
  if (p.dnd) {
    ctx.beginPath();ctx.arc(p.rx,p.ry-97,8,0,Math.PI*2);
    ctx.fillStyle='#4e3027';ctx.fill();
    ctx.strokeStyle='#e0846a';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.rx-4,p.ry-97);ctx.lineTo(p.rx+4,p.ry-97);ctx.stroke();
  }
}

// Audio runs on a timer, not on rAF: a hidden tab pauses rAF entirely, which would
// freeze everyone's volume at whatever it was when you switched away. 10 Hz is plenty
// given the 0.08s smoothing on each gain.
setInterval(() => {
  const me = players[myId];
  if (!me) return;
  const speaking=localSpeaking();
  if (me.speaking!==speaking) {me.speaking=speaking;socket.emit('speaking',speaking);}
  const audible = updateSpatialAudio(me, players, radioHolder);
  document.getElementById('peers').textContent = audible + ' nearby';
}, 100);

initWalkie();
initBubbles();
selectCharacter(selectedCharacter);
requestAnimationFrame(frame);
