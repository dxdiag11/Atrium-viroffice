// Click-to-move: a route around the rock, not a straight line into it.
//
// The cave floor is a set of walkable polygons with desks punched out of it, so "walk to
// where I clicked" is a search rather than a vector. The search runs on a coarse grid
// sampled with the same canMove() the keyboard uses, so both ways of moving agree about
// what counts as floor, and the result is pulled back into straight runs before anyone
// walks it -- a route that visibly steps around a grid is the tell that nobody is really
// walking.

const PATH_CELL = 12;  // px per search cell: under the avatar, over a per-pixel search
const PATH_SNAP = 72;  // px: how far from a click on rock to go looking for floor

const DIAGONAL = Math.SQRT2;
const PATH_STEPS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAGONAL], [1, -1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL],
];

function buildPathGrid(map, r) {
  const cols = Math.ceil(map.width / PATH_CELL);
  const rows = Math.ceil(map.height / PATH_CELL);
  const open = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * PATH_CELL + PATH_CELL / 2;
      const y = cy * PATH_CELL + PATH_CELL / 2;
      if (canMove(x, y, r, map.collisions)) open[cy * cols + cx] = 1;
    }
  }
  return { cols, rows, open };
}

// canTraverse samples every r px, which is coarse enough to step clean over a sliver of
// wall that someone walking it pixel by pixel would walk into. A leg is only worth
// planning if it is clear at the resolution it will actually be walked, so check it
// finer than any single frame of movement can cover.
function clearRun(from, to, r, collisions) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!canMove(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, r, collisions)) return false;
  }
  return true;
}

const cellCenter = (grid, i) => ({
  x: (i % grid.cols) * PATH_CELL + PATH_CELL / 2,
  y: Math.floor(i / grid.cols) * PATH_CELL + PATH_CELL / 2,
});

// The nearest cell you could stand in. Clicking a desk, a wall or the river should still
// walk you as close as that spot gets, which is what everyone means by clicking there.
function snapToFloor(grid, x, y) {
  const startX = Math.floor(x / PATH_CELL);
  const startY = Math.floor(y / PATH_CELL);
  for (let ring = 0; ring * PATH_CELL <= PATH_SNAP; ring++) {
    let best = -1;
    let bestDist = Infinity;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = startX + dx;
        const cy = startY + dy;
        if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) continue;
        const i = cy * grid.cols + cx;
        if (!grid.open[i]) continue;
        const c = cellCenter(grid, i);
        const dist = Math.hypot(c.x - x, c.y - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function heapPush(heap, idx, key) {
  heap.push({ idx, key });
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].key <= heap[i].key) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let small = i;
      if (left < heap.length && heap[left].key < heap[small].key) small = left;
      if (right < heap.length && heap[right].key < heap[small].key) small = right;
      if (small === i) break;
      [heap[small], heap[i]] = [heap[i], heap[small]];
      i = small;
    }
  }
  return top.idx;
}

const octile = (ax, ay, bx, by) => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy - (2 - DIAGONAL) * Math.min(dx, dy);
};

function searchGrid(grid, startIdx, goalIdx) {
  const { cols, rows, open } = grid;
  const score = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const settled = new Uint8Array(cols * rows);
  const goalX = goalIdx % cols;
  const goalY = Math.floor(goalIdx / cols);
  const heap = [];

  score[startIdx] = 0;
  heapPush(heap, startIdx, octile(startIdx % cols, Math.floor(startIdx / cols), goalX, goalY));

  while (heap.length) {
    const current = heapPop(heap);
    if (current === goalIdx) return cameFrom;
    if (settled[current]) continue;
    settled[current] = 1;

    const cx = current % cols;
    const cy = Math.floor(current / cols);
    for (const [dx, dy, cost] of PATH_STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (!open[next] || settled[next]) continue;
      // Cutting the corner would clip whatever the two cells are diagonal around.
      if (dx && dy && (!open[cy * cols + nx] || !open[ny * cols + cx])) continue;
      const stepped = score[current] + cost;
      if (stepped >= score[next]) continue;
      score[next] = stepped;
      cameFrom[next] = current;
      heapPush(heap, next, stepped + octile(nx, ny, goalX, goalY));
    }
  }
  return null;
}

// Drop every waypoint you can already see past. What the grid produces is a staircase;
// what a person walks is the diagonal across it.
function straighten(points, r, collisions) {
  if (points.length < 3) return points.slice(1);
  const out = [];
  let anchor = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    if (clearRun(anchor, points[i + 1], r, collisions)) continue;
    out.push(points[i]);
    anchor = points[i];
  }
  out.push(points[points.length - 1]);
  return out;
}

// Grids are per map and per avatar size, and both are fixed for a session, so the one
// pass over the floor is paid once rather than on every click.
let cachedGrid = null;

function pathGrid(map, r) {
  if (!cachedGrid || cachedGrid.map !== map || cachedGrid.r !== r) {
    cachedGrid = { map, r, grid: buildPathGrid(map, r) };
  }
  return cachedGrid.grid;
}

// Waypoints from `from` to `to`, excluding `from` itself. Null when there is no way
// across -- the far side of the river with no bridge in between.
function routeTo(map, r, from, to) {
  const grid = pathGrid(map, r);
  const exact = canMove(to.x, to.y, r, map.collisions);
  const goalIdx = snapToFloor(grid, to.x, to.y);
  if (goalIdx < 0) return null;
  const goal = exact ? { x: to.x, y: to.y } : cellCenter(grid, goalIdx);

  if (clearRun(from, goal, r, map.collisions)) return [goal];

  const startIdx = snapToFloor(grid, from.x, from.y);
  if (startIdx < 0) return null;
  const cameFrom = searchGrid(grid, startIdx, goalIdx);
  if (!cameFrom) return null;

  const cells = [];
  for (let i = goalIdx; i !== -1 && i !== startIdx; i = cameFrom[i]) cells.push(i);
  cells.reverse();

  const points = [{ x: from.x, y: from.y }, cellCenter(grid, startIdx), ...cells.map((i) => cellCenter(grid, i))];
  if (exact) points.push(goal);
  return straighten(points, r, map.collisions);
}

Object.assign(globalThis, { PATH_CELL, buildPathGrid, clearRun, snapToFloor, straighten, routeTo });
