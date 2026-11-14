"""AMES cut generator - real gem geometry at GIA proportions.

Every stone the app shows is built here rather than tessellated from a
revolve, so the facet pattern (and therefore the way light actually
bounces inside the stone) matches a cut gem instead of approximating one.

Girdle radius is 1.0, so every dimension below reads as a fraction of the
stone's half-width and the usual percent-of-diameter figures are /2.
"""
import math

ROUND_BRILLIANT = dict(
    table=0.57,          # table width as fraction of diameter
    crown_angle=34.5,    # degrees
    pavilion_angle=40.75,
    girdle=0.06,         # total thickness in radius units (3% of diameter)
    star_length=0.50,    # how far stars reach from table edge to girdle
    lower_half=0.75,     # how far lower girdle facets reach toward the culet
    culet=0.0,           # 0 = pointed
)


def _polar(r, az_deg, y):
    a = math.radians(az_deg)
    return (r * math.cos(a), y, r * math.sin(a))


def brilliant(p=None):
    """Return (verts, faces) for a round brilliant.

    58 facets: 1 table, 8 stars, 8 bezels, 16 upper girdle halves,
    8 pavilion mains, 16 lower girdle halves, plus a 16-sided girdle band.
    Each facet comes out genuinely planar, because every vertex is solved
    onto the facet plane it belongs to rather than placed by eye.
    """
    p = dict(ROUND_BRILLIANT, **(p or {}))
    rt = p['table']
    gt = p['girdle'] / 2.0
    gb = -gt

    ca = math.radians(p['crown_angle'])
    pa = math.radians(p['pavilion_angle'])

    crown_h = (1.0 - rt) * math.tan(ca)
    y_table = gt + crown_h

    # Bezel plane at azimuth 0: slope == crown angle, through the girdle.
    nb = (math.cos(math.pi / 2 - ca), math.sin(math.pi / 2 - ca))   # (radial, y)
    db = nb[0] * 1.0 + nb[1] * gt

    # Star apex rides on that bezel plane, at the requested star length.
    r_edge = rt * math.cos(math.radians(22.5))
    r_star = r_edge + p['star_length'] * (1.0 - r_edge)
    y_star = (db - nb[0] * r_star * math.cos(math.radians(22.5))) / nb[1]

    # Pavilion main plane at azimuth 0.
    np_ = (math.cos(math.pi / 2 - pa), -math.sin(math.pi / 2 - pa))
    dp = np_[0] * 1.0 + np_[1] * gb
    y_culet = dp / np_[1]

    # Lower girdle junction rides on the pavilion main plane.
    r_low = 1.0 - p['lower_half']
    y_low = (dp - np_[0] * r_low * math.cos(math.radians(22.5))) / np_[1]

    V = []

    def add(v):
        V.append(v)
        return len(V) - 1

    table = [add(_polar(rt, k * 45.0, y_table)) for k in range(8)]
    star = [add(_polar(r_star, k * 45.0 + 22.5, y_star)) for k in range(8)]
    g_top = [add(_polar(1.0, k * 22.5, gt)) for k in range(16)]
    g_bot = [add(_polar(1.0, k * 22.5, gb)) for k in range(16)]
    low = [add(_polar(r_low, k * 45.0 + 22.5, y_low)) for k in range(8)]
    culet = add((0.0, y_culet, 0.0))

    F = []
    G = {}

    def mark(name):
        G[name] = (len(F), None)

    def close(name):
        G[name] = (G[name][0], len(F))

    mark('table')
    F.append(list(reversed(table)))                                   # table
    close('table')

    mark('star')

    for k in range(8):                                                # stars
        F.append([table[k], star[k], table[(k + 1) % 8]])

    close('star')

    mark('bezel')
    for k in range(8):                                                # bezels
        F.append([table[k], star[(k - 1) % 8], g_top[2 * k], star[k]])

    close('bezel')

    mark('upper_half')
    for k in range(8):                                                # upper halves
        F.append([star[k], g_top[(2 * k + 1) % 16], g_top[2 * k]])
        F.append([star[k], g_top[(2 * k + 2) % 16], g_top[(2 * k + 1) % 16]])

    close('upper_half')

    mark('girdle')
    for i in range(16):                                               # girdle band
        j = (i + 1) % 16
        F.append([g_top[i], g_top[j], g_bot[j], g_bot[i]])

    close('girdle')

    mark('pavilion')
    for k in range(8):                                                # pavilion mains
        F.append([g_bot[2 * k], low[(k - 1) % 8], culet, low[k]])

    close('pavilion')

    mark('lower_half')
    for k in range(8):                                                # lower halves
        F.append([low[k], g_bot[2 * k], g_bot[(2 * k + 1) % 16]])
        F.append([low[k], g_bot[(2 * k + 1) % 16], g_bot[(2 * k + 2) % 16]])

    close('lower_half')

    return V, F, G


