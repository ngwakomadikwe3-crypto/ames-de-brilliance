"""W2 The Square Boutique: square iced watch, built in Blender with ames_jewel_kit to the house standard.

Design (from the W2 references): a polished superellipse case whose bezel carries a braided frame (two twisting
strands with a stone on every crest) inside which two rows of pave step down to a full pave dial with black Roman
numerals; three rows of stones down every case flank, a stone-set fluted crown ringed with melee and a halo where it
meets the case; iced lugs and the same iced bracelet as W1.

Conventions as W1 (see create_w1_classic_pave.py): mm under a 0.001 root, dial +Z, 12 at +Y, ames_watch_hand hands,
pave layouts on 'Pave .' carriers, accent material on the bracelet centre stones, case group 'Watch head'.

Run:  python scripts/blender/create_w2_square_boutique.py <out.glb>      (bpy module)
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

# --- squircle geometry (the square case is a superellipse, exponent N) ----------------------------------------------
N = 6.0
def sq(a, h):
    c, s = math.cos(a), math.sin(a)
    return (h * math.copysign(abs(c) ** (2 / N), c), h * math.copysign(abs(s) ** (2 / N), s))
def sq_normal(x, y):
    nx, ny = math.copysign(abs(x) ** (N - 1), x), math.copysign(abs(y) ** (N - 1), y); l = math.hypot(nx, ny) or 1
    return nx / l, ny / l
def sq_radius(a, h):
    return h / (abs(math.cos(a)) ** N + abs(math.sin(a)) ** N) ** (1 / N)
def inside_sq(x, y, h): return (abs(x) / h) ** N + (abs(y) / h) ** N < 1
def loft(name, profile, mat, segments=256, parent=head, smooth=True, flip=False):
    """Like revolve, but round a superellipse: profile is (half-size h, z), bottom to top."""
    verts, faces = [], []
    for h, z in profile:
        for k in range(segments):
            x, y = sq(TAU * k / segments, h); verts.append(g2b((x, y, z)))
    for i in range(len(profile) - 1):
        for k in range(segments):
            a, b = i * segments + k, i * segments + (k + 1) % segments
            faces.append((a + segments, b + segments, b, a) if flip else (a, b, b + segments, a + segments))
    return add(name, verts, faces, mat, parent, smooth)
def along(h, spacing, phase=0.0):
    """Points spaced evenly by arc length round the superellipse of half-size h: (x, y, nx, ny, u)."""
    dense = [sq(TAU * k / 4000, h) for k in range(4001)]
    acc = [0.0]
    for k in range(4000): acc.append(acc[-1] + math.dist(dense[k], dense[k + 1]))
    total = acc[-1]; n = max(1, round(total / spacing)); out, j = [], 0
    for m in range(n):
        target = (m + phase) / n * total
        while acc[j + 1] < target: j += 1
        x, y = dense[j]; nx, ny = sq_normal(x, y); out.append((x, y, nx, ny, j / 4000 * TAU))
    return out

# --- the case ---------------------------------------------------------------------------------------------------
H = 18.0
loft('Case and lugs', [(14.5, 0.0), (16.6, 0.3), (17.5, 1.0), (18.0, 2.2), (18.05, 7.2), (17.9, 8.2), (17.5, 8.8), (17.0, 9.0)], POLISHED)
loft('Case back', [(0.0, -0.5), (8.0, -0.42), (13.0, -0.2), (14.5, 0.0)], SATIN)
loft('Bezel', [(12.85, 8.6), (12.9, 9.6), (13.2, 10.2), (15.6, 10.5), (16.9, 10.3), (17.4, 9.6), (17.2, 8.8)], POLISHED)

# braided frame: two polished strands twisting round each other along the bezel's outer edge, a stone on every crest
HB, ZB, K, AMP = 16.25, 10.95, 26, 0.5
strands, braid_stones = [], []
for i in range(2):
    pts = []
    for k in range(720):
        u = TAU * k / 720; x, y = sq(u, HB); nx, ny = sq_normal(x, y); ph = K * u + i * math.pi
        d, z = AMP * math.cos(ph), ZB + AMP * math.sin(ph)
        pts.append(g2b((x + nx * d, y + ny * d, z)))
    o = kit.sweep(f'braid strand {i}', pts, 0.62, POLISHED, sides=10, closed=True)
    if o.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(o)
    strands.append(o)
    for m in range(K):                                           # crest of this strand: ph = pi/2 + 2 pi m
        u = (math.pi / 2 + TAU * m - i * math.pi) / K; x, y = sq(u, HB)
        braid_stones.append(pave_record((x, y, ZB + AMP + 0.55), (0, 0, 1), 1.05))
merge(strands, 'Braided frame', head)
pave_carrier('Pavé · braid', braid_stones, head)

# inner pavé band on the bezel slope, two rows
band = []
for h, z, ph in ((13.75, 10.33, 0.0), (14.95, 10.47, 0.5)):
    for x, y, nx, ny, _ in along(h, 1.1, ph):
        band.append(pave_record((x, y, z), (-nx * 0.12, -ny * 0.12, 1), 1.0))
pave_carrier('Pavé · bezel', band, head)

# iced flanks: three rows down every side, clear of the crown
CROWN_Z = 4.9
flank = []
for row, z in enumerate((3.2, 4.9, 6.6)):
    for x, y, nx, ny, _ in along(18.06, 1.38, 0.5 * row):
        if x > 0 and abs(y) < 3.4 and abs(z - CROWN_Z) < 3.0: continue
        flank.append(pave_record((x + nx * 0.08, y + ny * 0.08, z), (nx, ny, 0), 1.28))
pave_carrier('Pavé · case side', flank, head)

# --- the dial --------------------------------------------------------------------------------------------------
Z_DIAL = 8.6
loft('Dial', [(0.0, Z_DIAL), (12.9, Z_DIAL)], DIALBASE, flip=True)
NUMERALS = {12: 'XII', 1: 'I', 2: 'II', 3: 'III', 4: 'IIII', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI'}
def text_mesh(body, size, extrude):
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('t', cu); bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); me = ev.to_mesh()
    verts = [v.co.copy() for v in me.vertices]; faces = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    return verts, faces
nv, nf, centres = [], [], []
for hour, label in NUMERALS.items():
    a = math.pi / 2 - TAU * hour / 12
    r = sq_radius(a, 10.6) - (0.6 if hour % 3 else 0)
    verts, faces = text_mesh(label, 2.0, 0.12)
    rot = a - math.pi / 2; c, s = math.cos(rot), math.sin(rot); cx, cy = r * math.cos(a), r * math.sin(a)
    centres.append((cx, cy, 0.75 + 0.3 * len(label)))
    base = len(nv)
    for v in verts:
        nv.append(g2b((v.x * c - v.y * s + cx, v.x * s + v.y * c + cy, Z_DIAL + 0.28 + v.z)))
    nf += [tuple(i + base for i in f) for f in faces]
add('Dial numerals', nv, nf, LACQUER, head, smooth=False)
loft('Dial chapter ring', [(12.2, Z_DIAL + 0.1), (12.35, Z_DIAL + 0.32), (12.6, Z_DIAL + 0.32), (12.75, Z_DIAL + 0.1)], POLISHED)
dial_stones = []
pitch = 0.96
for j in range(-30, 31):
    for i in range(-30, 31):
        x = i * pitch + (j % 2) * pitch / 2; y = j * pitch * 0.866
        if not inside_sq(x, y, 11.75) or math.hypot(x, y) < 2.3: continue
        if any(math.hypot(x - cx, y - cy) < rr for cx, cy, rr in centres): continue
        dial_stones.append(pave_record((x, y, Z_DIAL + 0.32), (0, 0, 1), 0.84))
pave_carrier('Pavé · dial', dial_stones, head)
revolve('Dial boss', [(2.2, Z_DIAL), (2.2, Z_DIAL + 0.25), (1.5, Z_DIAL + 0.4)], POLISHED, segments=64, cap_top=True)

# --- hands ---------------------------------------------------------------------------------------------------------
def dauphine(name, length, width, tail, z, hand):
    verts = [g2b((0, length, z + 0.05)), g2b((width / 2, length * 0.18, z)), g2b((0, -tail, z + 0.05)), g2b((-width / 2, length * 0.18, z)),
             g2b((0, length * 0.18, z + 0.32)), g2b((0, length * 0.18, z - 0.12))]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (1, 0, 5), (2, 1, 5), (3, 2, 5), (0, 3, 5)]
    return add(name, verts, faces, POLISHED, head, smooth=False, props={'ames_watch_hand': hand})
dauphine('Hour hand', 6.8, 1.7, 1.4, Z_DIAL + 0.95, 'hour')
dauphine('Minute hand', 10.2, 1.45, 1.8, Z_DIAL + 1.3, 'minute')
sec = kit.sweep('Second hand', [g2b((0, -3.0, Z_DIAL + 1.65)), g2b((0, 10.6, Z_DIAL + 1.65))], 0.11, POLISHED, sides=6)
if sec.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(sec)
sec.parent = head; sec['ames_watch_hand'] = 'second'
cap = kit.sphere('Hand cap', 0.85, g2b((0, 0, Z_DIAL + 1.8)), POLISHED, segments=24, rings=10, scale=(1, 1, 0.45))
if cap.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(cap)
cap.parent = head

# --- crystal and crown ---------------------------------------------------------------------------------------------
glass = loft('Watch glass', [(0.0, 10.3), (12.95, 10.15)], GLASS, flip=True)
glass['ames_glass'] = 'over-stones'
crown_v, crown_f, seg = [], [], 48
for x0, rr in [(17.8, 1.9), (18.6, 2.1), (18.9, 2.5), (21.4, 2.5), (21.75, 2.3), (21.9, 1.8)]:
    for k in range(seg):
        a = TAU * k / seg; crown_v.append(g2b((x0, rr * math.cos(a), CROWN_Z + rr * math.sin(a))))
for i in range(5):
    for k in range(seg): crown_f.append((i * seg + k, i * seg + (k + 1) % seg, (i + 1) * seg + (k + 1) % seg, (i + 1) * seg + k))
add('Crown', crown_v, crown_f, POLISHED, head, smooth=True)
cs = kit.round_brilliant('Crown diamond', 1.3, DIAMOND); bpy.context.scene.collection.objects.link(cs)
orient(cs, (21.95, 0, CROWN_Z), (1, 0, 0)); cs.parent = head; cs['ames_gemstone_id'] = 'stone-diamond'; cs['ames_cut'] = 'round'
crown_pave = []
for ring, x0 in enumerate((19.55, 20.75)):                          # two rings of melee round the crown barrel
    for k in range(18):
        a = TAU * (k + 0.5 * ring) / 18
        crown_pave.append(pave_record((x0, 2.55 * math.cos(a), CROWN_Z + 2.55 * math.sin(a)), (0, math.cos(a), math.sin(a)), 1.02))
for k in range(14):                                                 # and a halo on the case side round the crown tube
    a = TAU * k / 14
    crown_pave.append(pave_record((18.12, 3.05 * math.cos(a), CROWN_Z + 3.05 * math.sin(a)), (1, 0, 0), 1.0))
pave_carrier('Pavé · crown', crown_pave, head)

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
            y0 = sy * 17.2 * (1 - u) + p.y * u; z0 = 5.6 * (1 - u) + p.z * u
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
from_bm('Bracelet links', bm, POLISHED, root, smooth=True)
merge(link_prongs, 'Bracelet prongs', root)
pave_carrier('Pavé · bracelet', link_stones, root)
root['ames_design'] = {'code': 'W2', 'name': 'The Square Boutique', 'case_mm': 36.1, 'bracelet_rows': len(rows),
                       'stones': {'bracelet_centre': len(accent_stones), 'pave': len(braid_stones) + len(band) + len(flank) + len(dial_stones) + len(crown_pave) + len(lug_stones) + len(link_stones), 'crown': 1}}
print('rows', len(rows), 'pave braid/band/flank/dial/crown', len(braid_stones), len(band), len(flank), len(dial_stones), len(crown_pave), 'lugs/links', len(lug_stones), len(link_stones), 'accent', len(accent_stones))

for o in bpy.data.objects:                                  # every authored stone: the studio gem renderer
    if o.get('ames_gemstone_id') and not o.get('ames_pave'): o['ames_optical_mode'] = 'closed-dielectric-visual'
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=True, export_yup=True, use_selection=False)
print('wrote', OUT)
