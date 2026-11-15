"""Emerald silk satin backdrop for the AMES app.

Draped folds as a height field, shaded like satin: a soft body tone plus a
narrow, bright sheen running along each crest (silk's signature), deep cool
shadows in the troughs, and a faint woven grain. Darkened toward the edges so
white type stays readable wherever it sits.
"""
import numpy as np, sys
from PIL import Image
from scipy.ndimage import zoom, gaussian_filter

W = H = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
rng = np.random.default_rng(7)
y, x = np.mgrid[0:H, 0:W] / max(W, H)

def smooth_noise(cells, seed):
    g = np.random.default_rng(seed).random((cells + 3, cells + 3))
    return zoom(g, (H + 3 * H / cells) / (cells + 3), order=3)[:H, :W]

# Drape: the cloth flows diagonally, bending around a few slow swells.
wx = (smooth_noise(3, 1) - 0.5) * 0.55 + (smooth_noise(6, 2) - 0.5) * 0.12
wy = (smooth_noise(3, 3) - 0.5) * 0.55
u = (x + wx) * np.cos(0.62) + (y + wy) * np.sin(0.62)
v = -(x + wx) * np.sin(0.62) + (y + wy) * np.cos(0.62)
h = np.zeros((H, W))
for k, a, ph in [(2.2, 1.0, 0.3), (3.6, 0.75, 1.7), (6.0, 0.18, 4.1), (1.4, 0.8, 2.2)]:   # few broad folds, like draped silk
    s = np.sin(u * k * 2 * np.pi + v * 1.3 + ph + smooth_noise(4, int(k * 10)) * 2.2)
    h += a * np.sign(s) * np.abs(s) ** 0.75          # fuller crests, softer troughs
h = gaussian_filter(h, H / 420)

# Shading: normals from the height field, light from the upper left.
gy, gx = np.gradient(h * H / 120)
n = np.stack([-gx, -gy, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
L = np.array([-0.45, -0.62, 0.64]); L /= np.linalg.norm(L)
V = np.array([0.0, 0.0, 1.0]); Hv = (L + V) / np.linalg.norm(L + V)
diffuse = np.clip(n @ L, 0, 1)
sheen = np.clip(n @ Hv, 0, 1) ** 38                     # tight satin highlight
glow = np.clip(n @ Hv, 0, 1) ** 6                       # the soft halo around it
cavity = np.clip(0.5 + h * 0.18, 0, 1)

shadow = np.array([2, 22, 18]) / 255
body = np.array([10, 66, 54]) / 255
light = np.array([52, 128, 104]) / 255
spec = np.array([150, 205, 182]) / 255
t = diffuse * 0.75 + cavity * 0.25
rgb = shadow + (body - shadow) * np.clip(t * 1.6, 0, 1)[..., None]
rgb = rgb + (light - body) * np.clip((t - 0.55) * 2.2, 0, 1)[..., None]
rgb = rgb + spec * (sheen * 0.42 + glow * 0.07)[..., None]

# Woven grain: a faint fine stripe along the weft, broken up a little.
weave = np.sin((u * 1.0) * W * 0.9) * 0.5 + 0.5
weave = weave * 0.6 + rng.random((H, W)) * 0.4
rgb *= (1 - 0.035 * (weave - 0.5))[..., None]

# Vignette so type reads at the edges and the centre carries the light.
r = np.hypot(x - 0.5, y - 0.45)
rgb *= np.clip(1.0 - r * 0.8, 0.5, 1)[..., None]

out = np.clip(rgb ** (1 / 1.05), 0, 1)
img = Image.fromarray((out * 255).astype(np.uint8))
img.save('/root/cuts/ames-silk-bg.webp', 'WEBP', quality=82, method=6)
img.resize((600, 600)).save('/root/cuts/out/probe.png')
import os; print('silk', img.size, os.path.getsize('/root/cuts/ames-silk-bg.webp') // 1024, 'KB')
