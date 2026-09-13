// The voting board: the quest board that drops over the cave when someone types /vote.
//
// One board exists at a time (the server refuses a second while one is alive), and it
// runs through the two phases chat-core names: a minute of voting, then half a minute
// where the closed board stays up with the result on it before it clears itself away.
//
// Voting is not optional. The board covers the office until you have answered it: the
// shrink button only unlocks once your vote is in, and from then on the countdown follows
// you around in a small badge you can open again whenever you want to watch the tally.
//
// Globals used: socket, myId, and the poll helpers from chat-core.

const vbRoot = document.getElementById('voteboard');
const vbOptions = document.getElementById('vb-options');
const vbQuestion = document.getElementById('vb-question');
const vbNote = document.getElementById('vb-note');
const vbClock = document.getElementById('vb-clock');
const vbTimerLabel = document.getElementById('vb-timer-label');
const vbMin = document.getElementById('vb-min');
const vbMinText = document.getElementById('vb-min-text');
const vbChip = document.getElementById('vb-chip');
const vbChipClock = document.getElementById('vb-chip-clock');
const vbChipLabel = document.getElementById('vb-chip-label');

const VB_ICONS = 5; // how many option icons the sheet in index.html defines

let vbMsg = null;     // the poll message currently on the board, or null
let vbPhase = '';     // last phase rendered, so a change can be reacted to exactly once
let vbSmall = false;  // shrunk into the badge
let vbTimer = null;

function vbClear() {
  clearInterval(vbTimer);
  clearTimeout(vbFoldTimer);
  vbTimer = null;
  vbMsg = null;
  vbPhase = '';
  vbSmall = false;
  vbRoot.hidden = true;
  vbRoot.classList.remove('vb-small', 'vb-folding', 'vb-unfolding');
  vbChip.hidden = true;
  vbChip.classList.remove('vb-pop', 'vb-gone');
  vbOptions.textContent = '';
}

// Whether the poll on the board is one this browser has already answered. Asked of the
// server's own tally rather than remembered locally, so a vote cast from another tab --
// or the one you took back by clicking it again -- counts the same way here.
function vbVoted() {
  if (!vbMsg) return false;
  return vbMsg.poll.options.some((o) => o.votes.some((v) => v.id === myId));
}

function vbCountdown(until) {
  const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
}

// --- rendering --------------------------------------------------------------

function vbOptionRow(option, i, totals, phase) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'vb-opt';
  row.disabled = phase !== 'open';
  const mine = option.votes.some((v) => v.id === myId);
  row.classList.toggle('mine', mine);
  row.setAttribute('aria-pressed', String(mine));
  if (phase !== 'open' && i === totals.top) row.classList.add('win');
  if (option.votes.length) row.title = option.votes.map((v) => v.name).join(', ');

  // The share of the vote washes across the card from the left, under everything else.
  const fill = document.createElement('span');
  fill.className = 'vb-fill';
  fill.style.width = (totals.total ? Math.round((totals.counts[i] / totals.total) * 100) : 0) + '%';

  const radio = document.createElement('span');
  radio.className = 'vb-radio';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'vb-opt-icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#vb-i-' + (i % VB_ICONS));
  icon.appendChild(use);

  const label = document.createElement('span');
  label.className = 'vb-opt-label';
  label.textContent = option.text; // option text is user input: text node only

  const badge = document.createElement('span');
  badge.className = 'vb-badge';
  badge.textContent = totals.counts[i] + ' suara';

  row.append(fill, radio, icon, label, badge);
  row.addEventListener('click', () => {
    if (!vbMsg) return;
    socket.emit('vote', { id: vbMsg.id, option: i });
  });
  return row;
}

// The whole board is repainted from the poll rather than patched: a vote from anyone
// changes every row's bar at once, and one render path means the board can never show a
// tally that disagrees with itself.
function vbDraw() {
  if (!vbMsg) return;
  const poll = vbMsg.poll;
  const phase = pollPhase(poll, Date.now());
  if (phase === 'over') return vbClear();

  const totals = pollTotals(poll);
  vbQuestion.textContent = poll.question;
  vbNote.textContent = phase === 'open'
    ? 'Pilih satu. Papan ini menutup layar sampai suaramu masuk.'
    : totals.top >= 0
      ? 'Voting selesai. Pilihan terbanyak: ' + poll.options[totals.top].text + '.'
      : 'Voting selesai. Tidak ada pilihan yang unggul sendirian.';

  vbOptions.textContent = '';
  poll.options.forEach((option, i) => vbOptions.appendChild(vbOptionRow(option, i, totals, phase)));

  // Closing the vote is the one moment everybody should be looking at the board, so a
  // board that was shrunk comes back by itself to show the result before it goes away.
  if (phase !== vbPhase) {
    if (phase === 'review') vbShrink(false);
    vbPhase = phase;
  }

  vbTick();
}

