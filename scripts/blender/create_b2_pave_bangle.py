"""B2 The Pave Bangle: a solid oval bangle paved across its top half, opening on a concealed hinge.

Original AMES geometry built in Blender with ames_jewel_kit: a D-section band (7 mm wide, 3.2 mm deep) on an oval
bore of 60 x 50 mm (Medium); four rows of melee over the domed top half, the middle two on their own carrier named
'accent' so a collection's accent choice turns them into a coloured line; a hinge barrel at one side and a
hidden box catch at the other. Conventions as W1: mm under a 0.001 root, pave layouts on 'Pave .' carriers.

Run:  python scripts/blender/create_b2_pave_bangle.py <out.glb>      (bpy module)
"""
import base64, math, struct, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau

# glTF frame (x right, y up, z toward the viewer) -> Blender (x, -z, y); the exporter converts back.
def g2b(v): return Vector((v[0], -v[2], v[1]))
def b2g(v): return (v[0], v[2], -v[1])

# --- materials -----------------------------------------------------------------------------------------------------
def material(name, color, metallic, roughness, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Metallic'].default_value = metallic; b.inputs['Roughness'].default_value = roughness
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    return m
POLISHED = material('White gold | visual study', (0.86, 0.85, 0.82), 1, 0.08)
SATIN = material('Brushed white gold | satin bracelet', (0.84, 0.83, 0.8), 1, 0.36)
DIAMOND = material('Diamond | closed dielectric', (0.99, 1, 1), 0, 0.012)
ACCENT = material('Accent diamond | closed dielectric', (0.99, 1, 1), 0, 0.012)
DIALBASE = material('Dial pavé base | white gold', (0.8, 0.8, 0.78), 1, 0.25)
LACQUER = material('Black lacquer | dial print', (0.01, 0.01, 0.012), 0, 0.22)
DATEDISC = material('Date disc | white lacquer', (0.92, 0.92, 0.9), 0, 0.3)
GLASS = material('Watch glass', (0, 0, 0), 0, 0.02)                   # as the house glass: the viewers make it clear (ames_glass)

root = bpy.data.objects.new('AMES piece (authored in mm)', None); bpy.context.scene.collection.objects.link(root)
root.scale = (0.001, 0.001, 0.001)

def add(name, verts_b, faces, mat, parent=root, smooth=True, props=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts_b], [], faces); me.validate(); me.update()
    for p in me.polygons: p.use_smooth = smooth
    if mat: me.materials.append(mat)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.parent = parent
    for k, v in (props or {}).items(): o[k] = v
    return o

def from_bm(name, bm, mat, parent=root, smooth=True, props=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    if mat: me.materials.append(mat)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.parent = parent
    for k, v in (props or {}).items(): o[k] = v
    return o

def merge(objs, name, parent=root, props=None):
    """Join kit objects (in Blender coordinates) into one mesh object."""
    bm = bmesh.new()
    for o in objs:
        me = o.data.copy(); me.transform(o.matrix_basis); bm.from_mesh(me); bpy.data.meshes.remove(me)
    mat = objs[0].data.materials[0] if objs[0].data.materials else None
    out = from_bm(name, bm, mat, parent, smooth=False, props=props)
    for o in objs: bpy.data.objects.remove(o)
    return out

def orient(obj, pos_g, normal_g, spin=0.0):
    """Place a kit object (table along Blender +Z) at a glTF position with its table facing a glTF direction."""
    n = g2b(normal_g).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n) @ Quaternion((0, 0, 1), spin)
    obj.matrix_basis = Matrix.Translation(g2b(pos_g)) @ q.to_matrix().to_4x4()
    return obj

def revolve(name, profile, mat, segments=192, parent=root, smooth=True, cap_top=False, cap_bottom=False, flip=False):
    """Surface of revolution about the glTF z axis (the dial axis) from (r, z) points, bottom to top."""
    verts, faces = [], []
    for r, z in profile:
        for k in range(segments):
            a = TAU * k / segments; verts.append(g2b((r * math.cos(a), r * math.sin(a), z)))
    n = len(profile)
    for i in range(n - 1):
        for k in range(segments):
            a, b = i * segments + k, i * segments + (k + 1) % segments
            faces.append((a + segments, b + segments, b, a) if flip else (a, b, b + segments, a + segments))
    if cap_top: verts.append(g2b((0, 0, profile[-1][1]))); c = len(verts) - 1; faces += [((n - 1) * segments + k, (n - 1) * segments + (k + 1) % segments, c) for k in range(segments)]
    if cap_bottom: verts.append(g2b((0, 0, profile[0][1]))); c = len(verts) - 1; faces += [((k + 1) % segments, k, c) for k in range(segments)]
    return add(name, verts, faces, mat, parent, smooth)

def rounded_box(size, bevel, M_g):
    """bmesh rounded box of size (sx, sy, sz) in its own frame, mapped by a glTF 4x4 (columns: x, y, z axes, origin)."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES', profile=0.5)
    for v in bm.verts:
        p = M_g @ Vector((v.co.x, v.co.y, v.co.z)); v.co = g2b(p)
    return bm

def pave_carrier(name, records, parent, extra=None):
    """A 'Pavé ·' node: one small stone mesh plus the layout of every stone, in the parent's glTF coordinates."""
    data = b''.join(struct.pack('<8f', *r) for r in records)
    s = kit.round_brilliant(name + ' stone', 0.5, DIAMOND); bpy.context.scene.collection.objects.link(s)
    s.parent = parent
    s.name = name
    for k, v in {'ames_optical_mode': 'closed-dielectric-visual', 'ames_gemstone_id': 'stone-diamond', 'ames_pave': True,
                 'ames_pave_layout': base64.b64encode(data).decode()}.items(): s[k] = v
    for k, v in (extra or {}).items(): s[k] = v
    return s

