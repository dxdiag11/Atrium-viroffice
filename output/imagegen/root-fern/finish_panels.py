"""Remove baked neutral checkerboards and verify static transition assets.

Run with Pillow, NumPy and SciPy installed. Sources remain untouched.
"""
from pathlib import Path
import json
import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[3]
WORK = Path(__file__).resolve().parent
DEST = ROOT / 'assets' / 'transitions'
DEST.mkdir(parents=True, exist_ok=True)
W, H = 1800, 2400
report = {'size': [W, H], 'panels': {}, 'coverage': []}

def finish(side):
    rgb = np.array(Image.open(WORK / f'root-fern-{side}-draft.png').convert('RGB'))
    if side == 'right':
        rgb = rgb[:, ::-1].copy()
    h, w = rgb.shape[:2]
    # The generated backing is bright neutral gray; all botanical colors are chromatic.
    chroma = np.ptp(rgb.astype(np.int16), axis=2)
    background = (chroma < 22) & (rgb.min(axis=2) > 95)
    labels, count = ndi.label(~background)
    areas = np.bincount(labels.ravel())
    areas[0] = 0
    body = labels == areas.argmax()
    # Fill enclosed pinholes; retain natural gaps connected to the leading fringe.
    solid = ndi.binary_fill_holes(body)
    core = ndi.binary_erosion(body, iterations=2, border_value=1)
    _, nearest = ndi.distance_transform_edt(~core, return_indices=True)
    clean = rgb.copy()
    edge = ~core
    clean[edge] = rgb[nearest[0][edge], nearest[1][edge]]
    alpha = solid.astype(np.uint8) * 255
    # Expand the continuous body to 82%, keeping 3% clear outside the furthest tips.
    safe = min(np.flatnonzero(~row)[0] if (~row).any() else w for row in solid) - 3
    tip = int(np.where(solid)[1].max())
    if safe <= 0:
        raise RuntimeError(f'{side}: outer edge has a hole')
    src_x = np.interp(np.arange(W), [0, .82*W, .97*W, W-1], [0, safe, tip+2, w-1])
    src_y = np.linspace(0, h-1, H)
    yy, xx = np.meshgrid(src_y, src_x, indexing='ij')
    rgba = np.dstack([clean, alpha])
    out = np.empty((H, W, 4), dtype=np.uint8)
    for c in range(4):
        out[:, :, c] = np.rint(np.clip(ndi.map_coordinates(rgba[:, :, c].astype(float), [yy, xx], order=1, mode='nearest'), 0, 255)).astype(np.uint8)
    # Resampling can close a tiny fringe gap around a subpixel hole. Seal it.
    opaque = out[:, :, 3] == 255
    repairs = (ndi.binary_fill_holes(opaque) & ~opaque) | (ndi.binary_fill_holes(out[:, :, 3] > 0) & (out[:, :, 3] == 0))
    if repairs.any():
        _, near = ndi.distance_transform_edt(~opaque, return_indices=True)
        out[repairs] = out[near[0][repairs], near[1][repairs]]
    if side == 'right':
        out = out[:, ::-1].copy()
    im = Image.fromarray(out)
    im.save(DEST / f'root-fern-{side}.png')
    a = out[:, :, 3]
    inner_body = a[:, :int(W*.8)] if side == 'left' else a[:, math.ceil(W*.2):]
    outer = a[:, 0] if side == 'left' else a[:, -1]
    holes = ndi.binary_fill_holes(a > 0) & (a == 0)
    assert inner_body.min() == 255 and outer.min() == 255
    assert not holes.any() and (a == 0).any()
    assert inner_body[0].min() == inner_body[-1].min() == 255
    report['panels'][side] = {
        'mode': im.mode, 'source_size': [w, h], 'size': [W, H],
        'transparent_pixels': int((a == 0).sum()),
        'antialiased_pixels': int(((a > 0) & (a < 255)).sum()),
        'opaque_body_min_alpha': int(inner_body.min()),
        'outer_edge_min_alpha': int(outer.min()),
        'interior_pinholes': int(holes.sum()),
        'source_opaque_body_fraction': round(safe / w, 4),
        'final_guaranteed_body_fraction': .80,
    }
    return im

left, right = finish('left'), finish('right')

def pair(vw, vh):
    # Place outer edges 2% beyond viewport; 80% body guarantees overlap.
    scale = max(.70 * vw / W, 1.10 * vh / H)
    pw, ph = math.ceil(W*scale), math.ceil(H*scale)
    l, r = [im.resize((pw, ph), Image.Resampling.LANCZOS) for im in (left, right)]
    layer = Image.new('RGBA', (vw, vh))
    layer.alpha_composite(l, (-round(.02*vw), (vh-ph)//2))
    layer.alpha_composite(r, (vw-pw+round(.02*vw), (vh-ph)//2))
    a = np.array(layer.getchannel('A'))
    uncovered = int((a < 255).sum())
    assert uncovered == 0, (vw, vh, uncovered)
    report['coverage'].append({'viewport': [vw, vh], 'panel_rendered': [pw, ph], 'uncovered_pixels': uncovered})
    bg = Image.new('RGBA', (vw, vh), '#ff00d4')
    bg.alpha_composite(layer)
    return bg.convert('RGB')

sheet = Image.new('RGB', (1600, 1220), '#171d23')
draw = ImageDraw.Draw(sheet)
for i, im in enumerate((left, right)):
    thumb = im.resize((450, 600), Image.Resampling.LANCZOS)
    bg = Image.new('RGBA', thumb.size, '#ff00d4' if i == 0 else '#00eaff')
    bg.alpha_composite(thumb)
    sheet.paste(bg.convert('RGB'), (20+i*480, 40))
    draw.text((20+i*480, 15), 'LEFT on magenta' if i == 0 else 'RIGHT on cyan', fill='white')
for i, (vw, vh) in enumerate(((390, 844), (1920, 1080), (3440, 1440), (844, 390))):
    preview = pair(vw, vh)
    preview.thumbnail((750, 235))
    x, y = (20+(i%2)*790, 680+(i//2)*265)
    draw.text((x, y-20), f'CLOSED {vw} x {vh}: no background leaks', fill='white')
    sheet.paste(preview, (x, y))
sheet.save(WORK / 'alpha-coverage-proof.jpg', quality=94)
(WORK / 'alpha-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
