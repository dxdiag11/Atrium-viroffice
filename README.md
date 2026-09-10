# Atrium

A virtual office with proximity voice. Walk close to someone and their mic fades in;
walk away and it fades out.

```bash
npm install
npm start          # http://localhost:3100  (office only)
npm run start:all  # office + all desk games together
```

## Desk games

Sit on a chair that faces a monitor (reception desk, phone booths, the open-plan
pods) and a **Main Game** menu pops up: **Gaple**, **Tumble Rush**, or **Werewolf**.
Pick one and it runs in an overlay right inside the office — "✕ Keluar" drops you
back at your desk.

Each game is its own standalone server, unchanged from a plain `games/*` app:
`gaple` :3200, `tumble` :3300, `werewolf` :3400. The office iframes them from
`http://<host>:<port>/?name=…&color=…` (so your office name/colour carry in) and a
game's own "back" button closes the overlay via `postMessage`. `npm run start:all`
(see `scripts/run-all.js`) launches everything. Because the games are served over
plain http, open the office at `http://localhost:3100` for the menu to work — an
https LAN origin can't iframe an http game (mixed content).

**Werewolf** (6–12 players) has no audio of its own: daytime discussion uses the
office's proximity voice, which keeps running in the parent page while the game
overlay is open. See `games/werewolf/README.md`.

Which chairs count as workstations is derived in `public/office.js`: any `chair`
within 80px of a `desk` marked `screen: true`. Move or add a monitor desk there and
the game seats follow.

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

## Walkie-talkie

Hold `T` to transmit to everyone on the floor, however far away they are. Release to
drop the channel.

One person holds the channel at a time -- the server decides, so whoever pressed first
wins and everyone else sees `channel busy`. A transmission arrives band-limited and
saturated, with a squelch click on each end, so it is obviously coming over the air
rather than from someone standing next to you. Anyone already close enough to hear you
directly does *not* get the radio copy: no doubled voice.

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
but not across arbitrary NATs. Voice only: no video, chat, or screen share.
