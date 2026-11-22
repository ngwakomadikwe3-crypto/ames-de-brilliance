"""N2 The Solitaire Pendant: one round brilliant in a four-prong basket on a fine cable chain.

Original AMES geometry built in Blender with ames_jewel_kit. Default configuration: a 1 ct round (6.5 mm) in four
claws with a gallery wire under the girdle, hung from a jump ring and an oval bail on a 45 cm cable chain (1.15 mm
links, alternate links turned a quarter) with a spring-ring clasp at the nape. Worn pose as the house necklaces:
built in Blender millimetres facing -Y with +Z up, exported under a root 'AMES piece (authored in mm)' scaled 1/1000.

Run:  python scripts/blender/create_n2_solitaire_pendant.py <out.glb>      (bpy module)
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
link_to_scene = bpy.context.scene.collection.objects.link
UP = Vector((0, 0, 1))


def material(name, color, metallic, roughness, transmission=0, ior=1.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    s = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, v in {'Base Color': (*color, 1), 'Metallic': metallic, 'Roughness': roughness, 'Transmission Weight': transmission, 'IOR': ior}.items():
        s.inputs[k].default_value = v
    return m


metal = material('White gold | visual study', (.87, .86, .84), 1, .05)
diamond = material('Diamond | closed dielectric', (.99, 1, 1), 0, .012, 1, 2.417)

root = bpy.data.objects.new('AMES piece (authored in mm)', None); link_to_scene(root)


def place(o, parent=root):
    if o.name not in bpy.context.scene.collection.objects: link_to_scene(o)
    o.parent = parent
    return o


# --- the chain: the house necklace line, softened from a V to a U for a pendant -------------------------------------
LENGTH, PITCH, WIRE, INNER = 450, 1.15, .28, (1.45, .78)       # chain length, link pitch, wire, inner oval (along, across)


def shape(phi, s):
    return Vector((50 * s * math.sin(phi), -46 * s * math.cos(phi), -100 * s * ((1 + math.cos(phi)) / 2) ** 2.2))


def polyline(s, n=6000):
    return [shape(i / n * math.tau, s) for i in range(n + 1)]


s = 1
for _ in range(6):
    pts = polyline(s); s *= LENGTH / sum((b - a).length for a, b in zip(pts, pts[1:]))
samples = polyline(s)
acc = [0]
for a, b in zip(samples, samples[1:]): acc.append(acc[-1] + (b - a).length)
N = round(acc[-1] / PITCH)
points, j = [], 0
for i in range(N):
    target = i * acc[-1] / N
    while acc[j + 1] < target: j += 1
    points.append(samples[j].lerp(samples[j + 1], (target - acc[j]) / (acc[j + 1] - acc[j])))

# one oval link in its own frame (x along the chain, y across), swept once and copied round the line
ax, ay = INNER[0] / 2 + WIRE / 2, INNER[1] / 2 + WIRE / 2
oval = [Vector((ax * math.cos(t), ay * math.sin(t), 0)) for t in (math.tau * k / 18 for k in range(18))]
template = kit.sweep('chain link', oval, WIRE / 2, metal, sides=6, closed=True)
bm = bmesh.new()
clasp_at = N // 2                                                 # the nape (phi = pi)
for i, p in enumerate(points):
    if i == clasp_at: continue
    t = (points[(i + 1) % N] - points[(i - 1) % N]).normalized()
    out = Vector((p.x, p.y, 0)).normalized()
    y = (out - t * out.dot(t)).normalized(); z = t.cross(y)
    M = Matrix((t, y, z)).transposed().to_4x4()
    if i % 2: M = M @ Matrix.Rotation(math.pi / 2, 4, 'X')       # cable chain: alternate links a quarter turn
    M.translation = p
    me = template.data.copy(); me.transform(M); bm.from_mesh(me); bpy.data.meshes.remove(me)
bpy.data.objects.remove(template)
chain_me = bpy.data.meshes.new('Cable chain'); bm.to_mesh(chain_me); bm.free()
for poly in chain_me.polygons: poly.use_smooth = True
chain_me.materials.append(metal)
chain = place(bpy.data.objects.new('Cable chain', chain_me)); chain['ames_optical_mode'] = 'conductor'

# spring-ring clasp at the nape and its tab
nape = points[clasp_at]; tn = (points[clasp_at + 1] - points[clasp_at - 1]).normalized()
place(kit.ring_link('Spring ring clasp', 1.55, .42, nape - tn * .9, UP, metal))
place(kit.sweep('Clasp tab', [nape + tn * .4, nape + tn * 2.2], .45, metal, sides=10, flatten=lambda t: (1, .45)))

# --- the pendant ---------------------------------------------------------------------------------------------------
CARAT_MM = 6.5
R = CARAT_MM / 2
front = points[0]
pendant = place(bpy.data.objects.new('Pendant', None))
bpy.context.view_layer.update()                                   # pendant node at the origin: parts keep world placement
bail_ring = place(kit.ring_link('Bail jump ring', .9, .32, front + Vector((0, 0, -.6)), Vector((1, 0, 0)), metal), pendant)
bail_top = front + Vector((0, 0, -1.4))
centre = bail_top + Vector((0, -.4, -(3.2 + R)))                 # the stone hangs a touch proud of the chest line
# stone frame: table toward the viewer (-Y), local +Y up
X, Zs = Vector((1, 0, 0)), Vector((0, -1, 0)); Ys = Zs.cross(X)
F = Matrix((X, Ys, Zs)).transposed().to_4x4(); F.translation = centre
gem = kit.round_brilliant('Solitaire diamond', R, diamond); place(gem, pendant)
gem.matrix_world = F @ Matrix.Rotation(math.radians(11), 4, 'Z')
gem['ames_optical_mode'] = 'closed-dielectric-visual'; gem['ames_gemstone_id'] = 'stone-diamond'; gem['ames_cut'] = 'round'
# the oval bail: a polished loop through the jump ring, down to the top of the basket
bail = kit.sweep('Bail', [F @ Vector((0, R + .55, -.9)), bail_top + Vector((0, .5, -.5)), bail_top + Vector((0, .9, .7)),
                          bail_top + Vector((0, 0, 1.35)), bail_top + Vector((0, -.9, .7)), bail_top + Vector((0, -.5, -.5)),
                          F @ Vector((0, R + .55, .25))], .34, metal, sides=12, flatten=lambda t: (1.25, .8))
parts = [bail]
# four claws from under the stone, over the girdle, filed onto the crown
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2; c, sn = math.cos(a), math.sin(a)
    path = [F @ Vector((R * .32 * c, R * .32 * sn, -R * .95)), F @ Vector((R * .82 * c, R * .82 * sn, -R * .45)),
            F @ Vector((R * 1.04 * c, R * 1.04 * sn, 0)), F @ Vector((R * .97 * c, R * .97 * sn, R * .2))]
    parts.append(kit.sweep(f'Claw {k}', kit.catmull(path, 6), lambda t: .36 - .06 * t, metal, sides=12, flatten=lambda t: (1, .7 if t > .85 else 1)))
# gallery wire under the girdle and a small culet ring tying the claws
gallery = [F @ Vector((R * .9 * math.cos(t), R * .9 * math.sin(t), -R * .36)) for t in (math.tau * k / 48 for k in range(48))]
parts.append(kit.sweep('Gallery wire', gallery, .2, metal, sides=8, closed=True))
base = [F @ Vector((R * .33 * math.cos(t), R * .33 * math.sin(t), -R * .95)) for t in (math.tau * k / 32 for k in range(32))]
parts.append(kit.sweep('Basket ring', base, .22, metal, sides=8, closed=True))
for p in parts:
    if p.name not in bpy.context.scene.collection.objects: link_to_scene(p)
bpy.context.view_layer.update()
mount = kit.join(parts, 'Pendant setting')
for p in parts:
    if p.name in bpy.data.objects: bpy.data.objects.remove(p)
if mount.name not in bpy.context.scene.collection.objects: link_to_scene(mount)
mw = mount.matrix_world.copy(); mount.parent = pendant; mount.matrix_parent_inverse = pendant.matrix_world.inverted(); mount.matrix_world = mw
mount['ames_optical_mode'] = 'conductor'

root['ames_design'] = {'code': 'N2', 'name': 'The Solitaire Pendant', 'chain_mm': LENGTH, 'centre': 'round, 1 ct, four claws', 'links': N - 1}
print('N2 links', N - 1, 'length', round(acc[-1]), flush=True)
root.scale = (.001, .001, .001)
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=False, export_yup=True, use_selection=False)
print('wrote', OUT)
