"""Portrait twin head v2: one parametric head for every face, built from MakeHuman's CC0 base mesh and targets.

Not modelled or generated from scratch: the anatomy, its identity range and its expressions are MakeHuman's (CC0 1.0,
https://github.com/makehumancommunity/makehuman, LICENSE.ASSETS.md). This script:

  1. cuts the head, neck and shoulders from the base mesh with its UVs, and keeps the eyes, teeth and tongue;
  2. turns the targets into glTF morph targets on that cut, subdivided once with the mesh (subdivision is linear, so
     every target is carried exactly):
       identity  'id:*'   the six young adult macro shapes (female and male across MakeHuman's three ancestry
                          bases, used only as a shape basis: the app never labels them) and the face details:
                          jaw and chin, brow ridge and forehead, cheekbones, nose (bridge, width, projection, tip),
                          lips, eyes, ears, neck: the app bakes these once per fitted face;
       expression 'ex:*'  blink (each eye), smile, parted lips, pursed, relaxed and open mouth: live, for idle life
                          and for showing lipstick on a moving mouth;
  3. takes MediaPipe's 478 landmarks as its own detector finds them on a render of this head, casts them onto the
     skin and stores each as a UV position (glTF exporters reorder vertices; a UV position survives);
  4. bakes the lip zones: a distance-field texture in UV space (R: signed distance to the vermillion border, G: signed
     distance to the line where the lips meet, upper lip positive) so a lipstick shader cuts a sharp border at any
     mesh density and treats the upper and lower lip as separate zones.

Run:  python scripts/blender/create_portrait_head.py <makehuman-data-dir> <front-landmarks.json> <front.json> <out-dir>   (bpy)
      (front-landmarks.json: MediaPipe Face Mesh on the render made by render_head_for_landmarks.py from a first build)
Writes portrait-head-v2.glb (raw, compress with gltf-transform meshopt), portrait-head-v2.json and lip-zones-v1.png.
"""
import json, math, sys
from pathlib import Path
import numpy as np
import bpy, bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree

DATA, OUTDIR = Path(sys.argv[-4]), Path(sys.argv[-1])
LANDMARKS, ORTHO = Path(sys.argv[-3]), Path(sys.argv[-2])   # MediaPipe's own landmarks found on a front render (render_head_for_landmarks.py)
OUTDIR.mkdir(parents=True, exist_ok=True)
TG = DATA / 'targets'
CUT_Y, SIDE_X = 4.3, 1.9          # dm in MakeHuman's own frame (y up, face toward +z): mid chest, across the deltoids

