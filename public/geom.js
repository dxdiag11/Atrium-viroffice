// Shared pure math: used by the browser (script tag) and by test.js (require).
const NEAR = 80;   // px: full volume within this distance
const FAR = 350;   // px: silent at or beyond this distance
const RADIUS = 8; // foot collision half-size in cave artwork pixels
const RADIO_LEVEL = 0.5; // fixed volume of a walkie transmission, at any distance

// 1 at NEAR, 0 at FAR, squared rolloff in between.
function falloff(d) {
  if (d <= NEAR) return 1;
  if (d >= FAR) return 0;
  const t = (FAR - d) / (FAR - NEAR);
  return t * t;
}

// How loud a walkie transmission from `distance` away should be. Someone close enough
// to hear directly gets 0: you should not hear the same voice twice, once through the
// air and once over the radio.
function radioGain(distance, transmitting) {
  if (!transmitting) return 0;
  return falloff(distance) > 0 ? 0 : RADIO_LEVEL;
}

// AABB test of the avatar square against a list of [x, y, w, h] wall rects.
function canMove(x, y, r, rects) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (rects.walkable) {
    for (const [ox, oy] of [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]]) {
      if (!rects.walkable.some(poly => pointInPolygon(x + ox, y + oy, poly))) return false;
    }
  }
  for (const [rx, ry, rw, rh] of rects) {
    if (x + r > rx && x - r < rx + rw && y + r > ry && y - r < ry + rh) return false;
  }
  return true;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function canTraverse(from, to, r, rects) {
  if (![from.x,from.y,to.x,to.y].every(Number.isFinite)) return false;
  const distance = Math.hypot(to.x-from.x, to.y-from.y);
  if (distance > 3000) return false;
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, r)));
  for (let i=1; i<=steps; i++) {
    if (!canMove(from.x+(to.x-from.x)*i/steps, from.y+(to.y-from.y)*i/steps, r, rects)) return false;
  }
  return true;
}

Object.assign(globalThis, { NEAR, FAR, RADIUS, RADIO_LEVEL, falloff, radioGain, canMove, canTraverse, pointInPolygon });
