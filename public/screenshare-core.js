// Shared pure meeting-room logic: used by server.js and test.js (require), mirrors chat-core.js.

const ROOM_CHAT_MAX = 20; // messages kept per room, for late joiners

function roomChannel(mapId, roomId) {
  return `room:${mapId}:${roomId}`;
}

let roomMsgSeq = 0;

function makeRoomMessage(fields) {
  return {
    id: 'r' + ++roomMsgSeq,
    at: Date.now(),
    from: null,
    name: null,
    color: null,
    text: '',
    ...fields,
  };
}

function rememberRoomMessage(roomChat, channel, msg) {
  const list = roomChat.get(channel) || [];
  list.push(msg);
  if (list.length > ROOM_CHAT_MAX) list.shift();
  roomChat.set(channel, list);
  return list;
}

// One presenter per room at a time -- same exclusivity as the walkie channel, just keyed
// per room instead of a single global slot.
function presenterFor(presenters, channel) {
  return presenters.get(channel) || null;
}

function startPresenting(presenters, channel, { id, name, kind }, now = Date.now()) {
  if (presenters.has(channel) && presenters.get(channel).id !== id) return null;
  const state = { id, name, kind, startedAt: now };
  presenters.set(channel, state);
  return state;
}

// Same check serves both an explicit "stop sharing" request and a forced release on
// stand/disconnect: either way, only the current presenter's own id may clear the slot.
function stopPresenting(presenters, channel, id) {
  const current = presenters.get(channel);
  if (!current || current.id !== id) return false;
  presenters.delete(channel);
  return true;
}

Object.assign(globalThis, {
  ROOM_CHAT_MAX, roomChannel, makeRoomMessage, rememberRoomMessage,
  presenterFor, startPresenting, stopPresenting,
});
