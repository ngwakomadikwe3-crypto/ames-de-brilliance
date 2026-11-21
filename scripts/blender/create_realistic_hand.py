"""HOUSEofAMES realistic hand twin, built from the MIT-licensed WebXR generic hand (Amazon, webxr-input-profiles).

What this does to the base mesh (right hand):
  * moves it into the try-on's frame: millimetres, wrist centre at the origin, fingers +y, back of hand +z,
    thumb toward -x, and maps its 25 WebXR joints onto the 21 tracking landmarks (metacarpals ride the palm);
  * grows a forearm out of the open wrist (it fades out in the shader, so there is never a cut edge);
  * gives the palm a slight natural cup, subdivides twice and sculpts: knuckle heads, the four extensor tendons,
    middle and end joint pads, thenar and hypothenar pads, a hollow palm, fingertip pads and nail beds;
  * adds real nail plates (cuticle, curved plate, free edge past the fingertip), weighted to the end bones;
  * bakes, per vertex: tissue thickness (for light through fingertips and webbing), ambient occlusion in the
    relaxed pose, fingertip flush, knuckle redness, forearm fade, and the coordinates the skin shader uses to
    draw creases per pixel (position along each finger, angle round it, palm-plane position);
  * stores the template joints, measurements and the relaxed pose (local rotations per bone) in the GLB extras.

Run: python scripts/blender/create_realistic_hand.py <webxr-right.glb> <out.glb>   (bpy module)
"""
import bpy, bmesh, sys, math, json, struct
import numpy as np
from mathutils import Vector, Quaternion, Matrix
from mathutils.bvhtree import BVHTree

SRC, OUT = sys.argv[-2], sys.argv[-1]
rng = np.random.default_rng(7)

# ---------------------------------------------------------------------------------------------------------------
# 1. import and move into the try-on frame
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
hand = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.vertices) > 100][0]
for o in list(bpy.data.objects):
    if o not in (arm, hand): bpy.data.objects.remove(o)
HEAD = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
mw = hand.matrix_world.copy()
w0 = HEAD['wrist']
y_ax = (HEAD['middle-finger-phalanx-proximal'] - w0).normalized()
x_ax = HEAD['pinky-finger-phalanx-proximal'] - HEAD['index-finger-phalanx-proximal']
x_ax = (x_ax - y_ax * x_ax.dot(y_ax)).normalized()
z_ax = x_ax.cross(y_ax)
R = Matrix((x_ax, y_ax, z_ax))                                   # rows: world -> frame
def frame(p, origin=w0): return (R @ (p - origin)) * 1000.0
verts = np.array([frame(mw @ v.co) for v in hand.data.vertices])
# wrist centre: centroid of the cross-section near the wrist joint height
near = verts[np.abs(verts[:, 1] - 4) < 4]
shift = np.array([near[:, 0].mean(), 0.0, (near[:, 2].min() + near[:, 2].max()) / 2])
verts -= shift
def jframe(name): return np.array(frame(HEAD[name])) - shift

FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']
J = np.zeros((21, 3))
J[0] = [0, 0, 0]
J[1], J[2], J[3], J[4] = (jframe('thumb-metacarpal'), jframe('thumb-phalanx-proximal'), jframe('thumb-phalanx-distal'), jframe('thumb-tip'))
for f, n in enumerate(FINGERS):
    k = 5 + 4 * f
    J[k], J[k + 1], J[k + 2], J[k + 3] = (jframe(n + '-phalanx-proximal'), jframe(n + '-phalanx-intermediate'), jframe(n + '-phalanx-distal'), jframe(n + '-tip'))
PARENT = [-1, 0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19]
BONE_MAP = {'wrist': 0, 'thumb-metacarpal': 1, 'thumb-phalanx-proximal': 2, 'thumb-phalanx-distal': 3, 'thumb-tip': 3}
for f, n in enumerate(FINGERS):
    BONE_MAP[n + '-metacarpal'] = 0
    for i, seg in enumerate(['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']):
        BONE_MAP[n + '-' + seg] = 5 + 4 * f + min(i, 2)

# write the transformed coordinates back so Blender modifiers work in mm
for v, p in zip(hand.data.vertices, verts): v.co = Vector(p)
hand.matrix_world = Matrix.Identity(4); hand.parent = None
hand.modifiers.clear()
bpy.data.objects.remove(arm)
bpy.context.view_layer.objects.active = hand; hand.select_set(True)
# collapse the 25 WebXR groups into the 21 landmark bones
groups = {g.index: g.name for g in hand.vertex_groups}
for b in range(21): hand.vertex_groups.new(name=f'b{b}')
for v in hand.data.vertices:
    acc = {}
    for g in v.groups:
        n = groups.get(g.group)
        if n in BONE_MAP: acc[BONE_MAP[n]] = acc.get(BONE_MAP[n], 0) + g.weight
    for b, wgt in acc.items(): hand.vertex_groups[f'b{b}'].add([v.index], wgt, 'REPLACE')
