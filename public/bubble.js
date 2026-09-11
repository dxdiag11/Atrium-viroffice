// What floats above a character's head: the typing indicator while someone composes,
// and the message itself for a few seconds after it is sent.
//
// Everything here is drawn in world space on the same canvas as the players, in a pass
// of its own after every avatar, so a bubble is never painted over by whoever is
// standing in front of its owner.
// Globals used: loadImage.

const TYPING_SHEET = '/assets/utilities/bubble-chat/bubble-chat.png';
const TYPING_FRAMES = 12;   // 4 columns x 3 rows of typing animation
const TYPING_FPS = 12;
const TYPING_W = 58;        // drawn width of the typing sprite, in world px

const SAY_MS = 3000;    // how long a sent message hangs over the sender's head
const POOF_MS = 620;    // the bunshin dispel that takes it away
const HEAD = 92;        // world px above the feet where a bubble's tail tip sits

const SAY_FONT = '600 12px system-ui, sans-serif';
const SAY_MAX_W = 168;  // text column before wrapping
const SAY_MAX_LINES = 4;
const SAY_PAD_X = 9;
const SAY_PAD_Y = 7;
const SAY_LINE = 15;
const SAY_TAIL = 8;     // tail height below the bubble body

const CREAM = '#f7f4ef';
const INK = '#3e4452';

let typingFrames = null; // 12 cropped canvases, or null until the sheet is ready
let typingTail = 0.5;    // where the tail tip sits across a frame, 0..1
const typing = new Set();     // player ids currently composing
const said = new Map();       // player id -> { text, at, layout }
const poofs = [];             // { x, y, w, h, at, seeds }

// --- the typing sprite sheet ------------------------------------------------

// Runs of `true` in a projection, split wherever the sheet goes fully transparent.
// Short runs are the little motion dashes flicked out between bubbles, not bubbles.
function bands(hits, minLength) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= hits.length; i++) {
    if (i < hits.length && hits[i]) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0 && i - start >= minLength) out.push([start, i - 1]);
    start = -1;
  }
  return out;
}

// The sheet is nominally a 4x3 grid, but the export does not actually respect it: the
// bubbles straddle the cell boundaries. So the frames are found from the artwork --
// three horizontal bands of ink, four bubbles across each -- which also means a
// re-export at another size or spacing keeps working.
function prepareTypingFrames(img) {
  const sheet = document.createElement('canvas');
  sheet.width = img.naturalWidth;
  sheet.height = img.naturalHeight;
  const sc = sheet.getContext('2d', { willReadFrequently: true });
  sc.drawImage(img, 0, 0);
  const { width: W, height: H } = sheet;
  const pixels = sc.getImageData(0, 0, W, H).data;
  const opaque = (x, y) => pixels[(y * W + x) * 4 + 3] >= 24;

  const rowHit = new Array(H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W && !rowHit[y]; x++) rowHit[y] = opaque(x, y);
  }

  // Tight box of whatever ink lies inside a region.
  const boxOf = (x0, x1, y0, y1) => {
    let minX = x1, minY = y1, maxX = x0, maxY = y0, found = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!opaque(x, y)) continue;
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return found ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
  };

  const boxes = [];
  for (const [top, bottom] of bands(rowHit, H * 0.05)) {
    const colHit = new Array(W).fill(false);
    for (let x = 0; x < W; x++) {
      for (let y = top; y <= bottom && !colHit[x]; y++) colHit[x] = opaque(x, y);
    }
    for (const [left, right] of bands(colHit, W * 0.04)) {
      const box = boxOf(left, right, top, bottom);
      if (box) boxes.push(box);
    }
  }
  if (boxes.length !== TYPING_FRAMES) throw new Error('Typing sheet is not ' + TYPING_FRAMES + ' frames');

  // One box size for all twelve, each bubble centred in it, so the frames can be swapped
  // in place without the bubble hopping around as its outline breathes.
  const w = Math.max(...boxes.map((b) => b.w));
  const h = Math.max(...boxes.map((b) => b.h));

  // The tail is the only part of the bubble that reaches the very bottom, so the middle
  // of the bottom few rows is the point that should end up over someone's head.
  const first = boxes[0];
  let sum = 0, count = 0;
  for (let y = first.y + first.h - Math.ceil(first.h * 0.04); y < first.y + first.h; y++) {
    for (let x = first.x; x < first.x + first.w; x++) {
      if (opaque(x, y)) { sum += x - first.x; count++; }
    }
  }
  typingTail = count ? (sum / count + (w - first.w) / 2) / w : 0.5;

  return boxes.map((box) => {
    const frame = document.createElement('canvas');
    frame.width = w;
    frame.height = h;
    frame.getContext('2d').drawImage(sheet, box.x, box.y, box.w, box.h,
      (w - box.w) / 2, h - box.h, box.w, box.h);
    return frame;
  });
}

