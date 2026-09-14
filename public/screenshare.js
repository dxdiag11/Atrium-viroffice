// Meeting-room panel: exclusive screen share, room roster, room-only chat.
// Globals used: socket, players, myId, map, PC_CONFIG (from rtc.js), roomChannel (server-shared core).
// One WebRTC connection per (presenter, viewer) pair, entirely separate from rtc.js's
// always-on voice mesh -- these only ever exist between people currently seated in the
// same room, and only for as long as someone is presenting.

const KIND_LABEL = { screen: 'Seluruh Layar', window: 'Jendela Aplikasi', tab: 'Tab Browser' };
const DISPLAY_SURFACE = { screen: 'monitor', window: 'window', tab: 'browser' };

let panelEl, roomNameEl, watchingEl, toggleEl, videoEl, stageEmptyEl, presentingBadgeEl,
  stopBtn, shareBtn, shareMenuEl, shareStatusEl, rosterListEl, chatLogEl, chatInputEl, chatSendEl;

let activeMapId = null, activeRoomId = null, activeChannel = null;
let minimized = false, watching = false;
let presenting = false, shareStream = null, shareTrack = null;
let remotePresenter = null; // { id, name, kind } of whoever else is presenting, or null
const screenPeers = {};     // remote id -> RTCPeerConnection (either direction)
let rosterIds = new Set();  // last-seen other-occupant ids, for reactive peer teardown/setup
const viewerWatching = new Map(); // remote id -> bool, purely for the "watching" count

function initScreenshare() {
  panelEl = document.getElementById('meeting-panel');
  roomNameEl = document.getElementById('mp-room-name');
  watchingEl = document.getElementById('mp-watching');
  toggleEl = document.getElementById('mp-toggle');
  videoEl = document.getElementById('mp-video');
  stageEmptyEl = document.getElementById('mp-stage-empty');
  presentingBadgeEl = document.getElementById('mp-presenting-badge');
  stopBtn = document.getElementById('mp-stop');
  shareBtn = document.getElementById('mp-share');
  shareMenuEl = document.getElementById('mp-share-menu');
  shareStatusEl = document.getElementById('mp-share-status');
  rosterListEl = document.getElementById('mp-roster-list');
  chatLogEl = document.getElementById('mp-chat-log');
  chatInputEl = document.getElementById('mp-chat-input');
  chatSendEl = document.getElementById('mp-chat-send');

  toggleEl.addEventListener('click', () => {
    minimized = !minimized;
    panelEl.classList.toggle('minimized', minimized);
    toggleEl.setAttribute('aria-label', minimized ? 'Expand meeting panel' : 'Minimize meeting panel');
    refreshWatching();
  });
  shareBtn.addEventListener('click', () => shareMenuEl.hidden = !shareMenuEl.hidden);
  for (const btn of shareMenuEl.querySelectorAll('[data-kind]')) {
    btn.addEventListener('click', () => { shareMenuEl.hidden = true; startShare(btn.dataset.kind); });
  }
  stopBtn.addEventListener('click', stopShare);
  chatSendEl.addEventListener('click', sendRoomChat);
  chatInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendRoomChat(); });
  document.addEventListener('visibilitychange', refreshWatching);
}

function refreshWatching() {
  setWatching(!minimized && document.visibilityState === 'visible');
}

function setWatching(on) {
  if (!activeChannel || on === watching) return;
  watching = on;
  socket.emit('screen-view', { watching: on });
}

function currentRoomOtherIds() {
  if (!activeRoomId) return [];
  return Object.values(players)
    .filter((p) => p.id !== myId && p.mapId === activeMapId && map.seatRoom?.get(p.seat) === activeRoomId)
    .map((p) => p.id);
}

function presenterId() {
  return presenting ? myId : (remotePresenter ? remotePresenter.id : null);
}

