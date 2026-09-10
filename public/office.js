// The Atrium floor plan, as data. Everything else is derived from this: the SVG that gets drawn,
// the walls you bump into, and the chairs you can sit on. Edit here, not in two places.

const WALL = 20;      // interior partition thickness
const SHELL = 24;     // outer building wall thickness

const PALETTE = {
  floor: '#3b4152',
  grout: '#353b4a',
  shell: '#5c6580',
  wall: '#525b73',
  wallTop: '#69738f',
  desk: '#8a6b4f',
  deskTop: '#a07f5e',
  screen: '#2b3040',
  chair: '#59627d',
  chairBack: '#464e66',
  sofa: '#6b5470',
  counter: '#7a8296',
  rug: '#4a5068',
  plantPot: '#8a5a44',
  plant: '#4f8a5c',
  table: '#8a6b4f',
  label: '#aeb6cc',
};

const OFFICE = {
  width: 2000,
  height: 1400,
  spawn: { x: 620, y: 470 },

  rooms: [
    { name: 'Reception', x: 24, y: 24, w: 460, h: 400, tint: '#434a5e',
      doors: { east: [250, 350] } },
    { name: 'Board Room', x: 760, y: 24, w: 620, h: 400, tint: '#464e63',
      doors: { south: [1020, 1120] } },
    { name: 'Booth 1', x: 1660, y: 24, w: 316, h: 190, tint: '#414859',
      doors: { west: [110, 180] } },
    { name: 'Booth 2', x: 1660, y: 234, w: 316, h: 190, tint: '#414859',
      doors: { west: [320, 390] } },
    { name: 'Focus Room', x: 24, y: 560, w: 460, h: 440, tint: '#3f4759',
      doors: { east: [760, 860] } },
    { name: 'Pantry', x: 1400, y: 980, w: 576, h: 396, tint: '#474f60',
      doors: { north: [1600, 1700], west: [1150, 1250] } },
  ],

  furniture: [
    // --- Reception ---
    { type: 'rug', x: 70, y: 55, w: 250, h: 110 },
    { type: 'sofa', x: 90, y: 70, w: 210, h: 70 },
    { type: 'desk', x: 120, y: 240, w: 280, h: 64, screen: true },
    { type: 'chair', x: 260, y: 190, dir: 'down' },
    { type: 'plant', x: 430, y: 90 },
    { type: 'plant', x: 430, y: 380 },

    // --- Board Room ---
    { type: 'whiteboard', x: 940, y: 34, w: 260, h: 14 },
    { type: 'desk', x: 880, y: 150, w: 380, h: 140 },
    { type: 'chair', x: 950, y: 115, dir: 'down' },
    { type: 'chair', x: 1070, y: 115, dir: 'down' },
    { type: 'chair', x: 1190, y: 115, dir: 'down' },
    { type: 'chair', x: 950, y: 325, dir: 'up' },
    { type: 'chair', x: 1070, y: 325, dir: 'up' },
    { type: 'chair', x: 1190, y: 325, dir: 'up' },
    { type: 'chair', x: 845, y: 220, dir: 'right' },
    { type: 'chair', x: 1295, y: 220, dir: 'left' },
    { type: 'plant', x: 1330, y: 370 },

    // --- Phone booths ---
    { type: 'desk', x: 1700, y: 90, w: 150, h: 50, screen: true },
    { type: 'chair', x: 1775, y: 165, dir: 'up' },
    { type: 'desk', x: 1700, y: 300, w: 150, h: 50, screen: true },
    { type: 'chair', x: 1775, y: 375, dir: 'up' },

    // --- Focus Room ---
    { type: 'bookshelf', x: 40, y: 620, w: 44, h: 220 },
    { type: 'rug', x: 140, y: 640, w: 260, h: 200 },
    { type: 'round', x: 268, y: 740, r: 42 },
    { type: 'chair', x: 180, y: 740, dir: 'right' },
    { type: 'chair', x: 356, y: 740, dir: 'left' },
    { type: 'plant', x: 430, y: 950 },

    // --- Open workspace: four pods, two desks back to back each ---
    ...pod(660, 580), ...pod(1060, 580), ...pod(660, 840), ...pod(1060, 840),
    { type: 'plant', x: 980, y: 520 },
    { type: 'plant', x: 980, y: 1000 },

    // --- Collab corner: soft seating between the pods and the east wall ---
    { type: 'rug', x: 1430, y: 540, w: 340, h: 300 },
    { type: 'round', x: 1600, y: 690, r: 60 },
    { type: 'chair', x: 1600, y: 598, dir: 'down' },
    { type: 'chair', x: 1600, y: 782, dir: 'up' },
    { type: 'chair', x: 1508, y: 690, dir: 'right' },
    { type: 'chair', x: 1692, y: 690, dir: 'left' },
    { type: 'bookshelf', x: 1898, y: 500, w: 54, h: 220 },
    { type: 'counter', x: 1420, y: 44, w: 200, h: 50 },
    { type: 'plant', x: 1660, y: 480 },
    { type: 'plant', x: 1450, y: 910 },

    // --- Lounge (bottom left, open plan) ---
    { type: 'rug', x: 200, y: 1100, w: 420, h: 250 },
    { type: 'sofa', x: 240, y: 1120, w: 240, h: 80 },
    { type: 'sofa', x: 240, y: 1265, w: 240, h: 80 },
    { type: 'round', x: 540, y: 1225, r: 50 },
    { type: 'pingpong', x: 800, y: 1130, w: 300, h: 170 },
    { type: 'plant', x: 700, y: 1330 },
    { type: 'plant', x: 1200, y: 1110 },

    // --- Pantry ---
    { type: 'counter', x: 1420, y: 1010, w: 500, h: 58 },
    { type: 'coffee', x: 1450, y: 1016, w: 46, h: 46 },
    { type: 'round', x: 1560, y: 1200, r: 66 },
    { type: 'chair', x: 1560, y: 1110, dir: 'down' },
    { type: 'chair', x: 1470, y: 1240, dir: 'right' },
    { type: 'chair', x: 1650, y: 1240, dir: 'left' },
    { type: 'round', x: 1850, y: 1200, r: 56 },
    { type: 'chair', x: 1850, y: 1120, dir: 'down' },
    { type: 'chair', x: 1850, y: 1285, dir: 'up' },
    { type: 'plant', x: 1935, y: 1030 },
  ],
};

