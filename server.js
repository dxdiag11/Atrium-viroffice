const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const { Server } = require('socket.io');

require('./public/geom.js');
require('./public/characters.js');
require('./public/office.js');
require('./public/chat-core.js');
const map = buildOffice(); // walls, spawn and seats all come from the one office model

const app = express();
app.use(express.static(__dirname + '/public'));
app.use('/assets/maps', express.static(__dirname + '/assets/maps', { maxAge: '1h' }));
app.use('/assets/characters', express.static(__dirname + '/assets/characters', { maxAge: '1h' }));
app.use('/assets/utilities', express.static(__dirname + '/assets/utilities', { maxAge: '1h' }));

// Browsers only hand out a mic on a secure origin. localhost counts as one; a LAN IP
// does not, so testing with someone on another machine needs https. Run ./make-cert.sh
// and this switches to https automatically.
const key = __dirname + '/certs/key.pem';
const cert = __dirname + '/certs/cert.pem';
const secure = !process.env.NO_TLS && fs.existsSync(key) && fs.existsSync(cert);

const server = secure
  ? https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, app)
  : http.createServer(app);

const io = new Server(server);

const players = {};

// The walkie channel: one talker at a time, owned here for the same reason seats are.
const RADIO_TIMEOUT = 30000;
let radio = null;
let radioTimer = null;

function releaseRadio(io) {
  clearTimeout(radioTimer);
  const id = radio;
  radio = null;
  if (id) io.emit('radio', { id, on: false });
}
// Chat lives in memory only: a restart wipes it, on purpose. Mention messages are never
// pushed here, otherwise a late joiner would read other people's private messages.
// Chat lives in memory only: a restart wipes it, and so does the room emptying out.
// Mention messages are never pushed here, otherwise a late joiner would read other
// people's private messages.
const messages = [];
const buckets = {}; // socket id -> chat rate limiter
const taps = {};    // socket id -> reaction/vote rate limiter
let msgSeq = 0;

function makeMessage(fields) {
  return {
    id: 'm' + ++msgSeq,
    at: Date.now(),
    scope: 'all',
    from: null,
    name: null,
    color: null,
    text: '',
    mentions: [],
    reactions: {}, // emoji -> [{ id, name }]
    poll: null,    // only ever set on scope 'poll'
    ...fields,
  };
}

// Reactions and votes attach to something the server still holds, and the only messages
// it holds are the global ones in the ring buffer. A mention is routed and forgotten on
// purpose, so there is deliberately nothing to react to -- see the note in chat-ui.js.
function messageById(id) {
  return messages.find((m) => m.id === id) || null;
}

function remember(msg) {
  messages.push(msg);
  if (messages.length > HISTORY_MAX) messages.shift();
}

// Join and leave notices are global chat, so they belong in history like any other.
function announce(text) {
  const msg = makeMessage({ scope: 'system', text });
  remember(msg);
  io.emit('chat', msg);
}

// A warning only the sender sees: never throw and never disconnect over chat input.
function warn(socket, text) {
  socket.emit('chat', makeMessage({ scope: 'system', text }));
}

const HELP_TEXT = 'Perintah yang ada: /vote, /help. ' + VOTE_USAGE;

