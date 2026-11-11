"""AMES jewellery modelling kit for Blender (bpy), no add-ons or extra packages.

Geometry a bench jeweller would recognise, built in real units (metres; 1 mm = 0.001):
  round_brilliant()  a true 57-facet round brilliant cut by its facet planes (table, 8 stars, 8 bezels,
                     16 upper halves, a faceted girdle, 16 lower halves, 8 pavilion mains, culet)
  sweep()            a tube of changing thickness along a smooth path (claws, rails, wires)
  shank()            a ring band with a rounded comfort profile that can change round the finger
  catmull()          a smooth path through hand-placed points

Proportions are the usual "ideal" round brilliant and are visual inputs, not a grading claim.
"""
import math
import bmesh
import bpy
from mathutils import Vector

TAU = math.tau


# --- convex cutting -------------------------------------------------------------------------------------------
def _clip(faces, n, d, eps=1e-10):
    """Keep the part of a convex solid (list of faces, each a loop of points) where n.p <= d."""
    kept, cut = [], []
    for f in faces:
        new = []
        for i, a in enumerate(f):
            b = f[(i + 1) % len(f)]
            da, db = n.dot(a) - d, n.dot(b) - d
            if da <= eps:
                new.append(a)
                if da >= -eps:
                    cut.append(a)
            if (da < -eps and db > eps) or (da > eps and db < -eps):
                p = a.lerp(b, da / (da - db))
                new.append(p)
                cut.append(p)
        if len(new) >= 3:
            kept.append(new)
    unique = []
    for p in cut:
        if all((p - q).length > 1e-7 for q in unique):
            unique.append(p)
    if len(unique) >= 3:
        c = sum(unique, Vector()) / len(unique)
        u = (unique[0] - c).normalized()
        v = n.cross(u)
        unique.sort(key=lambda p: math.atan2((p - c).dot(v), (p - c).dot(u)))
        kept.append(unique)
    return kept


def _plane(a, b, c, inside=Vector((0, 0, 0))):
    n = (b - a).cross(c - a).normalized()
    if n.dot(a - inside) < 0:
        n = -n
    return n, n.dot(a)


def round_brilliant_faces(table=.57, crown_deg=34.5, pavilion_deg=40.75, girdle=.07, star=.5, lower=.77,
                          culet=.012, girdle_sides=96):
    """Facet loops of a round brilliant with girdle radius 1, girdle top at z = 0 (crown up)."""
    beta, alpha = math.radians(crown_deg), math.radians(pavilion_deg)
    zt = (1 - table) * math.tan(beta)
    ring = [Vector((math.cos(i * TAU / girdle_sides), math.sin(i * TAU / girdle_sides), 0)) for i in range(girdle_sides)]
    top, bottom = [p + Vector((0, 0, 1)) for p in ring], [p - Vector((0, 0, 2)) for p in ring]
    faces = [top, list(reversed(bottom))]
    for i in range(girdle_sides):
        j = (i + 1) % girdle_sides
        faces.append([bottom[i], bottom[j], top[j], top[i]])
    inside = Vector((0, 0, -.2))
    step = TAU / 8
    polar = lambda r, a, z: Vector((r * math.cos(a), r * math.sin(a), z))
    faces = _clip(faces, Vector((0, 0, 1)), zt)                                   # table
    r_star = table * math.cos(step / 2) + star * (1 - table * math.cos(step / 2))
    z_star = (1 - r_star * math.cos(step / 2)) * math.tan(beta)                   # on both neighbouring bezels
    z_low = -girdle - math.tan(alpha) * (1 - (1 - lower) * math.cos(step / 2))
    for k in range(8):
        a = k * step
        faces = _clip(faces, Vector((math.cos(a) * math.sin(beta), math.sin(a) * math.sin(beta), math.cos(beta))), math.sin(beta))  # bezel
    for k in range(8):
        a = k * step
        faces = _clip(faces, *_plane(polar(table, a, zt), polar(table, a + step, zt), polar(r_star, a + step / 2, z_star), inside))  # star
    for k in range(8):
        a = k * step
        for s in (-1, 1):                                                          # upper halves
            faces = _clip(faces, *_plane(polar(1, a, 0), polar(1, a + s * step / 2, 0), polar(r_star, a + s * step / 2, z_star), inside))
    for k in range(8):
        a = k * step
        faces = _clip(faces, Vector((math.cos(a) * math.sin(alpha), math.sin(a) * math.sin(alpha), -math.cos(alpha))),
                      math.sin(alpha) + girdle * math.cos(alpha))                  # pavilion main
    for k in range(8):
        a = k * step
        for s in (-1, 1):                                                          # lower halves
            faces = _clip(faces, *_plane(polar(1, a, -girdle), polar(1, a + s * step / 2, -girdle),
                                         polar(1 - lower, a + s * step / 2, z_low), inside))
    faces = _clip(faces, Vector((0, 0, -1)), girdle + math.tan(alpha) - culet)     # culet
    return faces


