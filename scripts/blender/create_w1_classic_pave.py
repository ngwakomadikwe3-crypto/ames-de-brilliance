"""W1 The Classic Pavé: round iced watch, built in Blender with ames_jewel_kit to the house standard.

Design (from the W1 references): a slim polished round case with iced flanks; a domed bezel of 24 large round
brilliants on shared prongs; a recessed pavé dial with twelve polished petal outlines, black Roman numerals and a
framed date window at 3 o'clock; faceted dauphine hands, a fine seconds needle and a domed crystal; a fluted
crown set with a stone; iced lugs that curve down to the bracelet; and a bracelet whose every row is one large
centre stone in four prongs between two pavé side links, running from the lugs to a polished clasp at the back.

Conventions (shared with watch-v9 and the try-on): millimetres under a root 'AMES piece (authored in mm)' scaled
0.001; in glTF axes the dial faces +Z with 12 o'clock at +Y; the hands pivot at the dial centre and carry
ames_watch_hand so the viewer sets them to the time; small stones ship as pavé layouts (8 floats per stone:
position, quaternion turning the stone's +Y table outward, diameter) on 'Pavé ·' carrier nodes; the large bracelet
stones use the 'Accent' material so a collection's accent choice recolours them; the case group is 'Watch head'.
The bracelet is closed round a wrist (about 62 x 48 mm inside) so the try-on can measure its bore.

Run:  python scripts/blender/create_w1_classic_pave.py <out.glb>      (bpy module)
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
head = bpy.data.objects.new('Watch head', None); bpy.context.scene.collection.objects.link(head); head.parent = root

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

def revolve(name, profile, mat, segments=192, parent=head, smooth=True, cap_top=False, cap_bottom=False, flip=False):
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

# --- the case ---------------------------------------------------------------------------------------------------
R_CASE, Z_BACK, Z_MID, Z_FLANGE = 20.6, 0.0, 8.4, 9.6
case = revolve('Case and lugs', [(16.8, 0.0), (18.6, 0.25), (19.6, 0.9), (20.3, 1.8), (20.6, 3.0), (20.65, 5.5), (20.6, 7.6), (20.4, 8.6), (20.0, 9.3), (19.4, 9.6)], POLISHED)
back = revolve('Case back', [(0.0, -0.6), (6.0, -0.55), (12.0, -0.3), (16.0, -0.05), (16.8, 0.0)], SATIN)
# bezel: a domed ring carrying the large stones
bezel = revolve('Bezel', [(15.4, 9.4), (15.6, 10.6), (16.5, 11.1), (18.4, 11.35), (20.3, 11.05), (20.75, 10.4), (20.6, 9.6), (19.4, 9.6)], POLISHED)
rehaut = revolve('Rehaut', [(14.9, 8.55), (15.0, 8.65), (15.45, 9.6), (15.5, 10.5)], POLISHED)
# 24 large brilliants, graduating a touch larger at 12, 3, 6 and 9, tilted with the dome, on shared prongs
stones, prongs = [], []
for k in range(24):
    a = TAU * k / 24; grade = 1 + 0.07 * math.cos(4 * a) ** 8
    r = 1.98 * grade; c = (18.25 * math.cos(a), 18.25 * math.sin(a))
    n = Vector((math.cos(a) * math.sin(math.radians(13)), math.sin(a) * math.sin(math.radians(13)), math.cos(math.radians(13))))
    s = kit.round_brilliant(f'bezel stone {k}', r, DIAMOND); bpy.context.scene.collection.objects.link(s)
    orient(s, (c[0], c[1], 11.0 + 0.55 * r), n, spin=k * 0.3); s.parent = head; s['ames_gemstone_id'] = 'stone-diamond'; s['ames_cut'] = 'round'; s.name = f'Bezel stone {k + 1}'; stones.append(s)
    for side in (-1, 1):
        b = a + side * TAU / 48
        for rr in (16.4, 20.1):
            p = kit.sphere(f'prong {k}{side}{rr}', 0.42, g2b((rr * math.cos(b), rr * math.sin(b), 11.55 - 0.08 * abs(rr - 18.25))), POLISHED, segments=12, rings=8)
            if p.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(p)
            prongs.append(p)
merge(prongs, 'Bezel prongs', head)

# iced flanks: two rows of melee round the case side (not behind the crown)
flank = []
for row, z in enumerate((4.0, 6.0)):
    count = 92
    for k in range(count):
        a = TAU * (k + 0.5 * row) / count
        if abs(math.atan2(math.sin(a), math.cos(a))) < 0.16: continue         # leave the crown free
        flank.append(pave_record((20.72 * math.cos(a), 20.72 * math.sin(a), z), (math.cos(a), math.sin(a), 0), 1.32))
pave_carrier('Pavé · case side', flank, head)

# --- the dial --------------------------------------------------------------------------------------------------
Z_DIAL = 8.55
dial = revolve('Dial', [(0.0, Z_DIAL), (14.95, Z_DIAL)], DIALBASE, flip=True)
# twelve polished petal outlines (lens shapes from the centre boss outward)
def petal(angle, r0=3.6, r1=13.4, width=1.55, samples=26):
    pts = []
    for side in (1, -1):
        for i in range(samples + 1):
            t = i / samples if side == 1 else 1 - i / samples
            r = r0 + (r1 - r0) * t; w = width * math.sin(math.pi * t) ** 0.85 * side
            a = angle + w / max(r, 1)
            pts.append((r * math.cos(a), r * math.sin(a)))
    return pts
def inside_petal(x, y, angle, r0=3.6, r1=13.4, width=1.55, margin=0.0):
    r = math.hypot(x, y)
    if r < r0 or r > r1: return False
    t = (r - r0) / (r1 - r0); w = width * math.sin(math.pi * t) ** 0.85
    d = math.atan2(math.sin(math.atan2(y, x) - angle), math.cos(math.atan2(y, x) - angle)) * r
    return abs(d) < w - margin
PETALS = [TAU * k / 12 + TAU / 24 for k in range(12)]
rims = []
for k, a in enumerate(PETALS):
    pts = petal(a)
    rims.append(kit.sweep(f'petal rim {k}', [g2b((x, y, Z_DIAL + 0.16)) for x, y in pts], 0.17, POLISHED, sides=8, closed=True))
for o in rims:
    if o.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(o)
merge(rims, 'Dial petal outlines', head)

# Roman numerals (black lacquer), radial, with the date window at 3
NUMERALS = {12: 'XII', 1: 'I', 2: 'II', 4: 'IIII', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI'}
def text_mesh(body, size, extrude):
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('t', cu); bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); me = ev.to_mesh()
    verts = [v.co.copy() for v in me.vertices]; faces = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    return verts, faces
nv, nf = [], []
for hour, label in NUMERALS.items():
    a = math.pi / 2 - TAU * hour / 12                                   # 12 at +y, clockwise
    verts, faces = text_mesh(label, 2.15, 0.12)
    # bottoms of the numerals toward the centre: rotate the text's up (+y) to point outward
    rot = a - math.pi / 2; c, s = math.cos(rot), math.sin(rot); cx, cy = 11.75 * math.cos(a), 11.75 * math.sin(a)
    base = len(nv)
    for v in verts:
        x, y = v.x * c - v.y * s + cx, v.x * s + v.y * c + cy
        nv.append(g2b((x, y, Z_DIAL + 0.28 + v.z)))
    nf += [tuple(i + base for i in f) for f in faces]
add('Dial numerals', nv, nf, LACQUER, head, smooth=False)
# date window at 3 o'clock: a polished frame round a white date disc printed "22"
DX = 11.3
frame = rounded_box((3.6, 2.9, 0.5), 0.15, Matrix.Translation((DX, 0, Z_DIAL + 0.2)))
from_bm('Date window frame', frame, POLISHED, head)
disc = rounded_box((2.9, 2.2, 0.2), 0.05, Matrix.Translation((DX, 0, Z_DIAL + 0.48)))
from_bm('Date disc', disc, DATEDISC, head)
dv, df = text_mesh('22', 1.55, 0.04)
add('Date print', [g2b((v.x + DX, v.y - 0.02, Z_DIAL + 0.6 + v.z)) for v in dv], df, LACQUER, head, smooth=False)

# the pavé dial: melee on a hex grid inside each petal and between them, clear of rims, numerals, date, boss
dial_stones = []
pitch = 0.98
for j in range(-32, 33):
    for i in range(-32, 33):
        x = i * pitch + (j % 2) * pitch / 2; y = j * pitch * 0.866
        r = math.hypot(x, y)
        if r < 2.4 or r > 14.3: continue
        if any(abs((math.hypot(x - px, y - py))) < 0.55 for a in PETALS for px, py in petal(a)[::2]): continue   # rim clearance
        if 10.3 < r < 13.3 and any(abs(math.atan2(math.sin(math.atan2(y, x) - (math.pi / 2 - TAU * h / 12)), math.cos(math.atan2(y, x) - (math.pi / 2 - TAU * h / 12)))) * r < 1.9 for h in NUMERALS): continue
        if abs(x - DX) < 2.4 and abs(y) < 2.0: continue
        dial_stones.append(pave_record((x, y, Z_DIAL + 0.32), (0, 0, 1), 0.86))
pave_carrier('Pavé · dial', dial_stones, head)
boss = revolve('Dial boss', [(2.3, Z_DIAL), (2.3, Z_DIAL + 0.25), (1.6, Z_DIAL + 0.4)], POLISHED, segments=64, cap_top=True)

# --- hands (pivot at the dial centre, pointing to 12; the viewer turns them to the time) ------------------------------
def dauphine(name, length, width, tail, z, hand):
    pts = [(0, length), (width / 2, length * 0.18), (0, -tail), (-width / 2, length * 0.18)]
    ridge = 0.32
    verts = [g2b((0, length, z + 0.05)), g2b((width / 2, length * 0.18, z)), g2b((0, -tail, z + 0.05)), g2b((-width / 2, length * 0.18, z)),
             g2b((0, length * 0.18, z + ridge)), g2b((0, length * 0.18, z - 0.12))]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (1, 0, 5), (2, 1, 5), (3, 2, 5), (0, 3, 5)]
    o = add(name, verts, faces, POLISHED, head, smooth=False, props={'ames_watch_hand': hand})
    return o
dauphine('Hour hand', 8.6, 1.9, 1.6, Z_DIAL + 1.05, 'hour')
dauphine('Minute hand', 13.0, 1.6, 2.0, Z_DIAL + 1.45, 'minute')
sec = kit.sweep('Second hand', [g2b((0, -3.4, Z_DIAL + 1.85)), g2b((0, 13.6, Z_DIAL + 1.85))], 0.12, POLISHED, sides=6)
if sec.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(sec)
sec.parent = head; sec['ames_watch_hand'] = 'second'
cw = kit.sphere('Second counterweight', 0.55, g2b((0, -2.8, Z_DIAL + 1.85)), POLISHED, segments=14, rings=8, scale=(1, 1, 0.35))
if cw.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(cw)
cw.parent = sec
cap = kit.sphere('Hand cap', 0.95, g2b((0, 0, Z_DIAL + 2.0)), POLISHED, segments=24, rings=10, scale=(1, 1, 0.45))
if cap.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(cap)
cap.parent = head

# --- crystal and crown ---------------------------------------------------------------------------------------------
glass = revolve('Watch glass', [(0.0, 11.25), (8.0, 11.15), (13.0, 10.95), (15.3, 10.6)], GLASS, flip=True)
glass['ames_glass'] = 'over-stones'
crown_v, crown_f, seg = [], [], 48
for i, (x0, rr) in enumerate([(20.3, 2.2), (20.9, 2.45), (21.2, 2.95), (24.2, 2.95), (24.6, 2.7), (24.75, 2.2)]):
    for k in range(seg):
        a = TAU * k / seg; flute = 1 - (0.07 if (rr > 2.8 and k % 2) else 0)
        crown_v.append(g2b((x0, rr * flute * math.cos(a), 5.2 + rr * flute * math.sin(a))))
for i in range(5):
    for k in range(seg): crown_f.append((i * seg + k, i * seg + (k + 1) % seg, (i + 1) * seg + (k + 1) % seg, (i + 1) * seg + k))
add('Crown', crown_v, crown_f, POLISHED, head, smooth=True)
cs = kit.round_brilliant('Crown diamond', 1.5, DIAMOND); bpy.context.scene.collection.objects.link(cs)
orient(cs, (24.8, 0, 5.2), (1, 0, 0)); cs.parent = head; cs['ames_gemstone_id'] = 'stone-diamond'; cs['ames_cut'] = 'round'

# --- the wrist loop: lugs and bracelet ------------------------------------------------------------------------------
# Inside of the bracelet: an ellipse in the glTF y-z plane through the case back (z = 0) at 12 o'clock's foot.
A, B = 31.0, 24.0                                     # half height and half depth of the wrist opening
def loop_point(t, out=0.0):
    """Point on the wrist loop (t = 0 under the case), pushed `out` mm outward, with its tangent and outward normal."""
    y, z = A * math.sin(t), -B + B * math.cos(t)
    ty, tz = A * math.cos(t), -B * math.sin(t); tl = math.hypot(ty, tz); ty, tz = ty / tl, tz / tl
    ny, nz = tz * -1, ty                             # outward normal (rotate the tangent)
    if ny * y + nz * (z + B) < 0: ny, nz = -ny, -nz
    return Vector((0, y + ny * out, z + nz * out)), Vector((0, ty, tz)), Vector((0, ny, nz))
def arc_param(length_mm, start):
    t, acc, dt = start, 0.0, 0.0005
    while acc < length_mm: p0, _, _ = loop_point(t); p1, _, _ = loop_point(t + dt); acc += (p1 - p0).length; t += dt
    return t

# lugs: four horns from the case to the end links, paved on top
lug_bms, lug_stones = [], []
T_LUG = 0.78                                          # where the bracelet starts on the loop
for sy in (1, -1):
    for sx in (1, -1):
        path = []
        for i in range(9):
            u = i / 8
            t = sy * T_LUG * u
            p, tan, nrm = loop_point(t, 3.0)
            y0 = sy * 19.0 * (1 - u) + p.y * u; z0 = 6.2 * (1 - u) + p.z * u
            path.append(g2b((sx * 11.6, y0, z0)))
        o = kit.sweep(f'lug {sx}{sy}', path, 1.75, POLISHED, sides=14, flatten=lambda t: (1, 0.62))
        if o.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(o)
        lug_bms.append(o)
        for i in (2, 4, 6):
            pb = path[i]; pg = b2g(pb); nb = (path[i + 1] - path[i - 1]).cross(Vector((1, 0, 0))).normalized()
            n_g = b2g(nb); n_g = n_g if n_g[2] > 0 else tuple(-c for c in n_g)
            lug_stones.append(pave_record((pg[0], pg[1] + n_g[1] * 1.0, pg[2] + n_g[2] * 1.0), n_g, 1.25))
merge(lug_bms, 'Lugs', head)
pave_carrier('Pavé · lugs', lug_stones, head)

# bracelet rows: centre link with one large stone in four prongs, two pavé side links, gaps between
PITCH = 6.9
rows, t = [], T_LUG
while True:
    t_next = arc_param(PITCH, t)
    if t_next > TAU - T_LUG - 0.02: break
    rows.append((t + t_next) / 2); t = t_next
links, link_stones, accent_stones, link_prongs, clasp = [], [], [], [], None
back_index = min(range(len(rows)), key=lambda i: abs(rows[i] - math.pi))
for i, tm in enumerate(rows):
    c, tan, nrm = loop_point(tm, 1.65)
    side = Vector((1, 0, 0))
    M = Matrix(((side.x, tan.x, nrm.x, c.x), (side.y, tan.y, nrm.y, c.y), (side.z, tan.z, nrm.z, c.z), (0, 0, 0, 1)))
    if i == back_index:                                    # polished clasp row
        links.append(rounded_box((20.0, PITCH - 0.4, 3.2), 0.5, M)); continue
    links.append(rounded_box((7.0, PITCH - 0.45, 3.3), 0.45, M))
    for sx in (-1, 1):
        links.append(rounded_box((6.2, PITCH - 0.45, 3.0), 0.4, M @ Matrix.Translation((sx * 6.95, 0, -0.1))))
        for cx in (-2.0, 0.0, 2.0):
            for cy in (-2.0, 0.0, 2.0):
                p = M @ Vector((sx * 6.95 + cx, cy, 1.45)); n = (M.to_3x3() @ Vector((0, 0, 1))).normalized()
                link_stones.append(pave_record(tuple(p), tuple(n), 1.72))
    s = kit.round_brilliant(f'accent {i}', 1.7, ACCENT); bpy.context.scene.collection.objects.link(s)
    top = M @ Vector((0, 0, 1.95)); n = (M.to_3x3() @ Vector((0, 0, 1))).normalized()
    orient(s, tuple(top), tuple(n), spin=i * 0.4); s.parent = root; s['ames_gemstone_id'] = 'stone-diamond'; s['ames_cut'] = 'round'; s.name = f'Accent stone {i + 1}'; accent_stones.append(s)
    for px in (-1, 1):
        for py in (-1, 1):
            pp = M @ Vector((px * 1.55, py * 1.55, 2.1))
            pr = kit.sphere(f'link prong {i}{px}{py}', 0.38, g2b(tuple(pp)), POLISHED, segments=10, rings=6)
            if pr.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(pr)
            link_prongs.append(pr)
bm = bmesh.new()
for lb in links:
    me = bpy.data.meshes.new('tmp'); lb.to_mesh(me); lb.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
from_bm('Bracelet links', bm, SATIN, root, smooth=True)          # brushed link faces, polished prongs and lugs
merge(link_prongs, 'Bracelet prongs', root)
pave_carrier('Pavé · bracelet', link_stones, root)
root['ames_design'] = {'code': 'W1', 'name': 'The Classic Pavé', 'case_mm': 41.3, 'bracelet_rows': len(rows),
                       'stones': {'bezel': 24, 'bracelet_centre': len(accent_stones), 'pave': len(flank) + len(dial_stones) + len(lug_stones) + len(link_stones), 'crown': 1}}
print('rows', len(rows), 'pavé', len(flank), len(dial_stones), len(lug_stones), len(link_stones), 'accent', len(accent_stones))

for o in bpy.data.objects:                                  # every authored stone: the studio gem renderer
    if o.get('ames_gemstone_id') and not o.get('ames_pave'): o['ames_optical_mode'] = 'closed-dielectric-visual'
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=True, export_yup=True, use_selection=False)
print('wrote', OUT)
