// Chat panel: message list, composer, and the rendering rules.
// Globals used: socket, players, myId, getAudioCtx, and everything chat-core exports.

const chatPanel = document.getElementById('chat');
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const chatToggle = document.getElementById('chat-toggle');
const chatSuggest = document.getElementById('chat-suggest');
const chatBadge = document.getElementById('chat-badge');
const chatBell = document.getElementById('chat-bell');

// Only follow the tail when the reader is already there. Yanking the view down while
// someone is scrolled up reading loses their place.
const NEAR_BOTTOM = 60; // px

function atBottom() {
  return chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < NEAR_BOTTOM;
}

function timeLabel(at) {
  const d = new Date(at);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function addMessage(msg) {
  if (!show(msg)) return;
  // Only global chat floats over the map. A mention is addressed to a few people, and a
  // bubble above someone's head is readable by whoever is standing nearby.
  if (msg.scope === 'all' && msg.from && players[msg.from]) sayBubble(msg.from, msg.text);
  notify(msg);
}

// History is everything you missed before you could see it. Counting it as unread would
// hand a new joiner a badge of 50 and fifty beeps to go with it.
function addHistory(list) {
  (list || []).forEach(show);
}

// Rendered rows are kept by id because a reaction or a vote arrives long after the
// message did, and the row it belongs to has to be found again to be repainted.
const rows = new Map(); // message id -> { msg, row }

function show(msg) {
  if (!msg || typeof msg.text !== 'string') return false;
  const follow = atBottom();
  const row = renderMessage(msg);
  rows.set(msg.id, { msg, row });
  chatLog.appendChild(row);
  if (follow) chatLog.scrollTop = chatLog.scrollHeight;
  return true;
}

// Repainting the whole row rather than patching one chip: the row is a dozen elements,
// and a single render path means the message can never disagree with itself.
function repaint(id) {
  const entry = rows.get(id);
  if (!entry || !entry.row.isConnected) return;
  const follow = atBottom();
  const fresh = renderMessage(entry.msg);
  entry.row.replaceWith(fresh);
  entry.row = fresh;
  if (follow) chatLog.scrollTop = chatLog.scrollHeight;
}

function applyReaction({ id, reactions }) {
  const entry = rows.get(id);
  if (!entry) return;
  entry.msg.reactions = reactions || {};
  repaint(id);
}

function applyVote({ id, poll }) {
  const entry = rows.get(id);
  if (!entry || !poll) return;
  entry.msg.poll = poll;
  repaint(id);
}

function playerNames() {
  return Object.values(players).map((p) => p.name);
}

// Mention names come from the current roster rather than from the wire, so the Message
// shape stays exactly what the server sends.
function renderText(text) {
  const frag = document.createDocumentFragment();
  for (const token of parseMentions(text, playerNames()).tokens) {
    if (token.type !== 'mention') {
      frag.appendChild(document.createTextNode(token.value));
      continue;
    }
    const tag = document.createElement('span');
    tag.className = 'mention';
    tag.textContent = '@' + token.value;
    frag.appendChild(tag);
  }
  return frag;
}

function recipientLabel(msg) {
  const names = msg.mentions
    .filter((id) => id !== msg.from)
    .map((id) => (players[id] ? players[id].name : '?'));
  return 'hanya ke ' + (names.length ? names.join(', ') : 'kamu');
}

function renderMessage(msg) {
  const row = document.createElement('div');
  row.className = 'msg' + (msg.scope === 'system' ? ' system' : '');
  if (msg.scope === 'mention') {
    row.classList.add('private');
    // A private message must never be mistaken for a global one, in either direction.
    if (msg.mentions.includes(myId) && msg.from !== myId) row.classList.add('to-me');
  }

  if (msg.scope !== 'system') {
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = msg.color || '#e8eaf0';
    who.textContent = msg.name || 'anon';
    row.appendChild(who);

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = timeLabel(msg.at);
    row.appendChild(time);
  }

  // A poll carries its question inside the card, so printing msg.text too would say it
  // twice.
  if (msg.scope === 'poll') {
    row.appendChild(renderPoll(msg));
  } else {
    const body = document.createElement('span');
    body.className = 'text';
    // Built from text nodes only: message text is untrusted, innerHTML is never used.
    body.appendChild(msg.scope === 'system' ? document.createTextNode(msg.text) : renderText(msg.text));
    row.appendChild(body);
  }

  if (canReact(msg)) row.appendChild(renderReacts(msg));

  if (msg.scope === 'mention') {
    const tag = document.createElement('span');
    tag.className = 'only';
    tag.textContent = recipientLabel(msg);
    row.appendChild(tag);
  }

  return row;
}

// --- reactions --------------------------------------------------------------

// Only messages the server still holds can be reacted to, and the only ones it holds are
// global chat and polls. A mention is routed and forgotten by design (that is what keeps
// it private), so offering a chip on one would just produce a click that does nothing.
function canReact(msg) {
  return msg.scope === 'all' || msg.scope === 'poll';
}

function reactChip(msg, emoji, list) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip' + (list.some((v) => v.id === myId) ? ' mine' : '');
  chip.textContent = emoji + ' ' + list.length;
  chip.title = list.map((v) => v.name).join(', '); // titles are plain text, never parsed
  chip.addEventListener('click', () => socket.emit('react', { id: msg.id, emoji }));
  return chip;
}

