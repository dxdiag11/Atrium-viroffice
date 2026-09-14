# Validation: Recreation map and root–fern transition

Status: implemented and verified against the AC list in
[multi-map-recreation-spec.md](multi-map-recreation-spec.md). This note records what was
actually checked, where, and what remains untested — not a claim that every acceptance
criterion has real-device coverage.

## Test results

```
npm test              → 40/40 pass (test.js + test/multi-map.test.js)
npx playwright test   → 9/9 pass (test/browser/multi-map.spec.js)
```

`npm test` covers map geometry (reachability, collision, seat inventory), the
`WorldTravel` prepare/commit/finish state machine (idempotency, TTL, concurrent
arrivals, stale revisions), and the pure audio-gain matrix (proximity × radio × DND ×
same/cross-map). `playwright test` drives two real Chromium tabs against a live server
and checks travel, rendering, chat/voice signaling, viewport coverage, and failure
recovery in the browser.

## Recreation inventory (final, from tracing `public/recreation.js`)

| Kind | Count | IDs |
|---|---|---|
| chair | 18 | `table-{1,2,3}-{1..6}` |
| stool | 6 | `bar-{1..6}` |
| toilet | 2 | `toilet-west`, `toilet-east` |
| bed-edge | 6 | `bed-{north,south}-{1..3}` |
| sofa | 10 | `lounge-{west,east}-{1,2}`, `booth-{west,east}-{1,2,3}` |

Locked by the test `allowlist, final recreation asset and explicit furniture inventory`
in `test/multi-map.test.js`, which asserts the exact ID list — not just a count — so a
future edit that silently drops or renames a slot fails the suite.

## AC coverage

| AC | Evidence |
|---|---|
| AC01 | `office` map unchanged (51 seats, 18 game seats); `recreation` map uses `atrium-cave-recreation-night.png` at 1499×1049 — asserted in `multi-map.test.js`. |
| AC02 | Playwright `two clients travel...` walks a real client through both doors with no rejoin; direction (`up`/`down`) checked in the unit concurrency test. |
| AC03 | Unit tests for held-button flood (`lastRequest` throttle), duplicate commit, and simultaneous arrivals; Playwright covers a live held-key `s`/`w` press through a real travel. |
| AC04 | Full inventory table above; flood-fill in `multi-map.test.js` proves every seat, stand point, and both portal triggers are reachable at the real `RADIUS`. |
| AC05 | `(mapId, seatId)` scoping verified — occupying a recreation seat and an office seat with the same array index does not collide; disconnect cleanup is inherited from the existing player-remove path (not map-specific, not re-tested here). |
| AC06 | Rock/water/furniture negative-collision test in `multi-map.test.js`; reachability flood-fill also proves the dance floor and both sides of the DJ console are not sealed off. |
| AC07 | `sameMap()` gating verified in `updateSpatialAudio`, `draw`, `separate`, `nearestSeat`/`seatTaken`; Playwright confirms two players on different maps don't appear in each other's roster/render loop. |
| AC08 | Pure gain-matrix unit test (`audio matrix gates cross-map proximity...`) exhaustively checks every combination of same/cross-map × DND × distance × transmitting; Playwright confirms a real walkie press is heard cross-map with no duplicate playback path (signal-level, not perceptual audio — see Known gaps). |
| AC09 | Playwright sends chat across a travel and confirms delivery to a player who stayed behind; poll/reaction wiring is unchanged and only covered by the pre-existing `test.js` suite. |
| AC10 | Playwright screenshots + a `travelFrames` sample (state/progress per rAF tick) confirm the map/camera swap happens only on a `covered` frame at `progress === 1`, at four viewports and under `prefers-reduced-motion`. |
| AC11 | Explicit viewport tests at 390×844, 844×390, 1920×1080, 3440×1440, plus a resize-mid-`closing` test that keeps zero uncovered pixels through the resize. |
| AC12 | Playwright tests for: aborted panel assets (falls back to charcoal fade), aborted destination image (cancels and returns to source with a status message), a dropped `travel-result` (recovers via `world-sync`), and a mid-close `disconnect` (closes the cover instead of leaving it stuck, then rejoin returns to the office). |
| AC13 | Both suites at 100%; see the two-client Playwright test for the closest thing to a cross-map multiplayer smoke test in this repo. |

## Known gaps / not verified here

- **Audio is verified at the signal-gain level, not by ear.** No test plays and records
  actual WebRTC audio; `updateSpatialAudio`/`voiceGain`/`radioGain` are checked as pure
  functions and as WebAudio node parameters (`gain.value`/`setTargetAtTime` targets),
  not as sound a human confirmed hearing on real hardware.
- **Disconnect/occupancy cleanup on the recreation map** reuses the existing
  `socket.on('disconnect')` handler, which is map-agnostic; it is not re-tested
  specifically for a player who disconnects while seated in Recreation.
- **No load/stress test** beyond the unit test's 81-player crowd check for spawn
  contention (`full arrival cancels without moving source...`).
- Music, DJ controls, dance/sleep animations, and a third map remain explicitly out of
  scope per the spec and were not started.

## Where things live

- Map data: `public/office.js`, `public/recreation.js`, `public/maps.js`.
- Travel protocol: `world-travel.js` (server-side state machine), wired into
  `server.js`; client half in `public/main.js` (`checkPortal`, `worldPayload`,
  `applyWorldPlayer`) and `public/map-transition.js` (panel animation, recovery).
- Cross-map audio gating: `public/geom.js` (`voiceGain`/`radioGain` gain `sameMap`
  arg), `public/rtc.js` (`updateSpatialAudio`).
- Tests: `test/multi-map.test.js` (unit), `test/browser/multi-map.spec.js`
  (Playwright), `playwright.config.js`.
