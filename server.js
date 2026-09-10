const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const { Server } = require('socket.io');

require('./public/geom.js');
require('./public/characters.js');
require('./public/office.js');
const map = buildOffice(); // walls, spawn and seats all come from the one office model

const app = express();
app.use(express.static(__dirname + '/public'));
app.use('/assets/maps', express.static(__dirname + '/assets/maps', { maxAge: '1h' }));
app.use('/assets/characters', express.static(__dirname + '/assets/characters', { maxAge: '1h' }));

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

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players[socket.id]) return;
    const name = String((payload && payload.name) || 'anon').slice(0, 16);
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
      x: spawn.x,
      y: spawn.y,
      seat: null,
    };
    socket.emit('players', players, socket.id, radio);
    socket.broadcast.emit('player-joined', players[socket.id]);
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
