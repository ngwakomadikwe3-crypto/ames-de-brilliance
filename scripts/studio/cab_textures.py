"""Surface textures for the smooth (cabochon) stones in the live 3D files.

Each stone gets the pattern that makes it recognisable in life, painted into
textures the 3D engine keeps: jade's mottling, lapis's pyrite and calcite,
turquoise's matrix web, opal's play-of-colour, sunstone's copper glitter,
amber's flow lines and rose quartz's cloud. Textures are mapped top-down on
the dome (planar UVs), which suits a cabochon's shallow profile.
"""
import json, os
import numpy as np
from PIL import Image
from scipy.ndimage import zoom, gaussian_filter
from scipy.spatial import cKDTree

N = 1024
OUT = '/root/cuts/tex'
yy, xx = np.mgrid[0:N, 0:N] / N


def fbm(seed, base=4, octaves=6, gain=0.5):
    rng = np.random.default_rng(seed)
    f = np.zeros((N, N)); amp = 1.0; tot = 0.0; cells = base
    for _ in range(octaves):
        g = rng.random((cells + 3, cells + 3))
        up = zoom(g, (N + 3 * N / cells) / (cells + 3), order=3)[:N, :N]
        f += amp * up; tot += amp; amp *= gain; cells *= 2
    f /= tot
    return (f - f.min()) / (f.max() - f.min())


def warp(field_seed, strength, base=3):
    """Coordinates pushed around by noise, for organic, non-grid patterns."""
    wx = (fbm(field_seed, base) - 0.5) * strength
    wy = (fbm(field_seed + 7, base) - 0.5) * strength
    return xx + wx, yy + wy


