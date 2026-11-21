"""Tileable skin micro-relief for the realistic hand (public/hand-twin/skin-detail.jpg).

One tile = 10 mm of skin at 1024 px (0.01 mm per pixel). Channels are heights (0..1):
  R: back-of-hand skin: the diamond furrow network (two diagonal families plus a faint cross family, warped),
     pores sitting in the furrow junctions and scattered between, fine grain;
  G: palm and finger pads: dermal ridges (fingerprint-like parallel ridges, about 0.45 mm apart, swirling);
  B: low-frequency mottling for colour variation.
Everything is built from periodic fields (integer wave vectors, FFT noise, wrapped distances) so it tiles.
Run: python scripts/make_skin_detail.py public/hand-twin/skin-detail.jpg
"""
import sys
import numpy as np
from PIL import Image

N = 1024
rng = np.random.default_rng(11)
y, x = np.mgrid[0:N, 0:N] / N                                         # tile coordinates 0..1

def fft_noise(lo, hi, seed):
    r = np.random.default_rng(seed)
    f = np.fft.fftfreq(N) * N
    kx, ky = np.meshgrid(f, f); k = np.hypot(kx, ky)
    band = np.exp(-((np.log(np.maximum(k, 1e-6)) - np.log((lo * hi) ** 0.5)) ** 2) / (2 * (np.log(hi / lo) / 2.5) ** 2))
    band[0, 0] = 0
    spec = (r.normal(size=(N, N)) + 1j * r.normal(size=(N, N))) * band
    n = np.real(np.fft.ifft2(spec)); return (n - n.mean()) / (n.std() + 1e-9)

def norm01(a): a = a - a.min(); return a / (a.max() + 1e-9)

# --- R: furrows + pores ------------------------------------------------------------------------------------------
warp_a, warp_b = fft_noise(3, 9, 1), fft_noise(3, 9, 2)
def family(kx, ky, warp, sharp):
    phase = 2 * np.pi * (kx * x + ky * y) + warp
    return np.abs(np.cos(phase / 2)) ** sharp                          # 1 in the plateau, 0 in the groove
fam1 = family(19, 13, 1.6 * warp_a, 0.35)
fam2 = family(-17, 15, 1.6 * warp_b, 0.35)
fam3 = family(3, 26, 1.2 * fft_noise(3, 8, 3), 0.5)
plate = np.minimum(np.minimum(fam1, fam2), 0.55 + 0.45 * fam3)       # furrows are where any family dips
furrow_depth = 0.75 + 0.25 * norm01(fft_noise(2, 6, 4))               # furrows deeper in places
R = 1 - (1 - plate) * furrow_depth
# pores: wrapped distance to random points, more of them near the furrow crossings
pts = rng.random((900, 2))
keep = []
for p in pts:
    i, j = int(p[1] * N) % N, int(p[0] * N) % N
    if rng.random() < 0.35 + 0.65 * (1 - plate[i, j]): keep.append(p)
pts = np.array(keep)
pore = np.zeros((N, N))
for px, py in pts:
    dx = np.abs(x - px); dx = np.minimum(dx, 1 - dx); dy = np.abs(y - py); dy = np.minimum(dy, 1 - dy)
    r2 = (dx * dx + dy * dy) * N * N
    rad = rng.uniform(2.2, 4.0)
    pore = np.maximum(pore, np.exp(-r2 / (2 * rad * rad)))
R = R - 0.55 * pore + 0.08 * fft_noise(60, 200, 5)
R = norm01(R)

# --- G: dermal ridges (palm / pads) -------------------------------------------------------------------------------
flow = 0.55 * fft_noise(1.2, 3, 6) + 0.12 * fft_noise(3, 8, 7)
ridge_phase = 2 * np.pi * (2 * x + 22 * y) + 2 * np.pi * flow
G = 0.5 + 0.5 * np.cos(ridge_phase)
G = G ** 1.4
# ridges break into short dotted runs (sweat pores along the ridges)
G = G * (0.82 + 0.18 * (fft_noise(40, 120, 8) > -0.6)) - 0.25 * (np.maximum(0, fft_noise(80, 220, 9) - 1.6))
G = norm01(G + 0.06 * fft_noise(60, 200, 10))

# --- B: mottling --------------------------------------------------------------------------------------------------
B = norm01(0.6 * fft_noise(1, 3, 12) + 0.4 * fft_noise(3, 8, 13))

img = np.stack([R, G, B], -1)
Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(sys.argv[1], quality=92)
print('wrote', sys.argv[1], 'pores', len(pts))