_CUT_CACHE = {}


def round_brilliant(name, radius, material=None, **proportions):
    """A closed, watertight round brilliant. Origin at the centre of the girdle, table toward +Z."""
    key = tuple(sorted(proportions.items()))
    if key not in _CUT_CACHE:
        _CUT_CACHE[key] = round_brilliant_faces(**proportions)
    faces = _CUT_CACHE[key]
    girdle = proportions.get('girdle', .07)
    verts, index, loops = [], {}, []
    for f in faces:
        loop = []
        for p in f:
            k = (round(p.x, 6), round(p.y, 6), round(p.z, 6))
            if k not in index:
                index[k] = len(verts)
                verts.append(((p.x) * radius, p.y * radius, (p.z + girdle / 2) * radius))
            if not loop or loop[-1] != index[k]:
                loop.append(index[k])
        if len(loop) > 1 and loop[0] == loop[-1]:
            loop.pop()
        if len(loop) >= 3:
            loops.append(loop)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], loops)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=radius * 1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), 'brilliant is not watertight'
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    if material:
        mesh.materials.append(material)
    return obj


# --- metalwork ------------------------------------------------------------------------------------------------
def catmull(points, samples=12):
    """Smooth path through the points (centripetal-free uniform Catmull-Rom), with the end points kept."""
    pts = [Vector(p) for p in points]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(samples):
            t = s / samples
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1].copy())
    return out


def soften(points, rounds=3):
    """Round the corners of a hand-placed path without ever swinging outside it (corner cutting), ends kept."""
    pts = [Vector(p) for p in points]
    for _ in range(rounds):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [a.lerp(b, .25), a.lerp(b, .75)]
        out.append(pts[-1])
        pts = out
    return pts


def sweep(name, path, radius, material=None, sides=20, closed=False, flatten=None, round_end=True, round_start=False):
    """Tube along a path. radius: a number or a function of t in 0..1. flatten(t) -> (across, along-normal) scale
    of the round section, for claw tips that are filed flat. Ends are rounded like a filed and polished wire."""
    pts = [Vector(p) for p in path]
    rad = radius if callable(radius) else (lambda t, r=radius: r)
    n = len(pts)

    rings = [(p, rad(i / max(1, n - 1)), i / max(1, n - 1)) for i, p in enumerate(pts)]
    if not closed:
        def cap(p, direction, r, t):
            extra = []
            for k in range(1, 7):
                a = k / 6 * math.pi / 2
                extra.append((p + direction * r * math.sin(a), max(r * math.cos(a), r * .02), t))
            return extra
        if round_end:
            rings += cap(pts[-1], (pts[-1] - pts[-2]).normalized(), rings[-1][1], 1)
        if round_start:
            rings = list(reversed(cap(pts[0], (pts[0] - pts[1]).normalized(), rings[0][1], 0))) + rings
    centres = [r[0] for r in rings]
    m = len(centres)
    # Parallel-transport frames so the section never twists.
    tangents = []
    for i in range(m):
        a = centres[(i - 1) % m] if closed else centres[max(0, i - 1)]
        b = centres[(i + 1) % m] if closed else centres[min(m - 1, i + 1)]
        tangents.append((b - a).normalized())
    ref = Vector((0, 1, 0)) if abs(tangents[0].y) < .9 else Vector((1, 0, 0))
    u = tangents[0].cross(ref).normalized()
    verts, frames = [], []
    for i in range(m):
        t = tangents[i]
        u = (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        frames.append((u.copy(), v.copy()))
    for i, (centre, r, tt) in enumerate(rings):
        u, v = frames[i]
        fu, fv = flatten(tt) if flatten else (1, 1)
        for j in range(sides):
            a = j * TAU / sides
            verts.append(tuple(centre + u * (r * fu * math.cos(a)) + v * (r * fv * math.sin(a))))
    faces = []
    for i in range(m - (0 if closed else 1)):
        k = (i + 1) % m
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides, k * sides + (j + 1) % sides, k * sides + j))
    if not closed:
        faces.append(tuple(reversed(range(sides))))
        faces.append(tuple((m - 1) * sides + j for j in range(sides)))
    return _object(name, verts, faces, material)


