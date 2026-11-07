// Earrings: find the hinges of drop earrings so the viewer can let the drops dangle.
// An earring is a set of touching pieces; along its length, a hinge is a narrow neck (a jump ring or
// link) that no long piece of metal crosses. Everything below a hinge hangs from it, nested hinge by hinge.
import { cross, dot, eigen3, len, normalize, sub, type Analysis, type Shell, type SourcePart, type Vec3 } from './geometry';
import { shellStats } from './links';
import type { Rig, RigNode } from './rig';

const FITTING_WORDS = /(?<![a-z])(hooks?|posts?|lever[\s_-]*backs?|leverbacks?|clips?|butterfl(y|ies)|huggies?|french[\s_-]*wires?|ear[\s_-]*(wires?|backs?|hooks?|posts?)|earwires?|screw[\s_-]*backs?|scrolls?)(?![a-z])/i;
const SLICE = 0.4, MIN_DROP = 10, MAX_SHELLS = 4000;

export function planDangles(parts: SourcePart[], a: Analysis & { shells: Shell[] }): Rig | null {
  const shells = a.shells, n = shells.length;
  if (n < 2 || n > MAX_SHELLS) return null;
  const stats = shells.map(sh => shellStats(parts, sh));
  // Earrings: pieces that touch (bounding boxes within 0.4 mm), small loose bits joined to the nearest earring.
  const up = Array.from({ length: n }, (_, i) => i), find = (i: number): number => up[i] === i ? i : (up[i] = find(up[i]));
  const touch = (p: Shell, q: Shell) => [0, 1, 2].every(k => p.min[k] - 0.4 <= q.max[k] && q.min[k] - 0.4 <= p.max[k]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (find(i) !== find(j) && touch(shells[i], shells[j])) up[find(i)] = find(j);
  const byRoot = new Map<number, number[]>(); for (let i = 0; i < n; i++) { const r = find(i); let l = byRoot.get(r); if (!l) byRoot.set(r, l = []); l.push(i); }
  const box = (list: number[]) => { const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]; for (const i of list) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], shells[i].min[k]); hi[k] = Math.max(hi[k], shells[i].max[k]); } return { lo, hi, size: len(sub(hi, lo)), mid: [0, 1, 2].map(k => (lo[k] + hi[k]) / 2) as Vec3 }; };
  const clusters = [...byRoot.values()].map(list => ({ list, ...box(list) })), biggest = Math.max(...clusters.map(c => c.size));
  const earrings = clusters.filter(c => c.size >= 0.4 * biggest).map(c => ({ list: [...c.list] }));
  for (const c of clusters) if (c.size < 0.4 * biggest) {
    let best = 0, d = Infinity; earrings.forEach((e, k) => { const m = box(e.list).mid, dd = len(sub(m, c.mid)); if (dd < d) { d = dd; best = k; } });
    earrings[best].list.push(...c.list);
  }
  if (earrings.length > 4) return null;

  const metal = new Set(a.metalShells);
  const nodes: RigNode[] = [], shellNode = new Int32Array(n).fill(-1);
  const located: { lo: Vec3; hi: Vec3; c: Vec3; up: Vec3; necks: number[]; first: number }[] = [];
  for (const e of earrings) {
    // Its points (vertices, evenly strided) and its length direction.
    const pts: Vec3[] = [], total = e.list.reduce((s, i) => s + shells[i].triangles.length, 0), stride = Math.max(1, Math.floor(total / 30000));
    let count = 0;
    for (const i of e.list) { const p = parts[shells[i].part].positions; for (const t of shells[i].triangles) if (count++ % stride === 0) for (let k = 0; k < 3; k++) pts.push([p[t * 9 + k * 3], p[t * 9 + k * 3 + 1], p[t * 9 + k * 3 + 2]]); }
    if (pts.length < 60) continue;
    const c: Vec3 = [0, 0, 0]; for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
    const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const p of pts) { const d = sub(p, c); for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) cov[r][s] += d[r] * d[s] / pts.length; }
    const { vectors } = eigen3(cov); let axis = vectors[2];
    // Which end is up: the ear fitting (named), else away from the largest stone, else the file's up.
    const h = (p: Vec3) => dot(sub(p, c), axis);
    // A fitting named on only some parts (a name on every part says nothing about which end is up).
    const named = e.list.filter(i => FITTING_WORDS.test(parts[shells[i].part].own ?? parts[shells[i].part].hint)), fitting = named.length < e.list.length / 2 ? named : [];
    const stones = a.stones.filter(s => e.list.includes(s.shell)).sort((x, y) => y.width * y.length - x.width * x.length);
    const sign = fitting.length ? Math.sign(fitting.reduce((s, i) => s + h(stats[i].c), 0)) : stones.length ? -Math.sign(h(stones[0].center)) : Math.sign(axis[1] || axis[2]);
    if (sign < 0) axis = axis.map(v => -v) as Vec3;
    const hs = pts.map(h), top = Math.max(...hs), bottom = Math.min(...hs);
    if (top - bottom < MIN_DROP + 4) continue;
    // Width profile along the length: the widest of its two cross directions in each 0.4 mm slice.
    const e1 = normalize(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(axis, e1);
    const slices = Math.ceil((top - bottom) / SLICE) + 1, lo1 = new Float64Array(slices).fill(Infinity), hi1 = new Float64Array(slices).fill(-Infinity), lo2 = new Float64Array(slices).fill(Infinity), hi2 = new Float64Array(slices).fill(-Infinity);
    pts.forEach((p, i) => { const k = Math.floor((hs[i] - bottom) / SLICE), d = sub(p, c), u = dot(d, e1), v = dot(d, e2); lo1[k] = Math.min(lo1[k], u); hi1[k] = Math.max(hi1[k], u); lo2[k] = Math.min(lo2[k], v); hi2[k] = Math.max(hi2[k], v); });
    const width = Array.from({ length: slices }, (_, k) => hi1[k] < lo1[k] ? 0 : Math.max(hi1[k] - lo1[k], hi2[k] - lo2[k])), widest = Math.max(...width);
    const window = Math.round(5 / SLICE), at = (k: number) => bottom + (k + 0.5) * SLICE;
    // Long metal that crosses a height: then it is no hinge.
    const crossed = (y: number) => e.list.some(i => { if (!metal.has(i)) return false; const sh = shells[i], corners: number[] = [];
      for (const x of [sh.min[0], sh.max[0]]) for (const yy of [sh.min[1], sh.max[1]]) for (const z of [sh.min[2], sh.max[2]]) corners.push(h([x, yy, z]));
      const a0 = Math.min(...corners), a1 = Math.max(...corners); return a0 < y - 1.2 && a1 > y + 1.2 && len(sub(sh.max, sh.min)) > 5.5; });
    const necks: number[] = [];
    for (let k = window; k < slices - Math.round(3 / SLICE); k++) {
      const w = width[k]; if (w <= 0 || w > 0.4 * widest) continue;
      const above = Math.max(...width.slice(k + 1, k + 1 + window)), below = Math.max(...width.slice(Math.max(0, k - window), k));
      if (w > 0.55 * above || w > 0.55 * below || w > Math.min(...width.slice(Math.max(0, k - 2), k + 3).filter(x => x > 0))) continue;
      const y = at(k); if (top - y < 3 || crossed(y)) continue;
      if (necks.length && Math.abs(necks[necks.length - 1] - y) < 2.5) continue;
      necks.push(y);
    }
    necks.sort((x, y) => y - x); // top first
    while (necks.length > 3) necks.pop();
    if (!necks.length || necks[necks.length - 1] - bottom < 4) { if (necks.length) necks.pop(); }
    if (!necks.length) continue;
    // Pivot of each hinge: the centre of the neck slice.
    const first = nodes.length;
    necks.forEach((y, j) => {
      const s: Vec3 = [0, 0, 0]; let m = 0; pts.forEach((p, i) => { if (Math.abs(hs[i] - y) <= SLICE) { for (let k = 0; k < 3; k++) s[k] += p[k]; m++; } });
      const o = (m ? s.map(v => v / m) : c.map((v, k) => v + axis[k] * y)) as Vec3;
      nodes.push({ name: `Earring ${located.length + 1} drop ${j + 1} (hinged)`, parent: j ? first + j - 1 : -1, o, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], extras: { ames_dangle: { hinge: j + 1 } } });
    });
    const loc = { ...box(e.list), c, up: axis, necks, first };
    located.push(loc);
    // A piece goes below the last hinge above its centre (a jump ring on the hinge goes with what hangs from it).
    for (const i of e.list) { const y = h(stats[i].c), below = necks.filter(t => y - 0.3 < t).length; shellNode[i] = below ? first + below - 1 : -1; }
  }
  if (!nodes.length) return null;
  const nodeOf = (p: Vec3) => {
    let best = -1, d = Infinity;
    located.forEach((l, k) => { const inside = [0, 1, 2].every(q => p[q] >= l.lo[q] - 1 && p[q] <= l.hi[q] + 1), dd = inside ? 0 : len(sub(p, l.c)); if (dd < d) { d = dd; best = k; } });
    if (best < 0) return -1;
    const l = located[best], y = dot(sub(p, l.c), l.up), below = l.necks.filter(t => y - 0.3 < t).length;
    return below ? l.first + below - 1 : -1;
  };
  return { nodes, shellNode, triangleNode: new Map(), nodeOf, extras: {} };
}
