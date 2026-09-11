// The walkie-talkie handset that slides in whenever someone keys up. Every client shows
// the same device; only the trim differs between the person talking and everyone else.

const BAR_COUNT = 9;
const METER = { x: 22, y: 137, w: 76, h: 20 };

let walkieEl = null;
let barEls = [];
const barLevels = new Array(BAR_COUNT).fill(0);

function initWalkie() {
  walkieEl = document.getElementById('walkie');
  const group = walkieEl.querySelector('.bars');
  const width = 6;
  const gap = (METER.w - BAR_COUNT * width) / (BAR_COUNT - 1);

  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', METER.x + i * (width + gap));
    bar.setAttribute('width', width);
    bar.setAttribute('rx', 2);
    bar.setAttribute('y', METER.y + METER.h - 2);
    bar.setAttribute('height', 2);
    group.appendChild(bar);
    barEls.push(bar);
  }
}

function showWalkie(name, mine) {
  if (!walkieEl) return;
  walkieEl.classList.add('show');
  walkieEl.classList.toggle('tx', mine);
  walkieEl.querySelector('.mode').textContent = mine ? 'TX' : 'RX';
  // Always the talker's nickname, yours included: TX and the red trim already say the
  // handset is yours, and a name is what makes a screenshot readable.
  walkieEl.querySelector('.who').textContent = (name || '??').slice(0, 10).toUpperCase();
}

function hideWalkie() {
  if (!walkieEl) return;
  walkieEl.classList.remove('show', 'tx');
}

// level is 0..1 from whoever currently holds the channel.
function updateWalkieMeter(level) {
  if (!walkieEl || !walkieEl.classList.contains('show')) return;

  for (let i = 0; i < BAR_COUNT; i++) {
    // Middle bars swing harder than the edges, the way a real level meter reads.
    const weight = 0.45 + 0.55 * Math.sin(((i + 0.5) / BAR_COUNT) * Math.PI);
    const target = Math.min(1, level * weight * (0.75 + Math.random() * 0.5));
    barLevels[i] += (target - barLevels[i]) * 0.35; // ease, or it strobes
    const h = Math.max(2, barLevels[i] * METER.h);
    barEls[i].setAttribute('y', METER.y + METER.h - h);
    barEls[i].setAttribute('height', h);
  }
}
