"""Portrait twin bust v1: the head, neck and shoulders the earring, necklace and shades try-on dresses.

Source: the MakeHuman 1.x base mesh (makehuman/data/3dobjs/base.obj), CC0 1.0 (LICENSE-makehuman-assets.md beside
the output). Not modelled or generated from scratch: the anatomy is MakeHuman's neutral base, cut to a classic bust
(upper chest, across the deltoids), capped, subdivided once and converted to millimetres. Eyes are MakeHuman's eye
helpers, subdivided, with sclera / iris / pupil painted as vertex colours. No hair: the portrait is lit like a
jewellery photograph and the skin falls into shadow above the hairline (the viewer's shader does that fade).

Anchors (glTF frame, mm, face toward +Z, up +Y) are written to the root's extras as ames_bust:
  earlobe_l / earlobe_r   the lowest point of each ear lobe, where an earring's post goes through
  neck                    {centre, half_width, half_depth} of the neck at its base, where a necklace sits
  neck_front              the jugular notch (front base of the neck), where a pendant hangs from
  nose_bridge             the sellion (deepest point between the eyes), where shades rest
  eye_l / eye_r           eye centres (for the face tracker's scale: interpupillary distance)

Run:  python scripts/blender/create_portrait_bust.py <base.obj> [<canonical_face_model.obj>] <out.glb> [<preview.png>]   (bpy module)
      With MediaPipe's canonical face model it also writes face-landmarks-v1.json beside the GLB.
"""
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SRC = next(a for a in sys.argv if a.endswith('base.obj'))
OUT = next(a for a in sys.argv if a.endswith('.glb'))
PREVIEW = next((a for a in sys.argv if a.endswith('.png')), None)
DM = 100.0                                   # MakeHuman units are decimetres; out in millimetres
CUT_Z, SIDE_X = 4.3, 1.9                     # bust cut: mid chest (room for a 45 cm necklace), across the deltoids (dm)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC, use_split_groups=True)
keep = {'body', 'helper-l-eye', 'helper-r-eye'}
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name.split('.')[0] not in keep: bpy.data.objects.remove(o)
for o in bpy.data.objects: o.select_set(True)                   # the importer rotates Y-up data: bake it to Z-up
bpy.context.view_layer.objects.active = bpy.data.objects[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
body = next(o for o in bpy.data.objects if o.name.startswith('body'))
eyes = [o for o in bpy.data.objects if 'eye' in o.name]

# --- the bust: cut, cap, subdivide -----------------------------------------------------------------------------
bm = bmesh.new(); bm.from_mesh(body.data)
for co, no in (((0, 0, CUT_Z), (0, 0, -1)), ((SIDE_X, 0, 0), (1, 0, 0)), ((-SIDE_X, 0, 0), (-1, 0, 0))):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
# drop loose islands (fingers or arm pieces left by the cuts): keep the largest connected piece
bm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in bm.verts:
    if v in seen: continue
    stack, isl = [v], []
    seen.add(v)
    while stack:
        a = stack.pop(); isl.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b not in seen: seen.add(b); stack.append(b)
    islands.append(isl)
islands.sort(key=len, reverse=True)
for isl in islands[1:]: bmesh.ops.delete(bm, geom=isl, context='VERTS')
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
bm.to_mesh(body.data); bm.free()
mod = body.modifiers.new('subd', 'SUBSURF'); mod.levels = 1; mod.render_levels = 1
bpy.context.view_layer.objects.active = body; bpy.ops.object.modifier_apply(modifier='subd')
for p in body.data.polygons: p.use_smooth = True

# --- anchors (in the source frame, then converted) -----------------------------------------------------------
V = [body.matrix_world @ v.co for v in body.data.vertices]
def g(v): return [round(v.x * DM, 2), round(v.z * DM, 2), round(-v.y * DM, 2)]   # Blender dm -> glTF mm
eye_c = [sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices) for o in eyes]
eye_l, eye_r = sorted(eye_c, key=lambda c: -c.x)[0], sorted(eye_c, key=lambda c: c.x)[0]   # MakeHuman: +x is the figure's left
eye_z = (eye_l.z + eye_r.z) / 2
def lobe(sign):
    ear = [v for v in V if sign * v.x > 0.6 and eye_z - 0.75 < v.z < eye_z + 0.2 and -0.5 < v.y < 0.25]
    outer = max(sign * v.x for v in ear)
    rim = [v for v in ear if sign * v.x > outer - 0.12]
    return min(rim, key=lambda v: v.z)
lobe_l, lobe_r = lobe(1), lobe(-1)
bridge_band = [v for v in V if abs(v.x) < 0.05 and abs(v.z - eye_z) < 0.12]
bridge = max(bridge_band, key=lambda v: -v.y)                 # most forward point at eye level, on the midline
# neck: the narrowest horizontal section between chin and shoulders
def section(z, tol=0.04):
    ring = [v for v in V if abs(v.z - z) < tol and abs(v.x) < 0.9]
    return ring
best = None
for i in range(40):
    z = eye_z - 1.0 - i * 0.03
    ring = section(z)
    if len(ring) < 8: continue
    w = max(v.x for v in ring) - min(v.x for v in ring)
    if best is None or w < best[1]: best = (z, w, ring)
nz, nw, ring = best
base_z = nz - 0.35                                            # where a chain sits: the base of the neck
ring = section(base_z, 0.05)
cx, cy = (max(v.x for v in ring) + min(v.x for v in ring)) / 2, (max(v.y for v in ring) + min(v.y for v in ring)) / 2
neck = {'centre': g(Vector((cx, cy, base_z))), 'half_width': round((max(v.x for v in ring) - min(v.x for v in ring)) / 2 * DM, 2),
        'half_depth': round((max(v.y for v in ring) - min(v.y for v in ring)) / 2 * DM, 2)}
