# Atrium — Root and Fern Transition Assets

## Konsep dan cara pakai

Generate artwork statis terlebih dahulu, lalu animasikan posisi dua panel melalui kode. Tidak perlu video atau sprite sheet animasi. Panel kiri bergerak masuk dari kiri dan panel kanan dari kanan sampai menutup layar; map diganti saat tertutup; kedua panel kemudian membuka dari tengah menuju samping.

Lampirkan kedua gambar map cave sebagai referensi gaya untuk setiap generasi. Generate panel kiri dahulu. Untuk panel kanan, lampirkan juga hasil panel kiri sebagai referensi material dan kepadatan, bukan untuk dicerminkan persis.

Gunakan prompt utama berikut untuk kedua panel, lalu tambahkan salah satu instruksi sisi di bawah. Generate satu PNG per sisi, bukan dua panel dalam satu gambar.

## Shared prompt — include in BOTH generations

Create ONE premium hand-painted 2D transparent PNG foreground asset for a horizontal closing-and-opening screen transition in Atrium, a cozy subterranean biophilic virtual-office browser game.

REFERENCE ROLE
Use the attached cave-office maps as authoritative references for art style, color palette, texture, and atmosphere only. Match their warm amber lighting, earthy brown roots and wood, moss-green and olive plants, refined painted outlines, restrained highlights, and tactile commercial game-art finish. Do not reproduce their rooms, furniture, layout, or characters. If another transition panel is attached, use it to match this pair's rendering, lighting, root thickness, and foliage scale without copying its silhouette exactly.

ASSET PURPOSE
This is one of TWO separate opaque botanical curtains that slide horizontally over the gameplay viewport. The left curtain enters from the left; the right curtain enters from the right. Their leafy leading edges overlap at the center until the entire game view is hidden. The game then changes maps invisibly, and the curtains slide outward again.

Draw only the static artwork for the requested side. Do not illustrate movement, multiple frames, a finished transition screen, or an underlying game map. Animation will be performed in code.

SUBJECT AND DESIGN
A dense, continuous living curtain of intertwined tree roots, layered fern fronds, compact moss, and restrained broad understory leaves, inspired by lush vegetation growing inside a warmly lit limestone cave entrance.

- Strong organic woody roots provide the visual structure, with several medium-thick roots weaving vertically and diagonally across the curtain.
- Mature fern fronds form generous overlapping fans between the roots. Use a readable mix of larger fern silhouettes and smaller supporting foliage rather than thousands of tiny repetitive leaves.
- Moss softens root junctions and fills gaps. Deep shaded foliage forms a continuous botanical backing layer behind the visible roots and ferns.
- Plants feel healthy, lush, soft, welcoming, and maintained. Roots are natural and rounded, never thorny, skeletal, aggressive, or tentacle-like.
- Foliage and roots are the dominant materials. Do not substitute a rock slab, wooden door, metal gate, stone wall, cloud, or smoke bank.
- Use warm bark browns, deep forest green, olive, muted moss, subtle jade, and small warm amber reflected highlights. Lighting comes from diffuse cave lamps outside the image; do not draw lamps, bulbs, or glowing objects.
- Avoid bright emerald saturation, neon green, electric blue, high-contrast black regions, or fantasy glow.
- Give the curtain enough surface variation to feel rich, but maintain readable broad shapes and cohesive visual weight at screen size.

ART DIRECTION
Premium polished hand-painted 2D game asset, consistent with the attached maps. Fine confident outlines, soft painted texture, controlled shading, natural foliage contours, and warm subtle highlights. Crisp silhouette with clean antialiased alpha edges. No photographic foliage, no photorealistic compositing, no 3D rendering, no pixel art, no flat vector icon style.

This is a screen-space foreground curtain, viewed face-on as a flat illustrated layer. The reference maps use top-down cameras, but this asset is NOT a top-down floor plan or a plant viewed from overhead. It must read as a nearby curtain of vegetation passing in front of the player's view. Avoid camera tilt, perspective depth, vanishing points, or a tunnel illustration.

CANVAS AND ALPHA — CRITICAL
- Portrait canvas, target 1800 × 2400 pixels, PNG RGBA with genuine transparency.
- The curtain is a continuous mass anchored to its specified OUTER canvas edge and extending to both the top and bottom edges. Its continuation beyond these three edges is intentional because they will sit outside the screen viewport during use.
- Only the INNER leading edge has an irregular natural foliage silhouette against transparency.
- Use a deeply layered opaque botanical backing across the curtain's body. All internal gaps between foreground roots and leaves must reveal other shaded leaves, moss, or bark, NOT transparent holes.
- Keep the main body fully opaque. Soft shading is allowed, but no translucent leaves, see-through central areas, mist, or faded body opacity.
- Transparent space is permitted only outside the organic inner leading silhouette. Isolated fern tips may have small natural gaps at the leading fringe, but not within the solid coverage body.
- Extend opaque material to the full height of the canvas. Do not leave transparent top or bottom margins or rounded transparent outer corners.
- Do not draw a checkerboard transparency pattern. Do not add a white, black, colored, gradient, or scenery background behind the asset.
- No detached leaves floating outside the curtain. Every prominent protrusion must belong visibly to the main root-and-fern structure.

