const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const { Server } = require('socket.io');

require('./public/office.js');
require('./public/chat-core.js');
const map = buildOffice(); // walls, spawn and seats all come from the one office model

const app = express();
app.use(express.static(__dirname + '/public'));

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

const COLORS = ['#e0533f', '#3f8ee0', '#3fbf6f', '#d8a13a', '#a55fd0', '#3fc4c4', '#e06fa8', '#7a8ff0'];
const players = {};
let colorIndex = 0;

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
const messages = [];
const buckets = {}; // socket id -> rate limiter
let msgSeq = 0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
    ...fields,
  };
}

function remember(msg) {
  messages.push(msg);
  if (messages.length > HISTORY_MAX) messages.shift();
}

// A warning only the sender sees: never throw and never disconnect over chat input.
function warn(socket, text) {
  socket.emit('chat', makeMessage({ scope: 'system', text }));
}

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players[socket.id]) return;
    const raw = String((payload && payload.name) || 'anon').slice(0, 16);
    const name = uniqueName(raw, Object.values(players).map((p) => p.name));
    buckets[socket.id] = makeBucket(CHAT_LIMIT[0], CHAT_LIMIT[1]);
    players[socket.id] = {
      id: socket.id,
      name,
      color: COLORS[colorIndex++ % COLORS.length],
      x: clamp(map.spawn.x + (Math.random() - 0.5) * 120, 0, map.width),
      y: clamp(map.spawn.y + (Math.random() - 0.5) * 120, 0, map.height),
      seat: null,
    };
    socket.emit('players', players, socket.id, radio);
    socket.emit('chat-history', messages);
    socket.broadcast.emit('player-joined', players[socket.id]);
  });

  socket.on('chat', (payload) => {
    const me = players[socket.id];
    if (!me) return; // not joined yet: no name, no colour, nothing to attribute
    const text = normalizeText(payload && payload.text);
    if (!text) return;
    if (!buckets[socket.id].take(Date.now())) {
      return warn(socket, 'Terlalu cepat. Tunggu sebentar.');
    }

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

  socket.on('move', (pos) => {
    const p = players[socket.id];
    if (!p || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (p.seat !== null) return; // seated players are parked on their chair
    p.x = clamp(pos.x, 0, map.width);
    p.y = clamp(pos.y, 0, map.height);
    socket.broadcast.emit('player-moved', { id: socket.id, x: p.x, y: p.y });
  });

  // The server owns who is sitting where: two people clicking the same chair at the
  // same time both reach here, and only the first one gets it.
  const seatTaken = (i) => Object.values(players).some((q) => q.seat === i);

  socket.on('sit', (i) => {
    const p = players[socket.id];
    if (!p || p.seat !== null) return;
    if (!Number.isInteger(i) || i < 0 || i >= map.seats.length) return;
    if (seatTaken(i)) return socket.emit('seat-denied', i);

    p.seat = i;
    p.x = map.seats[i].x;
    p.y = map.seats[i].y;
    io.emit('player-seat', { id: socket.id, seat: i, x: p.x, y: p.y });
  });

  socket.on('stand', (pos) => {
    const p = players[socket.id];
    if (!p || p.seat === null) return;
    p.seat = null;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      p.x = clamp(pos.x, 0, map.width);
      p.y = clamp(pos.y, 0, map.height);
    }
    io.emit('player-seat', { id: socket.id, seat: null, x: p.x, y: p.y });
  });

  socket.on('ptt-down', () => {
    if (!players[socket.id]) return;
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
    if (!players[socket.id]) return;
    delete players[socket.id];
    io.emit('player-left', socket.id);
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
