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

`NO_TLS=1 npm start` goes back to plain http on 3100 without deleting the cert.
Re-run `./make-cert.sh` whenever your LAN IP changes. macOS may ask to allow incoming
connections for `node` the first time — allow it, or nobody can reach you.

Open two tabs, Join in both, allow the mic. **Use headphones** or the two tabs will
feed back. Move with WASD / arrow keys. Press `` ` `` to draw the audio range rings. Press `Enter`
to chat and `Escape` to get movement back.

## The office

`public/office.js` is the whole floor plan as data: rooms (with their doorways),
furniture, and where the chairs face. Walls you collide with, chairs you can sit on, and
the SVG that gets drawn are all derived from it, so there is nothing to keep in sync --
move a desk in that file and the collision box moves with it.

`public/office-svg.js` turns that data into the SVG. Add a new furniture type by adding
a shape function to `SHAPES` there, and an entry to `SOLID` in `office.js` if people
should not be able to walk through it.

Sitting: walk onto a chair and press `E`. Pressing `E` again, or any movement key, gets
you back up. One person per chair.

Players are solid. Overlaps are resolved by pushing apart rather than by blocking, so
walking into someone at an angle slides you around them instead of wedging you. Both
clients push away from each other, which is why a head-on meeting separates evenly. A
seated player is the exception: they never get shoved out of their chair, everyone else
gives way around them. Nobody is ever pushed through a wall.

## Swapping in the real map

Drop the artwork at `public/assets/map.png` and it replaces the generated SVG as the
background. The collision boxes still come from `office.js`, so update the room and
furniture coordinates there to line up with the art.

## Walkie-talkie

Hold `T` to transmit to everyone on the floor, however far away they are. Release to
drop the channel.

One person holds the channel at a time -- the server decides, so whoever pressed first
wins and everyone else sees `channel busy`. A transmission arrives band-limited and
saturated, with a squelch click on each end, so it is obviously coming over the air
rather than from someone standing next to you. Anyone already close enough to hear you
directly does *not* get the radio copy: no doubled voice.

A handset slides in on the right of *every* screen while the channel is open, with the
channel number, who is talking, and a level meter fed from their live mic. The person
holding the key gets the transmitting version -- red light blinking, antenna radiating,
push-to-talk button pressed in, `TX` -- while everyone else gets a green `RX` handset
with the talker's name. `public/walkie.js` drives it; the SVG itself is in
`public/index.html` and its trim is all CSS.

The channel auto-releases after 30 seconds, and on blur or disconnect. A browser that
swallows the `keyup` -- alt-tab, lock screen, crashed tab -- would otherwise hold it
shut for everyone.

## Tuning the audio

`public/geom.js`: `NEAR` (full volume within this distance) and `FAR` (silent at or
beyond it), in map pixels, plus `RADIO_LEVEL` for how loud walkie transmissions are.
The filter shape and squelch live in `attachAudio` and `playSquelch` in
`public/rtc.js`.

## Limits

WebRTC mesh, no SFU — every peer connects to every other peer, which is fine up to
roughly 6-8 people in the room. No TURN server, so this works on localhost and a LAN
but not across arbitrary NATs. Text chat is global by default; `@name` narrows a message to just the people named
(server-side, so nobody else receives it). No video, screen share, or persistence --
chat history lives in memory, and is wiped both on restart and the moment the last
person leaves the office.