for n in groups.values(): hand.vertex_groups.remove(hand.vertex_groups[n])
print('template joints', np.round(J[[0, 1, 4, 5, 9, 13, 17, 8, 12]], 1).tolist())

# ---------------------------------------------------------------------------------------------------------------
# 2. forearm out of the open wrist
bm = bmesh.new(); bm.from_mesh(hand.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.05)                 # glTF splits vertices at UV seams: weld them
bm.verts.ensure_lookup_table()
ymin = min(v.co.y for v in bm.verts)
cap = [f for f in bm.faces if f.normal.y < -0.9 and f.calc_center_median().y < 8]   # flat cap, tilted ~18 deg
print('wrist cap faces removed', len(cap))
bmesh.ops.delete(bm, geom=cap, context='FACES')                    # also drops the cap's now-loose inner edges
deform = bm.verts.layers.deform.verify()
boundary = [e for e in bm.edges if e.is_boundary]
print('boundary edges after cap removal', len(boundary))
loop_verts = []
if boundary:
    # order the boundary loop
    nxt = {}
    for e in boundary:
        a, b = e.verts; nxt.setdefault(a, []).append(b); nxt.setdefault(b, []).append(a)
    start = boundary[0].verts[0]; loop_verts = [start]; prev = None; cur = start
    while True:
        cand = [v for v in nxt[cur] if v is not prev]
        if not cand or cand[0] is start: break
        prev, cur = cur, cand[0]; loop_verts.append(cur)
print('wrist opening verts', len(loop_verts), 'at y', round(min(v.co.y for v in loop_verts), 1), round(max(v.co.y for v in loop_verts), 1))
P0 = np.array([v.co[:] for v in loop_verts]); c0 = P0.mean(0)
a0 = (P0[:, 0].max() - P0[:, 0].min()) / 2; b0 = (P0[:, 2].max() - P0[:, 2].min()) / 2
ang = np.arctan2(P0[:, 2] - c0[2], P0[:, 0] - c0[0]); r0 = np.hypot(P0[:, 0] - c0[0], P0[:, 2] - c0[2])
y_open = P0[:, 1].mean()
rings_d = [4, 10, 18, 28, 42, 60, 82, 106, 130, 150, 157, 161]
prev_ring = loop_verts; wrist_g = 0
for k, d in enumerate(rings_d):
    t = min(1.0, d / 150.0)
    a = a0 * (1 + 0.10 * t); b = b0 * (1 + 0.32 * t)
    blend = min(1.0, d / 50.0); blend = blend * blend * (3 - 2 * blend)
    cap = 1.0 if d <= 150 else (0.78 if d < 160 else 0.35)
    ring = []
    for i, v in enumerate(loop_verts):
        re = (a * b) / math.sqrt((b * math.cos(ang[i])) ** 2 + (a * math.sin(ang[i])) ** 2)
        r = (r0[i] * (1 - blend) + re * blend) * cap
        cx = c0[0] * (1 - 0.6 * blend); cz = c0[2] * (1 - 0.6 * blend)
        nv = bm.verts.new((cx + r * math.cos(ang[i]), y_open - d, cz + r * math.sin(ang[i])))
        nv[deform][wrist_g] = 1.0
        ring.append(nv)
    n = len(ring)
    for i in range(n):
        bm.faces.new((prev_ring[i], prev_ring[(i + 1) % n], ring[(i + 1) % n], ring[i]))
    prev_ring = ring