def voronoi(seed, cells, X=None, Y=None):
    """Distance to nearest site, edge distance (F2-F1) and cell id."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cells, 2))
    X = xx if X is None else X; Y = yy if Y is None else Y
    d, i = cKDTree(pts).query(np.stack([X.ravel(), Y.ravel()], 1), k=2)
    return d[:, 0].reshape(N, N), (d[:, 1] - d[:, 0]).reshape(N, N), i[:, 0].reshape(N, N)


def mix(a, b, t):
    a = np.asarray(a, float); b = np.asarray(b, float)
    return a + (b - a) * t[..., None]


def save(stone, name, rgb, kind='jpg'):
    os.makedirs(f'{OUT}/{stone}', exist_ok=True)
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    p = f'{OUT}/{stone}/{name}.{kind}'
    im.save(p, quality=92) if kind == 'jpg' else im.save(p, optimize=True)
    return os.path.basename(p)


spec = {}

# Jade: waxy mottled green, deeper patches and soft paler clouds.
m = fbm(11, 3); c = fbm(12, 6)
rgb = mix((22, 88, 50), (64, 146, 86), m)
rgb = mix(rgb, (150, 196, 150), np.clip((c - 0.62) * 2.2, 0, 1) * 0.55)
spec['stone-jade'] = {'base': save('stone-jade', 'base', rgb)}

# Lapis: deep ultramarine, white calcite streaks, gold pyrite flecks.
X, Y = warp(21, 0.35)
m = fbm(22, 5)
rgb = mix((18, 34, 128), (38, 70, 182), m)
streak = np.clip(1 - np.abs(np.sin((X * 2.3 + Y * 1.1) * 6.0 + fbm(23, 3) * 5)) * 7, 0, 1) * (fbm(24, 2) > 0.55)
rgb = mix(rgb, (205, 210, 222), gaussian_filter(streak.astype(float), 1.5) * 0.85)
d1, _, cid = voronoi(25, 3400)
fleck = (d1 < 0.0035) & (np.random.default_rng(26).random(3400)[cid] < 0.6) & (fbm(27, 3) > 0.42)
fleck = gaussian_filter(fleck.astype(float), 0.6)
rgb = mix(rgb, (226, 178, 72), np.clip(fleck * 1.4, 0, 1))
mr = np.zeros((N, N, 3)); mr[..., 1] = 255 * (0.30 - 0.12 * fleck); mr[..., 2] = 255 * np.clip(fleck * 1.4, 0, 1)
spec['stone-lapis-lazuli'] = {'base': save('stone-lapis-lazuli', 'base', rgb), 'mr': save('stone-lapis-lazuli', 'mr', mr)}

# Turquoise: blue-green body with a dark web of host rock (the matrix).
X, Y = warp(31, 0.18)
m = fbm(32, 4)
rgb = mix((38, 156, 160), (88, 196, 186), m)
_, edge, _ = voronoi(33, 70, X, Y)
_, edge2, _ = voronoi(34, 260, X, Y)
web = np.clip(1 - edge / 0.006, 0, 1) * (fbm(35, 3) > 0.30) + np.clip(1 - edge2 / 0.003, 0, 1) * 0.6 * (fbm(36, 3) > 0.55)
web = gaussian_filter(np.clip(web, 0, 1), 0.6)
rgb = mix(rgb, (62, 44, 30), np.clip(web, 0, 1))
spec['stone-turquoise'] = {'base': save('stone-turquoise', 'base', rgb)}

# Opal: milky body; play-of-colour as soft flashes, mostly blue-green with
# some gold and violet, each patch fading across itself like real fire.
X, Y = warp(41, 0.10)
rgb = mix((132, 146, 158), (182, 192, 200), fbm(42, 3))   # deeper body so the fire shows
d1, edge, cid = voronoi(43, 110, X, Y)
rng = np.random.default_rng(44)
palette = np.array([[0.10, 0.55, 1.0], [0.0, 0.85, 0.55], [0.30, 1.0, 0.25], [1.0, 0.70, 0.10], [0.62, 0.30, 1.0], [0.05, 0.75, 0.90]])
pick = palette[rng.integers(0, len(palette), 110)]
on = (rng.random(110) < 0.58)[cid] * np.clip((fbm(45, 4) - 0.38) * 3, 0, 1)
ang = rng.random(110)[cid] * 6.283
fade = np.clip(0.5 + 0.5 * np.sin((xx * np.cos(ang) + yy * np.sin(ang)) * 40), 0.15, 1)
inside = np.clip(edge / 0.03, 0, 1)
level = on * inside * fade * (0.55 + 0.40 * rng.random(110)[cid])
glow = gaussian_filter(pick[cid] * level[..., None], (2.5, 2.5, 0))
# The fire lives in the body colour as well as the glow, so it still shows
# under bright light where a glow alone would wash out.
lvl = np.clip(glow.max(-1) * 2.2, 0, 1)
rgb = rgb * (1 - lvl[..., None] * 0.75) + (glow / np.maximum(glow.max(-1, keepdims=True), 1e-4)) * 255 * lvl[..., None] * 0.75
spec['stone-opal'] = {'base': save('stone-opal', 'base', rgb), 'emissive': save('stone-opal', 'emissive', np.clip(glow * 2.4, 0, 1) * 255)}

# Sunstone: orange feldspar with copper platelets that catch the light.
m = fbm(51, 4)
rgb = mix((196, 82, 30), (228, 124, 58), m)
d1, _, cid = voronoi(52, 5200)
rng = np.random.default_rng(53)
plate = (d1 < 0.0045) & (rng.random(5200)[cid] < 0.55)
spark = gaussian_filter(plate * rng.random(5200)[cid], 0.5)
rgb = mix(rgb, (240, 170, 96), np.clip(spark * 1.5, 0, 1))
em = np.stack([spark * 255, spark * 170, spark * 95], -1) * 1.3
mr = np.zeros((N, N, 3)); mr[..., 1] = 255 * (0.16 - 0.08 * spark); mr[..., 2] = 255 * np.clip(spark * 1.5, 0, 1)
spec['stone-sunstone'] = {'base': save('stone-sunstone', 'base', rgb), 'emissive': save('stone-sunstone', 'emissive', em)}

# Amber: warm honey with darker flow lines, the way resin set.
X, Y = warp(61, 0.5)
flow = 0.5 + 0.5 * np.sin((X * 1.3 + Y * 0.4) * 22 + fbm(62, 3) * 6)
rgb = mix((236, 150, 44), (196, 98, 18), np.clip(flow * fbm(63, 4) * 1.3, 0, 1))
spec['stone-amber'] = {'base': save('stone-amber', 'base', rgb)}

# Rose quartz: cloudy pink, never glass-clear.
rgb = mix((236, 168, 182), (250, 206, 214), fbm(71, 3))
spec['stone-rose-quartz'] = {'base': save('stone-rose-quartz', 'base', rgb), 'transmission': 0.35, 'roughness': 0.16}

json.dump(spec, open(f'{OUT}/spec.json', 'w'), indent=1)
print(json.dumps(spec, indent=None)[:400])
