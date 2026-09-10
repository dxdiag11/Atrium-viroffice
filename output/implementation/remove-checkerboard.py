"""Remove the baked neutral checkerboard from male-001, preserving enclosed details.

Usage: python remove-checkerboard.py SOURCE OUTPUT PREVIEW
Requires pillow, numpy, opencv-python-headless. Source is never overwritten.
"""
import sys
import cv2
import numpy as np
from PIL import Image

source, destination, preview = sys.argv[1:]
rgb = np.array(Image.open(source).convert('RGB'))
h, w = rgb.shape[:2]
spread = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
neutral = ((spread < 20) & (rgb.min(axis=2) > 100)).astype('uint8')
# Only remove neutral regions connected to the empty margins. Cream shirts,
# sneakers, eyes and ID cards enclosed by the character's outline remain intact.
count, labels, stats, _ = cv2.connectedComponentsWithStats(neutral, 8)
border_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
background = np.isin(labels, border_labels[border_labels != 0])
mask = (~background).astype('uint8')
# Discard isolated checker remnants, keeping the twelve full-body components.
count, components, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
large = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 1500]
assert len(large) == 12, f'Expected 12 sprites, found {len(large)}'
mask = np.isin(components, large).astype('uint8')
# A narrow inward feather avoids leaving a gray checkerboard fringe.
distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
alpha = np.clip((distance - 0.55) / 0.8, 0, 1)
rgba = np.dstack([rgb, np.rint(alpha * 255).astype('uint8')])
rgba[rgba[:, :, 3] == 0, :3] = 0
result = Image.fromarray(rgba)
result.save(destination)
# Proof over a dark office-green background, where leftover gray is obvious.
proof = Image.new('RGBA', result.size, '#203b30')
proof.alpha_composite(result)
proof.convert('RGB').save(preview)
print(f'{w}x{h} RGBA; sprites={len(large)}; transparent={np.mean(alpha == 0):.1%}')
print(f'Opaque interior pixels unchanged: {np.array_equal(rgba[alpha == 1, :3], rgb[alpha == 1])}')