// Called ~10x/sec from main.js's existing audio-loop timer, and once more right after our
// own seat changes so sitting down shows the panel without waiting on that tick.
function updateMeetingRoom(me) {
  const seat = me && me.seat !== null && map ? map.seats[me.seat] : null;
  const roomId = seat?.room || null;
  const mapId = me?.mapId || null;

  if (roomId !== activeRoomId || mapId !== activeMapId) {
    leaveActiveRoom();
    activeRoomId = roomId;
    activeMapId = mapId;
    activeChannel = roomId ? roomChannel(mapId, roomId) : null;
    panelEl.hidden = !roomId;
    if (roomId) {
      roomNameEl.textContent = map.rooms?.find((r) => r.id === roomId)?.name || 'Meeting Room';
      resetStage();
      renderRoster(me);
      refreshWatching();
    }
    return;
  }
  if (roomId) renderRoster(me);
}

function leaveActiveRoom() {
  if (presenting) stopShare();
  for (const id of Object.keys(screenPeers)) closeScreenPeer(id);
  remotePresenter = null;
  rosterIds = new Set();
  viewerWatching.clear();
  minimized = false;
  watching = false;
  chatLogEl.textContent = '';
  resetStage();
  renderPresenterUi();
  renderWatchingCount();
}

function renderRoster(me) {
  const others = currentRoomOtherIds();
  if (presenting) {
    for (const id of others) if (!rosterIds.has(id)) ensureOutgoingPeer(id);
    for (const id of rosterIds) if (!others.includes(id)) closeScreenPeer(id);
  }
  rosterIds = new Set(others);

  const presenter = presenterId();
  const list = [me, ...others.map((id) => players[id])].filter(Boolean);
  rosterListEl.replaceChildren(...list.map((p) => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.id === presenter ? ' \u{1F5A5}️' : '') + (p.dnd ? ' · muted' : '');
    return li;
  }));
}

// --- presenting --------------------------------------------------------------

function showShareStatus(text) {
  shareStatusEl.textContent = text || '';
}

async function startShare(kind) {
  if (!activeChannel || presenting || shareStream) return;
  showShareStatus('');
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: DISPLAY_SURFACE[kind] || 'monitor' },
      audio: false,
    });
  } catch (err) {
    return showShareStatus('Dibatalkan.');
  }
  shareStream = stream;
  shareTrack = stream.getVideoTracks()[0];
  shareTrack.onended = () => stopShare();
  // `ontrack` only ever fires for a *received* remote track, so the presenter would
  // otherwise never see their own capture -- attach it to the stage directly.
  attachStage(shareStream);
  socket.emit('screen-share-start', { kind });
}

function stopShare() {
  if (activeChannel) socket.emit('screen-share-stop');
  stopLocalCapture();
}

function stopLocalCapture() {
  if (shareStream) for (const track of shareStream.getTracks()) track.stop();
  shareStream = null;
  shareTrack = null;
  const wasPresenting = presenting;
  presenting = false;
  for (const id of Object.keys(screenPeers)) closeScreenPeer(id);
  if (wasPresenting) {
    resetStage();
    renderPresenterUi();
  }
}

function renderPresenterUi() {
  const busy = !!remotePresenter;
  shareBtn.disabled = presenting || busy;
  shareBtn.textContent = busy ? (remotePresenter.name + ' sedang membagikan layar') : 'Bagikan Layar';
  presentingBadgeEl.hidden = !presenting;
  shareMenuEl.hidden = shareMenuEl.hidden || presenting || busy;
}

// --- WebRTC: one connection per (presenter, viewer) pair ----------------------

function ensureOutgoingPeer(viewerId) {
  if (screenPeers[viewerId]) return screenPeers[viewerId];
  const pc = new RTCPeerConnection(PC_CONFIG);
  screenPeers[viewerId] = pc;
  if (shareTrack) pc.addTrack(shareTrack, shareStream);
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('screen-signal', { to: viewerId, data: { candidate: e.candidate } }); };
  pc.onnegotiationneeded = async () => {
    try {
      await pc.setLocalDescription();
      socket.emit('screen-signal', { to: viewerId, data: { description: pc.localDescription } });
    } catch (err) { console.error('screen negotiation failed', err); }
  };
  return pc;
}

