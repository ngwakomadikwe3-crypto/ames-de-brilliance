"""AMES diamond tennis bracelet, revision 4: rebuilt in Blender, link by link.

Round brilliants, each in its own four-claw box link with a tapered under-gallery, hinged to its neighbours, closed
by a box clasp with a figure-eight safety. Original AMES geometry; sizes are design inputs, not measured stock.

Built in millimetres (1 unit = 1 mm), as the AMES viewer expects of a bracelet: every link is its own node tagged
ames_link (its place counted from the clasp; local +X along the chain, +Z the stone's table), and the root carries
ames_bracelet (links, pitch, length and width) so the viewer can open the clasp and lay the bracelet flat.

Run:  blender --background --python create_tennis_bracelet_v4.py -- <out.blend> [<out.glb>]
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh  # noqa: E402 (after bpy)
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out_blend = Path(argv[0]) if argv else Path('tennis-bracelet-v4.blend')
out_glb = Path(argv[1]) if len(argv) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
link_to_scene = scene.collection.objects.link


def material(name, color, metallic, roughness, transmission=0, ior=1.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    s = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, v in {'Base Color': (*color, 1), 'Metallic': metallic, 'Roughness': roughness, 'Transmission Weight': transmission, 'IOR': ior}.items():
        s.inputs[k].default_value = v
    return m


metal = material('White gold | visual study', (.87, .86, .84), 1, .05)
diamond = material('Diamond | closed dielectric', (.99, 1, 1), 0, .012, 1, 2.417)

# --- design inputs (mm) ----------------------------------------------------------------------------------------------
D, PITCH = 3.3, 3.62                    # stone diameter, link to link
RX, RY = 30.5, 25.5                     # the closed bracelet is an oval, as it sits on a wrist
TILT = math.radians(30)                 # the tables lean outward and up
R = D / 2
GIRDLE = .07
girdle_top = GIRDLE * R / 2
crown = lambda r: (1 - r / R) * math.tan(math.radians(34.5)) * R


def box(size, at, bevel=.12):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0] + at[0], v.co.y * size[1] + at[1], v.co.z * size[2] + at[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, profile=.5, affect='EDGES')
    mesh = bpy.data.meshes.new('box'); bm.to_mesh(mesh); bm.free()
    mesh.materials.append(metal)
    o = bpy.data.objects.new('box', mesh); kit.sharpen(o, 50)
    return o


def link_metal(name, pin_back=True, pin_front=True, clasp=None):
    """One link's setting in its own frame: +X along the chain, +Z the table, origin the stone."""
    parts = []
    top_z, low_z, top_s, low_s = -.10 * D, -.37 * D, R * .97, R * .6
    square = lambda s, z: [Vector((-s, -s, z)), Vector((s, -s, z)), Vector((s, s, z)), Vector((-s, s, z))]

    def frame(s, z, wire):
        # A square of wire with eased corners.
        c, pts = square(s, z), []
        for k in range(4):
            a, b, n = c[k], c[(k + 1) % 4], c[(k + 2) % 4]
            pts += [a.lerp(b, t) for t in (.12, .5, .88)] + [b.lerp(a, .04).lerp(b.lerp(n, .04), .5)]
        return kit.sweep(name + ' frame', kit.soften(pts + [pts[0]], 1)[:-1], wire, metal, sides=10, closed=True)
    parts.append(frame(top_s, top_z, .2)); parts.append(frame(low_s, low_z, .17))
    for sx in (-1, 1):
        for sy in (-1, 1):
            out = Vector((sx, sy, 0)).normalized()
            at = lambda r, z: out * r + Vector((0, 0, z))
            tip_r = R * .74
            path = kit.soften([
                at(low_s * 2 ** .5 * .96, low_z - .05),               # foot on the lower frame
                at(top_s * 2 ** .5 * .9, top_z),                       # up the corner of the box
                at(R + .30, girdle_top - .05),                         # beside the girdle
                at(R + .22, girdle_top + .2),
                at((R + tip_r) / 2 + .06, girdle_top + crown((R + tip_r) / 2) + .24),
                at(tip_r, girdle_top + crown(tip_r) + .15),            # resting on the crown
            ])
            radius = lambda t: .2 - .05 * t
            flat = lambda t: (1 + .3 * max(0, (t - .75) / .25), 1 - .3 * max(0, (t - .75) / .25))
            parts.append(kit.sweep(name + ' claw', path, radius, metal, sides=12, flatten=flat, round_start=True))
    # Hinge: a pin under the gap to each neighbour, with a knuckle on this link.
    back, front = (-PITCH / 2 if pin_back else 0), (PITCH / 2 if pin_front else 0)
    if front - back > .01:
        parts.append(kit.sweep(name + ' hinge pin', [(back, 0, low_z), (front, 0, low_z)], .24, metal, sides=12, round_start=True))
    if clasp == 'tongue':
        parts.append(box((2.5, 2.0, .9), (1.0, 0, -.63 * D)))
    if clasp == 'box':
        parts.append(box((2.7, 2.3, 1.1), (-1.0, 0, -.63 * D)))
        # Figure-eight safety catch on the side of the box.
        parts.append(kit.ring_link(name + ' safety', .55, .14, (-1.9, 1.25, -.63 * D), (0, 1, 0), metal))
        parts.append(kit.ring_link(name + ' safety', .45, .14, (-.95, 1.25, -.63 * D), (0, 1, 0), metal))
    joined = kit.join(parts, name)
    for p in parts:
        bpy.data.meshes.remove(p.data)
    return joined


