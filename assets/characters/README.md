# Character Asset Contract

`male-001` establishes the production layout. Every future variant has its own folder
and must ultimately contain the following two files:

| File | Canvas | Grid | Purpose |
| --- | --- | --- | --- |
| `move.png` | 1448 x 1086 px | 4 columns x 3 rows | standing / walking frames |
| `sit-talk.png` | 1448 x 1086 px | 4 columns x 3 rows | seated / talking frames |

Each cell is 362 x 362 px. Export as an RGBA PNG with a genuinely transparent
background (no checkerboard pattern baked into the pixels). Keep the character centred
and at the same apparent scale in every cell. The prompt pack in each planned variant
folder defines the character and both required sheets.

The visual contract is: warm, polished chibi 2D illustration; dark clean outlines;
soft cel shading; front and three-quarter side views; a compact, readable full-body
silhouette; modern adult office clothing. Palette accents must harmonize with the
limestone, teak, charcoal, emerald, amber, and teal cave-office map.

## Direction and frame convention

For both sheets: rows are down/front, left, right. Columns are: neutral/idle,
gesture or left-step, mid-motion, gesture or right-step. The generated sheet must have
no labels, borders, grid lines, background, cast shadows, logos, or text.

`male-001` already supplies its image files. The other folders intentionally contain
prompts only until their generated PNGs are reviewed and placed alongside them.

## Exception: `male-006`

`male-006` is not a selectable character and is not in `public/characters.js`. It is the
Recreation booth DJ, so it ships `move.png` only and does not follow the grid above: its
sheet is 5 columns x 3 rows on the same 1448 x 1086 canvas, with uneven cells, because
four of its poses hold a DJ controller wider than the body. `public/dj-npc.js` addresses
those four cells by the transparent gutters between them rather than by division, and
`test.js` re-derives the geometry from the PNG. Re-exporting this sheet will fail that
test unless the poses land in the same places.
