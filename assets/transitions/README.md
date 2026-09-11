# Root and fern transition panels

`root-fern-left.png` and `root-fern-right.png` are separate 1800 × 2400 PNG RGBA assets. Their outer sides and at least 80% of each panel width are fully opaque over the entire height. Only the irregular leading fringe borders transparency. Both are static artwork; animate panel position in application code.

The imagegen sources were 1086 × 1448 RGB. Local processing removed baked checkerboard backgrounds, cleaned edge colors, expanded the opaque bodies, sealed pinholes and resampled the results. Final dimensions do not imply additional native generated detail.

## Verified closed placement

For viewport dimensions `vw` and `vh`:

```js
const scale = Math.max(0.70 * vw / 1800, 1.10 * vh / 2400);
const panelWidth = Math.ceil(1800 * scale);
const panelHeight = Math.ceil(2400 * scale);
const leftX = -Math.round(0.02 * vw);
const rightX = vw - panelWidth + Math.round(0.02 * vw);
const y = Math.floor((vh - panelHeight) / 2);
```

Render both at `panelWidth × panelHeight`, clip to the viewport and place the right panel above the left. Preserve image alpha and full layer opacity when closed. The 80% opaque bodies overlap by approximately 8% of viewport width at the width-constrained minimum scale. Fit must be recalculated on resize. Do not independently fit each panel to half the viewport.

Pixel-level composition checks passed with zero uncovered pixels for portrait phone 390 × 844, landscape phone 844 × 390, desktop 1920 × 1080 and ultrawide 3440 × 1440. See `output/imagegen/root-fern/alpha-coverage-proof.jpg` and `alpha-validation.json` for visual and numeric evidence.

Suggested timing from the source brief: close 450 ms, hold until destination is ready with a 120 ms minimum, open 500 ms. Preload assets, lock movement during travel, preserve voice connections and provide a reduced-motion fade. Runtime integration has not been added.
