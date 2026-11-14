"""Turn rendered turntable PNGs into the app's spin folders.

Reads ~/cuts/spin/<name>/frame-NNN.png (and detail-NNN.png), writes
dist/ames-engine/<assetId>/spin/ with WebP frames and manifest.json, ready to
drop into the app's public/ames-engine folder.
"""
import os, json, glob, sys
from PIL import Image

ASSET = {'bracelet': 'ames-tennis-bracelet', 'necklace': 'ames-pear-fringe-necklace',
         'earrings': 'ames-pear-drop-earrings', 'ring': 'demo-pave-solitaire'}
SRC = os.path.expanduser('~/cuts/spin')
DST = os.path.expanduser('~/cuts/dist/ames-engine')
SPP = int(os.environ.get('SPP_NOTE', 0))

done = []
for name in sorted(os.listdir(SRC)):
    frames = sorted(glob.glob(os.path.join(SRC, name, 'frame-*.png')))
    if not frames:
        continue
    asset = ASSET.get(name, name)
    out = os.path.join(DST, asset, 'spin'); os.makedirs(out, exist_ok=True)
    size = None
    for f in frames:
        im = Image.open(f).convert('RGB'); size = im.width
        im.save(os.path.join(out, os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=90, method=6)
    man = {'frames': len(frames), 'pattern': 'frame-%03d.webp', 'size': size, 'turnSeconds': 16,
           'renderer': 'Blender Cycles · AMES photo studio'}
    if SPP:
        man['samples'] = SPP
    details = sorted(glob.glob(os.path.join(SRC, name, 'detail-*.png')))
    if len(details) == len(frames):
        for f in details:
            im = Image.open(f).convert('RGB'); dsize = im.width
            im.save(os.path.join(out, os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=88, method=6)
        man['detail'] = {'pattern': 'detail-%03d.webp', 'size': dsize}
    json.dump(man, open(os.path.join(out, 'manifest.json'), 'w'), indent=2)
    done.append('%s (%d frames%s)' % (asset, len(frames), ', detail' if 'detail' in man else ''))
print('\n'.join(done) or 'nothing to pack')