# --- the closed bracelet: links spaced evenly round the oval ---------------------------------------------------------
def oval(t):
    return Vector((RX * math.cos(t), RY * math.sin(t), 0))


samples = [oval(i * math.tau / 4000) for i in range(4001)]
lengths = [0]
for a, b in zip(samples, samples[1:]):
    lengths.append(lengths[-1] + (b - a).length)
N = round(lengths[-1] / PITCH)
points, j = [], 0
for i in range(N):
    target = i * lengths[-1] / N
    while lengths[j + 1] < target:
        j += 1
    points.append(samples[j].lerp(samples[j + 1], (target - lengths[j]) / (lengths[j + 1] - lengths[j])))
CLASP = round(N * .75)

root = bpy.data.objects.new('AMES tennis bracelet', None); link_to_scene(root)
stone_mesh = kit.round_brilliant('Tennis diamond', R, diamond, girdle=GIRDLE).data
plain = link_metal('White gold tennis link').data
tongue = link_metal('White gold clasp link (tongue)', pin_front=False, clasp='tongue').data
catch = link_metal('White gold clasp link (box)', pin_back=False, clasp='box').data
width = 0
for i in range(N):
    p = points[i]
    t = (points[(i + 1) % N] - points[(i - 1) % N]).normalized()
    out = Vector((t.y, -t.x, 0))
    if out.dot(p) < 0:
        out = -out
    table = (out * math.cos(TILT) + Vector((0, 0, math.sin(TILT)))).normalized()
    x = (t - table * t.dot(table)).normalized()
    y = table.cross(x)
    order = (i - (CLASP + 1) + N) % N
    node = bpy.data.objects.new('Bracelet link %d' % order, None); link_to_scene(node)
    node.parent = root
    node.matrix_world = Matrix((x, y, table)).transposed().to_4x4()
    node.matrix_world.translation = p
    node['ames_link'] = order
    gem = bpy.data.objects.new('Tennis diamond %d' % i, stone_mesh); link_to_scene(gem); gem.parent = node
    gem.rotation_euler = (0, 0, math.radians((i * 53) % 45))            # no two stones turned alike
    gem['ames_optical_mode'] = 'closed-dielectric-visual'; gem['ames_gemstone_id'] = 'stone-diamond'; gem['ames_cut'] = 'round'
    data = tongue if i == CLASP else catch if i == (CLASP + 1) % N else plain
    setting = bpy.data.objects.new('Link setting %d' % i, data); link_to_scene(setting); setting.parent = node
    setting['ames_optical_mode'] = 'conductor'
    ys = [v.co.y for v in data.vertices]
    width = max(width, max(ys) - min(ys), D)
length = round(N * PITCH * 10) / 10
root['ames_bracelet'] = {'links': N, 'pitch': PITCH, 'length_mm': length, 'width_mm': round(width * 10) / 10, 'clasp': 'box clasp with figure-eight safety'}
bpy.context.view_layer.update()
print('BRACELET_V4 links', N, 'length mm', length, 'width mm', round(width, 2), flush=True)
out_blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out_blend.resolve()))
if out_glb:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out_glb.resolve()), export_format='GLB', use_selection=True, export_apply=False,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_yup=True)
print('BRACELET_V4_COMPLETE', flush=True)