def pave_record(pos_g, normal_g, diameter):
    n = Vector(normal_g).normalized(); q = Vector((0, 1, 0)).rotation_difference(n)   # stone table is +Y
    return (pos_g[0], pos_g[1], pos_g[2], q.x, q.y, q.z, q.w, diameter)


# --- the band: an oval loop in the glTF x-y plane, axis along z ------------------------------------------------------
RX, RY, W, DEPTH = 30.0, 25.0, 7.0, 3.2
def bore(t):
    """Inside of the bangle at t, with the outward normal in the x-y plane."""
    x, y = RX * math.cos(t), RY * math.sin(t)
    nx, ny = math.cos(t) / RX, math.sin(t) / RY; l = math.hypot(nx, ny)
    return x, y, nx / l, ny / l
def dome(z):                                   # outer surface height above the bore, and its slope
    u = z / (W / 2); return 1.9 + (DEPTH - 1.9) * (1 - u * u), -(DEPTH - 1.9) * 2 * u / (W / 2)
section = []                                   # (radial, z), round the D: inner face, corner, dome, corner
for i in range(9): section.append((0.0, -W / 2 * 0.86 + W * 0.86 * i / 8))
for i in range(1, 5): a = math.pi * i / 10; section.append((0.45 - 0.45 * math.cos(a) + 0.0, W / 2 * 0.86 + (W / 2 * 0.14) * math.sin(a)))
for i in range(21):
    z = W / 2 - W * i / 20; section.append((dome(z)[0], z))
for i in range(1, 5): a = math.pi / 2 + math.pi * i / 10; section.append((0.45 - 0.45 * math.cos(a - math.pi / 2), -W / 2 * 0.86 - (W / 2 * 0.14) * math.sin(math.pi - a + math.pi / 2)))
SEG = 360
verts, faces = [], []
for k in range(SEG):
    x, y, nx, ny = bore(TAU * k / SEG)
    for r, z in section: verts.append(g2b((x + nx * r, y + ny * r, z)))
m = len(section)
for k in range(SEG):
    for j in range(m):
        a, b = k * m + j, k * m + (j + 1) % m
        c, d = ((k + 1) % SEG) * m + (j + 1) % m, ((k + 1) % SEG) * m + j
        faces.append((a, d, c, b))
add('Bangle band', verts, faces, POLISHED, root, smooth=True)

# hinge barrel at 9 o'clock, flush in the band; a fine seam and the hidden catch at 3 o'clock
for t0, name in ((math.pi / 2, 'Hinge barrel'), (-math.pi / 2, 'Catch seam')):
    x, y, nx, ny = bore(t0); r = dome(0)[0] * 0.55
    if name == 'Hinge barrel':
        o = kit.sweep(name, [g2b((x + nx * r, y + ny * r, -W / 2 + 0.3)), g2b((x + nx * r, y + ny * r, W / 2 - 0.3))], 1.05, SATIN, sides=24)
    else:
        o = kit.sweep(name, [g2b((x, y + ny * (dome(z)[0] + 0.02), z)) for z in [W / 2 * (1 - 2 * i / 12) * 0.98 for i in range(13)]], 0.07, SATIN, sides=6)
    if o.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(o)
    o.parent = root

# --- pave over the top half ----------------------------------------------------------------------------------------
def outer_point(t, z):
    x, y, nx, ny = bore(t); h, slope = dome(z)
    n = Vector((nx, ny, 0)) - Vector((0, 0, slope)); n = Vector((nx, ny, -slope)).normalized()
    return (x + nx * (h + 0.05), y + ny * (h + 0.05), z), tuple(n)
def arc_ts(spacing, phase, t0, t1, radial):
    ts, t, acc, dt, last = [], t0, 0.0, 0.0004, None
    target = spacing * phase
    while t < t1:
        x, y, nx, ny = bore(t); p = (x + nx * radial, y + ny * radial)
        if last: acc += math.dist(p, last)
        last = p
        if acc >= target: ts.append(t); target += spacing
        t += dt
    return ts
side_rows, accent_rows = [], []
for z, ph in ((-2.32, 0.0), (-0.78, 0.5), (0.78, 0.0), (2.32, 0.5)):
    h = dome(z)[0]; dia = 1.42 if abs(z) > 1 else 1.5
    for t in arc_ts(1.6, ph + 0.25, math.radians(-78), math.radians(78), h):
        p, n = outer_point(t, z)
        (accent_rows if abs(z) < 1 else side_rows).append(pave_record(p, n, dia))
pave_carrier('Pavé · bangle', side_rows, root)
pave_carrier('Pavé · accent line', accent_rows, root)
# present it as on a wrist seen from above: the loop stands in the glTF y-z plane, the paved half toward +z
root.rotation_euler = (0, 0, -math.pi / 2)
root['ames_design'] = {'code': 'B2', 'name': 'The Pavé Bangle', 'inner_mm': [2 * RX, 2 * RY], 'width_mm': W,
                       'stones': {'pave': len(side_rows), 'accent_line': len(accent_rows)}}
print('pave', len(side_rows), 'accent', len(accent_rows))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=True, export_yup=True, use_selection=False)
print('wrote', OUT)
