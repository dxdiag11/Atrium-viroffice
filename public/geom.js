// Shared pure math: used by the browser (script tag) and by test.js (require).
const NEAR = 80;   // px: full volume within this distance
const FAR = 350;   // px: silent at or beyond this distance
const RADIUS = 14; // px: avatar collision half-size

// 1 at NEAR, 0 at FAR, squared rolloff in between.
function falloff(d) {
  if (d <= NEAR) return 1;
  if (d >= FAR) return 0;
  const t = (FAR - d) / (FAR - NEAR);
  return t * t;
}

// AABB test of the avatar square against a list of [x, y, w, h] wall rects.
function canMove(x, y, r, rects) {
  for (const [rx, ry, rw, rh] of rects) {
    if (x + r > rx && x - r < rx + rw && y + r > ry && y - r < ry + rh) return false;
  }
  return true;
}

Object.assign(globalThis, { NEAR, FAR, RADIUS, falloff, canMove });
