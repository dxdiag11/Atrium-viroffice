/* ============================================================
   PENYUSUP — the ship. Kept in its own module because both the
   server and test.js need it: the walkable area is the union of
   these rectangles, and every route in the game is derived from
   where they overlap.
   ============================================================ */

const W = 2200, H = 1300;

// style drives what the client draws inside the room; accent tints it.
const ROOMS = [
  { name: 'Reaktor',     x: 70,   y: 70,   w: 260, h: 200, style: 'reactor', accent: '#ff7a3d' },
  { name: 'Mesin Atas',  x: 70,   y: 350,  w: 240, h: 190, style: 'engine',  accent: '#ffb443' },
  { name: 'Medbay',      x: 380,  y: 350,  w: 260, h: 200, style: 'med',     accent: '#4fd6c4' },
  { name: 'Keamanan',    x: 380,  y: 620,  w: 210, h: 190, style: 'security',accent: '#6f8dff' },
  { name: 'Mesin Bawah', x: 70,   y: 900,  w: 240, h: 190, style: 'engine',  accent: '#ffb443' },
  { name: 'Kelistrikan', x: 380,  y: 900,  w: 250, h: 200, style: 'power',   accent: '#ffd83d' },
  { name: 'Gudang',      x: 700,  y: 950,  w: 280, h: 240, style: 'storage', accent: '#c08a5a' },
  { name: 'Kafetaria',   x: 760,  y: 70,   w: 380, h: 280, style: 'social',  accent: '#7ee0a0' },
  { name: 'Admin',       x: 820,  y: 560,  w: 250, h: 180, style: 'command', accent: '#8ab4ff' },
  { name: 'Komunikasi',  x: 1120, y: 950,  w: 240, h: 200, style: 'comms',   accent: '#59c8e8' },
  { name: 'Perisai',     x: 1440, y: 950,  w: 250, h: 200, style: 'shield',  accent: '#7be3ff' },
  { name: 'O2',          x: 1180, y: 380,  w: 200, h: 170, style: 'o2',      accent: '#9be8a8' },
  { name: 'Senjata',     x: 1480, y: 120,  w: 250, h: 200, style: 'weapons', accent: '#ff6d7a' },
  { name: 'Navigasi',    x: 1900, y: 560,  w: 230, h: 200, style: 'command', accent: '#8ab4ff' },
  { name: 'Lab',         x: 1900, y: 120,  w: 230, h: 190, style: 'lab',     accent: '#c58bff' },
];

// Corridors. Each overlaps what it joins by ~40px, which is both the doorway a player
// walks through and the waypoint bots route by. Branches and loops are deliberate:
// there is more than one way round the ship, plus three dead ends (O2, Navigasi, Lab).
const HALLS = [
  { x: 290,  y: 150,  w: 510, h: 72 },   // Reaktor     - Kafetaria
  { x: 140,  y: 230,  w: 72,  h: 160 },  // Reaktor     - Mesin Atas
  { x: 270,  y: 410,  w: 150, h: 72 },   // Mesin Atas  - Medbay
  { x: 110,  y: 500,  w: 72,  h: 440 },  // Mesin Atas  - Mesin Bawah
  { x: 270,  y: 960,  w: 150, h: 72 },   // Mesin Bawah - Kelistrikan
  { x: 590,  y: 1000, w: 150, h: 72 },   // Kelistrikan - Gudang
  { x: 940,  y: 1010, w: 220, h: 72 },   // Gudang      - Komunikasi
  { x: 1320, y: 1010, w: 160, h: 72 },   // Komunikasi  - Perisai
  { x: 1560, y: 700,  w: 72,  h: 290 },  // Perisai     - (right trunk)
  { x: 1560, y: 700,  w: 380, h: 72 },   // (right trunk elbow)
  { x: 1690, y: 190,  w: 250, h: 72 },   // Senjata     - (right trunk)
  { x: 1868, y: 190,  w: 72,  h: 590 },  // right trunk: Lab / Navigasi hang off it
  { x: 1100, y: 180,  w: 420, h: 72 },   // Kafetaria   - Senjata
  { x: 1240, y: 200,  w: 72,  h: 220 },  // (spur down to O2)
  { x: 900,  y: 310,  w: 72,  h: 290 },  // Kafetaria   - Admin
  { x: 860,  y: 700,  w: 72,  h: 290 },  // Admin       - Gudang
  { x: 1030, y: 660,  w: 230, h: 72 },   // Admin       - (elbow)
  { x: 1188, y: 660,  w: 72,  h: 330 },  // (elbow)     - Komunikasi
  { x: 440,  y: 510,  w: 72,  h: 150 },  // Medbay      - Keamanan
  { x: 600,  y: 400,  w: 180, h: 72 },   // Medbay      - (elbow)
  { x: 700,  y: 310,  w: 100, h: 160 },  // (elbow)     - Kafetaria
  { x: 440,  y: 770,  w: 72,  h: 170 },  // Keamanan    - Kelistrikan
];