tip = bm.verts.new((c0[0] * 0.4, y_open - 163, c0[2] * 0.4)); tip[deform][wrist_g] = 1.0
for i in range(len(prev_ring)): bm.faces.new((prev_ring[i], prev_ring[(i + 1) % len(prev_ring)], tip))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
print('non-manifold edges after forearm', sum(len(e.link_faces) != 2 for e in bm.edges), 'loop angle monotonic', bool(np.all(np.diff(np.unwrap(ang)) > 0) or np.all(np.diff(np.unwrap(ang)) < 0)))
join = [v for v in bm.verts if -48 < v.co.y < 4 and v.co.x > -40]                  # blend the old wrist edge into the forearm
for _ in range(8): bmesh.ops.smooth_vert(bm, verts=join, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(hand.data); bm.free()

# ---------------------------------------------------------------------------------------------------------------
# 3. slight palm cup (before subdivision; joints move with it)
def cup(p, thumbw):
    m = np.clip((p[..., 1] - 8) / 30, 0, 1)                                # none at the wrist, full by mid palm
    u = np.clip((p[..., 0] - 2) / 42, -1.3, 1.3)
    return -2.6 * u * u * m * (1 - thumbw)
co = np.array([v.co[:] for v in hand.data.vertices])
thumbw = np.zeros(len(co))
for v in hand.data.vertices:
    for g in v.groups:
        if hand.vertex_groups[g.group].name in ('b1', 'b2', 'b3'): thumbw[v.index] += g.weight
co[:, 2] += cup(co, np.clip(thumbw, 0, 1))
for v, p in zip(hand.data.vertices, co): v.co = Vector(p)
J[5:, 2] += cup(J[5:], np.zeros(16))

# ---------------------------------------------------------------------------------------------------------------
# 4. subdivide (weights and UVs interpolate) and read everything into arrays
mod = hand.modifiers.new('sub', 'SUBSURF'); mod.levels = 2; mod.render_levels = 2; mod.uv_smooth = 'PRESERVE_CORNERS'
bpy.ops.object.modifier_apply(modifier='sub')
me = hand.data
me.calc_loop_triangles()
N = len(me.vertices)
P = np.array([v.co[:] for v in me.vertices])
tris = np.array([t.vertices[:] for t in me.loop_triangles], dtype=np.uint32)
W = np.zeros((N, 21))
gid = {g.index: int(g.name[1:]) for g in hand.vertex_groups}
for v in me.vertices:
    for g in v.groups: W[v.index, gid[g.group]] += g.weight
W[W.sum(1) == 0, 0] = 1
W /= W.sum(1, keepdims=True)
print('subdivided verts', N, 'tris', len(tris))

def vnormals(P):
    fn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    n = np.zeros_like(P)
    for k in range(3): np.add.at(n, tris[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
Nn = vnormals(P)
dorsal = np.clip((Nn[:, 2] - 0.05) / 0.55, 0, 1); dorsal = dorsal * dorsal * (3 - 2 * dorsal)
palmar = np.clip((-Nn[:, 2] - 0.05) / 0.55, 0, 1); palmar = palmar * palmar * (3 - 2 * palmar)
bone = W.argmax(1)

# finger membership and joint frames
def finger_of_bone(b):
    if b in (1, 2, 3): return 0
    if b >= 5: return 1 + (b - 5) // 4
    return -1
fid = np.array([finger_of_bone(b) for b in bone])
MCP = [2, 5, 9, 13, 17]                                                   # thumb: its MCP is landmark 2
mcp_x = np.array([J[m, 0] for m in MCP[1:]])
palm_near = (fid < 0) & (P[:, 1] > J[5:18:4, 1].min() - 26) & (P[:, 1] < J[5:18:4, 1].max() + 10)
fid[palm_near] = 1 + np.abs(P[palm_near, 0][:, None] - mcp_x[None]).argmin(1)

def seg_dir(a, b): d = J[b] - J[a]; return d / np.linalg.norm(d)
CHAIN = [[2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
SJ = []                                                                   # s of each chain joint, per finger
for ch in CHAIN:
    s = [0.0]
    for a, b in zip(ch, ch[1:]): s.append(s[-1] + np.linalg.norm(J[b] - J[a]))
    SJ.append(s)
s_along = np.full(N, -99.0); around = np.zeros(N)
for i in range(N):
    f = fid[i]
    if f < 0: continue
    ch = CHAIN[f]; b = bone[i]
    k = ch.index(b) if b in ch[:-1] else 0
    a = ch[k]; d = seg_dir(a, ch[k + 1])
    r = P[i] - J[a]
    s_along[i] = SJ[f][k] + r.dot(d)
    up = np.array([0, 0, 1.0]) - d * d[2]; up /= np.linalg.norm(up); lat = np.cross(d, up)
    rr = r - d * r.dot(d)
    around[i] = math.atan2(rr.dot(lat), rr.dot(up)) / math.pi            # 0 = back of the finger, +-1 = pad side

# smooth skinning: every vertex blends continuously (no territory boundaries, no hard switch to the asset weights)
def ss(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
W_asset = W.copy()
thumbness = np.clip(W_asset[:, 1] + W_asset[:, 2] + W_asset[:, 3], 0, 1)
# fingers: along-the-finger weights per finger, shared between fingers by distance from each finger's axis
Wf = np.zeros_like(W); share = np.zeros((N, 4)); along = []
for f in range(1, 5):
    k = 1 + 4 * f; d = seg_dir(k, k + 1)
    r = P - J[k]; sf = r @ d
    lat = np.linalg.norm(r - np.outer(sf, d), axis=1)
    # on the finger itself measure along the bent chain (continuous at the joints)
    on = (fid == f); sf = np.where(on, s_along, sf)
    share[:, f - 1] = np.exp(-np.minimum(lat, 40) ** 2 / (2 * 6.5 ** 2)) + 1e-9
    t0 = ss(-12, 6, sf); t1 = ss(SJ[f][1] - 4, SJ[f][1] + 4, sf); t2 = ss(SJ[f][2] - 3.2, SJ[f][2] + 3.2, sf)
    along.append((k, 1 - t0, t0 * (1 - t1), t1 * (1 - t2), t2))
share /= share.sum(1, keepdims=True)
for f, (k, w0, w1, w2, w3) in enumerate(along):
    sh = share[:, f]
    Wf[:, 0] += sh * w0; Wf[:, k] += sh * w1; Wf[:, k + 1] += sh * w2; Wf[:, k + 2] += sh * w3
# thumb: joint blends along the thumb, easing into the asset's own thenar weights
d2 = seg_dir(2, 3); st = (P - J[2]) @ d2
st = np.where(fid == 0, s_along, st)
t0 = ss(-5, 5, st); t1 = ss(SJ[0][1] - 3.5, SJ[0][1] + 3.5, st)
Wt = np.zeros_like(W); Wt[:, 1] = 1 - t0; Wt[:, 2] = t0 * (1 - t1); Wt[:, 3] = t1
mix = ss(-12, -3, st)[:, None]
Wt = Wt * mix + W_asset * (1 - mix)
W = Wt * thumbness[:, None] + Wf * (1 - thumbness[:, None])
W /= W.sum(1, keepdims=True); bone = W.argmax(1)

# ---------------------------------------------------------------------------------------------------------------
# 5. sculpt the anatomy (displacement along the normal, in mm)
def gauss2(p, c, sx, sy=None):
    sy = sy or sx
    return np.exp(-((p[:, 0] - c[0]) ** 2 / (2 * sx * sx) + (p[:, 1] - c[1]) ** 2 / (2 * sy * sy)))
disp = np.zeros(N)
on_hand = (P[:, 1] > -6).astype(float)
# knuckle heads (MCP) on the back of the hand, a touch behind the joint centre
for f, amp in zip(range(4), [1.7, 1.9, 1.5, 1.2]):
    m = J[5 + 4 * f]
    disp += amp * dorsal * gauss2(P, (m[0], m[1] - 4), 5.5, 6.5) * on_hand
# middle and end joints: small dorsal bulges and pad side fullness between creases
for f in range(4):
    for jn, amp in ((6, 0.75), (7, 0.4)):
        c = J[jn + 4 * f]
        disp += amp * dorsal * gauss2(P, (c[0], c[1]), 4.0, 3.2)
# the extensor tendons fanning from the wrist to each knuckle
for f in range(4):
    A = np.array([J[5 + 4 * f, 0] * 0.32, 14.0]); B = np.array([J[5 + 4 * f, 0], J[5 + 4 * f, 1] - 9])
    ab = B - A; t = np.clip(((P[:, :2] - A) @ ab) / (ab @ ab), 0, 1)
    d = np.linalg.norm(P[:, :2] - (A + t[:, None] * ab), axis=1)
    fade = np.clip((t - 0.12) / 0.2, 0, 1) * np.clip((1 - t) / 0.18, 0, 1)
    disp += [0.62, 0.66, 0.5, 0.42][f] * dorsal * np.exp(-d * d / (2 * 1.5 ** 2)) * fade
# palm: thenar and hypothenar pads, a hollow centre, pads under the knuckles
disp += 2.6 * palmar * gauss2(P, (J[1, 0] + 10, 32), 13, 18) * (1 - 0.6 * thumbness)
disp += 1.8 * palmar * gauss2(P, (J[17, 0] - 6, 36), 10, 17)
disp -= 1.7 * palmar * gauss2(P, (J[9, 0] - 2, 52), 15, 13)
for f in range(4):
    m = J[5 + 4 * f]; disp += 1.1 * palmar * gauss2(P, (m[0], m[1] - 3), 6, 5)
# fingertip pads and the pads between creases
for f in range(5):
    ch = CHAIN[f]; s0, s1 = SJ[f][-2], SJ[f][-1]
    t = np.clip((s_along - s0) / (s1 - s0), 0, 1)
    sel = (fid == f)
    disp += sel * palmar * 1.1 * np.sin(np.pi * np.clip((t - 0.15) / 1.45, 0, 1)) ** 1.5
# nail beds: shallow recess under where the plates sit
nail_mask = np.zeros(N)
for f in range(5):
    s0, s1 = SJ[f][-2], SJ[f][-1]; L = s1 - s0
    t = (s_along - s0) / L
    m = (fid == f) & (t > 0.72) & (t < 1.65) & (np.abs(around) < 0.42)
    nail_mask[m] = np.clip((0.42 - np.abs(around[m])) / 0.08, 0, 1) * np.clip((t[m] - 0.72) / 0.08, 0, 1)
disp -= 0.32 * nail_mask
P = P + Nn * disp[:, None]
Nn = vnormals(P)

# ---------------------------------------------------------------------------------------------------------------
# 6. relaxed resting pose (local rotations per bone; bind pose = identity, so local axes are model axes)
def qaxis(axis, deg): axis = Vector(axis).normalized(); return Quaternion(axis, math.radians(deg))
local = [Quaternion() for _ in range(21)]
# fingers: gather toward the middle finger, then a cascade of curl (index straightest)
dir_mid = seg_dir(9, 10); phi_mid = math.atan2(dir_mid[0], dir_mid[1])
SPREAD = [-7.5, 0.0, 6.5, 13.0]
CURL = [(13, 20, 9), (19, 27, 13), (25, 34, 17), (31, 40, 21)]           # MCP, PIP, DIP degrees
for f in range(4):
    k = 5 + 4 * f; d = seg_dir(k, k + 1)
    phi = math.atan2(d[0], d[1]); turn = math.degrees(math.radians(SPREAD[f]) + phi_mid - phi)
    q_add = qaxis((0, 0, -1), turn)
    for n, deg in enumerate(CURL[f]):
        b = k + n; db = Vector(seg_dir(b, b + 1))
        if n == 0: db = q_add @ db
        flex_axis = db.cross(Vector((0, 0, -1))).normalized()
        q = qaxis(flex_axis, deg)
        local[b] = (q @ q_add) if n == 0 else q
# thumb: relaxed about 30 degrees off the palm, slightly toward the index, gently bent
local[1] = qaxis((0, 0, -1), 6) @ qaxis((0, 1, 0), -10)
for b, deg in ((2, 9), (3, 16)):
    db = Vector(seg_dir(b, b + 1)); toward = Vector((0.65, 0, -0.75))
    local[b] = qaxis(db.cross(toward), deg)

def pose_points(P, W, local):
    world = [None] * 21; Jp = np.zeros((21, 3))
    for b in range(21):
        p = PARENT[b]
        if p < 0: world[b] = local[b]; Jp[b] = J[b]; continue
        world[b] = world[p] @ local[b]
        Jp[b] = Jp[p] + np.array(world[p] @ Vector(J[b] - J[p]))
    mats = np.array([np.array(q.to_matrix()) for q in world])
    out = np.zeros_like(P)
    for b in range(21):
        wb = W[:, b]
        if not wb.any(): continue
        out += wb[:, None] * (Jp[b] + (P - J[b]) @ mats[b].T)
    return out, Jp, mats

# ---------------------------------------------------------------------------------------------------------------
# 7. nail plates
nail_P, nail_N, nail_tri, nail_attr, nail_bone = [], [], [], [], []
bvh_bind = BVHTree.FromPolygons([Vector(p) for p in P], [t.tolist() for t in tris])
def inside_width(c, lat):
    # from a point on the bone axis, out both ways: the first surface each side is this finger's own skin
    d = 0.0
    for sgn in (1, -1):
        h = bvh_bind.ray_cast(Vector(c), Vector(lat * sgn), 30)
        d += h[3] if h[0] is not None else 9.0
    return d
def finger_width(f, t):
    ch = CHAIN[f]; a, b = ch[-2], ch[-1]
    c = J[a] + (J[b] - J[a]) * t; d = seg_dir(a, b); up = np.array([0, 0, 1.0]) - d * d[2]; up /= np.linalg.norm(up)
    lat = np.cross(d, up)
    return inside_width(c, lat)
def _unused():
    hits = []
    return 0
for f in range(5):
    ch = CHAIN[f]; a, b = ch[-2], ch[-1]; L = np.linalg.norm(J[b] - J[a]); d = seg_dir(a, b)
    up = np.array([0, 0, 1.0]) - d * d[2]; up /= np.linalg.norm(up); lat = np.cross(d, up)
    if f == 0:                                                             # the thumb nail faces up-and-out
        rot = Quaternion(Vector(d), math.radians(-28)); up = np.array(rot @ Vector(up)); lat = np.cross(d, up)
    width = finger_width(f, 0.55) * (0.66 if f else 0.7)
    # find where the fingertip ends along the axis (dorsal surface)
    # the plate ends where the top of the fingertip starts to curve down (height above the axis falls off)
    hs = []
    for s_ in np.linspace(L * 0.3, L * 2.2, 120):
        h = bvh_bind.ray_cast(Vector(J[a] + d * s_ + up * 25), Vector(-up), 40)
        hs.append((s_, 25 - h[3] if h[0] is not None else -99))
    top_h = max(hv for _, hv in hs)
    end_s = max(s_ for s_, hv in hs if hv >= top_h - 1.1)
    nu, nv = 18, 13
    root, free = end_s * 0.45, 1.7
    grid = np.zeros((nu, nv, 3)); gn = np.zeros((nu, nv, 3)); attr = np.zeros((nu, nv, 4))
    for i in range(nu):
        u = i / (nu - 1)
        s_len = root + u * (end_s + free - root)
        for j in range(nv):
            v = -1 + 2 * j / (nv - 1)
            # outline: rounded cuticle (sides start later), sides gently convergent toward the tip
            s_here = s_len + (1 - u) ** 2 * 2.6 * v * v - u ** 3 * 1.4 * v * v      # U-shaped cuticle, rounded free edge
            half = width / 2 * (0.9 + 0.1 * min(1, u * 3))
            o = J[a] + d * s_here + lat * (v * half)
            h = bvh_bind.ray_cast(Vector(o + up * 25), Vector(-up), 40) if s_here <= end_s - 0.2 else (None,)
            if h[0] is not None:
                p = np.array(h[0]); n = np.array(h[1])
            else:                                                          # free edge: continue the plate
                ip = max(0, i - 1); p = grid[ip, j] + d * ((end_s + free - root) / (nu - 1)) - up * 0.12; n = gn[ip, j]
            grid[i, j] = p + n * 0.24; gn[i, j] = n
            attr[i, j] = (u, v, max(0.0, s_here - end_s), 1.0)
    print('nail', f, 'L', round(L, 1), 'end_s', round(end_s, 1), 'rows past the tip', int((attr[:, nv // 2, 2] > 0).sum()), 'of', nu)
    top = grid.reshape(-1, 3); topn = gn.reshape(-1, 3)
    bot = top - topn * 0.36
    base = sum(len(x) for x in nail_P)
    nail_P += [top, bot]; nail_N += [topn, -topn]
    at = attr.reshape(-1, 4); atb = at.copy(); atb[:, 3] = 0
    nail_attr += [at, atb]
    idx = lambda i, j: i * nv + j
    T = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            q = (idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1))
            T += [(q[0], q[1], q[2]), (q[0], q[2], q[3])]
            T += [tuple(x + nu * nv for x in (q[0], q[2], q[1])), tuple(x + nu * nv for x in (q[0], q[3], q[2]))]
    # side and edge walls
    rim = [idx(i, 0) for i in range(nu)] + [idx(nu - 1, j) for j in range(1, nv)] + [idx(i, nv - 1) for i in range(nu - 2, -1, -1)] + [idx(0, j) for j in range(nv - 2, 0, -1)]
    for k in range(len(rim)):
        p0, p1 = rim[k], rim[(k + 1) % len(rim)]
        T += [(p0, p1 + nu * nv, p1), (p0, p0 + nu * nv, p1 + nu * nv)]
    T = np.array(T) + base
    # make the top faces point the same way as the skin normal
    nail_tri.append(T); nail_bone.append(np.full(2 * nu * nv, ch[-2]))
nail_P = np.concatenate(nail_P); nail_N = np.concatenate(nail_N); nail_tri = np.concatenate(nail_tri).astype(np.uint32)
nail_attr = np.concatenate(nail_attr); nail_bone = np.concatenate(nail_bone)
# orient triangles outward by comparing with the stored normals
fn = np.cross(nail_P[nail_tri[:, 1]] - nail_P[nail_tri[:, 0]], nail_P[nail_tri[:, 2]] - nail_P[nail_tri[:, 0]])
want = nail_N[nail_tri[:, 0]] + nail_N[nail_tri[:, 1]] + nail_N[nail_tri[:, 2]]
flip = (fn * want).sum(1) < 0
nail_tri[flip] = nail_tri[flip][:, [0, 2, 1]]
print('nails', len(nail_P), 'verts')

# ---------------------------------------------------------------------------------------------------------------
# 8. bakes: thickness (bind pose), ambient occlusion (relaxed pose, nails included), surface masks
thick = np.zeros(N)
for i in range(N):
    o = Vector(P[i] - Nn[i] * 0.05); acc = []
    for jit in ((0, 0, 0), (0.25, 0, 0), (-0.25, 0, 0), (0, 0.25, 0), (0, -0.25, 0)):
        dvec = Vector(-Nn[i] + np.array(jit)).normalized()
        h = bvh_bind.ray_cast(o, dvec, 60)
        acc.append(h[3] if h[0] is not None else 60)
    thick[i] = np.median(acc)
posed, Jp, mats = pose_points(P, W, local)
nposed = vnormals(posed)
nail_posed = np.array([Jp[b] + mats[b] @ (p - J[b]) for p, b in zip(nail_P, nail_bone)])
allP = np.concatenate([posed, nail_posed]); allT = np.concatenate([tris, nail_tri + N])
bvh_pose = BVHTree.FromPolygons([Vector(p) for p in allP], [t.tolist() for t in allT])
K = 28; dirs = []
for k in range(K):                                                        # cosine-weighted hemisphere, z-up
    u1, u2 = (k + 0.5) / K, (k * 0.618034) % 1
    r = math.sqrt(u1); th = 2 * math.pi * u2; dirs.append((r * math.cos(th), r * math.sin(th), math.sqrt(1 - u1)))
dirs = np.array(dirs)
ao = np.zeros(N)
for i in range(N):
    n = nposed[i]; t1 = np.cross(n, [0, 0, 1] if abs(n[2]) < 0.9 else [1, 0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(n, t1)
    o = Vector(posed[i] + n * 0.08); occ = 0.0
    for dl in dirs:
        dv = t1 * dl[0] + t2 * dl[1] + n * dl[2]
        h = bvh_pose.ray_cast(o, Vector(dv), 22)
        if h[0] is not None: occ += 1 - h[3] / 22
    ao[i] = 1 - occ / K
tipness = np.zeros(N)
for f in range(5):
    s0, s1 = SJ[f][-2], SJ[f][-1]; t = np.clip((s_along - s0) / (s1 - s0), 0, 1.7)
    sel = fid == f; tipness[sel] = np.clip((t[sel] - 0.45) / 1.1, 0, 1) ** 1.3
knuckle = np.zeros(N)
for f in range(4):
    for jn, sg in ((5, 7.5), (6, 5.0), (7, 4.0)):
        c = J[jn + 4 * f]; knuckle = np.maximum(knuckle, gauss2(P, (c[0], c[1] - (2 if jn == 5 else 0)), sg))
for jn, sg in ((2, 6.5), (3, 4.5)):
    c = J[jn]; knuckle = np.maximum(knuckle, gauss2(P, (c[0], c[1]), sg) * (fid == 0))
knuckle *= np.clip(dorsal + 0.25, 0, 1)
y_crease = 2.0
forearm = np.clip((y_crease - P[:, 1]) / 150.0, 0, 1)
print('thickness mm min/median/max', round(thick.min(), 1), round(np.median(thick), 1), round(thick.max(), 1), ' ao min', round(ao.min(), 2))

# measurements for fitting
def width_at(y, axis):
    band = P[np.abs(P[:, 1] - y) < 2.5]
    return band[:, axis].max() - band[:, axis].min()
def ring_width(f, frac):
    ch = CHAIN[f]; a, b = ch[0], ch[1]
    c = J[a] + (J[b] - J[a]) * frac; d = seg_dir(a, b); up = np.array([0, 0, 1.0]) - d * d[2]; up /= np.linalg.norm(up)
    lat = np.cross(d, up)
    return float(inside_width(c, lat))
fingers_w = [ring_width(0, 0.4)] + [ring_width(f, 0.38) for f in range(1, 5)]
_band = P[(np.abs(P[:, 1] - ((J[5, 1] + J[17, 1]) / 2 - 8)) < 2.5) & (P[:, 0] > J[5, 0] - 14)]
palm_w = _band[:, 0].max() - _band[:, 0].min()
measure = {'fingers': [round(x, 2) for x in fingers_w], 'palm': round(float(palm_w), 2),
           'wrist': round(float(width_at(-26, 0)), 2), 'wristDepth': round(float(width_at(-26, 2)), 2)}
print('measurements', measure)

# ---------------------------------------------------------------------------------------------------------------
# 9. write the GLB (two meshes; custom attributes quantised; skin data as JOINTS_0 / WEIGHTS_0)
def top4(Wm):
    idx = np.argsort(-Wm, 1)[:, :4]; w = np.take_along_axis(Wm, idx, 1); w /= w.sum(1, keepdims=True)
    return idx.astype(np.uint8), w.astype(np.float32)
sj, sw = top4(W)
nj = np.zeros((len(nail_P), 4), np.uint8); nj[:, 0] = nail_bone; nw = np.zeros((len(nail_P), 4), np.float32); nw[:, 0] = 1
def u8n(x): return np.clip(np.round(np.asarray(x) * 255), 0, 255).astype(np.uint8)
def s8n(x): return np.clip(np.round(np.asarray(x) * 127), -127, 127).astype(np.int8)
def s16n(x): return np.clip(np.round(np.asarray(x) * 32767), -32767, 32767).astype(np.int16)
FINGER = np.zeros((N, 4), np.int16)
FINGER[:, 0] = s16n(np.clip(s_along, -127, 127) / 128.0)              # mm / 128
FINGER[:, 1] = s16n(np.where(fid < 0, 5, fid) / 8.0)                   # finger id / 8
FINGER[:, 2] = s16n(around)
FINGER[:, 3] = s16n(knuckle)
SKIN = np.stack([u8n(np.clip(thick, 0, 40) / 40), u8n(ao), u8n(tipness), u8n(forearm)], 1)
PALM = np.stack([s16n(P[:, 0] / 128.0), s16n(P[:, 1] / 256.0), s16n(dorsal), s16n(nail_mask)], 1).astype(np.int16)
NAIL = np.stack([s16n(nail_attr[:, 0]), s16n(nail_attr[:, 1]), s16n(np.clip(nail_attr[:, 2], 0, 4) / 4), s16n(nail_attr[:, 3])], 1).astype(np.int16)

buf = bytearray(); views = []; accessors = []
def add(arr, ctype, typ, normalized=False, target=34962, minmax=False):
    global buf
    arr = np.ascontiguousarray(arr)
    while len(buf) % 4: buf.append(0)
    off = len(buf); buf += arr.tobytes()
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, **({'target': target} if target else {})})
    acc = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(arr.shape[0]) if typ != 'SCALAR' else int(arr.size), 'type': typ}
    if normalized: acc['normalized'] = True
    if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
    accessors.append(acc); return len(accessors) - 1
F32, U8, I8, I16, U32 = 5126, 5121, 5120, 5122, 5125
skin_prim = {'attributes': {
    'POSITION': add(P.astype(np.float32), F32, 'VEC3', minmax=True), 'NORMAL': add(Nn.astype(np.float32), F32, 'VEC3'),
    'JOINTS_0': add(sj, U8, 'VEC4'), 'WEIGHTS_0': add(sw, F32, 'VEC4'),
    '_FINGER': add(FINGER, I16, 'VEC4', True), '_SKIN': add(SKIN, U8, 'VEC4', True), '_PALM': add(PALM, I16, 'VEC4', True)},
    'indices': add(tris.reshape(-1), U32, 'SCALAR', target=34963), 'mode': 4}
nail_prim = {'attributes': {
    'POSITION': add(nail_P.astype(np.float32), F32, 'VEC3', minmax=True), 'NORMAL': add(nail_N.astype(np.float32), F32, 'VEC3'),
    'JOINTS_0': add(nj, U8, 'VEC4'), 'WEIGHTS_0': add(nw, F32, 'VEC4'), '_NAIL': add(NAIL, I16, 'VEC4', True)},
    'indices': add(nail_tri.reshape(-1), U32, 'SCALAR', target=34963), 'mode': 4}
extras = {
    'ames_hand_template': {
        'version': 1, 'units': 'mm', 'frame': 'wrist origin, fingers +y, back of hand +z, right hand',
        'joints': np.round(J, 3).tolist(), 'measure': measure,
        'relaxed': [[round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)] for q in local],
        'chainS': [[round(x, 3) for x in s] for s in SJ],
        'source': 'WebXR generic hand (MIT, Amazon, github.com/immersive-web/webxr-input-profiles), resculpted by HOUSEofAMES',
    }}
gltf = {'asset': {'version': '2.0', 'generator': 'HOUSEofAMES create_realistic_hand.py'},
        'scene': 0, 'scenes': [{'nodes': [0, 1]}],
        'nodes': [{'name': 'Hand skin', 'mesh': 0}, {'name': 'Hand nails', 'mesh': 1}],
        'meshes': [{'name': 'skin', 'primitives': [skin_prim]}, {'name': 'nails', 'primitives': [nail_prim]}],
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}], 'extras': extras}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
while len(buf) % 4: buf.append(0)
with open(OUT, 'wb') as fh:
    fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    fh.write(struct.pack('<II', len(js), 0x4E4F534A)); fh.write(js)
    fh.write(struct.pack('<II', len(buf), 0x004E4942)); fh.write(bytes(buf))
np.savez('/tmp/hand-debug.npz', W=W, nail_bone=nail_bone, P=P, tris=tris, posed=posed, ao=ao, thick=thick, nail_P=nail_P, nail_tri=nail_tri, nail_posed=nail_posed, J=J, Jp=Jp)
print('wrote', OUT)
