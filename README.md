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
feed back. Move with WASD / arrow keys. Press `` ` `` to draw the audio range rings.

## The office

The background is `assets/maps/atrium-cave-office.png`, served directly at
`/assets/maps/atrium-cave-office.png`. Its world coordinates are 1499 × 1049 pixels.
`public/office.js` defines the cave's walkable floor polygons, bridge crossings,
furniture collision rectangles, reception spawn, and 51 interactive seats in those
same coordinates. Both server and client use this model. Rocks, water and solid
furniture block movement; the server also checks the path of incoming moves.

The camera follows the player and centers the map on larger screens. The old
`office-svg.js` renderer is no longer loaded by the application.

Sitting: walk onto a chair and press `E`. Pressing `E` again, or any movement key, gets
you back up.

## Characters

Before joining, choose one of the ten characters from `assets/characters/` and enter
your name. The browser remembers the last joined choice. `public/characters.js`
contains the shared character allowlist; the server validates and includes the chosen
ID in player snapshots so other participants see the same character.

`public/sprites.js` uses `move.png` for idle/walking and `sit-talk.png` for seated and
speaking gestures. Each image is sliced proportionally into four columns and three
rows using its actual size, supporting both supplied export dimensions without
rewriting the assets. Nearby voice and walkie-talkie still use the existing WebRTC
mesh; a microphone energy meter publishes only a speaking boolean for animation.

Asset limitations: the supplied sheets have no back-facing row, so moving/facing up
uses the front row. Some walk poses and character scales still need art cleanup.
`male-001/sit-talk.png` has been cleaned locally into a transparent RGBA sheet;
its seated/speaking poses are enabled. Its original export is backed up in
`output/implementation/male-001-sit-talk-original.png`. Other seated sheets include
chairs; these are rendered over the chairs in the flat map artwork.

Run `npm test` for map reachability, collision/path checks, character asset coverage,
sprite slicing and existing spatial-audio math tests. Browser smoke testing was also
performed with two clients and synthetic microphones (not a real LAN audio-quality test).

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
