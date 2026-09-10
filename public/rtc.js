// WebRTC mesh + per-peer spatial gain. Globals used: socket, falloff, NEAR, FAR.

const PC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let audioCtx = null;
let localStream = null;
let selfId = null;

// id -> { pc, polite, makingOffer, ignoreOffer, gain, panner, element }
const peers = {};

// Called from the Join button, so the user gesture is still active:
// both getUserMedia and AudioContext need one.
async function startVoice() {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
}

function setSelfId(id) {
  selfId = id;
}

function setMuted(muted) {
  if (!localStream) return;
  for (const track of localStream.getAudioTracks()) track.enabled = !muted;
}

function connectPeer(id) {
  if (peers[id] || !localStream || id === selfId) return peers[id];

  const pc = new RTCPeerConnection(PC_CONFIG);
  const peer = {
    pc,
    // Perfect negotiation tie-break: both sides derive the same answer from the ids.
    polite: selfId > id,
    makingOffer: false,
    ignoreOffer: false,
    gain: null,
    panner: null,
    element: null,
  };
  peers[id] = peer;

  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { to: id, data: { candidate: e.candidate } });
  };

  pc.onnegotiationneeded = async () => {
    // Only the impolite side offers. Both sides create the connection when a player
    // joins, so letting both offer produces glare on every single pair; the id
    // tie-break already tells us who goes first.
    if (peer.polite) return;
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      socket.emit('signal', { to: id, data: { description: pc.localDescription } });
    } catch (err) {
      console.error('negotiation failed', err);
    } finally {
      peer.makingOffer = false;
    }
  };

  pc.ontrack = (e) => attachAudio(peer, e.streams[0]);

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') pc.restartIce();
  };

  return peer;
}

function attachAudio(peer, stream) {
  if (peer.gain) return;

  // Chrome will not pump a remote MediaStream through WebAudio unless the stream is
  // also attached to a media element. The element stays muted; the graph below plays.
  const el = new Audio();
  el.srcObject = stream;
  el.muted = true;
  el.play().catch(() => {});
  peer.element = el;

  const source = audioCtx.createMediaStreamSource(stream);
  peer.gain = audioCtx.createGain();
  peer.gain.gain.value = 0; // start silent, the distance loop fades it in
  peer.panner = audioCtx.createStereoPanner();
  source.connect(peer.gain).connect(peer.panner).connect(audioCtx.destination);
}

function closePeer(id) {
  const peer = peers[id];
  if (!peer) return;
  delete peers[id];

  peer.pc.ontrack = peer.pc.onicecandidate = peer.pc.onnegotiationneeded = null;
  peer.pc.close();
  if (peer.gain) peer.gain.disconnect();
  if (peer.panner) peer.panner.disconnect();
  if (peer.element) {
    peer.element.srcObject = null;
    peer.element = null;
  }
}

// Called every frame from the render loop.
// Returns how many peers are audible, for the HUD.
function updateSpatialAudio(me, players) {
  if (!audioCtx) return 0;
  const now = audioCtx.currentTime;
  let audible = 0;

  for (const id of Object.keys(peers)) {
    const peer = peers[id];
    const other = players[id];
    if (!peer.gain || !other) continue;

    const dx = other.x - me.x;
    const dy = other.y - me.y;
    const gain = falloff(Math.hypot(dx, dy));
    if (gain > 0) audible++;

    // setTargetAtTime instead of .value: ramps smoothly, no zipper noise.
    peer.gain.gain.setTargetAtTime(gain, now, 0.08);
    peer.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / FAR)), now, 0.08);
  }
  return audible;
}

async function handleSignal(from, data) {
  if (!localStream) return; // not in the room yet, nothing to negotiate with
  const peer = peers[from] || connectPeer(from);
  if (!peer) return;
  const pc = peer.pc;

  try {
    if (data.description) {
      const collision =
        data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;

      await pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        await pc.setLocalDescription();
        socket.emit('signal', { to: from, data: { description: pc.localDescription } });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!peer.ignoreOffer) throw err;
      }
    }
  } catch (err) {
    console.error('signal handling failed', err);
  }
}