// Slash commands are handled before mention routing: a poll is addressed to the room by
// definition, so "@Sari" inside one would only narrow who can answer it.
function runCommand(socket, me, { name, args }) {
  if (name === 'help') return warn(socket, HELP_TEXT);
  if (name !== 'vote') {
    return warn(socket, 'Perintah /' + name + ' tidak ada. ' + HELP_TEXT);
  }

  const parsed = parseVote(args);
  if (parsed.error) return warn(socket, parsed.error);

  const msg = makeMessage({
    scope: 'poll',
    from: socket.id,
    name: me.name,
    color: me.color,
    // The question doubles as the message text so anything that only knows about text --
    // a log dump, a future notification -- still says something useful.
    text: parsed.question,
    poll: makePoll(parsed.question, parsed.options, Date.now()),
  });
  remember(msg);
  io.emit('chat', msg);
}

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players[socket.id]) return;
    const raw = String((payload && payload.name) || 'anon').slice(0, 16);
    const name = uniqueName(raw, Object.values(players).map((p) => p.name));
    buckets[socket.id] = makeBucket(CHAT_LIMIT[0], CHAT_LIMIT[1]);
    taps[socket.id] = makeBucket(TAP_LIMIT[0], TAP_LIMIT[1]);
    const character = characterById(payload && payload.characterId);
    const spawn = {...map.spawn};
    for (let attempt=0; attempt<20; attempt++) {
      const x=map.spawn.x+(Math.random()-.5)*80, y=map.spawn.y+(Math.random()-.5)*36;
      if (canMove(x,y,RADIUS,map.collisions)) { spawn.x=x; spawn.y=y; break; }
    }
    players[socket.id] = {
      id: socket.id,
      name,
      color: character.color,
      characterId: character.id,
      direction: 'down',
      speaking: false,
      dnd: false,
      typing: false,
      x: spawn.x,
      y: spawn.y,
      seat: null,
    };
    socket.emit('players', players, socket.id, radio);
    socket.emit('chat-history', messages);
    socket.broadcast.emit('player-joined', players[socket.id]);
    announce(name + ' masuk');
  });

  socket.on('chat', (payload) => {
    const me = players[socket.id];
    if (!me) return; // not joined yet: no name, no colour, nothing to attribute
    const text = normalizeText(payload && payload.text);
    if (!text) return;
    if (!buckets[socket.id].take(Date.now())) {
      return warn(socket, 'Terlalu cepat. Tunggu sebentar.');
    }

    setTyping(false); // the words are out; a stale "…" would hang over their head

    const command = parseCommand(text);
    if (command) return runCommand(socket, me, command);

    const { scope, ids, unknown } = resolveRecipients(text, socket.id, players);
    if (unknown.length) {
      // Sending it anyway would leak a message meant to be private, so drop it entirely.
      return warn(socket, 'Tidak ada user bernama @' + unknown.join(', @'));
    }

    const msg = makeMessage({
      scope,
      from: socket.id,
      name: me.name,
      color: me.color,
      text,
      mentions: ids || [],
    });

    if (scope === 'all') {
      remember(msg);
      return io.emit('chat', msg);
    }
    // Routed server-side, never broadcast-then-filtered: anyone could read a filtered
    // message straight out of devtools. Deliberately not remembered, either.
    for (const id of ids) io.to(id).emit('chat', msg);
  });

  // Reactions and votes are edits to a message the server already owns, so the client
  // sends an intent ("toggle this emoji") and gets the whole new state back. Sending a
  // delta would mean two browsers that clicked at once end up disagreeing.
  socket.on('react', (payload) => {
    const me = players[socket.id];
    if (!me || !payload || !taps[socket.id].take(Date.now())) return;
    const msg = messageById(String(payload.id || ''));
    if (!msg || msg.scope === 'system') return;
    if (!toggleReaction(msg, payload.emoji, me)) return;
    io.emit('reacted', { id: msg.id, reactions: msg.reactions });
  });

  socket.on('vote', (payload) => {
    const me = players[socket.id];
    if (!me || !payload || !taps[socket.id].take(Date.now())) return;
    const msg = messageById(String(payload.id || ''));
    if (!msg || !msg.poll) return;
    if (!castVote(msg.poll, me, payload.option, Date.now())) return;
    io.emit('voted', { id: msg.id, poll: msg.poll });
  });

  socket.on('move', (pos) => {
    const p = players[socket.id];
    if (!p || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (p.seat !== null) return; // seated players are parked on their chair
    if (!canTraverse(p, pos, RADIUS, map.collisions)) {
      return socket.emit('position-corrected', {x:p.x,y:p.y});
    }
    const dx=pos.x-p.x, dy=pos.y-p.y;
    if (dx || dy) p.direction = Math.abs(dx)>Math.abs(dy) ? (dx<0?'left':'right') : (dy<0?'up':'down');
    p.x = pos.x;
    p.y = pos.y;
    socket.broadcast.emit('player-moved', { id: socket.id, x: p.x, y: p.y, direction:p.direction });
  });

  // Composing is public the way speaking is: everyone can see the bubble over your head,
  // nobody can see the draft. Mention drafts included -- who is typing leaks nothing, and
  // hiding it would tell the room you are writing something private.
  function setTyping(on) {
    const p = players[socket.id];
    if (!p || typeof on !== 'boolean' || p.typing === on) return;
    p.typing = on;
    socket.broadcast.emit('player-typing', { id: socket.id, on });
  }

  socket.on('typing', setTyping);

  // Do Not Disturb lives on the server for the same reason a seat does: everyone else
  // has to see it, or they walk over and talk into a mic that is already off.
  socket.on('dnd', on => {
    const p=players[socket.id];
    if (!p || typeof on !== 'boolean' || p.dnd === on) return;
    p.dnd=on;
    // Holding the channel with the mic cut would lock everyone out for 30s of dead air.
    if (on && radio === socket.id) releaseRadio(io);
    socket.broadcast.emit('player-dnd', {id:socket.id,on});
  });

  socket.on('speaking', on => {
    const p=players[socket.id];
    if (!p || typeof on !== 'boolean' || p.speaking === on) return;
    p.speaking=on;
    socket.broadcast.emit('player-speaking', {id:socket.id,on});
  });

  // The server owns who is sitting where: two people clicking the same chair at the
  // same time both reach here, and only the first one gets it.
  const seatTaken = (i) => Object.values(players).some((q) => q.seat === i);

  socket.on('sit', (i) => {
    const p = players[socket.id];
    if (!p || p.seat !== null) return;
    if (!Number.isInteger(i) || i < 0 || i >= map.seats.length) return;
    if (Math.hypot(p.x-map.seats[i].x,p.y-map.seats[i].y)>48) return;
    if (!canTraverse(p,map.seats[i],RADIUS,map.collisions)) return;
    if (seatTaken(i)) return socket.emit('seat-denied', i);

    p.seat = i;
    p.x = map.seats[i].x;
    p.y = map.seats[i].y;
    io.emit('player-seat', { id: socket.id, seat: i, x: p.x, y: p.y });
  });

  socket.on('stand', (pos) => {
    const p = players[socket.id];
    if (!p || p.seat === null) return;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      if (Math.hypot(p.x-pos.x,p.y-pos.y)>60 || !canTraverse(p,pos,RADIUS,map.collisions)) return;
      p.x = pos.x;
      p.y = pos.y;
    }
    p.seat = null;
    io.emit('player-seat', { id: socket.id, seat: null, x: p.x, y: p.y });
  });

  socket.on('ptt-down', () => {
    if (!players[socket.id]) return;
    if (players[socket.id].dnd) return; // muted mic: the transmission would be dead air
    if (radio && radio !== socket.id) return socket.emit('radio-busy', radio);

    radio = socket.id;
    // A browser that never delivers keyup -- alt-tab, lock screen, crashed tab -- would
    // otherwise hold the channel shut for everyone with no way back.
    clearTimeout(radioTimer);
    radioTimer = setTimeout(() => releaseRadio(io), RADIO_TIMEOUT);
    io.emit('radio', { id: socket.id, on: true });
  });

  socket.on('ptt-up', () => {
    if (radio === socket.id) releaseRadio(io);
  });

  // Verbatim relay of WebRTC offer/answer/ICE between two players.
  socket.on('signal', (msg) => {
    if (!msg || !players[msg.to] || !players[socket.id]) return;
    io.to(msg.to).emit('signal', { from: socket.id, data: msg.data });
  });

  socket.on('disconnect', () => {
    if (radio === socket.id) releaseRadio(io);
    delete buckets[socket.id];
    delete taps[socket.id];
    if (!players[socket.id]) return;
    const { name } = players[socket.id];
    delete players[socket.id];
    io.emit('player-left', socket.id);
    announce(name + ' keluar');

    // Nobody left in the office: the conversation is over, so the next person to walk
    // in starts on a blank log instead of reading a stranger's backlog. Ids keep
    // counting up, since they are only promised to be unique per server run.
    if (!Object.keys(players).length) messages.length = 0;
  });
});

const PORT = process.env.PORT || (secure ? 3443 : 3100);
const scheme = secure ? 'https' : 'http';

server.listen(PORT, '0.0.0.0', () => {
  console.log(scheme + '://localhost:' + PORT);
  if (!secure) return console.log('(run ./make-cert.sh to let others on your LAN join)');
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('share: ' + scheme + '://' + net.address + ':' + PORT);
      }
    }
  }
});