function ensureIncomingPeer(remoteId) {
  if (screenPeers[remoteId]) return screenPeers[remoteId];
  const pc = new RTCPeerConnection(PC_CONFIG);
  screenPeers[remoteId] = pc;
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('screen-signal', { to: remoteId, data: { candidate: e.candidate } }); };
  pc.ontrack = (e) => attachStage(e.streams[0]);
  return pc;
}

function closeScreenPeer(id) {
  const pc = screenPeers[id];
  if (!pc) return;
  delete screenPeers[id];
  pc.ontrack = pc.onicecandidate = pc.onnegotiationneeded = null;
  pc.close();
}

async function onScreenSignal({ from, data }) {
  let pc = screenPeers[from];
  if (!pc) {
    // The only legitimate reason to spin up a peer on receipt, rather than having opened
    // it ourselves, is a fresh offer from the room's current presenter.
    if (!data?.description || data.description.type !== 'offer' || !remotePresenter || from !== remotePresenter.id) return;
    pc = ensureIncomingPeer(from);
  }
  try {
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        await pc.setLocalDescription();
        socket.emit('screen-signal', { to: from, data: { description: pc.localDescription } });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (err) {
    console.error('screen signal failed', err);
  }
}

function attachStage(stream) {
  videoEl.srcObject = stream;
  videoEl.hidden = false;
  stageEmptyEl.hidden = true;
}

function resetStage() {
  videoEl.srcObject = null;
  videoEl.hidden = true;
  stageEmptyEl.hidden = false;
}

// --- server events -------------------------------------------------------------

function onScreenShareState({ presenter }) {
  const wasPresenting = presenting;
  presenting = !!(presenter && presenter.id === myId);
  remotePresenter = presenter && presenter.id !== myId ? presenter : null;

  if (presenting && !wasPresenting) {
    for (const id of currentRoomOtherIds()) ensureOutgoingPeer(id);
  } else if (!presenting && wasPresenting) {
    stopLocalCapture(); // stopped/denied server-side (e.g. we stood up mid-negotiation)
  }
  if (!presenter) resetStage(); // else the incoming pc will attach the stage once the track arrives
  renderPresenterUi();
}

function onScreenShareDenied({ reason, by }) {
  showShareStatus(reason === 'busy' ? (by || 'Seseorang') + ' sedang membagikan layar.' : 'Tidak bisa membagikan layar sekarang.');
  stopLocalCapture(); // getDisplayMedia had already succeeded before the server said no
}

function onScreenViewer({ id, watching: on }) {
  viewerWatching.set(id, on);
  renderWatchingCount();
}

// The server echoes our own `screen-view` back to us too (it broadcasts to the whole
// room, sender included), so viewerWatching already covers everyone -- no separate +1.
function renderWatchingCount() {
  const count = [...viewerWatching.values()].filter(Boolean).length;
  watchingEl.textContent = '\u{1F441}️ ' + count;
}

// --- room chat -------------------------------------------------------------

function sendRoomChat() {
  const text = chatInputEl.value.trim();
  if (!text || !activeChannel) return;
  socket.emit('room-chat', { text });
  chatInputEl.value = '';
}

function appendRoomChatRow(msg) {
  const row = document.createElement('div');
  row.className = 'mp-msg';
  const who = document.createElement('span');
  who.className = 'who';
  who.style.color = msg.color || '#e8dab8';
  who.textContent = msg.name || '?';
  row.append(who, document.createTextNode(': ' + msg.text));
  chatLogEl.appendChild(row);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function onRoomChat(msg) {
  appendRoomChatRow(msg);
}

function onRoomChatHistory(list) {
  chatLogEl.textContent = '';
  (list || []).forEach(appendRoomChatRow);
}

// Full teardown on disconnect: mirrors the reset the game overlay and arcade menu get.
function resetScreenshare() {
  leaveActiveRoom();
  activeMapId = activeRoomId = activeChannel = null;
  if (panelEl) panelEl.hidden = true;
}
