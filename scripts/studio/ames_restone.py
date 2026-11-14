"""Swap a piece's placeholder stones for real cut geometry.

Each placeholder is replaced where it stands. The new stone copies the old
one's own local transform and is then scaled by the ratio of their widths, so
it lands in the setting at exactly the old stone's size and angle - no parent
arithmetic, which is what pulled the stones out of their baskets first time.
"""
import bpy, math
from mathutils import Vector, Matrix
import ames_cuts as C


def _local_box(ob):
    bb = [Vector(c) for c in ob.bound_box]
    xs = [p.x for p in bb]; ys = [p.y for p in bb]; zs = [p.z for p in bb]
    centre = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
    return centre, Vector((max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)))


def _template(outline, gem_mat, girdle_mat):
    """Build the cut once, table facing +Z, girdle centred on the origin.

    The generator works in Y-up, so the rotation is baked into the vertices
    here rather than carried on every object that uses the mesh.
    """
    V, F, G = C.shaped(outline)
    V = [(x, -z, y) for (x, y, z) in V]          # Y-up -> Z-up
    me = bpy.data.meshes.new(f'cut_{outline}')
    me.from_pydata(V, [], F)
    me.validate(); me.update()
    import ames_studio
    ames_studio._face_outward(me)
    for poly in me.polygons:
        poly.use_smooth = False
    me.materials.append(gem_mat)
    me.materials.append(girdle_mat)
    lo, hi = G['girdle']
    for i in range(lo, hi):
        me.polygons[i].material_index = 1

    xs = [v[0] for v in V]; ys = [v[1] for v in V]; zs = [v[2] for v in V]
    centre = Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
    size = Vector((max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)))
    return me, centre, size


def _orient(old, t_size):
    """Work out how a fancy-shape placeholder lies in its own local frame.

    Returns the 4x4 that carries the template (length +x with the tip at +x,
    width y, table +z) onto the placeholder: longest local axis is the length,
    shortest is the depth, the narrower end is the tip and the broader face is
    the table. Each axis is scaled to the placeholder so the new stone fills
    exactly the seat the setting was modelled around.
    """
    vs = [v.co.copy() for v in old.data.vertices]
    lo = [min(v[k] for v in vs) for k in range(3)]
    hi = [max(v[k] for v in vs) for k in range(3)]
    size = [hi[k] - lo[k] for k in range(3)]
    a = max(range(3), key=lambda k: size[k])
    c = min(range(3), key=lambda k: size[k])
    b = 3 - a - c
    mid = [(lo[k] + hi[k]) / 2 for k in range(3)]

    def spread(axis, frac_lo, frac_hi, other):
        sel = [v for v in vs if lo[axis] + frac_lo * size[axis] <= v[axis] <= lo[axis] + frac_hi * size[axis]]
        if not sel:
            return 0.0
        return max(abs(v[o] - mid[o]) for v in sel for o in other)

    tip_sign = 1.0 if spread(a, 0.82, 1.0, (b,)) < spread(a, 0.0, 0.18, (b,)) else -1.0
    table_sign = 1.0 if spread(c, 0.9, 1.0, (a, b)) > spread(c, 0.0, 0.1, (a, b)) else -1.0

    m = Matrix.Identity(4)
    for row in range(3):
        for col in range(3):
            m[row][col] = 0.0
    m[a][0] = tip_sign * size[a] / t_size.x
    m[b][1] = size[b] / t_size.y
    # Depth follows the width, not the placeholder: squashing a cut to fit a
    # shallow stand-in flattens its pavilion and the stone goes see-through.
    depth = size[b] / t_size.y
    m[c][2] = table_sign * depth
    if m.to_3x3().determinant() < 0:
        m[b][1] = -m[b][1]                     # the cut is mirror-symmetric in width
    # Keep the table where the old table was; any extra depth goes down into
    # the setting, where a real stone's pavilion sits.
    shift = Vector((0, 0, 0))
    shift[c] = table_sign * (size[c] - t_size.z * depth) / 2.0
    return Matrix.Translation(shift) @ m


def restone(stones, outline, gem_mat, girdle_mat):
    me, t_centre, t_size = _template(outline, gem_mat, girdle_mat)
    t_width = max(t_size.x, t_size.y)
    made = []

    for old in list(stones):
        o_centre, o_size = _local_box(old)
        o_width = max(o_size.x, o_size.y)
        if o_width <= 1e-12:
            continue
        if outline == 'round':
            # Round placeholders are already table-up in their own frame;
            # guessing the table from a near-symmetric stand-in can flip the
            # stone pavilion-up, which renders it grey and milky.
            fit = Matrix.Scale(o_width / t_width, 4)
        else:
            fit = _orient(old, t_size)

        new = bpy.data.objects.new(old.name.replace('placeholder', 'cut'), me)
        bpy.context.collection.objects.link(new)
        new.parent = old.parent
        new.matrix_parent_inverse = old.matrix_parent_inverse.copy()
        new.matrix_basis = (old.matrix_basis
                            @ Matrix.Translation(o_centre)
                            @ fit
                            @ Matrix.Translation(-t_centre))
        made.append(new)
        bpy.data.objects.remove(old, do_unlink=True)

    bpy.context.view_layer.update()
    return made


def verify(stones, expect_width=None):
    """Report what actually landed, so a bad fit shows up before a long render."""
    if not stones:
        return 'no stones'
    ws = []
    for o in stones:
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        xs = [p.x for p in bb]; ys = [p.y for p in bb]
        ws.append(max(max(xs)-min(xs), max(ys)-min(ys)))
    return 'stones %d  width min %.4f avg %.4f max %.4f' % (
        len(ws), min(ws), sum(ws)/len(ws), max(ws))
