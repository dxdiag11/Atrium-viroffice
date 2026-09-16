// The recreation DJ: scenery, not a peer. Traced straight out of male-006/move.png so
// the booth shows the same character the sheet draws, in the sheet's own mixing poses.
//
// That sheet is a 5 x 3 grid whose cells are uneven, so the four front-facing mixing
// poses are addressed by the transparent gutters between them rather than by division.
// Each of those poses ships its own controller, drawn far larger relative to the body
// than the map's painted deck, so every frame is cut at the row where the controller
// starts: what is left is the character down to his hands, and the artwork's mixer
// stands in for the one that was cut away.
const DJ_SHEET = '/assets/characters/male-006/move.png';

// x/y is where the hands land on the painted mixer; `body` is the idle pose's full
// standing height in sheet pixels, which maps to the 64px avatars use on the map.
const DJ_STAGE = {mapId:'recreation', x:1203, y:168, height:64, body:345, beat:520};

// cut: first row of the pose's own controller. chest: the white tee's centre, which is
// the only landmark that stays put while the shoulders lean from frame to frame.
const DJ_POSES = [
  {x:270, y:0,   w:354, top:35, cut:243, chest:187},
  {x:839, y:0,   w:349, top:56, cut:244, chest:183},
  {x:839, y:733, w:349, top:44, cut:235, chest:165},
  {x:270, y:733, w:354, top:28, cut:226, chest:196},
];

let djSheet = null, djPending = null;

// Failure is silent on purpose: the booth simply stays empty rather than blocking a map.
function loadDjNpc() {
  if (!djPending) djPending = loadImage(DJ_SHEET).then(img=>{djSheet=img;return img;});
  return djPending;
}

// Depth key for the avatar sort, so anyone crossing the strip behind the decks passes
// behind him. Null on every map without a booth.
function djAnchorY(mapId) { return djSheet && mapId===DJ_STAGE.mapId ? DJ_STAGE.y : null; }

function drawDjNpc(context, mapId, now) {
  if (djAnchorY(mapId)===null) return false;
  const pose = DJ_POSES[Math.floor(now/DJ_STAGE.beat)%DJ_POSES.length];
  const scale = DJ_STAGE.height/DJ_STAGE.body, height = pose.cut-pose.top;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(djSheet, pose.x, pose.y+pose.top, pose.w, height,
    DJ_STAGE.x-pose.chest*scale, DJ_STAGE.y-height*scale, pose.w*scale, height*scale);
  return true;
}
Object.assign(globalThis,{DJ_STAGE,DJ_POSES,loadDjNpc,djAnchorY,drawDjNpc});
