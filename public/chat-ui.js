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
  notify(msg);
}

// History is everything you missed before you could see it. Counting it as unread would
// hand a new joiner a badge of 50 and fifty beeps to go with it.
function addHistory(list) {
  (list || []).forEach(show);
}

function show(msg) {
  if (!msg || typeof msg.text !== 'string') return false;
  const follow = atBottom();
  chatLog.appendChild(renderMessage(msg));
  if (follow) chatLog.scrollTop = chatLog.scrollHeight;
  return true;
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

  const body = document.createElement('span');
  body.className = 'text';
  // Built from text nodes only: message text is untrusted, innerHTML is never used.
  body.appendChild(msg.scope === 'system' ? document.createTextNode(msg.text) : renderText(msg.text));
  row.appendChild(body);

  if (msg.scope === 'mention') {
    const tag = document.createElement('span');
    tag.className = 'only';
    tag.textContent = recipientLabel(msg);
    row.appendChild(tag);
  }

  return row;
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

// --- composing --------------------------------------------------------------

function sendChat() {
  const text = normalizeText(chatInput.value);
  chatInput.value = '';
  closeSuggest();
  if (!text) return;
  socket.emit('chat', { text });
}

function setCollapsed(on) {
  chatPanel.classList.toggle('collapsed', on);
  chatToggle.textContent = on ? '+' : '\u2212';
  if (!on) clearUnread();
  store('atrium.chat.collapsed', on);
}

function focusChat() {
  if (chatPanel.hidden) return;
  setCollapsed(false);
  chatInput.focus();
}

chatToggle.addEventListener('click', () => {
  setCollapsed(!chatPanel.classList.contains('collapsed'));
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

Object.assign(globalThis, { addMessage, addHistory, focusChat, refreshSuggest });