def shaped(outline='round', p=None):
    """A brilliant carried onto another outline.

    Oval, marquise and cushion are the round stone scaled in the girdle plane.
    The pear is different: one end stays round and the other is drawn into a
    point, so each vertex is pulled toward the long axis by how close it sits
    to the tip. Tip is at +x, length 2, length-to-width about 1.5.
    """
    if outline == 'step':
        return step_cut()
    V, F, G = brilliant(p)
    if outline == 'round':
        return V, F, G
    if outline == 'pear':
        out = []
        for (x, y, z) in V:
            th = math.atan2(z, x) % (2 * math.pi)       # 0 at the tip
            pinch = abs(math.sin(th / 2.0)) ** 0.72
            out.append((x, y * 0.62, z * pinch * 0.78))   # depth ~62% of the true widest point
        return out, F, G
    # Depth scales with the narrower outline too: an oval cut keeps a round
    # stone's full depth and comes out ~85% deep, dark and heavy, where real
    # ovals sit near 60%.
    sx, sz, sy = {'oval': (1.00, 0.72, 0.74), 'marquise': (1.00, 0.50, 0.55), 'cushion': (0.94, 0.94, 0.96)}[outline]
    return [(x * sx, y * sy, z * sz) for (x, y, z) in V], F, G


def step_cut(length=1.0, width=0.72, corner=0.26):
    """Emerald (step) cut: a cut-cornered rectangle with facets in parallel steps.

    Every tier is the same octagon scaled about the centre, so each step facet
    between two tiers is a true flat trapezoid. Returns the same (V, F, G) shape
    as brilliant(), with the long axis on x and the table up the y axis.
    """
    a, b, c = length, width, corner
    outline = [(a - c, b), (a, b - c), (a, -(b - c)), (a - c, -b),
               (-(a - c), -b), (-a, -(b - c)), (-a, b - c), (-(a - c), b)]
    g = 0.035
    # (scale, height): table, two crown steps, girdle, three pavilion steps, keel.
    # Pavilion steps at 58, 50 and 43 degrees across the width. Shallower than
    # that and light falls straight out of the bottom, leaving a dead grey
    # window in the middle of the table. The last tier closes to a keel line
    # along the length, as on a real emerald cut, rather than to a point.
    # Steps fall at 48, 44 and 40 degrees across the width. Too deep and the
    # light goes out through the far side (a dark, extinct centre); too
    # shallow and it falls out of the bottom (a grey window). Total depth
    # lands near 68% of the width, which is where cutters put it.
    tiers = [(0.60, 0.60, g + 0.30), (0.80, 0.80, g + 0.19), (1.00, 1.00, g), (1.00, 1.00, -g),
             (0.70, 0.70, -g - 0.240), (0.42, 0.40, -g - 0.449), (0.30, 0.06, -g - 0.654)]
    V, rings = [], []
    for sx, sz, h in tiers:
        ring = []
        for (x, z) in outline:
            V.append((x * sx, h, z * sz)); ring.append(len(V) - 1)
        rings.append(ring)
    F, G = [], {}
    G['table'] = (0, 1); F.append(list(reversed(rings[0])))
    def band(i):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(8):
            j = (k + 1) % 8
            F.append([r0[k], r0[j], r1[j], r1[k]])
    start = len(F); band(0); band(1); G['crown'] = (start, len(F))
    start = len(F); band(2); G['girdle'] = (start, len(F))
    start = len(F); band(3); band(4); band(5); G['pavilion'] = (start, len(F))
    F.append(list(rings[6]))
    return V, F, G
