"""Finish a studio render for the HOUSEofAMES page: lay a soft pool of light under the piece (the render already
carries the piece's own shadow), and save the picture as WebP with its transparency.

  python ames_poster_finish.py render.png poster.webp [--pool 0.10] [--size 1200]
Needs Pillow (pip install pillow).
"""
import argparse
import math

from PIL import Image, ImageFilter

p = argparse.ArgumentParser(); p.add_argument('src'); p.add_argument('dst')
p.add_argument('--pool', type=float, default=.10, help='strength of the pool of light under the piece (0 = none)')
p.add_argument('--size', type=int, default=0, help='resize to this many pixels square')
a = p.parse_args()
im = Image.open(a.src).convert('RGBA')
if a.size and a.size != im.width:
    im = im.resize((a.size, a.size), Image.LANCZOS)
w, h = im.size
if a.pool > 0:
    # Where the piece stands: the lowest solid pixels of the picture.
    solid = im.getchannel('A').point(lambda v: 255 if v > 200 else 0)
    box = solid.getbbox() or (0, 0, w, h)
    cx, base, width = (box[0] + box[2]) / 2, box[3], box[2] - box[0]
    pool = Image.new('L', (w, h), 0)
    px = pool.load()
    rx, ry = width * .95, width * .30
    for y in range(max(0, int(base - ry * 1.3)), min(h, int(base + ry * 1.3))):
        for x in range(max(0, int(cx - rx * 1.3)), min(w, int(cx + rx * 1.3))):
            r = math.hypot((x - cx) / rx, (y - base + ry * .12) / ry)
            if r < 1.3:
                px[x, y] = int(255 * a.pool * math.exp(-r * r * 2.6))
    pool = pool.filter(ImageFilter.GaussianBlur(w / 160))
    under = Image.merge('RGBA', (Image.new('L', (w, h), 214), Image.new('L', (w, h), 226), Image.new('L', (w, h), 220), pool))
    im = Image.alpha_composite(under, im)
im.save(a.dst, quality=92, method=6) if a.dst.lower().endswith('.webp') else im.save(a.dst)
print('finished', a.dst, im.size)