function renderReacts(msg) {
  const bar = document.createElement('div');
  bar.className = 'reacts';

  for (const [emoji, list] of Object.entries(msg.reactions || {})) {
    if (list.length) bar.appendChild(reactChip(msg, emoji, list));
  }

  const palette = document.createElement('span');
  palette.className = 'palette';
  palette.hidden = true;
  for (const emoji of REACTIONS) {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.textContent = emoji;
    // The row is repainted when the server answers, which closes the palette on its own.
    pick.addEventListener('click', () => socket.emit('react', { id: msg.id, emoji }));
    palette.appendChild(pick);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  // A smiley with a plus reads as "add a reaction" at a glance; a bare "+" reads as
  // nothing in particular.
  add.textContent = '\u{1F642}+';
  add.title = 'Tambah reaksi';
  add.addEventListener('click', () => {
    palette.hidden = !palette.hidden;
    bar.classList.toggle('open', !palette.hidden); // keeps "+" lit while the palette is up
  });

  bar.appendChild(add);
  bar.appendChild(palette);
  return bar;
}

// --- polls ------------------------------------------------------------------

// A closed poll has to stop taking clicks even for people who never touched the tab, so
// each open card asks to be repainted the moment it expires. One timer per card, dropped
// when it fires; a card that gets repainted first simply schedules a fresh one.
function renderPoll(msg) {
  const poll = msg.poll;
  const card = document.createElement('div');
  card.className = 'poll';

  const question = document.createElement('div');
  question.className = 'q';
  question.textContent = poll.question;
  card.appendChild(question);

  const { counts, total, top } = pollTotals(poll);
  const closed = Date.now() >= poll.endsAt;

  poll.options.forEach((option, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'opt';
    row.disabled = closed;
    if (option.votes.some((v) => v.id === myId)) row.classList.add('mine');
    if (closed && i === top) row.classList.add('win');
    if (option.votes.length) row.title = option.votes.map((v) => v.name).join(', ');

    const fill = document.createElement('span');
    fill.className = 'fill';
    fill.style.width = (total ? Math.round((counts[i] / total) * 100) : 0) + '%';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = option.text;

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(counts[i]);

    row.append(fill, label, count);
    row.addEventListener('click', () => socket.emit('vote', { id: msg.id, option: i }));
    card.appendChild(row);
  });

  const foot = document.createElement('div');
  foot.className = 'poll-foot';
  foot.textContent = total + ' suara · ' + (closed ? 'voting selesai' : 'tutup ' + timeLabel(poll.endsAt));
  card.appendChild(foot);

  if (!closed) setTimeout(() => repaint(msg.id), poll.endsAt - Date.now() + 200);
  return card;
}

// --- unread + notification --------------------------------------------------

// Preferences are per-browser conveniences, and localStorage throws outright in some
// privacy modes, so every access is guarded and a failure just means "use the default".
function stored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch (err) {
    return fallback;
  }
}

function store(key, on) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch (err) {
    /* not worth telling the user about */
  }
}

let unread = 0;
let unreadMentions = 0;
let muted = stored('atrium.chat.muted', false);

function drawBadge() {
  chatBadge.textContent = String(unread);
  chatBadge.classList.toggle('mention', unreadMentions > 0);
  chatBadge.hidden = unread === 0;
}

function clearUnread() {
  unread = 0;
  unreadMentions = 0;
  drawBadge();
}

function notify(msg) {
  if (msg.from === myId) return; // your own message is never news
  const forMe = msg.scope === 'mention' && msg.mentions.includes(myId);
  const collapsed = chatPanel.classList.contains('collapsed');
  if (!collapsed && !forMe) return;

  if (collapsed) {
    unread++;
    if (forMe) unreadMentions++;
    drawBadge();
  }
  // A mention rings even with the panel open: it is addressed to you specifically.
  // Join/leave notices stay silent; people come and go too often to beep about it.
  if (!muted && msg.scope !== 'system') ping(forMe);
}

