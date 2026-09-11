# Gaple

Indonesian domino for **4 seats**, standalone (like `games/tumble` and `games/werewolf`).
Opened from the office's **Main Game** menu — sit at a monitor-facing chair, pick
**🀄 Gaple**.

```bash
cd games/gaple
npm install
npm start        # http://localhost:3200
```

## Why this exists

The original version ran the whole game locally in each browser tab against 3 local
AI opponents — so four people opening Gaple from the office each got their own solo
game and never actually played together. The server now owns one shared table: it
deals, validates every move, and is the only thing that knows anyone's hand besides
themselves.

## How it plays

- Up to **4 real players** share one table. Whoever opens the game first takes seat 1,
  and so on; empty seats show "Kosong" and get filled with a bot the moment someone
  clicks **Mulai permainan**, so the table always starts.
- A 5th+ person joining while the table is full, or a round is in progress, watches as
  a spectator and is seated automatically the next time **Main Lagi** is pressed.
- If someone leaves mid-round, their seat is taken over by a bot immediately so the
  round doesn't stall waiting on a turn that will never come.
- Scores carry across rounds for as long as the table has at least one player; the
  table resets once everyone has left.

Domino rules are standard Gaple: highest double starts, tiles extend the chain from
either open end, four consecutive passes ends the round for whoever holds the fewest
pips.