# --- the base mesh, read directly (vertex order is what the targets index) -----------------------------------------
V, VT, faces, group = [], [], [], None
for line in open(DATA / '3dobjs' / 'base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): group = line.split()[1]
    elif line.startswith('f '):
        corners = [c.split('/') for c in line.split()[1:]]
        faces.append((group, [int(c[0]) - 1 for c in corners], [int(c[1]) - 1 for c in corners]))
V, VT = np.array(V), np.array(VT)

def read_target(rel):
    d = np.zeros_like(V)
    for line in open(TG / rel):
        if line[0] in '#\n': continue
        p = line.split(); d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
    return d

# --- which parts ---------------------------------------------------------------------------------------------------
def keep_body(vs):
    c = V[vs].mean(axis=0); return c[1] > CUT_Y and abs(c[0]) < SIDE_X
PARTS = {'Head skin': lambda g, vs: g == 'body' and keep_body(vs),
         'Teeth upper': lambda g, vs: g == 'helper-upper-teeth', 'Teeth lower': lambda g, vs: g == 'helper-lower-teeth',
         'Tongue': lambda g, vs: g == 'helper-tongue'}

# --- the morphs ----------------------------------------------------------------------------------------------------
def pair(*names): return sum((read_target(n) for n in names), np.zeros_like(V))
ID = {}
for anc in ('african', 'asian', 'caucasian'):
    for sex in ('female', 'male'):
        ID[f'id:base-{anc[:3]}-{sex}'] = read_target(f'macrodetails/{anc}-{sex}-young.target')
# age: how a young adult face becomes an older one (the mean over the six macro shapes, so it carries no ancestry or sex)
ID['id:age-old'] = sum(read_target(f'macrodetails/{anc}-{sex}-old.target') - read_target(f'macrodetails/{anc}-{sex}-young.target')
                       for anc in ('african', 'asian', 'caucasian') for sex in ('female', 'male')) / 6
for folder, names in {
    'chin': ['chin-bones-decr', 'chin-bones-incr', 'chin-height-decr', 'chin-height-incr', 'chin-jaw-drop-decr', 'chin-jaw-drop-incr',
             'chin-prognathism-decr', 'chin-prognathism-incr', 'chin-prominent-decr', 'chin-prominent-incr', 'chin-width-decr', 'chin-width-incr', 'chin-cleft-incr'],
    'head': ['head-fat-decr', 'head-fat-incr', 'head-scale-depth-decr', 'head-scale-depth-incr', 'head-scale-horiz-decr', 'head-scale-horiz-incr',
             'head-scale-vert-decr', 'head-scale-vert-incr', 'head-square', 'head-round', 'head-oval', 'head-triangular', 'head-invertedtriangular'],
    'forehead': ['forehead-nubian-decr', 'forehead-nubian-incr', 'forehead-scale-vert-decr', 'forehead-scale-vert-incr', 'forehead-temple-decr',
                 'forehead-temple-incr', 'forehead-trans-backward', 'forehead-trans-forward'],
    'eyebrows': ['eyebrows-trans-backward', 'eyebrows-trans-forward', 'eyebrows-trans-down', 'eyebrows-trans-up', 'eyebrows-angle-down', 'eyebrows-angle-up'],
    'neck': ['neck-scale-horiz-decr', 'neck-scale-horiz-incr', 'neck-scale-depth-decr', 'neck-scale-depth-incr', 'neck-double-incr'],
    'nose': ['nose-scale-horiz-decr', 'nose-scale-horiz-incr', 'nose-scale-vert-decr', 'nose-scale-vert-incr', 'nose-scale-depth-decr', 'nose-scale-depth-incr',
             'nose-trans-up', 'nose-trans-down', 'nose-point-width-decr', 'nose-point-width-incr', 'nose-nostrils-width-decr', 'nose-nostrils-width-incr',
             'nose-hump-decr', 'nose-hump-incr', 'nose-width1-decr', 'nose-width1-incr', 'nose-width2-decr', 'nose-width2-incr', 'nose-point-up', 'nose-point-down',
             'nose-base-up', 'nose-base-down'],
    'mouth': ['mouth-scale-horiz-decr', 'mouth-scale-horiz-incr', 'mouth-scale-vert-decr', 'mouth-scale-vert-incr', 'mouth-scale-depth-decr', 'mouth-scale-depth-incr',
              'mouth-upperlip-volume-decr', 'mouth-upperlip-volume-incr', 'mouth-lowerlip-volume-decr', 'mouth-lowerlip-volume-incr', 'mouth-cupidsbow-decr',
              'mouth-cupidsbow-incr', 'mouth-angles-down', 'mouth-angles-up'],
}.items():
    for n in names:
        if (TG / folder / f'{n}.target').exists(): ID[f'id:{n}'] = read_target(f'{folder}/{n}.target')
for n in ['cheek-bones-decr', 'cheek-bones-incr', 'cheek-volume-decr', 'cheek-volume-incr', 'cheek-trans-down', 'cheek-trans-up']:
    ID[f'id:{n}'] = pair(f'cheek/l-{n}.target', f'cheek/r-{n}.target')
for n in ['eye-scale-decr', 'eye-scale-incr', 'eye-trans-up', 'eye-trans-down', 'eye-trans-in', 'eye-trans-out', 'eye-height2-decr', 'eye-height2-incr',
          'eye-corner1-up', 'eye-corner1-down', 'eye-epicanthus-in', 'eye-epicanthus-out']:
    ID[f'id:{n}'] = pair(f'eyes/l-{n}.target', f'eyes/r-{n}.target')
for n in ['ear-scale-decr', 'ear-scale-incr', 'ear-trans-up', 'ear-trans-down', 'ear-rot-backward', 'ear-rot-forward', 'ear-lobe-decr', 'ear-lobe-incr']:
    ID[f'id:{n}'] = pair(f'ears/l-{n}.target', f'ears/r-{n}.target')
EXU = TG / 'expression' / 'units' / 'caucasian'
# Clean expression regions (MakeHuman units: 1 = 100 mm; in base.obj the eyes sit near y 7.28, the mouth near y 6.62). MakeHuman's
# units mix regions: the corner puller also bulges the cheeks, the upward retraction moves the mouth. Each expression
# here moves only its own region, so a smile can never touch the eyelids and a cheek raise never moves the mouth.
def ramp(v, a, b): return np.clip((v - a) / (b - a), 0, 1)
def smooth(t): return t * t * (3 - 2 * t)
MOUTH_ONLY = smooth(1 - ramp(V[:, 1], 6.75, 6.83))[:, None]                                  # up to just under the nose
CHEEK_ONLY = (smooth(ramp(V[:, 1], 6.68, 6.76)) * smooth(1 - ramp(V[:, 1], 7.06, 7.14)) * smooth(ramp(np.abs(V[:, 0]), 0.14, 0.22)))[:, None]
def cheek_raise():
    d = (read_target('expression/units/caucasian/mouth-corner-puller.target') + read_target('expression/units/caucasian/mouth-upward-retraction.target')) * CHEEK_ONLY
    d[:, 0] = 0                                                                                # up and forward only: the cheek lifts
    m = np.abs(d).max(); return d * (0.05 / m if m > 0 else 0)                                 # about 5 mm at full weight
EX = {'ex:blink-l': read_target('expression/units/caucasian/eye-left-closure.target'),
      'ex:blink-r': read_target('expression/units/caucasian/eye-right-closure.target'),
      # the smile: mouth corners up and out, the upper lip lifting a little off the teeth; nothing above the nose
      'ex:smile': (read_target('expression/units/caucasian/mouth-corner-puller.target') + 0.35 * read_target('expression/units/caucasian/mouth-elevation.target')) * MOUTH_ONLY,
      'ex:part': read_target('expression/units/caucasian/mouth-parling.target'),
      'ex:purse': read_target('expression/units/caucasian/mouth-pursing.target'),
      'ex:relaxed': read_target('expression/units/caucasian/mouth-compression.target') * -0.6,
      'ex:open': read_target('expression/units/caucasian/mouth-open.target'),
      'ex:brows-up': read_target('expression/units/caucasian/eyebrows-left-up.target') + read_target('expression/units/caucasian/eyebrows-right-up.target'),
      # for a genuine (Duchenne) smile: the eyes narrow at the corners, the brows soften (inner brow eases down)
      'ex:squint': read_target('expression/units/caucasian/eye-left-slit.target') + read_target('expression/units/caucasian/eye-right-slit.target'),
      'ex:brows-soft': 0.5 * (read_target('expression/units/caucasian/eyebrows-left-down.target') + read_target('expression/units/caucasian/eyebrows-right-down.target')),
      'ex:cheeks-up': cheek_raise()}                                     # the cheeks only (the app caps it at 0.3)
# --- live mirroring: the 52 ARKit / MediaPipe face blendshapes ('ar:*') ---------------------------------------------
# MediaPipe FaceLandmarker reports the customer's expression as these 52 channels every frame; the twin carries a
# shape for each (the eye-look channels turn the eyeballs instead). Built from MakeHuman's expression units: one-sided
# channels are the unit masked to one half of the face with a smooth 12 mm blend across the midline (the two halves
# sum to the whole unit); upper/lower-lip channels split at the lips' meeting line with a 3 mm blend; a few with no
# MakeHuman unit (jaw left/right/forward, mouth left/right, cheek puff) are rigid shifts of their region under a
# smooth mask. Every mask is smooth, so no shape can crease the mesh.
U = lambda n: read_target(f'expression/units/caucasian/{n}.target')
FIG_L = smooth(ramp(V[:, 0], -0.06, 0.06))[:, None]; FIG_R = 1 - FIG_L          # MakeHuman +x is the figure's left
LIPS_Y = 6.622
UPPER = smooth(ramp(V[:, 1], LIPS_Y - 0.015, LIPS_Y + 0.015))[:, None]; LOWER = 1 - UPPER
MOUTH_REGION = (smooth(1 - ramp(np.abs(V[:, 0]), 0.28, 0.42)) * smooth(ramp(V[:, 1], 6.42, 6.5)) * smooth(1 - ramp(V[:, 1], 6.74, 6.82)) * smooth(ramp(V[:, 2], 0.6, 0.9)))[:, None]
JAW_REGION = (smooth(1 - ramp(V[:, 1], 6.60, 6.70)) * smooth(ramp(V[:, 1], 6.1, 6.25)) * smooth(1 - ramp(np.abs(V[:, 0]), 0.55, 0.7)) * smooth(ramp(V[:, 2], 0.2, 0.6)))[:, None]
CHEEK_PUFF = (smooth(ramp(V[:, 1], 6.5, 6.6)) * smooth(1 - ramp(V[:, 1], 6.85, 6.95)) * smooth(ramp(np.abs(V[:, 0]), 0.22, 0.32)) * smooth(1 - ramp(np.abs(V[:, 0]), 0.55, 0.65)) * smooth(ramp(V[:, 2], 0.6, 0.85)))[:, None]
def shift(mask, d): out = np.zeros_like(V); out[:] = d; return out * mask
smile_full = (U('mouth-corner-puller') + 0.35 * U('mouth-elevation')) * MOUTH_ONLY
puff = np.zeros_like(V); puff[:, 0] = np.sign(V[:, 0]) * 0.035; puff[:, 2] = 0.012; puff *= CHEEK_PUFF
AR = {
  'ar:browDownLeft': U('eyebrows-left-down'), 'ar:browDownRight': U('eyebrows-right-down'),
  'ar:browInnerUp': U('eyebrows-left-inner-up') + U('eyebrows-right-inner-up'),
  'ar:browOuterUpLeft': U('eyebrows-left-extern-up'), 'ar:browOuterUpRight': U('eyebrows-right-extern-up'),
  'ar:cheekPuff': puff, 'ar:cheekSquintLeft': cheek_raise() * FIG_L, 'ar:cheekSquintRight': cheek_raise() * FIG_R,
  'ar:eyeBlinkLeft': U('eye-left-closure'), 'ar:eyeBlinkRight': U('eye-right-closure'),
  'ar:eyeSquintLeft': U('eye-left-slit'), 'ar:eyeSquintRight': U('eye-right-slit'),
  'ar:eyeWideLeft': U('eye-left-opened-up'), 'ar:eyeWideRight': U('eye-right-opened-up'),
  'ar:jawForward': shift(JAW_REGION, [0, 0, 0.04]), 'ar:jawLeft': shift(JAW_REGION, [0.045, 0, 0]), 'ar:jawRight': shift(JAW_REGION, [-0.045, 0, 0]),
  'ar:jawOpen': U('mouth-open'),
  'ar:mouthClose': U('mouth-compression') * 0.5 * MOUTH_REGION,
  'ar:mouthDimpleLeft': U('mouth-retraction') * FIG_L, 'ar:mouthDimpleRight': U('mouth-retraction') * FIG_R,
  'ar:mouthFrownLeft': U('mouth-depression') * FIG_L, 'ar:mouthFrownRight': U('mouth-depression') * FIG_R,
  'ar:mouthFunnel': U('mouth-protusion'), 'ar:mouthPucker': U('mouth-pursing'),
  'ar:mouthLeft': shift(MOUTH_REGION, [0.04, 0, 0]), 'ar:mouthRight': shift(MOUTH_REGION, [-0.04, 0, 0]),
  'ar:mouthLowerDownLeft': U('mouth-parling') * LOWER * FIG_L, 'ar:mouthLowerDownRight': U('mouth-parling') * LOWER * FIG_R,
  'ar:mouthPressLeft': U('mouth-compression') * FIG_L, 'ar:mouthPressRight': U('mouth-compression') * FIG_R,
  'ar:mouthRollLower': U('mouth-compression') * 0.7 * LOWER, 'ar:mouthRollUpper': U('mouth-compression') * 0.7 * UPPER,
  'ar:mouthShrugLower': U('mouth-eversion') * LOWER, 'ar:mouthShrugUpper': U('mouth-eversion') * UPPER,
  'ar:mouthSmileLeft': smile_full * FIG_L, 'ar:mouthSmileRight': smile_full * FIG_R,
  'ar:mouthStretchLeft': U('mouth-depression-retraction') * FIG_L, 'ar:mouthStretchRight': U('mouth-depression-retraction') * FIG_R,
  'ar:mouthUpperUpLeft': U('mouth-elevation') * UPPER * FIG_L, 'ar:mouthUpperUpRight': U('mouth-elevation') * UPPER * FIG_R,
  'ar:noseSneerLeft': U('nose-left-elevation'), 'ar:noseSneerRight': U('nose-right-elevation'),
}
EX.update(AR)
MORPHS = {**ID, **EX}
print('morphs', len(ID), 'identity,', len(EX), 'expression'); [print(k, round(float(np.abs(v).max()) * 100, 2), 'mm') for k, v in EX.items()]

# --- build each part in Blender, subdivided, with every morph as a shape key -----------------------------------
def g2b(a): return np.stack([a[:, 0], -a[:, 2], a[:, 1]], axis=1)       # MakeHuman (y up, +z front) -> Blender (z up, -y front)
bpy.ops.wm.read_factory_settings(use_empty=True)
root = bpy.data.objects.new('AMES portrait head', None); bpy.context.scene.collection.objects.link(root)
root.scale = (0.1, 0.1, 0.1)                                              # dm -> m (anchors and the app work in mm)

def build(name, keep, subdiv):
    fs = [(vs, ts) for g, vs, ts in faces if keep(g, vs)]
    used = sorted({v for vs, _ in fs for v in vs}); local = {v: i for i, v in enumerate(used)}
    def mesh_with(coords):
        me = bpy.data.meshes.new(name); bm = bmesh.new()
        verts = [bm.verts.new(c) for c in g2b(coords[used])]
        uv = bm.loops.layers.uv.new('UVMap')
        for vs, ts in fs:
            try: f = bm.faces.new([verts[local[v]] for v in vs])
            except ValueError: continue
            for loop, t in zip(f.loops, ts): loop[uv].uv = VT[t]
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
        if subdiv:
            m = o.modifiers.new('s', 'SUBSURF'); m.levels = subdiv; m.uv_smooth = 'PRESERVE_BOUNDARIES'
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s')
        return o
    obj = mesh_with(V); obj.parent = root
    base = np.array([v.co[:] for v in obj.data.vertices])
    obj.shape_key_add(name='Basis', from_mix=False)
    kept = 0
    for key, delta in MORPHS.items():
        if not np.abs(delta[used]).max() > 1e-6: continue
        tmp = mesh_with(V + delta); co = np.array([v.co[:] for v in tmp.data.vertices]); bpy.data.objects.remove(tmp)
        if np.abs(co - base).max() < 5e-5: continue                    # under 5 microns: nothing here
        sk = obj.shape_key_add(name=key, from_mix=False)
        sk.data.foreach_set('co', co.reshape(-1)); sk.value = 0.0; kept += 1
    for p in obj.data.polygons: p.use_smooth = True
    for sk in obj.data.shape_keys.key_blocks: sk.value = 0.0         # morphs ship switched off: the app sets them
    print(name, len(obj.data.vertices), 'verts', kept, 'morphs')
    return obj, base

parts = {n: build(n, k, 1 if n == 'Head skin' else 0) for n, k in PARTS.items()}

# --- the eyes: MakeHuman's high-poly eye proxy (CC0), not the base mesh's helper spheres --------------------------------
# The base mesh's eye "helpers" are 30 mm placeholder balls with no iris; the real eyes are a proxy fitted to them: each
# proxy vertex is a weighted point of three base vertices plus an offset scaled by the base mesh's own size there
# (MakeHuman's .mhclo fitting). Fitting the proxy to the base mesh with each morph applied gives the eyes' morphs, so
# the eyes follow every shape of the face exactly like the skin. Its UVs map MakeHuman's photographic eye texture.
EYE_DIR = DATA / 'eyes' / 'high-poly'
PV, PT, PF = [], [], []
for line in open(EYE_DIR / 'high-poly.obj'):
    if line.startswith('v '): PV.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): PT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('f '):
        cs = [c.split('/') for c in line.split()[1:]]; PF.append(([int(c[0]) - 1 for c in cs], [int(c[1]) - 1 for c in cs]))