// A short sine blip rather than an audio file: nothing to load, nothing to ship.
function ping(strong) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = strong ? 880 : 620;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(strong ? 0.08 : 0.04, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

// Not setMuted: rtc.js already owns that name for the microphone, and these scripts
// share one global scope.
function setChatMuted(on) {
  muted = on;
  chatBell.classList.toggle('off', on);
  chatBell.textContent = on ? '\uD83D\uDD15' : '\uD83D\uDD14';
  store('atrium.chat.muted', on);
}

chatBell.addEventListener('click', () => setChatMuted(!muted));
setChatMuted(muted);

// --- @ autocomplete ---------------------------------------------------------

let suggestions = [];  // names currently offered
let suggestAt = -1;    // index of the '@' being completed
let suggestPick = 0;

// The '@' whose token the caret sits in, or -1. Names may contain spaces, so the prefix
// runs to the caret rather than stopping at the first one; a prefix that matches nobody
// simply closes the list.
function mentionStart() {
  const before = chatInput.value.slice(0, chatInput.selectionStart);
  const at = before.lastIndexOf('@');
  if (at < 0) return -1;
  if (at > 0 && WORD_CHAR.test(before[at - 1])) return -1;
  return at;
}

function closeSuggest() {
  suggestions = [];
  suggestAt = -1;
  chatSuggest.hidden = true;
}

function refreshSuggest() {
  if (chatPanel.hidden || document.activeElement !== chatInput) return;
  const at = mentionStart();
  if (at < 0) return closeSuggest();

  const me = players[myId];
  const prefix = chatInput.value.slice(at + 1, chatInput.selectionStart);
  const names = matchNames(prefix, playerNames(), me && me.name);
  if (!names.length) return closeSuggest();

  const previous = suggestions[suggestPick];
  suggestions = names;
  suggestAt = at;
  suggestPick = Math.max(0, names.indexOf(previous)); // keep the highlight on roster churn
  drawSuggest();
}

function drawSuggest() {
  chatSuggest.textContent = '';
  suggestions.forEach((name, i) => {
    const item = document.createElement('div');
    item.textContent = name; // a name is user input: text node only
    if (i === suggestPick) item.className = 'active';
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus in the input so the caret survives the click
      complete(i);
    });
    chatSuggest.appendChild(item);
  });
  chatSuggest.hidden = false;
}

function complete(i) {
  const name = suggestions[i];
  if (!name) return;
  const caret = chatInput.selectionStart;
  const head = chatInput.value.slice(0, suggestAt) + '@' + name + ' ';
  chatInput.value = head + chatInput.value.slice(caret);
  chatInput.setSelectionRange(head.length, head.length);
  closeSuggest();
}

function moveSuggest(step) {
  suggestPick = (suggestPick + step + suggestions.length) % suggestions.length;
  drawSuggest();
}

chatInput.addEventListener('input', refreshSuggest);
chatInput.addEventListener('blur', closeSuggest);

// --- typing indicator -------------------------------------------------------

// Everyone else sees a "…" bubble over your head while you compose. The server is only
// told when the answer changes, and a pause long enough to be a pause takes it down:
// someone who wandered off mid-sentence should not appear to type forever.
const TYPING_IDLE = 3000; // ms of stillness that ends a composing run

let composing = false;
let composeTimer = null;

function setComposing(on) {
  clearTimeout(composeTimer);
  if (on) composeTimer = setTimeout(() => setComposing(false), TYPING_IDLE);
  if (composing === on) return;
  composing = on;
  if (myId) setTyping(myId, on); // your own head gets it too; the server only tells others
  socket.emit('typing', on);
}

// An empty box is not composing: clearing what you typed should drop the bubble at once.
chatInput.addEventListener('input', () => setComposing(chatInput.value.trim().length > 0));
chatInput.addEventListener('blur', () => setComposing(false));

// --- composing --------------------------------------------------------------

function sendChat() {
  const text = normalizeText(chatInput.value);
  chatInput.value = '';
  closeSuggest();
  setComposing(false);
  if (!text) return;
  socket.emit('chat', { text });
}

function setCollapsed(on) {
  chatPanel.classList.toggle('collapsed', on);
  document.getElementById('chat-open').setAttribute('aria-expanded', String(!on));
  if (!on) {
    clearUnread();
    // A closed panel is display:none, so it has no layout and the follow-the-tail scroll
    // in show() lands on nothing. What arrived behind the badge is exactly what you
    // opened the panel to read, so put the view on it.
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  store('atrium.chat.collapsed', on);
}

function focusChat() {
  if (chatPanel.hidden) return;
  setCollapsed(false);
  chatInput.focus();
}

chatToggle.addEventListener('click', () => {
  setCollapsed(!chatPanel.classList.contains('collapsed'));
  document.getElementById('chat-open').focus();
});

document.getElementById('chat-open').addEventListener('click', () => {
  if (chatPanel.classList.contains('collapsed')) focusChat();
  else setCollapsed(true);
});

setCollapsed(stored('atrium.chat.collapsed', false));

document.getElementById('chat-send').addEventListener('click', () => {
  sendChat();
  chatInput.focus();
});

chatInput.addEventListener('keydown', (e) => {
  if (suggestions.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      return moveSuggest(e.key === 'ArrowDown' ? 1 : -1);
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      return complete(suggestPick);
    }
    if (e.key === 'Escape') {
      e.preventDefault(); // first Escape only closes the list, it does not leave chat
      return closeSuggest();
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    sendChat();
  } else if (e.key === 'Escape') {
    chatInput.blur();
  }
});

chatInput.setAttribute('maxlength', String(MAX_LEN));

Object.assign(globalThis, { addMessage, addHistory, applyReaction, applyVote, focusChat, refreshSuggest, setComposing });