// Only the parts that change once a second, so the second hand never fights the rows
// underneath it for focus.
function vbTick() {
  if (!vbMsg) return;
  const poll = vbMsg.poll;
  const phase = pollPhase(poll, Date.now());
  if (phase !== vbPhase) return vbDraw(); // a phase boundary: the rows change too

  const open = phase === 'open';
  const clock = vbCountdown(open ? poll.endsAt : poll.endsAt + POLL_REVIEW_MS);
  vbClock.textContent = clock;
  vbChipClock.textContent = clock;
  vbTimerLabel.textContent = open ? 'Voting Ends In' : 'Papan Tutup Dalam';
  vbChipLabel.textContent = open ? 'Papan vote' : 'Hasil vote';
  vbRoot.classList.toggle('vb-closing', !open);

  // Before a vote is in, the only way out of the board is to answer it.
  const locked = open && !vbVoted();
  vbMin.disabled = locked;
  vbMin.title = locked ? 'Pilih satu opsi dulu untuk mengecilkan papan.' : 'Kecilkan papan';
  vbMinText.textContent = locked ? 'Pilih dulu' : 'Kecilkan';
}

// --- shrink / restore -------------------------------------------------------

// The board does not blink out of existence, it folds away towards the badge and
// unfolds back out of it, so it is obvious where it went and where it came from. The
// flight path is measured rather than guessed: the badge sits in a corner whose position
// depends on the window and on the phone's safe area, and a hard-coded corner would send
// the board to the wrong place on half the screens it runs on.
const VB_FOLD_MS = 340;
const VB_CHIP_OUT_MS = 170;

let vbFoldTimer = null;

function vbStill() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Where the stage has to travel, and how far it has to shrink, to land on the badge.
function vbAim() {
  const stage = vbRoot.querySelector('.vb-stage').getBoundingClientRect();
  const chip = vbChip.getBoundingClientRect();
  vbRoot.style.setProperty('--vb-dx', (chip.left + chip.width / 2 - stage.left - stage.width / 2) + 'px');
  vbRoot.style.setProperty('--vb-dy', (chip.top + chip.height / 2 - stage.top - stage.height / 2) + 'px');
  vbRoot.style.setProperty('--vb-scale', Math.max(0.08, chip.width / stage.width).toFixed(3));
}

function vbShrink(on) {
  if (!vbMsg || on === vbSmall) return;
  if (on && pollPhase(vbMsg.poll, Date.now()) === 'open' && !vbVoted()) return;

  clearTimeout(vbFoldTimer);
  vbRoot.classList.remove('vb-folding', 'vb-unfolding');
  vbChip.classList.remove('vb-pop', 'vb-gone');
  vbSmall = on;

  if (vbStill()) {
    // Someone who asked for less movement gets the ends of the animation and none of
    // the middle.
    vbRoot.classList.toggle('vb-small', on);
    vbChip.hidden = !on;
    if (!on) vbMin.focus();
    return;
  }

  if (on) {
    // The badge appears first so its corner can be measured, then the board flies into
    // it while it pops up to catch it.
    vbChip.hidden = false;
    vbAim();
    vbRoot.classList.add('vb-folding');
    vbChip.classList.add('vb-pop');
    vbFoldTimer = setTimeout(() => {
      vbRoot.classList.add('vb-small');
      vbRoot.classList.remove('vb-folding');
      vbChip.classList.remove('vb-pop');
    }, VB_FOLD_MS);
    return;
  }

  // Unfolding: the stage has to be laid out again before it can be measured, so the
  // small class comes off first and the animation starts from the badge's corner.
  vbRoot.classList.remove('vb-small');
  vbAim();
  vbRoot.classList.add('vb-unfolding');
  vbChip.classList.add('vb-gone');
  vbMin.focus({ preventScroll: true });
  setTimeout(() => {
    if (!vbSmall) vbChip.hidden = true; // ...unless it was shrunk again mid-flight
  }, VB_CHIP_OUT_MS);
  vbFoldTimer = setTimeout(() => vbRoot.classList.remove('vb-unfolding'), VB_FOLD_MS);
}

// --- wiring -----------------------------------------------------------------

// Called for every chat message, live or from history, so someone who walks in halfway
// through a vote still gets the board -- with whatever is left of the minute on it.
function voteBoardSaw(msg) {
  if (!msg || msg.scope !== 'poll' || !msg.poll) return;
  if (pollPhase(msg.poll, Date.now()) === 'over') return;
  if (vbMsg && vbMsg.id === msg.id) return voteBoardUpdate(msg.id, msg.poll);

  vbMsg = msg;
  vbPhase = '';
  vbSmall = false;
  vbRoot.hidden = false;
  vbRoot.classList.remove('vb-small', 'vb-folding', 'vb-unfolding');
  vbChip.hidden = true;
  vbDraw();
  clearInterval(vbTimer);
  vbTimer = setInterval(vbTick, 500);
}

function voteBoardUpdate(id, poll) {
  if (!vbMsg || vbMsg.id !== id || !poll) return;
  vbMsg.poll = poll;
  vbDraw();
}

// True while the board is holding the floor -- the office underneath must not take
// keystrokes meant for it.
function voteBoardBlocking() {
  return !vbRoot.hidden && !vbSmall;
}

vbMin.addEventListener('click', () => vbShrink(true));
vbChip.addEventListener('click', () => vbShrink(false));

// Escape is the habit of every modal, and here it means "shrink", never "dismiss": the
// board is only finished when its own clock says so.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || vbRoot.hidden) return;
  if (vbSmall) return;
  e.preventDefault();
  vbShrink(true);
});

Object.assign(globalThis, { voteBoardSaw, voteBoardUpdate, voteBoardBlocking, vbClear });