REF, W, OFF, SCALE = [], [], [], {}
mode = None
for line in open(EYE_DIR / 'high-poly.mhclo'):
    p = line.split()
    if not p or p[0].startswith('#'): continue
    if p[0] in ('x_scale', 'y_scale', 'z_scale'): SCALE[p[0][0]] = (int(p[1]), int(p[2]), float(p[3])); continue
    if p[0] == 'verts': mode = 'verts'; continue
    if mode == 'verts' and len(p) == 9:
        REF.append([int(x) for x in p[:3]]); W.append([float(x) for x in p[3:6]]); OFF.append([float(x) for x in p[6:9]])
    elif mode == 'verts' and len(p) == 1:
        REF.append([int(p[0])] * 3); W.append([1.0, 0, 0]); OFF.append([0.0, 0, 0])
    elif mode == 'verts' and p[0] in ('delete_verts', 'material', 'obj_file'): mode = None
REF, W, OFF = np.array(REF), np.array(W), np.array(OFF)
assert len(REF) == len(PV), (len(REF), len(PV))
def fit_proxy(Vb):
    s = np.array([abs(Vb[SCALE[k][0]][i] - Vb[SCALE[k][1]][i]) / SCALE[k][2] for i, k in enumerate('xyz')])
    return (Vb[REF] * W[:, :, None]).sum(axis=1) + OFF * s
