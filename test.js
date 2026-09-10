const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

require('./public/geom.js');
require('./public/office.js');
require('./public/characters.js');

test('all selectable characters have both sprite sheets and unknown IDs fall back safely', () => {
  assert.strictEqual(CHARACTERS.length,10);
  assert.strictEqual(new Set(CHARACTERS.map(c=>c.id)).size,10);
  assert.strictEqual(characterById('../../etc/passwd').id,'male-001');
  for (const c of CHARACTERS) for (const file of ['move.png','sit-talk.png']) {
    const data=fs.readFileSync(path.join(__dirname,'assets','characters',c.id,file));
    assert.strictEqual(data.toString('hex',0,8),'89504e470d0a1a0a');
    assert.strictEqual(data[25],6,c.id+'/'+file+' must be RGBA, not an opaque checkerboard');
  }
});

test('sprite cells cover both native export sizes with no assumed 362px crop', () => {
  for (const [width,height] of [[1448,1086],[1447,1087]]) {
    const last=spriteFrame(width,height,'right',3);
    assert.strictEqual(last.x+last.w,width);
    assert.strictEqual(last.y+last.h,height);
    assert.strictEqual(spriteFrame(width,height,'left',0).y,height/3);
    assert.strictEqual(spriteFrame(width,height,'up',0).y,0); // no back-facing art supplied
  }
});

test('cave spawn, seats, waterways and desk collisions match artwork coordinates', () => {
  const map=buildOffice();
  assert.strictEqual(map.width,1499);
  assert.strictEqual(map.height,1049);
  assert.ok(canMove(map.spawn.x,map.spawn.y,RADIUS,map.collisions));
  for (const s of map.seats) assert.ok(canMove(s.x,s.y,RADIUS,map.collisions),'blocked seat '+JSON.stringify(s));
  for (const [x,y] of [[25,25],[1300,950],[325,330],[749,524],[750,125],[550,340]]) {
    assert.ok(!canMove(x,y,RADIUS,map.collisions),'walkable obstacle '+x+','+y);
  }
  assert.ok(canMove(350,423,RADIUS,map.collisions),'lounge bridge');
  assert.ok(canMove(1150,758,RADIUS,map.collisions),'waterfall bridge');
});

test('every mapped seat is reachable from reception without crossing obstacles', () => {
  const map=buildOffice(),step=8,cols=Math.ceil(map.width/step),seen=new Set();
  const queue=[[Math.round(map.spawn.x/step),Math.round(map.spawn.y/step)]];
  seen.add(queue[0][1]*cols+queue[0][0]);
  for (let head=0;head<queue.length;head++) {
    const [x,y]=queue[head];
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,ny=y+dy,key=ny*cols+nx;
      if (nx<0||ny<0||nx*step>=map.width||ny*step>=map.height||seen.has(key)) continue;
      if (canMove(nx*step,ny*step,RADIUS,map.collisions)) {seen.add(key);queue.push([nx,ny]);}
    }
  }
  for (const s of map.seats) assert.ok(queue.some(([x,y])=>Math.hypot(x*step-s.x,y*step-s.y)<20),'unreachable seat '+JSON.stringify(s));
});

test('movement cannot skip walls, non-finite positions or the water', () => {
  assert.ok(!canTraverse({x:70,y:120},{x:180,y:120},8,[[100,100,50,50]]));
  assert.ok(!canTraverse({x:70,y:120},{x:NaN,y:120},8,[]));
  assert.ok(canTraverse({x:50,y:50},{x:70,y:50},8,[]));
});

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
