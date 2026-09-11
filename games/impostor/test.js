const test = require('node:test');
const assert = require('node:assert');
const M = require('./map');

const PLAYER_R = 16;
const inAny = (x, y) => M.walkable(x, y);

test('every room and corridor is reachable from every other', () => {
  const seen = new Set([0]);
  const q = [0];
  while (q.length) {
    const cur = q.shift();
    for (const n of M.EDGES[cur]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  const stranded = M.RECTS.map((r, i) => [r, i]).filter(([, i]) => !seen.has(i))
    .map(([r]) => r.name || `hall @${r.x},${r.y}`);
  assert.deepStrictEqual(stranded, [], 'these are cut off from the ship');
});

test('every doorway is wide enough to walk through', () => {
  const narrow = [];
  for (let i = 0; i < M.RECTS.length; i++) {
    for (const j of M.EDGES[i]) {
      if (j < i) continue;
      const a = M.RECTS[i], b = M.RECTS[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // One of the two spans is the doorway; the other is how deep the overlap runs.
      if (Math.max(w, h) < PLAYER_R * 2 + 4) {
        narrow.push(`${a.name || 'hall'}@${a.x},${a.y} <-> ${b.name || 'hall'}@${b.x},${b.y} = ${w}x${h}`);
      }
    }
  }
  assert.deepStrictEqual(narrow, [], 'doorways a player cannot fit through');
});

test('everything placed on the map stands on walkable floor', () => {
  const off = [];
  for (const s of M.STATIONS) if (!inAny(s.x, s.y)) off.push('station ' + s.id);
  for (const v of M.VENTS) if (!inAny(v.x, v.y)) off.push('vent ' + v.id);
  if (!inAny(M.EMERGENCY.x, M.EMERGENCY.y)) off.push('emergency button');
  if (!inAny(M.LIGHTS_FIX.x, M.LIGHTS_FIX.y)) off.push('lights panel');
  if (!inAny(M.SPAWN.x, M.SPAWN.y)) off.push('spawn');
  assert.deepStrictEqual(off, [], 'placed outside the walkable area');
});

test('every station and vent sits in the room it claims', () => {
  const byName = new Map(M.ROOMS.map((r) => [r.name, r]));
  const wrong = [];
  for (const s of [...M.STATIONS, ...M.VENTS]) {
    const room = byName.get(s.room);
    if (!room) { wrong.push(`${s.id}: no room named ${s.room}`); continue; }
    if (!M.inRect(room, s.x, s.y)) wrong.push(`${s.id} is not inside ${s.room}`);
  }
  assert.deepStrictEqual(wrong, [], 'mis-placed');
});

// The regression test for bots wedging on corners: a route is only usable if the
// straight line between consecutive waypoints never leaves the floor.
test('routes between every pair of rooms stay on the floor the whole way', () => {
  const bad = [];
  for (const from of M.ROOMS) {
    for (const to of M.ROOMS) {
      if (from === to) continue;
      const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
      const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
      const path = M.routeTo(fx, fy, tx, ty);
      let cx = fx, cy = fy;
      for (const wp of path) {
        const d = Math.hypot(wp.x - cx, wp.y - cy);
        const steps = Math.max(2, Math.ceil(d / 6));
        for (let i = 1; i <= steps; i++) {
          const x = cx + (wp.x - cx) * (i / steps), y = cy + (wp.y - cy) * (i / steps);
          if (!inAny(x, y)) { bad.push(`${from.name} -> ${to.name} leaves the floor at ${x.toFixed(0)},${y.toFixed(0)}`); i = steps; }
        }
        cx = wp.x; cy = wp.y;
      }
    }
  }
  assert.deepStrictEqual(bad.slice(0, 8), [], `${bad.length} broken routes`);
});

test('routes reach every station from the spawn point', () => {
  const bad = [];
  for (const s of M.STATIONS) {
    const path = M.routeTo(M.SPAWN.x, M.SPAWN.y, s.x, s.y);
    const last = path[path.length - 1];
    if (Math.hypot(last.x - s.x, last.y - s.y) > 0.001) bad.push(s.id);
  }
  assert.deepStrictEqual(bad, [], 'stations a bot can never walk to');
});

test('vent networks have at least two vents each and no stray ids', () => {
  const nets = new Map();
  for (const v of M.VENTS) nets.set(v.net, (nets.get(v.net) || 0) + 1);
  const lonely = [...nets.entries()].filter(([, n]) => n < 2).map(([k]) => k);
  assert.deepStrictEqual(lonely, [], 'vent networks with nothing to travel to');
  assert.strictEqual(new Set(M.VENTS.map((v) => v.id)).size, M.VENTS.length, 'duplicate vent ids');
});

test('the map fits inside its declared bounds', () => {
  const out = M.RECTS.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > M.W || r.y + r.h > M.H)
    .map((r) => r.name || `hall @${r.x},${r.y}`);
  assert.deepStrictEqual(out, [], 'sticks out of the world');
});