P0 = fit_proxy(V)
def build_eye(name, side):
    keep = [f for f in PF if (P0[f[0]][:, 0].mean() > 0) == (side > 0)]
    used = sorted({v for vs, _ in keep for v in vs}); local = {v: i for i, v in enumerate(used)}
    def mesh_with(P):
        me = bpy.data.meshes.new(name); bm = bmesh.new(); verts = [bm.verts.new(c) for c in g2b(P[used])]
        uv = bm.loops.layers.uv.new('UVMap')
        for vs, ts in keep:
            try: f = bm.faces.new([verts[local[v]] for v in vs])
            except ValueError: continue
            for loop, t in zip(f.loops, ts): loop[uv].uv = PT[t]
        bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o
    obj = mesh_with(P0); obj.parent = root
    base = np.array([v.co[:] for v in obj.data.vertices]); obj.shape_key_add(name='Basis', from_mix=False); kept = 0
    for key, delta in MORPHS.items():
        co = g2b((fit_proxy(V + delta))[used]); co_base = g2b(P0[used])
        if np.abs(co - co_base).max() < 5e-5: continue
        sk = obj.shape_key_add(name=key, from_mix=False); sk.data.foreach_set('co', (base + (co - co_base)).reshape(-1)); sk.value = 0.0; kept += 1
    for p in obj.data.polygons: p.use_smooth = True
    print(name, len(obj.data.vertices), 'verts', kept, 'morphs (high-poly eye proxy)')
    return obj, base
