"""AMES iced watch, revision 9: the watch-v8 metal reworked in Blender to the house standard.

What changes (everything else in watch-v8.glb is kept byte for byte by scripts/apply-iced-watch-v9.mjs):
  * Drilled pavé. Every pavé stone the viewer sets (bezel, case side, lugs, the six large stones on each bracelet link
    and the fifty shoulder stones build-diamond-designs.py adds) gets its own seat: a short well round the girdle, a
    cone the pavilion sits in and a drilled hole under the culet, cut from the case and the link metal.
  * Hands. The hour and minute hands become faceted dauphine hands (a raised centre ridge, so each half catches the
    light differently) with a pierced boss at the pivot; the seconds hand a fine needle with a round counterweight.
    Same length, width, thickness and pivot as before, so the movement and try-on code see the same hands.
  * Finish and edges: every hard edge of the case and links gets a small two-step chamfer that catches a thin
    line of light; link tops and case flanks are polished, link sides and the case back satin (separate materials).
  * Winding crown stone. The placeholder becomes a true 57-facet round brilliant (ames_jewel_kit) of the same size.

The script works directly in each mesh's own glTF coordinates (no axis conversion): it reads the dequantized watch,
cuts in Blender, and writes the new triangles to a JSON file the splice script installs.

Run:  python create_iced_watch_v9.py -- <watch-v8-dequantized.glb> <out.json>      (bpy module, or blender --python)
Make the input with:  npx gltf-transform dequantize public/ames-engine/ames-iced-watch/web/watch-v8.glb in.glb
"""
import base64
import json
import math
import struct
import sys
import time
from pathlib import Path

import bpy
import bmesh  # noqa: E402 (after bpy)
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
src, out = Path(argv[0]), Path(argv[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
T0 = time.time()

raw = src.read_bytes()
n = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + n])
binary = raw[28 + n:]
node = {nd['name']: nd for nd in doc['nodes']}
COMP = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def accessor(i):
    a = doc['accessors'][i]
    v = doc['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    w = WIDTH[a['type']]
    stride = v.get('byteStride', size * w)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<%d%s' % (w, fmt), binary, start + k * stride) for k in range(a['count'])]


def mesh_of(name):
    """bmesh of a node's mesh in its own (glTF) coordinates, welded so it can be cut."""
    prim = doc['meshes'][node[name]['mesh']]['primitives'][0]
    pos = accessor(prim['attributes']['POSITION'])
    idx = [i[0] for i in accessor(prim['indices'])] if 'indices' in prim else list(range(len(pos)))
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in pos]
    for k in range(0, len(idx), 3):
        try:
            bm.faces.new((verts[idx[k]], verts[idx[k + 1]], verts[idx[k + 2]]))
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return bm


def layout(name):
    packed = base64.b64decode(node[name]['extras']['ames_pave_layout'])
    return [(Vector(r[:3]), Quaternion((r[6], r[3], r[4], r[5])), r[7]) for r in struct.iter_unpack('<8f', packed)]


def shoulder_stones():
    # The same fifty small stones build-diamond-designs.py adds to every bracelet link (keep the two in step).
    out = []
    for side in (-1, 1):
        for row in range(5):
            for col in range(5):
                out.append((Vector(((col - 2) * 1.16 + (.18 if row % 2 else -.18), 1.36, side * (2.72 + row * 1.25))), Quaternion(), 1.10))
    return out


def to_local(stones, target):
    """Stones given in the parent frame of the target node -> the target mesh's own coordinates."""
    nd = node[target]
    t = Vector(nd.get('translation', (0, 0, 0)))
    s = nd.get('scale', (1, 1, 1))[0]
    assert 'rotation' not in nd, target
    return [((p - t) / s, q, d / s) for p, q, d in stones]


def seat(p, q, d, n=14):
    """Cutter for one pavé seat: a well round the girdle, the pavilion cone, a drilled hole. Axis = q * +Y (table)."""
    axis = q @ Vector((0, 1, 0))
    u = axis.orthogonal().normalized(); v = axis.cross(u)
    r = d / 2
    profile = [(r * 1.04, .9 * r), (r * 1.04, -.03 * r), (r * .96, -.1 * r), (.3 * r, -.86 * r), (.3 * r, -2.2 * r)]
    verts, faces = [], []
    for rr, h in profile:
        for k in range(n):
            a = k * math.tau / n
            verts.append(tuple(p + axis * h + u * (rr * math.cos(a)) + v * (rr * math.sin(a))))
    for i in range(len(profile) - 1):
        for k in range(n):
            faces.append((i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k))
    faces.append(tuple(range(n))); faces.append(tuple(reversed(range((len(profile) - 1) * n, len(profile) * n))))
    return verts, faces