// Failing to load is not worth an error banner: the office still works, you just don't
// get the "..." over anyone's head.
function initBubbles() {
  loadImage(TYPING_SHEET)
    .then((img) => { typingFrames = prepareTypingFrames(img); })
    .catch(() => { typingFrames = null; });
}

// --- state ------------------------------------------------------------------

function setTyping(id, on) {
  if (on) typing.add(id);
  else typing.delete(id);
}

// Only global messages land here: a mention is addressed to a few people, and painting
// it over the map would hand it to everyone standing nearby.
function sayBubble(id, text) {
  typing.delete(id); // the words are out; stop pretending they are still being typed
  said.set(id, { text, at: performance.now(), layout: null });
}

function clearBubbles(id) {
  typing.delete(id);
  said.delete(id);
}

function resetBubbles() {
  typing.clear();
  said.clear();
  poofs.length = 0;
}

// --- drawing ----------------------------------------------------------------

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Wrap on words, but a single unbroken 280-character "word" still has to fit, so fall
// back to cutting mid-word rather than letting one token run off the bubble.
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (ctx.measureText(line).width > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function layoutSaid(ctx, entry) {
  if (entry.layout) return entry.layout;
  ctx.font = SAY_FONT;
  let lines = wrap(ctx, entry.text, SAY_MAX_W);
  if (lines.length > SAY_MAX_LINES) {
    lines = lines.slice(0, SAY_MAX_LINES);
    lines[SAY_MAX_LINES - 1] = lines[SAY_MAX_LINES - 1].replace(/.{1,3}$/, '…');
  }
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  entry.layout = {
    lines,
    w: Math.ceil(textWidth) + SAY_PAD_X * 2,
    h: lines.length * SAY_LINE + SAY_PAD_Y * 2,
  };
  return entry.layout;
}

// The message bubble, drawn to echo the typing sprite: same cream fill, same charcoal
// outline, same glossy sliver along the top.
function drawSaid(ctx, x, tipY, layout, alpha, scale) {
  const { w, h, lines } = layout;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, tipY);
  ctx.scale(scale, scale);
  ctx.translate(-x, -tipY);

  const left = x - w / 2;
  const top = tipY - SAY_TAIL - h;

  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.fillStyle = CREAM;

  // Body and tail are one path, so the outline runs around the outside of both and
  // never draws a seam across the joint.
  roundRectPath(ctx, left, top, w, h, 11);
  ctx.moveTo(x - 7, top + h - 1);
  ctx.lineTo(x - 2, tipY);
  ctx.lineTo(x + 7, top + h - 1);
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 7, top + h - 2);
  ctx.lineTo(x - 2, tipY);
  ctx.lineTo(x + 7, top + h - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.7)';
  roundRectPath(ctx, left + 6, top + 4, Math.max(10, w * 0.32), 4, 2);
  ctx.fill();

  ctx.fillStyle = '#2c3243';
  ctx.font = SAY_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => ctx.fillText(line, x, top + SAY_PAD_Y + SAY_LINE * (i + 1) - 4));
  ctx.restore();
}

function drawTyping(ctx, x, tipY, now) {
  if (!typingFrames) return;
  const frame = typingFrames[Math.floor(now / (1000 / TYPING_FPS)) % typingFrames.length];
  const w = TYPING_W;
  const h = (frame.height / frame.width) * w;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame, x - typingTail * w, tipY - h, w, h);
}