front_band = [v for v in V if abs(v.x) < 0.06 and abs(v.z - (base_z - 0.18)) < 0.04]
notch = min(front_band, key=lambda v: v.y)                    # the front of the neck at its base: the jugular notch
anchors = {'earlobe_l': g(lobe_l), 'earlobe_r': g(lobe_r), 'nose_bridge': g(bridge), 'eye_l': g(eye_l), 'eye_r': g(eye_r),
           'neck': neck, 'neck_front': g(notch), 'units': 'mm', 'source': 'MakeHuman 1.x base mesh, CC0 1.0'}
print('ANCHORS', json.dumps(anchors))

# --- face landmarks: MediaPipe's 468 canonical landmarks pinned to the bust (for morphing to a customer's face) ------
# The canonical face (Apache 2.0, mediapipe/modules/face_geometry/data/canonical_face_model.obj) is in cm with y up,
# z forward and the subject's left at +x: the bust's glTF axes. Scale it to the bust's eye spacing, put its nose tip on
# the bust's, and pin every landmark to the nearest bust vertex. C (canonical, in the bust frame) and B (on the bust)
# go to face-landmarks-v1.json: at runtime the customer's landmarks are aligned to C, and their differences from C
# move B and, smoothly, the skin around it.
CANON = next((a for a in sys.argv if a.endswith('canonical_face_model.obj')), None)
if CANON:
    from mathutils.kdtree import KDTree
    cv = [Vector(map(float, l.split()[1:4])) for l in open(CANON) if l.startswith('v ')]
    nose_band = [v for v in V if abs(v.x) < 0.05 and eye_z - 0.75 < v.z < eye_z - 0.15]
    nose = min(nose_band, key=lambda v: v.y)                                          # most forward: the nose tip
    bust_mm = [Vector(g(v)) for v in V]
    eye_mid = lambda a, b: (cv[a] + cv[b]) / 2
    canon_ipd = (eye_mid(263, 362) - eye_mid(33, 133)).length
    k = (Vector(g(eye_l)) - Vector(g(eye_r))).length / canon_ipd
    shift = Vector(g(nose)) - cv[1] * k
    C = [c * k + shift for c in cv]
    tree = KDTree(len(bust_mm))
    for i, p in enumerate(bust_mm): tree.insert(p, i)
    tree.balance()
    B = [tree.find(c)[0] for c in C]
    err = sum((b - c).length for b, c in zip(B, C)) / len(C)
    out = Path(OUT).with_name('face-landmarks-v1.json')
    out.write_text(json.dumps({'about': 'MediaPipe canonical face landmarks (Apache 2.0) on the AMES portrait bust, mm, glTF frame',
                               'C': [[round(x, 1) for x in c] for c in C], 'B': [[round(x, 1) for x in b] for b in B]}))
    print('LANDMARKS', len(C), 'mean pin distance mm', round(err, 2), '->', out)

# --- eyes: subdivided helpers with painted sclera, iris and pupil ---------------------------------------------
for o in eyes:
    m = o.modifiers.new('subd', 'SUBSURF'); m.levels = 2
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='subd')
    me = o.data; c = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        d = (v.co - c).normalized(); a = math.degrees(math.acos(max(-1, min(1, -d.y))))   # angle from looking forward (-Y)
        rgb = (0.02, 0.015, 0.012) if a < 6 else (0.16, 0.09, 0.05) if a < 15 else (0.09, 0.05, 0.03) if a < 16.5 else (0.86, 0.84, 0.8)
        col.data[v.index].color = (*rgb, 1)
    for p in me.polygons: p.use_smooth = True
    o.name = 'Eye ' + ('left' if c.x > 0 else 'right')
body.name = 'Bust skin'

# --- millimetres, one root carrying the anchors -------------------------------------------------------------
root = bpy.data.objects.new('AMES portrait bust', None); bpy.context.scene.collection.objects.link(root)
for o in [body] + eyes:
    o.parent = root
root.scale = (DM / 1000, DM / 1000, DM / 1000)               # dm -> m (glTF metres; anchors are in mm)
root['ames_bust'] = anchors
bpy.context.view_layer.update()
print('VERTS', len(body.data.vertices), 'FACES', len(body.data.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=True, export_yup=True,
                          export_attributes=True, use_selection=False)
print('wrote', OUT)

if PREVIEW:                                                   # the mesh and anchors, before any shading
    scene = bpy.context.scene; scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.show_object_outline = False
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    wf = body.modifiers.new('wire', 'WIREFRAME'); wf.thickness = 0.004; wf.use_replace = False
    for name, p in (('lobe l', lobe_l), ('lobe r', lobe_r), ('bridge', bridge), ('notch', notch)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0045, location=root.matrix_world @ (p * 1)); s = bpy.context.object
        mat = bpy.data.materials.new(name); mat.diffuse_color = (0.9, 0.1, 0.1, 1); s.data.materials.append(mat)
        s.location = Vector((p.x * 0.1, p.y * 0.1, p.z * 0.1))
    cam = bpy.data.cameras.new('cam'); cam.lens = 105; co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
    co.location = (0.62, -1.05, 0.66); co.rotation_euler = (math.radians(88), 0, math.radians(30))
    scene.camera = co; scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('preview', PREVIEW)
