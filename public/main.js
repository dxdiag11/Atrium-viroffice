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
let assetsReady = false;
let mapPromise = null;
try {
  selectedCharacter = characterById(localStorage.getItem('atrium.character')).id;
  document.getElementById('name').value = localStorage.getItem('atrium.name') || '';
} catch (_) { /* Storage can be unavailable in private browsing. */ }

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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

document.getElementById('mute').addEventListener('click', (e) => {
  const on = e.currentTarget.classList.toggle('on');
  setMuted(on);
  e.currentTarget.textContent = on ? 'Unmute mic' : 'Mute mic';
});

// --- socket ----------------------------------------------------------------

socket.on('players', (all, id, holder) => {
  joining=false;
  for (const oldId of Object.keys(players)) delete players[oldId];
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
});

socket.on('player-joined', (p) => {
  addPlayer(p);
  connectPeer(p.id);
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
socket.on('position-corrected',({x,y})=>{
  const me=players[myId];
  if (!me) return;
  me.x=me.rx=sentX=x; me.y=me.ry=sentY=y;
});

socket.on('player-left', (id) => {
  delete players[id];
  closePeer(id);
});

socket.on('radio', ({ id, on }) => {
  radioHolder = on ? id : null;
  playSquelch(on);
  renderRadio();
});

socket.on('radio-busy', () => {
  const el = document.getElementById('radio');
  el.textContent = 'channel busy';
  el.className = 'busy';
  setTimeout(renderRadio, 1000);
});

function renderRadio() {
  const el = document.getElementById('radio');
  const hud = document.getElementById('hud');
  const mine = radioHolder === myId;
  const who = players[radioHolder];

  el.textContent = !radioHolder ? 'hold T to talk' : mine ? 'ON AIR' : 'on air - ' + (who ? who.name : '?');
  el.className = radioHolder ? 'live' : '';
  hud.classList.toggle('on-air', mine);
}

socket.on('signal', ({ from, data }) => handleSignal(from, data));

socket.on('disconnect', () => {
  for (const id of Object.keys(players)) if (id !== myId) closePeer(id);
  for (const id of Object.keys(players)) delete players[id];
  myId=null; joining=false; radioHolder=null; held.clear(); sentX=sentY=null;
  document.getElementById('gate').hidden=false;
  document.getElementById('hud').hidden=true;
  document.getElementById('join').disabled=false;
  showError('Connection lost. Re-enter the office when your connection returns.');
});

function addPlayer(p) {
  players[p.id] = { ...p, rx: p.x, ry: p.y, direction:p.direction || 'down', walkUntil:0 };
  loadCharacter(p.characterId).catch(err=>showError(err.message));
}

// --- input -----------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (!myId || ['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
  if (e.key === '`') showRange = !showRange;
  if (key === 'e' && !e.repeat && players[myId]) toggleSit(players[myId]);
  // keydown repeats while a key is held, so ask the channel only on the first one.
  if (key === 't' && !held.has('t') && myId) socket.emit('ptt-down');
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
}

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

// --- loop ------------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap so a background tab can't teleport
  last = now;

  const me = players[myId];
  if (me) {
    move(me, dt);
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

  draw(me);
  requestAnimationFrame(frame);
}

function draw(me) {
  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!map || !me) return;

  const camX = canvas.width>map.width?(map.width-canvas.width)/2:clamp(me.x-canvas.width/2,0,map.width-canvas.width);
  const camY = canvas.height>map.height?(map.height-canvas.height)/2:clamp(me.y-canvas.height/2,0,map.height-canvas.height);

  ctx.save();
  ctx.translate(-camX, -camY);

  if (background) ctx.drawImage(background, 0, 0, map.width, map.height);

  if (showRange) {
    for (const [radius, color] of [[NEAR, '#4fd08a'], [FAR, '#4f7fd0']]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(me.x, me.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (const p of Object.values(players).sort((a,b)=>a.ry-b.ry)) drawPlayer(p, p.id === myId);

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
    const pulse = RADIUS + 8 + Math.sin(performance.now() / 160) * 4;
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0956a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const seated=p.seat!==null;
  const speaking=p.speaking || p.id===radioHolder;
  const direction=seated?map.seats[p.seat].dir:p.direction;
  const walking=isSelf?p.walking:performance.now()<p.walkUntil;
  if (isSelf || speaking) {
    ctx.beginPath(); ctx.ellipse(p.rx,p.ry,15,6,0,0,Math.PI*2);
    ctx.strokeStyle=speaking?'#b8ecb0':'#efd59a';ctx.lineWidth=2;ctx.stroke();
  }
  if (!drawCharacter(ctx,p.characterId,p.rx,p.ry,direction,seated,speaking,walking,performance.now())) {
    ctx.beginPath();ctx.arc(p.rx,p.ry,8,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();
  }

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8eaf0';
  const label=p.name+(speaking?' · speaking':'');
  const width=ctx.measureText(label).width+14;
  ctx.fillStyle='rgba(12,24,20,.88)';ctx.fillRect(p.rx-width/2,p.ry-85,width,18);
  ctx.fillStyle=isSelf?'#f4dfb1':'#edf1e6';
  ctx.fillText(label, p.rx, p.ry-72);
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

selectCharacter(selectedCharacter);
requestAnimationFrame(frame);
