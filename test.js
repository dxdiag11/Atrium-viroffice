const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

require('./public/geom.js');
require('./public/office.js');
require('./public/characters.js');
require('./public/chat-core.js');

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

test('cave monitor seats retain the arcade while social seats do not', () => {
  const map = buildOffice();
  assert.strictEqual(map.seats.filter(seat => seat.game).length, 20);
  for (const [x, y] of [[553,299],[575,598],[1186,394]]) {
    assert.strictEqual(map.seats.find(seat => seat.x === x && seat.y === y).game, true);
  }
  for (const [x, y] of [[304,121],[754,79],[146,702],[1227,819]]) {
    assert.ok(!map.seats.find(seat => seat.x === x && seat.y === y).game);
  }
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

test('smoothLevel attacks fast and releases slow', () => {
  assert.strictEqual(smoothLevel(0, 0), 0);
  assert.strictEqual(smoothLevel(0.5, 0.5), 0.5); // steady signal, steady ring

  const rise = smoothLevel(0, 1) - 0;   // silence to full
  const fall = 1 - smoothLevel(1, 0);   // full to silence
  assert.ok(rise > fall, 'speech should snap on and trail off, not the reverse');

  // Both directions stay inside the interval and converge on the raw value.
  let v = 0;
  for (let i = 0; i < 40; i++) v = smoothLevel(v, 0.8);
  assert.ok(Math.abs(v - 0.8) < 0.01, 'did not converge upward, got ' + v);
  for (let i = 0; i < 80; i++) v = smoothLevel(v, 0);
  assert.ok(v < 0.01, 'did not decay to silence, got ' + v);
});

test('separateFrom leaves players who are not touching alone', () => {
  assert.deepStrictEqual(separateFrom(100, 100, []), [100, 100]);
  assert.deepStrictEqual(separateFrom(100, 100, [{ x: 400, y: 400 }]), [100, 100]);

  // Exactly touching, not overlapping: nothing to fix.
  assert.deepStrictEqual(separateFrom(100, 100, [{ x: 100 + RADIUS * 2, y: 100 }]), [100, 100]);
});

test('separateFrom pushes an overlap out to exactly touching', () => {
  const [x, y] = separateFrom(100, 100, [{ x: 110, y: 100 }]);
  assert.strictEqual(Math.round(Math.hypot(x - 110, y - 100)), RADIUS * 2);
  assert.ok(x < 100, 'pushed away from them, not towards');
  assert.strictEqual(y, 100, 'a head-on overlap should not drift sideways');
});

test('separateFrom unstacks two players on the exact same pixel', () => {
  const [x, y] = separateFrom(300, 300, [{ x: 300, y: 300 }]);
  assert.strictEqual(Math.hypot(x - 300, y - 300), RADIUS * 2);
});

test('separateFrom resolves being squeezed by two players', () => {
  const others = [
    { x: 100 - 10, y: 100 },
    { x: 100 + 10, y: 100 },
  ];
  const [x, y] = separateFrom(100, 100, others);
  for (const p of others) {
    assert.ok(Math.hypot(x - p.x, y - p.y) >= RADIUS * 2 - 0.001, 'still overlapping ' + p.x);
  }
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

// --- chat -------------------------------------------------------------------

test('normalizeText trims, caps length, and rejects blanks', () => {
  assert.strictEqual(normalizeText('  hi  '), 'hi');
  assert.strictEqual(normalizeText(''), '');
  assert.strictEqual(normalizeText('   '), '');
  assert.strictEqual(normalizeText(undefined), '');
  assert.strictEqual(normalizeText(42), '');

  assert.strictEqual(normalizeText('a'.repeat(280)).length, 280);
  assert.strictEqual(normalizeText('a'.repeat(281)).length, 280);
  assert.strictEqual(normalizeText('  ' + 'a'.repeat(300) + '  '), 'a'.repeat(280));
});

test('makeBucket allows up to the limit, then refuses until the window passes', () => {
  const bucket = makeBucket(3, 1000);

  assert.strictEqual(bucket.take(0), true);
  assert.strictEqual(bucket.take(10), true);
  assert.strictEqual(bucket.take(20), true);
  assert.strictEqual(bucket.take(30), false);
  assert.strictEqual(bucket.take(999), false);

  assert.strictEqual(bucket.take(1000), true); // first hit aged out
  assert.strictEqual(bucket.take(1001), false); // hits at 10 and 20 still count
  assert.strictEqual(bucket.take(1020), true);
});

test('uniqueName only suffixes on a clash, case-insensitively', () => {
  assert.strictEqual(uniqueName('Budi', []), 'Budi');
  assert.strictEqual(uniqueName('Budi', ['Sari']), 'Budi');
  assert.strictEqual(uniqueName('Budi', ['Budi']), 'Budi (2)');
  assert.strictEqual(uniqueName('Budi', ['budi']), 'Budi (2)');
  assert.strictEqual(uniqueName('Budi', ['Budi', 'Budi (2)']), 'Budi (3)');
});

test('parseMentions finds names anywhere in the text', () => {
  const names = ['Sari', 'Budi'];

  assert.deepStrictEqual(parseMentions('@Sari hi', names).mentioned, ['Sari']);
  assert.deepStrictEqual(parseMentions('hi @Sari ok', names).mentioned, ['Sari']);
  assert.deepStrictEqual(parseMentions('hi @Sari', names).mentioned, ['Sari']);
  assert.deepStrictEqual(parseMentions('@Sari @Budi hi', names).mentioned, ['Sari', 'Budi']);
  assert.deepStrictEqual(parseMentions('@Sari @Sari hi', names).mentioned, ['Sari']);
  assert.deepStrictEqual(parseMentions('@sari hi', names).mentioned, ['Sari']); // canonical case
});

test('parseMentions prefers the longest matching name', () => {
  const names = ['Budi', 'Budiman', 'Budi Ganteng'];

  assert.deepStrictEqual(parseMentions('@Budiman hi', names).mentioned, ['Budiman']);
  assert.deepStrictEqual(parseMentions('@Budi Ganteng hi', names).mentioned, ['Budi Ganteng']);
  assert.deepStrictEqual(parseMentions('@Budi hi', names).mentioned, ['Budi']);
});

test('parseMentions reports unknown names and ignores non-mentions', () => {
  const names = ['Sari'];

  assert.deepStrictEqual(parseMentions('@Sarii hi', names).unknown, ['Sarii']);
  assert.deepStrictEqual(parseMentions('@Sarii @Sarii', names).unknown, ['Sarii']);
  assert.deepStrictEqual(parseMentions('mail a@b.com', names).unknown, []);
  assert.deepStrictEqual(parseMentions('mail a@b.com', names).mentioned, []);
  assert.deepStrictEqual(parseMentions('price @', names).unknown, []);
  assert.deepStrictEqual(parseMentions('price @ 10', names).mentioned, []);
  assert.deepStrictEqual(parseMentions('who @', names).tokens, [{ type: 'text', value: 'who @' }]);
});

test('parseMentions tokens rebuild the original text', () => {
  const names = ['Sari', 'Budi'];
  for (const text of ['@Sari hi @Budi', 'no mentions', 'a@b.com @Sarii', '@Sari', 'hi @Sari']) {
    const rebuilt = parseMentions(text, names).tokens
      .map((t) => (t.type === 'mention' ? '@' + t.value : t.value))
      .join('');
    assert.strictEqual(rebuilt.toLowerCase(), text.toLowerCase());
  }
});

test('resolveRecipients routes by mention', () => {
  const players = {
    s1: { id: 's1', name: 'Budi' },
    s2: { id: 's2', name: 'Sari' },
    s3: { id: 's3', name: 'Andi' },
  };

  assert.deepStrictEqual(resolveRecipients('halo semua', 's1', players), {
    scope: 'all', ids: null, unknown: [],
  });

  const one = resolveRecipients('@Sari cek ini', 's1', players);
  assert.strictEqual(one.scope, 'mention');
  assert.deepStrictEqual(one.ids, ['s2', 's1']); // sender always included

  const two = resolveRecipients('@Sari @Andi halo', 's1', players);
  assert.deepStrictEqual(two.ids, ['s2', 's3', 's1']);

  // Mentioning yourself must not duplicate you in the recipient list.
  assert.deepStrictEqual(resolveRecipients('@Budi note', 's1', players).ids, ['s1']);

  const bad = resolveRecipients('@Sarii halo', 's1', players);
  assert.deepStrictEqual(bad.unknown, ['Sarii']);
  assert.deepStrictEqual(bad.ids, []);
});

test('matchNames filters by prefix and drops yourself', () => {
  const names = ['Sari', 'Budi', 'Sandi', 'sasa'];

  assert.deepStrictEqual(matchNames('', names, 'Budi'), ['Sari', 'Sandi', 'sasa']);
  assert.deepStrictEqual(matchNames('s', names, 'Budi'), ['Sari', 'Sandi', 'sasa']);
  assert.deepStrictEqual(matchNames('SA', names, 'Budi'), ['Sari', 'Sandi', 'sasa']);
  assert.deepStrictEqual(matchNames('sar', names, 'Budi'), ['Sari']);
  assert.deepStrictEqual(matchNames('sar', names, 'Sari'), []); // yourself, case-insensitively
  assert.deepStrictEqual(matchNames('z', names, 'Budi'), []);
  assert.deepStrictEqual(matchNames('Budi Gant', names, 'Sari'), []);
  assert.deepStrictEqual(matchNames('budi g', ['Budi Ganteng'], 'Sari'), ['Budi Ganteng']);
});