parts['Eye left'] = build_eye('Eye left', 1); parts['Eye right'] = build_eye('Eye right', -1)
head, head_base = parts['Head skin']

# --- landmarks: where MediaPipe itself finds its 478 landmarks on this head --------------------------------------------
# A front render of the neutral head (render_head_for_landmarks.py, orthographic) was run through MediaPipe Face Mesh;
# each landmark is cast straight back onto the skin. So the landmarks are what the scan's detector will report on a
# face of this shape: the fit compares like with like. Stored as UV positions (and mm positions for reference).
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc
me = head.data; uvl = me.uv_layers['UVMap'].data
lm = json.loads(LANDMARKS.read_text()); ortho = json.loads(ORTHO.read_text())
bvh = BVHTree.FromPolygons([v.co[:] for v in me.vertices], [p.vertices[:] for p in me.polygons])
def g_mm(p): return [round(p[0] * 100, 2), round(p[2] * 100, 2), round(-p[1] * 100, 2)]   # Blender dm -> glTF mm
landmark_uv, landmark_mm, misses = [], [], 0
for l in lm:
    x = (ortho['cx'] + (l['x'] - 0.5) * ortho['width_m']) * 10            # metres -> dm (the mesh's own units)
    z = (ortho['cz'] + (0.5 - l['y']) * ortho['height_m']) * 10
    # a small bundle of rays: one exactly on the midline can slip through the hairline seam there; keep the frontmost hit
    hits = [bvh.ray_cast(Vector((x + dx, -30.0, z + dz)), Vector((0, 1, 0))) for dx, dz in ((0, 0), (0.012, 0), (-0.012, 0), (0, 0.012), (0, -0.012))]
    hits = [h for h in hits if h[0] is not None]
    hit, normal, fi, dist = min(hits, key=lambda h: h[3]) if hits else (None, None, None, None)
    if hit is not None and (x, z) != (hit.x, hit.z):                         # back onto the landmark's own line of sight
        hit = Vector((x, hit.y, z)); fi = bvh.find_nearest(hit)[2]; hit = bvh.find_nearest(hit)[0]
    if hit is None or -hit.y * 100 < 95:                                    # off the silhouette, or under the chin onto the neck:
        # the skin point nearest the line of sight within the face's own depth (glTF z 95..175 mm)
        best = min((bvh.find_nearest(Vector((x, -y / 100, z))) for y in range(95, 176)), key=lambda r: r[3] if r[0] else 1e9)
        hit, normal, fi, dist = best; misses += 1
    poly = me.polygons[fi]; w = poly_3d_calc([me.vertices[v].co for v in poly.vertices], hit)
    uv = sum((Vector(uvl[li].uv) * wi for li, wi in zip(poly.loop_indices, w)), Vector((0, 0)))
    landmark_uv.append([round(uv.x, 6), round(uv.y, 6)]); landmark_mm.append(g_mm(hit))