// Two desks back to back with a chair on each side: the standard office pod.
function pod(x, y) {
  return [
    { type: 'desk', x, y, w: 200, h: 70, screen: true },
    { type: 'desk', x, y: y + 80, w: 200, h: 70, screen: true },
    { type: 'chair', x: x + 50, y: y - 36, dir: 'down' },
    { type: 'chair', x: x + 150, y: y - 36, dir: 'down' },
    { type: 'chair', x: x + 50, y: y + 186, dir: 'up' },
    { type: 'chair', x: x + 150, y: y + 186, dir: 'up' },
  ];
}

// Furniture you cannot walk through. Chairs and rugs are deliberately absent:
// you walk onto a chair and then sit on it.
const SOLID = {
  desk: (f) => [f.x, f.y, f.w, f.h],
  counter: (f) => [f.x, f.y, f.w, f.h],
  sofa: (f) => [f.x, f.y, f.w, f.h],
  bookshelf: (f) => [f.x, f.y, f.w, f.h],
  pingpong: (f) => [f.x, f.y, f.w, f.h],
  whiteboard: (f) => [f.x, f.y, f.w, f.h],
  coffee: (f) => [f.x, f.y, f.w, f.h],
  round: (f) => [f.x - f.r * 0.8, f.y - f.r * 0.8, f.r * 1.6, f.r * 1.6],
  plant: (f) => [f.x - 18, f.y - 18, 36, 36],
};

// A wall run minus its doorway.
function segments(from, to, gap) {
  if (!gap) return [[from, to]];
  const parts = [];
  if (gap[0] > from) parts.push([from, gap[0]]);
  if (gap[1] < to) parts.push([gap[1], to]);
  return parts;
}

function roomWalls(room) {
  const { x, y, w, h } = room;
  const d = room.doors || {};
  const out = [];
  for (const [a, b] of segments(x, x + w, d.north)) out.push([a, y, b - a, WALL]);
  for (const [a, b] of segments(x, x + w, d.south)) out.push([a, y + h - WALL, b - a, WALL]);
  for (const [a, b] of segments(y, y + h, d.west)) out.push([x, a, WALL, b - a]);
  for (const [a, b] of segments(y, y + h, d.east)) out.push([x + w - WALL, a, WALL, b - a]);
  return out;
}

// The shape the rest of the app consumes: same fields the old map.json had, plus seats.
function buildOffice() {
  const { width, height, spawn } = OFFICE;
  const collisions = [
    [0, 0, width, SHELL],
    [0, height - SHELL, width, SHELL],
    [0, 0, SHELL, height],
    [width - SHELL, 0, SHELL, height],
  ];

  for (const room of OFFICE.rooms) collisions.push(...roomWalls(room));
  for (const f of OFFICE.furniture) {
    const box = SOLID[f.type];
    if (box) collisions.push(box(f));
  }

  const seats = OFFICE.furniture
    .filter((f) => f.type === 'chair')
    .map((f) => ({ x: f.x, y: f.y, dir: f.dir }));

  return { width, height, spawn, collisions, seats };
}

Object.assign(globalThis, { OFFICE, WALL, SHELL, PALETTE, buildOffice, roomWalls });
