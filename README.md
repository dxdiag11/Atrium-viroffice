# Atrium

A virtual office with proximity voice. Walk close to someone and their mic fades in;
walk away and it fades out.

```bash
npm install
npm start        # http://localhost:3100
```

## Testing with someone else on your LAN

Browsers refuse `getUserMedia` on a plain `http://` origin unless the host is
`localhost`, so a second machine needs https:

```bash
./make-cert.sh   # self-signed cert for your current LAN IP
npm start        # now serves https://<your-lan-ip>:3443
```

Send them the `share:` link that `npm start` prints. The cert is self-signed, so both
of you get a "Your connection is not private" page once: **Advanced -> Proceed**. After
that the origin counts as secure and the mic prompt appears as normal.

Re-run `./make-cert.sh` whenever your LAN IP changes. macOS may ask to allow incoming
connections for `node` the first time — allow it, or nobody can reach you.

Open two tabs, Join in both, allow the mic. **Use headphones** or the two tabs will
feed back. Move with WASD / arrow keys. Press `` ` `` to draw the audio range rings.

## The office

`public/office.js` is the whole floor plan as data: rooms (with their doorways),
furniture, and where the chairs face. Walls you collide with, chairs you can sit on, and
the SVG that gets drawn are all derived from it, so there is nothing to keep in sync --
move a desk in that file and the collision box moves with it.

`public/office-svg.js` turns that data into the SVG. Add a new furniture type by adding
a shape function to `SHAPES` there, and an entry to `SOLID` in `office.js` if people
should not be able to walk through it.

Sitting: walk onto a chair and press `E`. Pressing `E` again, or any movement key, gets
you back up.

## Swapping in the real map

Drop the artwork at `public/assets/map.png` and it replaces the generated SVG as the
background. The collision boxes still come from `office.js`, so update the room and
furniture coordinates there to line up with the art.

## Tuning the audio

`public/geom.js`: `NEAR` (full volume within this distance) and `FAR` (silent at or
beyond it), in map pixels.

## Limits

WebRTC mesh, no SFU — every peer connects to every other peer, which is fine up to
roughly 6-8 people in the room. No TURN server, so this works on localhost and a LAN
but not across arbitrary NATs. Voice only: no video, chat, or screen share.