COMPOSITION FOR ANIMATION
Keep the inner edge lush and irregular, with overlapping fern fans and roots creating a soft organic meeting line. Avoid a straight vertical cut, a symmetrical arch, or a central doorway. The two finished panels must function through generous overlap, not exact jigsaw interlocking. Their bodies must be solid enough to conceal the map even when the leafy tips do not align.

The curtain's broad shapes should remain attractive when the panel is translated horizontally as one rigid image. Avoid long delicate hanging vines that would obviously require independent swinging animation. No baked motion blur, speed lines, directional particles, falling leaves, or shadows cast onto an unseen background.

STRICT EXCLUSIONS
No people, characters, animals, faces, eyes, hands, skulls, weapons, monsters, horror imagery, predatory plants, thorns, fantasy portals, magic runes, crystals, furniture, rooms, paths, water, clouds, fog, smoke, UI, text, labels, logos, watermark, borders, frame mockups, arrows, or animation diagrams. No empty central opening within the opaque curtain body.

OUTPUT
One isolated static root-and-fern curtain panel only, for the specified side, on genuine transparent PNG. Preserve the alpha channel. No preview sheet, no second panel, no alternative design, and no embedded background map.

## Side instruction A — LEFT PANEL

Generate the LEFT transition curtain.

Anchor the curtain to the LEFT canvas edge. The dense botanical body extends continuously from x = 0 to at least 80% of canvas width across the ENTIRE image height, with no transparent holes. Its irregular fern-and-root leading edge projects toward the RIGHT, varying within approximately 80–97% of canvas width. Only the space to the right of that organic silhouette is transparent.

Roots and fern fans grow from the left-side body toward the right-facing leading fringe. Use a few recognizable large fern fans near the upper-middle and lower-middle leading edge, balanced by rounded woody roots. Do not create a hollow center, decorative picture frame, or open cave entrance. Keep the outer left edge, top edge, and bottom edge fully covered by botanical material.

This panel will slide RIGHTWARD from offscreen left to cover the left portion and overlap the viewport center. Produce only this left panel.

## Side instruction B — RIGHT PANEL

Generate the RIGHT transition curtain, visually matching the attached left panel while retaining a distinct natural arrangement. Do not simply mirror the left panel, and do not change its art style or foliage scale.

Anchor the curtain to the RIGHT canvas edge. The dense botanical body extends continuously from at most 20% of canvas width to x = 100% across the ENTIRE image height, with no transparent holes. Its irregular fern-and-root leading edge projects toward the LEFT, varying within approximately 3–20% of canvas width. Only the space to the left of that organic silhouette is transparent.

Roots and fern fans grow from the right-side body toward the left-facing leading fringe. Use complementary but asymmetrical fern groupings and woody root bends. Do not create a hollow center, decorative picture frame, or open cave entrance. Keep the outer right edge, top edge, and bottom edge fully covered by botanical material.

This panel will slide LEFTWARD from offscreen right to cover the right portion and overlap the viewport center. Produce only this right panel.

## Delivery and implementation notes

Suggested final filenames:
- `assets/transitions/root-fern-left.png`
- `assets/transitions/root-fern-right.png`

Generation is complete only after inspecting alpha coverage: confirm true transparency outside the leading edge, no checkerboard baked into the file, no interior pinholes, and fully opaque outer/top/bottom edges. Verify both panels together over a bright contrasting test background before integration. Use an image-edit pass if coverage needs repair.

Do not assume that two images each rendered at half the viewport width will cover the screen. Size panels using their fully opaque bodies, leaving generous center overlap. For the requested 80% opaque body, an initial fit rule is: rendered panel width >= 0.70 × viewport width AND rendered panel height >= 1.10 × viewport height, preserving aspect ratio. Compute a uniform scale meeting both constraints; position outer edges beyond the viewport and clip overflow. Recheck coverage for portrait phones, landscape screens, and ultrawide screens. Actual alpha bounds take precedence over these estimates.

Suggested starting timing, adjustable after preview:
- Close inward over approximately 450 ms with a smooth ease-in-out.
- Once fully covered, switch map and reposition the character/camera. Hold closed until the destination is ready, with a short minimum pause around 120 ms.
- Open outward over approximately 500 ms with a soft ease-out; no bounce or spring.

Preload both panels and the destination background. Keep panels above the map, character sprites, and world-space interaction hints. Keep essential walkie/chat controls usable above the transition layer where appropriate. Lock movement during travel, preserve voice connections, and prevent return-trigger loops. Provide a reduced-motion alternative using a brief fade. The artwork itself needs no frame animation, no video, and no sprite sheet.