print('landmarks cast onto the head:', len(lm) - misses, 'by ray,', misses, 'on the silhouette by nearest point')
eyes = {n: np.array([v.co[:] for v in parts[n][0].data.vertices]).mean(axis=0) for n in ('Eye left', 'Eye right')}
eye_l, eye_r = np.array(g_mm(eyes['Eye left'])), np.array(g_mm(eyes['Eye right']))
if eye_l[0] < eye_r[0]: eye_l, eye_r = eye_r, eye_l                         # glTF +x is the figure's left
pinned = landmark_mm
C = [np.array(p) if p else np.zeros(3) for p in landmark_mm]

# --- lip zones: distance fields in UV space ------------------------------------------------------------------------
OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
uvo, uvi = np.array([landmark_uv[i] for i in OUTER]), np.array([landmark_uv[i] for i in INNER])
lo, hi = uvo.min(axis=0), uvo.max(axis=0); pad = (hi - lo) * 0.35; lo, hi = lo - pad, hi + pad
# mm per UV unit around the mouth, from the pinned contour (UV is roughly isotropic on the face)
_unused_mm_per_uv = np.mean([np.linalg.norm(np.array(pinned[OUTER[i]]) - np.array(pinned[OUTER[i - 1]])) / max(1e-9, np.linalg.norm(uvo[i] - uvo[i - 1])) for i in range(len(OUTER))])
def smooth_closed(pts, n=400):                                            # Catmull-Rom through the contour
    out = []
    for i in range(len(pts)):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % len(pts)], pts[(i + 2) % len(pts)]
        for t in np.linspace(0, 1, n // len(pts), endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.array(out)
# UV is not uniform across the mouth: every texel of the lip-zone map takes its true position on the skin (the mesh's
# own triangles rasterised in UV), and every distance is measured there in mm, so the border is exact, not estimated.
outer_curve = smooth_closed(np.array([landmark_mm[i][:2] for i in OUTER]))
inner_curve = smooth_closed(np.array([landmark_mm[i][:2] for i in INNER]))
# the line where the lips meet: the inner contour's middle (left corner -> right corner through the upper and lower halves)
meet = (inner_curve[: len(inner_curve) // 2] + inner_curve[len(inner_curve) // 2:][::-1]) / 2
W, H = 512, 256
xs, ys = np.meshgrid(np.linspace(lo[0], hi[0], W), np.linspace(lo[1], hi[1], H))
uvpts = np.stack([xs.ravel(), ys.ravel()], axis=1)
pts = np.full((len(uvpts), 2), np.nan)
Pmm = np.array([[v.co.x * 100, v.co.z * 100] for v in me.vertices])          # glTF x, y in mm
for poly in me.polygons:
    tri_uv = np.array([uvl[li].uv[:] for li in poly.loop_indices]); tri_p = Pmm[list(poly.vertices)]
    if tri_uv[:, 0].max() < lo[0] or tri_uv[:, 0].min() > hi[0] or tri_uv[:, 1].max() < lo[1] or tri_uv[:, 1].min() > hi[1]: continue
    for k in range(1, len(tri_uv) - 1):                                    # fan-triangulate quads
        a_, b_, c_ = tri_uv[0], tri_uv[k], tri_uv[k + 1]
        m = (uvpts[:, 0] >= min(a_[0], b_[0], c_[0])) & (uvpts[:, 0] <= max(a_[0], b_[0], c_[0])) & (uvpts[:, 1] >= min(a_[1], b_[1], c_[1])) & (uvpts[:, 1] <= max(a_[1], b_[1], c_[1]))
        if not m.any(): continue
        q = uvpts[m]; v0, v1, v2 = b_ - a_, c_ - a_, q - a_
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-14: continue
        w1 = (v2[:, 0] * v1[1] - v1[0] * v2[:, 1]) / den; w2 = (v0[0] * v2[:, 1] - v2[:, 0] * v0[1]) / den; w0 = 1 - w1 - w2
        ins = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        idx = np.where(m)[0][ins]
        pts[idx] = w0[ins, None] * tri_p[0] + w1[ins, None] * tri_p[k] + w2[ins, None] * tri_p[k + 1]
holes = np.isnan(pts[:, 0]); pts[holes] = 1e4                               # texels off the mesh: far from the lips
print('lip-zone texels on the skin', int((~holes).sum()), 'of', len(pts))
def seg_dist(pts, poly, closed=True):
    a = poly; b = np.roll(poly, -1, axis=0) if closed else poly[1:]; a = a if closed else poly[:-1]
    d = np.full(len(pts), np.inf)
    for s in range(0, len(a), 1):
        ab = b[s] - a[s]; t = np.clip(((pts - a[s]) @ ab) / max(1e-12, ab @ ab), 0, 1)
        d = np.minimum(d, np.linalg.norm(pts - (a[s] + t[:, None] * ab), axis=1))
    return d
def inside(pts, poly):
    x, y = pts[:, 0], pts[:, 1]; res = np.zeros(len(pts), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        crosses = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1)
        res ^= crosses
    return res
sd_outer = seg_dist(pts, outer_curve) * np.where(inside(pts, outer_curve), 1, -1)   # + inside the lips
d_meet = seg_dist(pts, meet, closed=False)
# which lip: the side of the meeting line, oriented so the upper lip's centre (landmark 0) is positive. MakeHuman's UV
# layout turns the face sideways, so 'above' is decided by the line, never by a UV axis.
def side_of(q, poly):
    ab = poly[1:] - poly[:-1]; t = np.clip(np.einsum('ij,ij->i', q[None, :] - poly[:-1], ab) / np.einsum('ij,ij->i', ab, ab), 0, 1)
    k = np.argmin(np.linalg.norm(q[None, :] - (poly[:-1] + t[:, None] * ab), axis=1))
    return np.sign(ab[k, 0] * (q[1] - poly[k, 1]) - ab[k, 1] * (q[0] - poly[k, 0]))
upper_sign = side_of(np.array(landmark_mm[0][:2]), meet)
seg_a, seg_ab = meet[:-1], meet[1:] - meet[:-1]
t = np.clip(((pts[:, None, :] - seg_a[None]) * seg_ab[None]).sum(-1) / (seg_ab ** 2).sum(-1)[None], 0, 1)
nearest = np.argmin(np.linalg.norm(pts[:, None, :] - (seg_a[None] + t[..., None] * seg_ab[None]), axis=2), axis=1)
rel = pts - seg_a[nearest]; cross = seg_ab[nearest, 0] * rel[:, 1] - seg_ab[nearest, 1] * rel[:, 0]
sd_meet = d_meet * np.sign(cross) * upper_sign
RANGE = 6.0                                                                # mm encoded in 0..255 (128 = 0)
enc = lambda d: np.clip(128 + d / RANGE * 127, 0, 255).astype(np.uint8)
img = np.stack([enc(sd_outer), enc(sd_meet), np.full(len(pts), 0, np.uint8), np.full(len(pts), 255, np.uint8)], axis=1).reshape(H, W, 4)
lipimg = bpy.data.images.new('lip-zones', W, H, alpha=True)
lipimg.pixels = (img[::1].astype(np.float32) / 255).ravel()
lipimg.filepath_raw = str(OUTDIR / 'lip-zones-v1.png'); lipimg.file_format = 'PNG'; lipimg.save()

# --- export ----------------------------------------------------------------------------------------------------
meta = {'about': 'AMES portrait head v2 (MakeHuman CC0 base mesh and targets; MediaPipe canonical landmarks, Apache 2.0)',
        'units': 'glTF metres; anchors and landmarks in mm', 'identity': list(ID.keys()), 'expressions': list(EX.keys()),
        'landmarks': {'uv': landmark_uv, 'mm': landmark_mm, 'source': 'MediaPipe Face Mesh (refined, 478) on a front render of the neutral head'},
        'lips': {'outer': OUTER, 'inner': INNER, 'uvRect': [float(lo[0]), float(lo[1]), float(hi[0]), float(hi[1])], 'rangeMm': RANGE,
                 'channels': 'R: signed distance to the vermillion border (+ on the lips); G: signed distance to where the lips meet (+ upper lip)'},
        'eyes': {'left': [round(float(x), 2) for x in eye_l], 'right': [round(float(x), 2) for x in eye_r]}}
(OUTDIR / 'portrait-head-v2.json').write_text(json.dumps(meta))
bpy.ops.export_scene.gltf(filepath=str(OUTDIR / 'portrait-head-v2.glb'), export_format='GLB', export_morph=True, export_morph_normal=False,
                          export_extras=True, export_yup=True, export_apply=False, export_attributes=True)
print('wrote', OUTDIR)