def drill(name, stones, bevel):
    bm = mesh_of(name)
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    # A small chamfer on every hard edge, so each edge catches a thin bright line of light (bevel in mesh units).
    bev = obj.modifiers.new('Edge chamfer', 'BEVEL')
    bev.width = bevel; bev.segments = 2; bev.limit_method = 'ANGLE'; bev.angle_limit = math.radians(35); bev.harden_normals = False
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bev.name)
    verts, faces = [], []
    for p, q, d in stones:
        v, f = seat(p, q, d)
        faces += [tuple(i + len(verts) for i in face) for face in f]; verts += v
    cm = bpy.data.meshes.new('seats'); cm.from_pydata(verts, [], faces)
    cutter = bpy.data.objects.new('seats', cm); bpy.context.scene.collection.objects.link(cutter)
    mod = obj.modifiers.new('Drill pavé seats', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'; mod.object = cutter; mod.solver = 'EXACT'; mod.use_hole_tolerant = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter)
    print('WATCH_V9 drilled %-24s %4d seats  %6d faces  %.0fs' % (name, len(stones), len(obj.data.polygons), time.time() - T0), flush=True)
    return obj.data


def dauphine(width, thick, pivot, boss, n=24):
    """A faceted hand in its normalized box (length along +Y from -1 to 1, flat in XY, raised toward +Z)."""
    bm = bmesh.new()
    tip, tail = 1.0, -1.0
    widest = pivot + (tip - pivot) * .22
    outline = [(0, tip), (width, widest), (width * .55, pivot), (width * .45, tail), (-width * .45, tail), (-width * .55, pivot), (-width, widest)]
    top = [bm.verts.new((x, y, thick * .25)) for x, y in outline]
    bottom = [bm.verts.new((x, y, -thick)) for x, y in outline]
    ridge = [bm.verts.new((0, tip, thick * .25)), bm.verts.new((0, pivot, thick))]
    m = len(outline)
    for k in range(m):
        bm.faces.new((bottom[k], bottom[(k + 1) % m], top[(k + 1) % m], top[k]))
    bm.faces.new(list(reversed(bottom)))
    # Top: two facets either side of the ridge from the tip to the pivot, flat behind it.
    bm.faces.new((top[0], ridge[1], top[1])); bm.faces.new((top[1], ridge[1], top[2]))
    bm.faces.new((top[6], ridge[1], top[0])); bm.faces.new((top[5], ridge[1], top[6]))
    bm.faces.new((top[3], top[2], ridge[1])); bm.faces.new((top[3], ridge[1], top[4])); bm.faces.new((top[4], ridge[1], top[5]))
    bm.verts.remove(ridge[0])
    # Pierced boss round the pivot.
    ring = bmesh.ops.create_circle(bm, segments=n, radius=boss)['verts']
    bmesh.ops.translate(bm, verts=ring, vec=(0, pivot, thick * .3))
    inner = bmesh.ops.create_circle(bm, segments=n, radius=boss * .45)['verts']
    bmesh.ops.translate(bm, verts=inner, vec=(0, pivot, thick * .3))
    for k in range(n):
        bm.faces.new((ring[k], ring[(k + 1) % n], inner[(k + 1) % n], inner[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def needle(width, thick, pivot, weight, n=20):
    bm = bmesh.new()
    pts = [(0, 1), (width, pivot + .1), (width * 1.4, pivot), (width, pivot - .05), (width * .9, -.7)]
    outline = pts + [(-x, y) for x, y in reversed(pts[1:])]
    top = [bm.verts.new((x, y, thick)) for x, y in outline]; bottom = [bm.verts.new((x, y, -thick)) for x, y in outline]
    m = len(outline)
    bm.faces.new(top); bm.faces.new(list(reversed(bottom)))
    for k in range(m):
        bm.faces.new((bottom[k], bottom[(k + 1) % m], top[(k + 1) % m], top[k]))
    disc = bmesh.ops.create_cone(bm, cap_ends=True, segments=n, radius1=weight, radius2=weight, depth=thick * 2)['verts']
    bmesh.ops.translate(bm, verts=disc, vec=(0, -.82, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def finish(name, bm_or_mesh, smooth_angle=None, brushed=None):
    """brushed(normal) -> True for faces with a satin finish (link sides, case back); the rest stay polished."""
    if isinstance(bm_or_mesh, bmesh.types.BMesh):
        mesh = bpy.data.meshes.new(name); bm_or_mesh.to_mesh(mesh); bm_or_mesh.free()
    else:
        mesh = bm_or_mesh
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.normal_update()
    groups = {'polished': ([], []), 'brushed': ([], [])}
    for f in bm.faces:
        pos, nor = groups['brushed' if brushed and brushed(f.normal) else 'polished']
        # Flat facets for stones and hands; the case keeps soft normals where the surface is smooth.
        for loop in f.loops:
            n_ = f.normal if smooth_angle is None or loop.edge.calc_face_angle(0) > smooth_angle else loop.vert.normal
            pos.append(tuple(loop.vert.co)); nor.append(tuple(n_.normalized()))
    bm.free()
    pack = lambda rows: base64.b64encode(b''.join(struct.pack('<3f', *r) for r in rows)).decode()
    out = {k: {'positions': pack(p), 'normals': pack(n), 'count': len(p)} for k, (p, n) in groups.items() if p}
    out['count'] = sum(v['count'] for k, v in out.items() if isinstance(v, dict))
    return out


result = {}
# --- drilled pavé ---------------------------------------------------------------------------------------------------
case_stones = to_local(layout('Pavé · bezel') + layout('Pavé · case side') + layout('Pavé · lugs'), 'Case and lugs')
# Polished flanks, bezel and lugs; satin case back.
result['Case and lugs'] = finish('Case and lugs', drill('Case and lugs', case_stones, 0.05 / 24.62), smooth_angle=math.radians(30), brushed=lambda n: n.z < -0.6)
link_stones = layout('Pavé · bracelet 1') + shoulder_stones()
# Polished link tops, satin sides and undersides.
result['Bracelet link 1 metal'] = finish('Bracelet link 1 metal', drill('Bracelet link 1 metal', to_local(link_stones, 'Bracelet link 1 metal'), 0.06 / 9.895), smooth_angle=math.radians(30), brushed=lambda n: n.y < 0.55)
result['Bracelet link 10 metal'] = finish('Bracelet link 10 metal', drill('Bracelet link 10 metal', to_local(layout('Pavé · bracelet 10') + shoulder_stones(), 'Bracelet link 10 metal'), 0.06 / 9.895), smooth_angle=math.radians(30), brushed=lambda n: n.y < 0.55)

# --- hands: same box, pivot where the movement turns them ------------------------------------------------------------
for name, width, thick, kind in (('Hour hand mesh', .172, .032, 'dauphine'), ('Minute hand mesh', .089, .022, 'dauphine'), ('Second hand mesh', .026, .008, 'needle')):
    nd = node[name]
    pivot = -nd['translation'][1] / nd['scale'][1]
    bm = dauphine(width, thick, pivot, width * .9) if kind == 'dauphine' else needle(width * .5, thick, pivot, width * 2.4)
    result[name] = finish(name, bm)

# --- winding-crown stone: a true round brilliant in the placeholder's box (table +Y, girdle radius 1) ---------------
gem = kit.round_brilliant('Crown diamond', 1.0)
zs = [v.co.z for v in gem.data.vertices]
mid, half = (max(zs) + min(zs)) / 2, (max(zs) - min(zs)) / 2
for v in gem.data.vertices:                     # Blender +Z table -> glTF +Y, depth scaled to the placeholder's .604
    x, y, z = v.co
    v.co = Vector((x, (z - mid) * .604 / half, -y))
result['Crown diamond'] = finish('Crown diamond', gem.data)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result))
print('WATCH_V9_COMPLETE %.0fs' % (time.time() - T0), {k: v['count'] // 3 for k, v in result.items()}, flush=True)
