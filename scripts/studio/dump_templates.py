"""Write cut-templates.json: flat-shaded triangle soups of every cut, for the GLB recutter."""
import json, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ames_cuts as C
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gems.py')).read()
ns = {}; exec(src[src.index('LOW = {'):src.index('CABS = {')], ns); FACETED = ns['FACETED']

def tri(V, F):
    P, N = [], []
    Vz = [(x, -z, y) for (x, y, z) in V]          # Y-up -> Z-up, table +z
    for f in F:
        pts = [Vz[k] for k in f]
        nx = ny = nz = 0.0
        for a in range(len(pts)):
            p, q = pts[a], pts[(a + 1) % len(pts)]
            nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1])
        L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1; n = (nx / L, ny / L, nz / L)
        c = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
        if n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0:
            pts = pts[::-1]; n = (-n[0], -n[1], -n[2])
        for k in range(1, len(pts) - 1):
            for p in (pts[0], pts[k], pts[k + 1]): P.extend(p); N.extend(n)
    return {'position': P, 'normal': N}

T = {o: tri(*C.shaped(o)[:2]) for o in ('round', 'pear', 'cushion', 'oval', 'step')}
G = {}
for gid, (cut, prop, *_rest) in FACETED.items():
    V, F, _ = C.step_cut() if cut == 'step' else (C.brilliant(prop) if cut == 'round' else C.shaped(cut, prop))
    G[gid] = {'cut': cut, **tri(V, F)}
json.dump({'pieces': T, 'gems': G}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cut-templates.json'), 'w'))
print('templates:', list(T), len(G), 'gems')