const STATIONS = [
  { id: 'reactor', name: 'Mulai ulang reaktor',  room: 'Reaktor',     x: 170,  y: 170,  kind: 'sequence' },
  { id: 'upper',   name: 'Isi bahan bakar mesin', room: 'Mesin Atas',  x: 170,  y: 440,  kind: 'hold' },
  { id: 'medbay',  name: 'Pindai tubuh',          room: 'Medbay',      x: 560,  y: 450,  kind: 'hold' },
  { id: 'security',name: 'Periksa rekaman',       room: 'Keamanan',    x: 480,  y: 700,  kind: 'wires' },
  { id: 'lower',   name: 'Bersihkan turbin',      room: 'Mesin Bawah', x: 170,  y: 990,  kind: 'hold' },
  { id: 'elec',    name: 'Sambung kabel',         room: 'Kelistrikan', x: 560,  y: 990,  kind: 'wires' },
  { id: 'storage', name: 'Susun muatan',          room: 'Gudang',      x: 830,  y: 1100, kind: 'hold' },
  { id: 'cafe',    name: 'Buang sampah',          room: 'Kafetaria',   x: 850,  y: 270,  kind: 'hold' },
  { id: 'admin',   name: 'Gesek kartu',           room: 'Admin',       x: 990,  y: 640,  kind: 'wires' },
  { id: 'comms',   name: 'Unduh data',            room: 'Komunikasi',  x: 1290, y: 1080, kind: 'hold' },
  { id: 'shields', name: 'Aktifkan perisai',      room: 'Perisai',     x: 1600, y: 1080, kind: 'sequence' },
  { id: 'o2',      name: 'Bersihkan filter O2',   room: 'O2',          x: 1330, y: 480,  kind: 'sequence' },
  { id: 'weapons', name: 'Kalibrasi senjata',     room: 'Senjata',     x: 1570, y: 270,  kind: 'sequence' },
  { id: 'nav',     name: 'Atur jalur',            room: 'Navigasi',    x: 2050, y: 660,  kind: 'wires' },
  { id: 'lab',     name: 'Analisa sampel',        room: 'Lab',         x: 2050, y: 250,  kind: 'wires' },
];

// Impostor-only shortcuts. Each network is a set of vents you can travel between.
const VENTS = [
  { id: 'v1',  net: 'kiri',   room: 'Reaktor',     x: 285, y: 235 },
  { id: 'v2',  net: 'kiri',   room: 'Mesin Atas',  x: 255, y: 500 },
  { id: 'v3',  net: 'kiri',   room: 'Mesin Bawah', x: 255, y: 950 },
  { id: 'v4',  net: 'bawah',  room: 'Kelistrikan', x: 600, y: 1060 },
  { id: 'v5',  net: 'bawah',  room: 'Gudang',      x: 930, y: 1150 },
  { id: 'v6',  net: 'bawah',  room: 'Komunikasi',  x: 1150, y: 1110 },
  { id: 'v7',  net: 'tengah', room: 'Kafetaria',   x: 790, y: 320 },
  { id: 'v8',  net: 'tengah', room: 'Admin',       x: 850, y: 590 },
  { id: 'v9',  net: 'kanan',  room: 'Senjata',     x: 1510, y: 300 },
  { id: 'v10', net: 'kanan',  room: 'Navigasi',    x: 1935, y: 730 },
];

const EMERGENCY = { x: 1050, y: 150 };   // Kafetaria
const LIGHTS_FIX = { x: 440, y: 1040 };  // Kelistrikan
const SPAWN = { x: 950, y: 210 };        // Kafetaria

const RECTS = [...ROOMS, ...HALLS];
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const walkable = (x, y) => RECTS.some((r) => inRect(r, x, y));

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function overlapCenter(a, b) {
  const x1 = Math.max(a.x, b.x), x2 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y, b.y), y2 = Math.min(a.y + a.h, b.y + b.h);
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

const NODES = RECTS.map((r) => ({ r, x: r.x + r.w / 2, y: r.y + r.h / 2 }));
const EDGES = NODES.map(() => []);
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    if (overlaps(NODES[i].r, NODES[j].r)) { EDGES[i].push(j); EDGES[j].push(i); }
  }
}
const nodeAt = (x, y) => NODES.findIndex((n) => inRect(n.r, x, y));

// Waypoints are doorway centres, never room centres: both ends of every segment then
// sit inside one convex rectangle, so the straight line between them cannot clip a
// corner and wedge whoever is walking it. test.js checks this for every pair of rooms.
function routeTo(fromX, fromY, toX, toY) {
  const s = nodeAt(fromX, fromY), t = nodeAt(toX, toY);
  if (s < 0 || t < 0 || s === t) return [{ x: toX, y: toY }];
  const prev = new Map([[s, -1]]);
  const q = [s];
  while (q.length) {
    const cur = q.shift();
    if (cur === t) break;
    for (const nx of EDGES[cur]) if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); }
  }
  if (!prev.has(t)) return [{ x: toX, y: toY }];
  const idx = [];
  for (let cur = t; cur !== -1; cur = prev.get(cur)) idx.unshift(cur);
  const path = [];
  for (let i = 0; i + 1 < idx.length; i++) path.push(overlapCenter(NODES[idx[i]].r, NODES[idx[i + 1]].r));
  path.push({ x: toX, y: toY });
  return path;
}

module.exports = {
  W, H, ROOMS, HALLS, RECTS, STATIONS, VENTS, EMERGENCY, LIGHTS_FIX, SPAWN,
  NODES, EDGES, inRect, walkable, overlaps, overlapCenter, nodeAt, routeTo,
};
