// Draws the OFFICE data as one SVG. Loaded into an <img> and blitted once per frame,
// so this runs a single time at startup. Browser only.

const FACING = { up: 0, right: 90, down: 180, left: 270 };

function chair(f) {
  const p = PALETTE;
  return `<g transform="translate(${f.x},${f.y}) rotate(${FACING[f.dir] || 0})">
    <rect x="-17" y="-17" width="34" height="34" rx="8" fill="${p.chair}"/>
    <rect x="-19" y="9" width="38" height="12" rx="5" fill="${p.chairBack}"/>
    <rect x="-13" y="-13" width="26" height="26" rx="6" fill="#636d8a" opacity="0.5"/>
  </g>`;
}

function desk(f) {
  const p = PALETTE;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const screen = f.screen
    ? `<rect x="${cx - 26}" y="${cy - 16}" width="52" height="30" rx="3" fill="${p.screen}"/>
       <rect x="${cx - 22}" y="${cy - 12}" width="44" height="22" rx="2" fill="#3d6a86"/>
       <rect x="${cx - 8}" y="${cy + 14}" width="16" height="4" fill="${p.screen}"/>`
    : '';
  return `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="10" fill="${p.desk}"/>
    <rect x="${f.x + 4}" y="${f.y + 4}" width="${f.w - 8}" height="${f.h - 12}" rx="7" fill="${p.deskTop}"/>
    ${screen}`;
}

function sofa(f) {
  const p = PALETTE;
  return `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" fill="${p.sofa}"/>
    <rect x="${f.x + 10}" y="${f.y + 14}" width="${f.w / 2 - 16}" height="${f.h - 24}" rx="9" fill="#7d6382"/>
    <rect x="${f.x + f.w / 2 + 6}" y="${f.y + 14}" width="${f.w / 2 - 16}" height="${f.h - 24}" rx="9" fill="#7d6382"/>`;
}

function plant(f) {
  const p = PALETTE;
  return `<path d="M${f.x - 13} ${f.y + 4} L${f.x + 13} ${f.y + 4} L${f.x + 9} ${f.y + 20} L${f.x - 9} ${f.y + 20} Z" fill="${p.plantPot}"/>
    <circle cx="${f.x}" cy="${f.y - 10}" r="14" fill="${p.plant}"/>
    <circle cx="${f.x - 11}" cy="${f.y + 1}" r="10" fill="#468050"/>
    <circle cx="${f.x + 11}" cy="${f.y + 1}" r="10" fill="#59976a"/>`;
}

const SHAPES = {
  chair,
  desk,
  sofa,
  plant,

  rug: (f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="12" fill="${PALETTE.rug}"/>
    <rect x="${f.x + 12}" y="${f.y + 12}" width="${f.w - 24}" height="${f.h - 24}" rx="8" fill="none" stroke="#5b6280" stroke-width="3"/>`,

  round: (f) => `<circle cx="${f.x}" cy="${f.y}" r="${f.r}" fill="${PALETTE.table}"/>
    <circle cx="${f.x}" cy="${f.y}" r="${f.r - 6}" fill="${PALETTE.deskTop}"/>`,

  counter: (f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" fill="${PALETTE.counter}"/>
    <rect x="${f.x}" y="${f.y}" width="${f.w}" height="10" rx="4" fill="#98a1b8"/>`,

  coffee: (f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="5" fill="#2f3546"/>
    <circle cx="${f.x + f.w / 2}" cy="${f.y + f.h / 2}" r="9" fill="#c98a4b"/>`,

  bookshelf: (f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="4" fill="#6b5340"/>
    ${[0.25, 0.5, 0.75].map((t) =>
      `<rect x="${f.x + 3}" y="${f.y + f.h * t}" width="${f.w - 6}" height="5" fill="#8a6b4f"/>`).join('')}
    ${[0.06, 0.31, 0.56, 0.81].map((t) =>
      `<rect x="${f.x + 6}" y="${f.y + f.h * t + 6}" width="${f.w - 12}" height="${f.h * 0.16}" fill="#7d8bb0" opacity="0.7"/>`).join('')}`,

  whiteboard: (f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="3" fill="#dfe4ee"/>`,

  pingpong: (f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" fill="#2f6b4f"/>
    <rect x="${f.x + 6}" y="${f.y + 6}" width="${f.w - 12}" height="${f.h - 12}" rx="4" fill="none" stroke="#d8e2dc" stroke-width="3"/>
    <rect x="${f.x + f.w / 2 - 2}" y="${f.y}" width="4" height="${f.h}" fill="#d8e2dc"/>`,
};

function officeSvg() {
  const p = PALETTE;
  const { width, height } = OFFICE;

  const rooms = OFFICE.rooms
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.tint}"/>`)
    .join('');

  // Rugs sit under everything else so furniture reads as standing on them.
  const under = OFFICE.furniture.filter((f) => f.type === 'rug');
  const over = OFFICE.furniture.filter((f) => f.type !== 'rug');
  const draw = (list) => list.map((f) => (SHAPES[f.type] || (() => ''))(f)).join('');

  const walls = [
    ...OFFICE.rooms.flatMap(roomWalls),
    [0, 0, width, SHELL],
    [0, height - SHELL, width, SHELL],
    [0, 0, SHELL, height],
    [width - SHELL, 0, SHELL, height],
  ]
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${p.wall}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${Math.min(6, h)}" fill="${p.wallTop}"/>`)
    .join('');

  const labels = OFFICE.rooms
    .map((r) => `<text x="${r.x + r.w / 2}" y="${r.y + r.h - 18}" fill="${p.label}"
      font-family="sans-serif" font-size="20" font-weight="600" letter-spacing="2"
      text-anchor="middle" opacity="0.55">${r.name.toUpperCase()}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <pattern id="tile" width="80" height="80" patternUnits="userSpaceOnUse">
        <rect width="80" height="80" fill="${p.floor}"/>
        <path d="M80 0V80M0 80H80" stroke="${p.grout}" stroke-width="2"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#tile)"/>
    ${rooms}${draw(under)}${draw(over)}${walls}${labels}
  </svg>`;
}

function officeSvgUrl() {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(officeSvg());
}

Object.assign(globalThis, { officeSvg, officeSvgUrl });
