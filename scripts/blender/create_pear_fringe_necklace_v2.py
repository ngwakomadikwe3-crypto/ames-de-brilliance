"""AMES pear-drop fringe necklace, revision 2: rebuilt in Blender, link by link.

A 42 cm riviera of round brilliants, each in the tennis bracelet's four-claw box link (tapered under-gallery, hinge
pin to each neighbour), plain box links round the back of the neck, and a box clasp with a figure-eight safety at the
nape. A graduated fringe of pear brilliants hangs from every second link at the front, the largest at the centre,
each in the pear drop earring's claw setting with a V claw guarding the point, on a jump-ring bail so it swings.
Original AMES geometry (a classic fringe riviera); sizes are design inputs, not measured stock.

Same layout and node contract as revision 1 (scripts/ames-pieces/necklace.mjs) so the viewer, the lay-flat 'hang'
view and the cut variants (scripts/build-necklace-cuts.mjs) keep working:
  every link is its own node tagged ames_link (its place counted from the clasp; local +X along the chain, +Z the
  stone's table); each pear sits in its own node at its hinge tagged ames_dangle; the root carries ames_bracelet
  with kind 'necklace' and lay 'hang'. Built in millimetres (the .blend; the .glb root scales by 1/1000 as revision 1 does); worn pose faces -Y (glTF
+Z) with +Z up.

Run:  blender --background --python create_pear_fringe_necklace_v2.py -- <out.blend> [<out.glb>]
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
out_blend = Path(argv[0]) if argv else Path('pear-fringe-necklace-v2.blend')
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
LENGTH, D, PITCH = 420, 2.6, 2.95      # chain length, riviera stone diameter, link to link
R = D / 2
GIRDLE = .07
girdle_top = GIRDLE * R / 2
crown = lambda r: (1 - r / R) * math.tan(math.radians(34.5)) * R
DIAMOND_ARC, FRINGE = 150, 21          # diamonds 150 mm either side of the centre; 21 pears a side + the centre one
UP, DOWN = Vector((0, 0, 1)), Vector((0, 0, -1))


def box(size, at, bevel=.1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0] + at[0], v.co.y * size[1] + at[1], v.co.z * size[2] + at[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, profile=.5, affect='EDGES')
    mesh = bpy.data.meshes.new('box'); bm.to_mesh(mesh); bm.free()
    mesh.materials.append(metal)
    o = bpy.data.objects.new('box', mesh); kit.sharpen(o, 50)
    return o


def square_frame(name, s, z, wire, sx=1, sy=1):
    """A square of wire with eased corners (the tennis bracelet's basket frame)."""
    c = [Vector((-s * sx, -s * sy, z)), Vector((s * sx, -s * sy, z)), Vector((s * sx, s * sy, z)), Vector((-s * sx, s * sy, z))]
    pts = []
    for k in range(4):
        a, b, n = c[k], c[(k + 1) % 4], c[(k + 2) % 4]
        pts += [a.lerp(b, t) for t in (.12, .5, .88)] + [b.lerp(a, .04).lerp(b.lerp(n, .04), .5)]
    return kit.sweep(name + ' frame', kit.soften(pts + [pts[0]], 1)[:-1], wire, metal, sides=10, closed=True)


def link_metal(name, set_stone, pin_back=True, pin_front=True, clasp=None):
    """One link in its own frame: +X along the chain, +Z the table, origin the stone. With set_stone, the tennis
    bracelet's four-claw box at necklace scale; without, a slim box link of the same pitch."""
    parts = []
    top_z, low_z, top_s, low_s = -.10 * D, -.37 * D, R * .97, R * .6
    if set_stone:
        parts.append(square_frame(name, top_s, top_z, .15)); parts.append(square_frame(name, low_s, low_z, .13))
        for sx in (-1, 1):
            for sy in (-1, 1):
                out = Vector((sx, sy, 0)).normalized()
                at = lambda r, z: out * r + Vector((0, 0, z))
                tip_r = R * .74
                path = kit.soften([
                    at(low_s * 2 ** .5 * .96, low_z - .04),            # foot on the lower frame
                    at(top_s * 2 ** .5 * .9, top_z),                    # up the corner of the box
                    at(R + .23, girdle_top - .04),                      # beside the girdle
                    at(R + .17, girdle_top + .15),
                    at((R + tip_r) / 2 + .05, girdle_top + crown((R + tip_r) / 2) + .18),
                    at(tip_r, girdle_top + crown(tip_r) + .11),         # resting on the crown
                ])
                radius = lambda t: .155 - .04 * t
                flat = lambda t: (1 + .3 * max(0, (t - .75) / .25), 1 - .3 * max(0, (t - .75) / .25))
                parts.append(kit.sweep(name + ' claw', path, radius, metal, sides=12, flatten=flat, round_start=True))
    else:
        # Plain link: a low rounded box frame, wider across the chain than along it, then a bar over the top.
        parts.append(square_frame(name, R * .62, -.2 * D, .2, sx=1.15, sy=.8))
        parts.append(kit.sweep(name + ' bar', [(-R * .6, 0, -.2 * D + .14), (R * .6, 0, -.2 * D + .14)], .17, metal, sides=10, round_start=True))
        low_z = -.2 * D
    back, front = (-PITCH / 2 if pin_back else 0), (PITCH / 2 if pin_front else 0)
    if front - back > .01:
        parts.append(kit.sweep(name + ' hinge pin', [(back, 0, low_z), (front, 0, low_z)], .19, metal, sides=12, round_start=True))
    if clasp == 'tongue':
        parts.append(box((2.4, 1.8, .9), (1.0, 0, -.62 * D)))
    if clasp == 'box':
        parts.append(box((2.6, 2.0, 1.05), (-1.0, 0, -.62 * D)))
        parts.append(kit.ring_link(name + ' safety', .5, .13, (-1.9, 1.1, -.62 * D), (0, 1, 0), metal))
        parts.append(kit.ring_link(name + ' safety', .4, .13, (-1.05, 1.1, -.62 * D), (0, 1, 0), metal))
    joined = kit.join(parts, name)
    for p in parts:
        bpy.data.meshes.remove(p.data)
    return joined


# --- the worn line: round the neck, dipping to a soft V at the front (revision 1's curve, in Blender axes) -----------
def shape(phi, s):
    return Vector((50 * s * math.sin(phi), -46 * s * math.cos(phi), -100 * s * ((1 + math.cos(phi)) / 2) ** 3))


def polyline(s, n=4000):
    return [shape(i / n * math.tau, s) for i in range(n + 1)]


def length_of(pts):
    return sum((b - a).length for a, b in zip(pts, pts[1:]))


s = 1
for _ in range(6):
    s *= LENGTH / length_of(polyline(s))
samples = polyline(s)
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
CLASP = N // 2
arc = lambda i: min(i, N - i) * PITCH

frames = []
for i, p in enumerate(points):
    t = (points[(i + 1) % N] - points[(i - 1) % N]).normalized()
    out = Vector((p.x, p.y, 0)).normalized() + UP * .35
    z = (out - t * out.dot(t)).normalized()                           # the table: outward and a little up
    frames.append([p, t, z])
# Laid flat the drops must fall on the link's +Y side (away from the viewer's ruler), as in revision 1.
flip = DOWN.dot(frames[0][2].cross(frames[0][1])) < 0
for f in frames:
    if flip:
        f[1] = -f[1]
    f.append(f[2].cross(f[1]))                                        # +Y = Z x X
step = -1 if flip else 1
first = CLASP if flip else (CLASP + 1) % N
order_of = lambda i: (((i - first) * step) % N + N) % N
last = (first - step + N) % N

root = bpy.data.objects.new('AMES pear-drop fringe necklace', None); link_to_scene(root)
stone_mesh = kit.round_brilliant('Riviera diamond', R, diamond, girdle=GIRDLE).data
meshes = {
    'set': link_metal('White gold riviera link', True).data,
    'plain': link_metal('White gold box link', False).data,
}


def metal_for(i, set_stone):
    if i == first:
        key = ('box', set_stone)
        if key not in meshes:
            meshes[key] = link_metal('White gold clasp link (box)', set_stone, pin_back=step < 0, pin_front=step > 0, clasp='box').data
        return meshes[key]
    if i == last:
        key = ('tongue', set_stone)
        if key not in meshes:
            meshes[key] = link_metal('White gold clasp link (tongue)', set_stone, pin_back=step > 0, pin_front=step < 0, clasp='tongue').data
        return meshes[key]
    return meshes['set' if set_stone else 'plain']


def parent_keep(child, parent):
    """Parent without moving: child's local matrix becomes parent^-1 @ its world matrix."""
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix()
    child.matrix_basis = parent.matrix_world.inverted() @ world


PEAR_CACHE = {}


def pear(k, W, L, at, table_dir):
    """A pear brilliant (full width W, length L) centred at `at`, point straight up, table toward table_dir, in the
    earring's claw setting with a broad V claw on the point. Returns [stone, *setting parts] placed in world space."""
    ratio = L / W
    outline = kit.pear_outline(ratio)
    tip = 2 * ratio - 1
    hw = W / 2
    gem, info = kit.fancy_brilliant('Pear drop diamond %d' % k, outline, hw, diamond, turn=math.pi / 2, keel=tip - 1.05)
    gem['ames_optical_mode'] = 'closed-dielectric-visual'; gem['ames_gemstone_id'] = 'stone-diamond'
    q = math.pi / 2
    claws = [q, math.radians(24), math.radians(156), math.radians(-38), math.radians(-142)] + ([-q] if k == 0 else [])
    parts = [gem] + kit.claw_setting('Pear drop setting %d' % k, outline, hw, info, claws, metal, wire=max(.17, W * .055), wide=[q],
                                         sides=12 if k == 0 else 10, rail_sides=8)
    # The outline's origin is the centre of the round end; move the stone's mid-length to `at`.
    mid = (tip - 1) / 2 * hw
    y = UP; z = table_dir.normalized(); x = y.cross(z)
    place = Matrix((x, y, z)).transposed().to_4x4()
    place.translation = at
    place = place @ Matrix.Translation((0, -mid, 0))
    for p in parts:
        p.matrix_world = place
    top = place @ Vector((0, tip * hw, 0))                                  # the pear's point, world space
    return parts, top, info


diamonds = longest = 0
for i in range(N):
    p, x, z, y = frames[i]
    order = order_of(i)
    node = bpy.data.objects.new('Necklace link %d' % (order + 1), None); link_to_scene(node)
    node.parent = root
    node.matrix_world = Matrix((x, y, z)).transposed().to_4x4()
    node.matrix_world.translation = p
    node['ames_link'] = order
    set_stone = arc(i) <= DIAMOND_ARC
    if set_stone:
        diamonds += 1
        gem = bpy.data.objects.new('Riviera diamond %d' % i, stone_mesh); link_to_scene(gem); gem.parent = node
        gem.rotation_euler = (0, 0, math.radians((i * 53) % 45))
        gem['ames_optical_mode'] = 'closed-dielectric-visual'; gem['ames_gemstone_id'] = 'stone-diamond'; gem['ames_cut'] = 'round'
    setting = bpy.data.objects.new('Necklace link setting %d' % i, metal_for(i, set_stone)); link_to_scene(setting); setting.parent = node
    setting['ames_optical_mode'] = 'conductor'

    # The fringe: a pear on every second link at the front, graduated to the largest at the centre.
    k = i if i <= N / 2 else i - N
    if abs(k) % 2 or abs(k) > FRINGE * 2:
        continue
    bpy.context.view_layer.update()
    centre = k == 0
    t = abs(k) / (FRINGE * 2)
    W = 6.2 if centre else 4.4 - 1.8 * t
    L = W * (1.5 if centre else 1.45)
    gap = 2.6 if centre else .95
    to_local = node.matrix_world.to_3x3().inverted()
    dn_local = (to_local @ DOWN).normalized()
    hinge_local = dn_local * R * .95 + Vector((0, 0, -.2 * D))
    hinge = node.matrix_world @ hinge_local
    drop = bpy.data.objects.new('Pear drop %d' % k, None); link_to_scene(drop)
    drop.parent = node; drop.matrix_parent_inverse = Matrix(); drop.location = hinge_local
    drop['ames_dangle'] = {'hinge': 'pear'}
    bpy.context.view_layer.update()
    outward = Vector((p.x, p.y, 0)).normalized()
    parts, point, info = pear(k, W, L, hinge + DOWN * (gap + L / 2), outward)
    across = UP.cross(outward).normalized()
    parts.append(kit.ring_link('Pear bail ring %d' % k, .42, .13, hinge, across, metal))      # through the link's pin
    parts.append(kit.sweep('Pear bail %d' % k, [hinge + DOWN * .42, point + UP * .1], .15, metal, sides=12, round_start=True))
    if centre:
        parts.append(kit.ring_link('Pear bail link 0', .5, .14, hinge + DOWN * 1.4, outward, metal))
    stone, metal_parts = parts[0], parts[1:]
    link_to_scene(stone); parent_keep(stone, drop)
    for m in metal_parts:
        link_to_scene(m)
    bpy.context.view_layer.update()
    mount = kit.join(metal_parts, 'Pear drop setting %d' % k)
    for m in metal_parts:
        bpy.data.objects.remove(m)
    link_to_scene(mount); mount['ames_optical_mode'] = 'conductor'
    mount.parent = drop; mount.matrix_parent_inverse = Matrix(); mount.matrix_basis = drop.matrix_world.inverted()
    diamonds += 1
    longest = max(longest, gap + L + R)

length = round(N * PITCH * 10) / 10
root['ames_bracelet'] = {'kind': 'necklace', 'lay': 'hang', 'links': N, 'pitch': PITCH, 'length_mm': length,
                         'width_mm': round((D + .4) * 10) / 10, 'drop_mm': round(longest * 10) / 10,
                         'clasp': 'box clasp with figure-eight safety', 'stones': diamonds, 'stone': 'Diamond'}
bpy.context.view_layer.update()
print('NECKLACE_V2 links', N, 'diamonds', diamonds, 'pears', FRINGE * 2 + 1, 'length mm', length, 'longest drop', round(longest, 1), 'flip', flip, flush=True)
out_blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out_blend.resolve()))
if out_glb:
    # The web file carries the same root as revision 1: authored in millimetres under a 1/1000 scale.
    root.name = 'AMES piece (authored in mm)'; root.scale = (.001, .001, .001)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out_glb.resolve()), export_format='GLB', use_selection=True, export_apply=False,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_yup=True)
print('NECKLACE_V2_COMPLETE', flush=True)
