// Chat panel: message list, composer, and the rendering rules.
// Globals used: socket, players, myId, normalizeText, MAX_LEN.

const chatPanel = document.getElementById('chat');
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const chatToggle = document.getElementById('chat-toggle');

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
  if (!msg || typeof msg.text !== 'string') return;
  const follow = atBottom();
  chatLog.appendChild(renderMessage(msg));
  if (follow) chatLog.scrollTop = chatLog.scrollHeight;
}

function renderMessage(msg) {
  const row = document.createElement('div');
  row.className = 'msg' + (msg.scope === 'system' ? ' system' : '');

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
  body.textContent = msg.text; // never innerHTML: message text is untrusted
  row.appendChild(body);

  return row;
}

function sendChat() {
  const text = normalizeText(chatInput.value);
  chatInput.value = '';
  if (!text) return;
  socket.emit('chat', { text });
}

function setCollapsed(on) {
  chatPanel.classList.toggle('collapsed', on);
  chatToggle.textContent = on ? '+' : '\u2212';
}

function focusChat() {
  if (chatPanel.hidden) return;
  setCollapsed(false);
  chatInput.focus();
}

chatToggle.addEventListener('click', () => {
  setCollapsed(!chatPanel.classList.contains('collapsed'));
});

document.getElementById('chat-send').addEventListener('click', () => {
  sendChat();
  chatInput.focus();
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChat();
  } else if (e.key === 'Escape') {
    chatInput.blur();
  }
});

chatInput.setAttribute('maxlength', String(MAX_LEN));

Object.assign(globalThis, { addMessage, focusChat });
