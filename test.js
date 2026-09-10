const test = require('node:test');
const assert = require('node:assert');

require('./public/geom.js');

test('falloff boundaries', () => {
  assert.strictEqual(falloff(0), 1);
  assert.strictEqual(falloff(NEAR), 1);
  assert.strictEqual(falloff(FAR), 0);
  assert.strictEqual(falloff(FAR + 500), 0);

  const mid = falloff((NEAR + FAR) / 2);
  assert.strictEqual(mid, 0.25); // squared rolloff: halfway is a quarter, not a half
  assert.ok(falloff(NEAR + 1) > mid && mid > falloff(FAR - 1));
});

test('falloff decreases monotonically', () => {
  let prev = Infinity;
  for (let d = 0; d <= FAR + 50; d += 5) {
    const g = falloff(d);
    assert.ok(g <= prev, 'gain rose at d=' + d);
    prev = g;
  }
});

test('radioGain only opens up where the voice is not already audible', () => {
  assert.strictEqual(radioGain(0, false), 0);
  assert.strictEqual(radioGain(9999, false), 0); // silent unless someone is transmitting

  assert.strictEqual(radioGain(0, true), 0);        // standing on top of them
  assert.strictEqual(radioGain(NEAR, true), 0);     // still full proximity volume
  assert.strictEqual(radioGain(FAR - 1, true), 0);  // faint, but heard directly

  assert.strictEqual(radioGain(FAR, true), RADIO_LEVEL);       // the handover point
  assert.strictEqual(radioGain(FAR + 2000, true), RADIO_LEVEL); // distance stops mattering
});

test('canMove blocks overlap, allows clearance', () => {
  const walls = [[100, 100, 50, 50]]; // rect spans x 100-150, y 100-150
  const r = 10;

  assert.strictEqual(canMove(125, 125, r, walls), false); // dead center
  assert.strictEqual(canMove(95, 125, r, walls), false);  // edge overlap
  assert.strictEqual(canMove(85, 125, r, walls), true);   // just clear
  assert.strictEqual(canMove(400, 400, r, walls), true);  // far away
});

test('axis-separated move slides along a wall', () => {
  const walls = [[100, 100, 50, 50]];
  const r = 10;
  let x = 88, y = 120;

  // Walking right into the wall while also moving down: X blocked, Y still applies.
  const nx = x + 5;
  if (canMove(nx, y, r, walls)) x = nx;
  const ny = y + 5;
  if (canMove(x, ny, r, walls)) y = ny;

  assert.strictEqual(x, 88);  // blocked
  assert.strictEqual(y, 125); // slid
});
