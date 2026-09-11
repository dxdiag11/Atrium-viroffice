# PROMPT.md — Virtual Office Chat Typing Bubble Sprite Sheet

## Goal

Create a **transparent PNG sprite sheet** for a virtual office game that contains an animated **chat typing bubble only** (no character, no UI, no background). The asset is intended for 2D game engines (Unity, Godot, Phaser, PixiJS, React Canvas, etc.) and should loop seamlessly.

---

## Style

- Cute modern office game aesthetic.
- Minimalist rounded speech bubble.
- Premium casual UI, similar to Slack / Discord typing indicator but in a warm game style.
- Soft shading with subtle glossy highlight.
- Thick dark outline suitable for scaling in games.
- Clean vector-like edges.
- Transparent background.

---

## Canvas Specification

- **Output:** PNG
- **Background:** Fully transparent.
- **Layout:** Sprite sheet.
- **Frames:** 12 frames.
- **Grid:** 4 columns × 3 rows.
- **Frame size:** 256 × 256 px each.
- **Total canvas:** 1024 × 768 px.

Each frame must occupy the exact same position and dimensions to simplify sprite animation.

---

## Bubble Design

### Bubble Shape

- Rounded rectangle.
- Bottom-left speech tail.
- Large corner radius.
- Soft cream/off-white fill (`#F7F4EF`).
- Slight inner shadow.
- Thin glossy highlight on top-left.
- Dark charcoal outline (`#3E4452`).
- Small floating motion marks around the bubble to create a subtle bounce effect.

### Dots

- Three circular typing dots.
- Dark gray (`#40485A`) when active.
- Light gray (`#C8CBD4`) when inactive.
- Dots evenly spaced horizontally.
- Perfect circles.

---

## Animation

The animation should feel **alive**, not static.

### Bubble Motion

Every frame includes a tiny movement:

- Vertical floating: ±3 px.
- Horizontal wobble: ±2 px.
- Scale breathing: 98% → 100% → 102%.
- Rotation: -1° → 1°.

Movement should be smooth and loop seamlessly.

### Typing Dot Timeline

| Frame | Dot State |
|-------|-----------|
| 1 | ● ○ ○ |
| 2 | ● ● ○ |
| 3 | ● ● ● |
| 4 | ○ ● ● |
| 5 | ○ ○ ● |
| 6 | ○ ● ● |
| 7 | ● ● ● |
| 8 | ● ● ○ |
| 9 | ● ○ ○ |
|10 | ○ ● ○ |
|11 | ○ ○ ● |
|12 | ● ○ ○ (matches frame 1 for perfect loop) |

Legend:

- **●** = Active dark dot.
- **○** = Inactive light gray dot.

The dots should fade smoothly between states instead of instantly appearing/disappearing.

---

## Animation Quality

- Smooth idle loop at **12 FPS**.
- No frame jitter.
- Bubble remains centered.
- Identical bubble size across frames.
- Seamless looping from Frame 12 back to Frame 1.

---

## Rendering Requirements

- Transparent PNG only.
- No character.
- No text.
- No prompt card.
- No background.
- No drop shadow outside the bubble.
- Crisp game-ready sprite asset.

---

## Keywords

chibi office game UI, typing indicator, speech bubble sprite sheet, transparent PNG, idle animation, cute productivity game, cozy virtual office, 2D game asset, seamless loop, polished vector-style interface.