def shank(name, inner_radius, width, thickness, material=None, around=256, section=32, power=2.7):
    """Ring band in the XZ plane (finger along Y), top of the ring at +Z. width(a) and thickness(a) are functions
    of the angle a from the top (0..pi each side) so the band can swell or taper; power shapes the corners."""
    verts, faces = [], []
    for i in range(around):
        a = i * TAU / around
        radial = Vector((math.sin(a), 0, math.cos(a)))
        side = min(a, TAU - a)
        w, t = width(side) / 2, thickness(side) / 2
        centre = radial * (inner_radius + t)
        for j in range(section):
            b = j * TAU / section
            c, s = math.cos(b), math.sin(b)
            # Superellipse: a soft rectangle. The inside (toward the finger) is rounder: comfort fit.
            p = power if c > 0 else 2.15
            rr = (abs(c) ** p + abs(s) ** p) ** (-1 / p)
            verts.append(tuple(centre + radial * (t * rr * c) + Vector((0, w * rr * s, 0))))
    for i in range(around):
        k = (i + 1) % around
        for j in range(section):
            faces.append((i * section + j, i * section + (j + 1) % section, k * section + (j + 1) % section, k * section + j))
    return _object(name, verts, faces, material)


def _object(name, verts, faces, material=None, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    if material:
        mesh.materials.append(material)
    return obj


def sphere(name, radius, location, material=None, segments=20, rings=12, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        v.co.x *= scale[0]; v.co.y *= scale[1]; v.co.z *= scale[2]
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    if material:
        mesh.materials.append(material)
    return obj


def sharpen(obj, degrees=38):
    """Smooth shading that keeps real corners: edges sharper than the angle stay crisp (drilled seats, filed ends)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(degrees)
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > limit)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(obj.data)
    bm.free()


def join(objects, name):
    """Merge objects into one mesh object (world placement kept)."""
    bm = bmesh.new()
    materials = []
    for o in objects:
        mesh = o.data.copy()
        mesh.transform(o.matrix_world if o.users_collection else o.matrix_basis)
        offset = len(materials)
        for mat in o.data.materials:
            if mat not in materials:
                materials.append(mat)
        tmp = bmesh.new(); tmp.from_mesh(mesh)
        remap = {i: materials.index(m) for i, m in enumerate(o.data.materials)}
        for f in tmp.faces:
            f.material_index = remap.get(f.material_index, 0)
        tmp.to_mesh(mesh); tmp.free()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    for m in materials:
        out.materials.append(m)
    return bpy.data.objects.new(name, out)


# --- fancy shapes: pear, cushion, oval -----------------------------------------------------------------------------
def pear_outline(length=1.55, points=144):
    """Convex pear, narrow half-width 1, point toward +Y, origin at the centre of the round end (under the culet)."""
    tip = 2 * length - 1
    circles = [((0, 0), 1), ((0, tip * .46), .66), ((0, tip * .8), .26), ((0, tip - .015), .015)]
    out = []
    for i in range(points):
        a = i * TAU / points
        d = (math.cos(a), math.sin(a))
        c, r = max(circles, key=lambda cr: cr[0][0] * d[0] + cr[0][1] * d[1] + cr[1])
        p = Vector((c[0] + r * d[0], c[1] + r * d[1], 0))
        if not out or (p - out[-1]).length > 1e-6:
            out.append(p)
    return out


def superellipse_outline(power=3.2, ratio=1, points=144):
    """Cushion (power about 3), oval (power 2, ratio > 1): half-width 1 across X, ratio along Y."""
    out = []
    for i in range(points):
        a = i * TAU / points
        c, s = math.cos(a), math.sin(a)
        out.append(Vector((math.copysign(abs(c) ** (2 / power), c), ratio * math.copysign(abs(s) ** (2 / power), s), 0)))
    return out


def _on_outline(outline, angle):
    """Where a ray from the origin at this angle leaves the outline, and the outline's direction there."""
    d = Vector((math.cos(angle), math.sin(angle), 0))
    n = len(outline)
    for i in range(n):
        a, b = outline[i], outline[(i + 1) % n]
        e = b - a
        den = d.x * e.y - d.y * e.x
        if abs(den) < 1e-12:
            continue
        t = (a.x * e.y - a.y * e.x) / den
        u = (a.x * d.y - a.y * d.x) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9:
            # Direction of the outline, averaged over a short stretch so flats and arcs blend.
            tangent = (outline[(i + 3) % n] - outline[(i - 2) % n]).normalized()
            return d * t, tangent
    raise ValueError('outline does not surround the origin')


def fancy_brilliant_faces(outline, table=.58, crown_deg=34.5, pavilion_deg=40.5, girdle=.06, star=.5, lower=.76, culet=.012, mains=8, turn=0, keel=0):
    """Brilliant-style facets for any convex outline (narrow half-width about 1): table, stars, bezels, upper halves,
    girdle, lower halves, pavilion mains, culet. Girdle top at z = 0, crown toward +Z, culet under the origin.
    keel: length of the keel line along +Y for long shapes (pear, oval, marquise). A long stone cut to a single point
    underneath has shallow facets toward its ends and you see straight through it; a keel keeps them steep, as
    cutters do. The table is the outline set in by the same distance all round, so the crown angle holds too."""
    top, bottom = [p + Vector((0, 0, 1)) for p in outline], [p - Vector((0, 0, 2.5)) for p in outline]
    n = len(outline)
    faces = [top, list(reversed(bottom))] + [[bottom[i], bottom[(i + 1) % n], top[(i + 1) % n], top[i]] for i in range(n)]
    count = mains * 2
    G, T = [], []
    for k in range(count):
        g, t = _on_outline(outline, turn + k * TAU / count)
        G.append(g); T.append(t)
    narrow = min(g.length for g in G)
    zt = (1 - table) * math.tan(math.radians(crown_deg)) * narrow
    depth = math.tan(math.radians(pavilion_deg)) * narrow
    inside = Vector((0, 0, -.2 * narrow))
    up = Vector((0, 0, 1))
    faces = _clip(faces, up, zt)
    bezels, pavs = {}, {}
    inset = (1 - table) * narrow
    foot = lambda g: Vector((0, min(max(g.y, 0), keel), 0))                 # nearest point of the keel line
    def table_point(k):
        inward = Vector((-T[k].y, T[k].x, 0))
        if inward.dot(G[k] - foot(G[k])) > 0: inward = -inward
        return G[k] + inward * inset + up * zt
    TP = [table_point(k) for k in range(count)]
    for k in range(0, count, 2):
        bezels[k] = _plane(G[k], TP[k], G[k] + T[k], inside + foot(G[k]))
        pavs[k] = _plane(G[k] - up * girdle, foot(G[k]) - up * (girdle + depth), G[k] - up * girdle + T[k], inside + foot(G[k]))
    height = lambda plane, p: (plane[1] - plane[0].x * p.x - plane[0].y * p.y) / plane[0].z
    S, L = {}, {}
    for j in range(1, count, 2):
        a, b = (j - 1) % count, (j + 1) % count
        mid = (TP[a] + TP[b]) / 2; mid.z = 0
        s = mid.lerp(G[j], star)
        S[j] = Vector((s.x, s.y, min(height(bezels[a], s), height(bezels[b], s))))
        l = G[j].lerp(foot(G[j]), lower)
        L[j] = Vector((l.x, l.y, max(height(pavs[a], l), height(pavs[b], l))))
    for k in range(0, count, 2):
        faces = _clip(faces, *bezels[k])
    for j in range(1, count, 2):
        a, b = (j - 1) % count, (j + 1) % count
        faces = _clip(faces, *_plane(TP[a], TP[b], S[j], inside + foot(G[j])))
    for j in range(1, count, 2):
        for k in ((j - 1) % count, (j + 1) % count):
            faces = _clip(faces, *_plane(G[k], G[j], S[j], inside + foot(G[j])))
    for k in range(0, count, 2):
        faces = _clip(faces, *pavs[k])
    for j in range(1, count, 2):
        for k in ((j - 1) % count, (j + 1) % count):
            faces = _clip(faces, *_plane(G[k] - up * girdle, G[j] - up * girdle, L[j], inside + foot(G[j])))
    faces = _clip(faces, -up, girdle + depth - culet * narrow)
    return faces, {'crown': zt, 'depth': depth + girdle, 'narrow': narrow}


def fancy_brilliant(name, outline, half_width, material=None, **proportions):
    """A closed fancy-shape brilliant. Origin at the girdle's mid height above the culet; table toward +Z.
    Returns (object, info) where info gives crown height and total depth below the girdle top, in real units."""
    faces, info = fancy_brilliant_faces(outline, **proportions)
    girdle = proportions.get('girdle', .06)
    # The stone is convex, so its skin is the hull of its corners: always closed, whatever slivers the cutting left.
    bm = bmesh.new()
    seen = set()
    for f in faces:
        for p in f:
            k = (round(p.x, 5), round(p.y, 5), round(p.z, 5))
            if k not in seen:
                seen.add(k)
                bm.verts.new((p.x * half_width, p.y * half_width, (p.z + girdle / 2) * half_width))
    hull = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(.4), verts=list(bm.verts), edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    leaks = sum(1 for e in bm.edges if not e.is_manifold)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    assert leaks == 0, '%s is not watertight (%d open edges)' % (name, leaks)
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    if material:
        mesh.materials.append(material)
    return obj, {k: v * half_width for k, v in info.items()}


def claw_setting(name, outline, half_width, info, angles, material, wire=.36e-3, rail_drop=.82, girdle=.06, tip_in=.2, wide=None):
    """Claws and a gallery wire for a fancy stone (stone at the origin, table +Z, as fancy_brilliant makes it).
    angles: where round the outline the claws stand (radians). wide: angles whose claw is a broad V tip."""
    parts = []
    top = girdle * half_width / 2                      # girdle top above the origin
    rail_z = top - info['depth'] * rail_drop
    shrink = 1 - rail_drop * .78                       # the pavilion narrows going down
    loop = [(p.x * half_width * shrink, p.y * half_width * shrink, rail_z) for p in outline[::2]]
    # A fine under-rail low on the pavilion: high up it would show through the stone as a bright frame.
    parts.append(sweep(name + ' gallery', loop, wire * .55, material, sides=12, closed=True))
    for i, angle in enumerate(angles):
        g, _ = _on_outline(outline, angle)
        g = g * half_width
        out = g.normalized()
        at = lambda r, z: out * (g.length + r) + Vector((0, 0, z))
        rise = info['crown'] * tip_in / (1 - .58) * .9
        path = soften([
            at(-g.length * (1 - shrink) - wire * .2, rail_z - wire * 1.4),
            at(-g.length * (1 - shrink) + wire * .2, rail_z + wire * .4),
            at(-g.length * (1 - shrink) * .5 + wire * .7, (rail_z + top) / 2),      # following the pavilion up
            at(wire * .75, top - info['depth'] * .1),
            at(wire * .85, top + wire * .7),
            at(-g.length * tip_in * .45, top + rise * .5 + wire * 1.15),
            at(-g.length * tip_in, top + rise + wire * .62),
        ])
        broad = wide and any(abs((angle - w + math.pi) % TAU - math.pi) < 1e-6 for w in wide)
        radius = lambda t: wire * (1 - .22 * t)
        flat = (lambda t: (1 + (.9 if broad else .25) * max(0, (t - .55) / .45), 1 - .3 * max(0, (t - .8) / .2)))
        parts.append(sweep('%s claw %d' % (name, i), path, radius, material, sides=16, flatten=flat, round_start=True))
    return parts


def ring_link(name, radius, wire, location, axis, material):
    """A small closed jump ring. axis: the direction the hole faces."""
    a = Vector(axis).normalized()
    u = a.orthogonal().normalized(); v = a.cross(u)
    c = Vector(location)
    return sweep(name, [c + u * (radius * math.cos(k * TAU / 40)) + v * (radius * math.sin(k * TAU / 40)) for k in range(40)], wire, material, sides=12, closed=True)