// --- the bunshin dispel -----------------------------------------------------

const PUFFS = 12;

// Fixed per-puff jitter rather than Math.random() at draw time: the cloud has to be the
// same shape on every frame of its half-second, or it boils instead of billowing.
function spawnPoof(x, tipY, layout, now) {
  poofs.push({
    x,
    y: tipY - SAY_TAIL - layout.h / 2,
    w: layout.w,
    h: layout.h,
    at: now,
    seeds: Array.from({ length: PUFFS }, (_, i) => ({
      angle: (i / PUFFS) * Math.PI * 2 + Math.random() * 0.5,
      reach: 0.45 + Math.random() * 0.55,
      size: 0.7 + Math.random() * 0.7,
      // Every fourth puff hangs back near the middle, so the cloud is a mass with a
      // ragged edge instead of a ring of separate cotton balls.
      ring: i % 4 === 0 ? 0.3 : 1,
      delay: Math.random() * 0.18,
      spin: (Math.random() - 0.5) * 1.2,
    })),
  });
}

function drawPoof(ctx, poof, now) {
  const t = (now - poof.at) / POOF_MS;
  if (t >= 1) return false;

  // The cloud starts out the size of the bubble it ate and swells a little past it,
  // rather than blasting out of a single point: a clone leaves a puff, not an explosion.
  const restX = poof.w * 0.3;
  const restY = poof.h * 0.36;
  const spread = Math.max(poof.w, poof.h) * 0.34;
  const base = Math.max(poof.h, poof.w * 0.45) * 0.5;

  ctx.save();

  // The flash: the clone is gone before the smoke has finished arriving.
  if (t < 0.22) {
    const f = t / 0.22;
    ctx.globalAlpha = (1 - f) * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(poof.x, poof.y, base * (0.7 + f * 1.1), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const seed of poof.seeds) {
    const local = (t - seed.delay) / (1 - seed.delay);
    if (local <= 0) continue;
    const ease = 1 - Math.pow(1 - local, 2.2);          // fast out, then coasting
    const reach = spread * seed.reach * ease;
    const px = poof.x + Math.cos(seed.angle) * (restX + reach) * seed.ring + seed.spin * ease * 7;
    const py = poof.y + Math.sin(seed.angle) * (restY + reach * 0.6) * seed.ring - ease * 12; // smoke rises
    const radius = base * seed.size * (0.7 + ease * 0.55);

    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, 'rgba(255,255,255,.9)');
    grad.addColorStop(0.5, 'rgba(238,239,245,.6)');
    grad.addColorStop(1, 'rgba(212,216,227,0)');
    ctx.globalAlpha = Math.pow(1 - local, 1.4);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return true;
}

// --- the pass ---------------------------------------------------------------

// Called once per frame from draw(), after every avatar has been painted.
function drawBubbles(ctx, roster, now) {
  for (const p of roster) {
    const x = p.rx;
    const tipY = p.ry - HEAD;
    const entry = said.get(p.id);

    if (entry) {
      const layout = layoutSaid(ctx, entry);
      const age = now - entry.at;
      if (age >= SAY_MS) {
        spawnPoof(x, tipY, layout, now);
        said.delete(p.id);
      } else {
        // A short pop on arrival, so the bubble does not simply blink into existence.
        const rise = Math.min(1, age / 160);
        const scale = 1 + Math.sin(rise * Math.PI) * 0.08;
        drawSaid(ctx, x, tipY, layout, Math.min(1, age / 90), scale);
      }
      continue;
    }

    if (typing.has(p.id)) drawTyping(ctx, x, tipY, now);
  }

  // Poofs outlive their bubble -- and their owner, who may have walked off or logged
  // out mid-puff -- so they are kept in world coordinates of their own.
  for (let i = poofs.length - 1; i >= 0; i--) {
    if (!drawPoof(ctx, poofs[i], now)) poofs.splice(i, 1);
  }
}

Object.assign(globalThis, { initBubbles, setTyping, sayBubble, clearBubbles, resetBubbles, drawBubbles });
