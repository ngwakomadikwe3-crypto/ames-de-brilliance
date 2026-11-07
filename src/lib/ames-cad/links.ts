// Bracelets: find the repeating links of an uploaded bracelet so the viewer can unclasp it and lay it flat.
// Works on the analysed CAD (world-space mm). A bracelet whose links are separate pieces of metal (or a line
// of repeated stones) is split link by link; a solid bangle or cuff has no links and is left as it is.
import { cross, dot, eigen3, len, normalize, samplePoints, sub, type Analysis, type Shell, type SourcePart, type Vec3 } from './geometry';
import type { Rig } from './rig';

/** One link's frame in the closed bracelet: origin, x along the chain (toward the next link), y outward, z across. */
export type LinkFrame = { order: number; o: Vec3; x: Vec3; y: Vec3; z: Vec3 };
export type BraceletInfo = { links: number; pitch: number; length_mm: number; width_mm: number; clasp: string };
/** The bracelet as moving parts: one per link (ames_link = its place in the flat line, from the clasp). */
export type LinkPlan = Rig & { info: BraceletInfo };

const MIN_LINKS = 12, MAX_LINKS = 400;
const CLASP_WORDS = /clasp|lock|catch|tongue|toggle|lobster|fastener|box[\s_-]*catch/i;
const TAU = Math.PI * 2;

/** Area-weighted centre and surface area of a shell. */
export function shellStats(parts: SourcePart[], sh: Shell): { c: Vec3; area: number } {
  const p = parts[sh.part].positions; let area = 0; const c: Vec3 = [0, 0, 0];
  for (const t of sh.triangles) {
    const o = t * 9, a: Vec3 = [p[o], p[o + 1], p[o + 2]], b: Vec3 = [p[o + 3], p[o + 4], p[o + 5]], d: Vec3 = [p[o + 6], p[o + 7], p[o + 8]];
    const w = len(cross(sub(b, a), sub(d, a))) / 2 || 1e-9; area += w;
    for (let k = 0; k < 3; k++) c[k] += w * (a[k] + b[k] + d[k]) / 3;
  }
  return { c: c.map(v => v / (area || 1)) as Vec3, area };
}

export function planLinks(parts: SourcePart[], a: Analysis & { shells: Shell[] }): LinkPlan | null {
  if (a.shells.length < MIN_LINKS) return null;
  // The bracelet's plane: the two widest directions of its points; the normal is its width.
  const pts = samplePoints(parts, a.shells, a.shells.map((_, i) => i), 24000), n0 = pts.length / 3;
  if (n0 < 100) return null;
  const c: Vec3 = [0, 0, 0]; for (let i = 0; i < pts.length; i++) c[i % 3] += pts[i] / n0;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < pts.length; i += 3) { const d = [pts[i] - c[0], pts[i + 1] - c[1], pts[i + 2] - c[2]]; for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) cov[r][s] += d[r] * d[s] / n0; }
  const { vectors } = eigen3(cov), n = vectors[0], u = vectors[2], v = normalize(cross(n, u));
  const angle = (p: Vec3) => { const d = sub(p, c), t = Math.atan2(dot(d, v), dot(d, u)); return t < 0 ? t + TAU : t; };
  const radius = (p: Vec3) => { const d = sub(p, c); return Math.hypot(dot(d, u), dot(d, v)); };
  // It must be a closed loop: hollow in the middle and going all the way round.
  const radii: number[] = [], bins = new Set<number>(); let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { const p: Vec3 = [pts[i], pts[i + 1], pts[i + 2]]; radii.push(radius(p)); bins.add(Math.floor(angle(p) / TAU * 36) % 36); const h = dot(sub(p, c), n); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  radii.sort((x, y) => x - y); const R = radii[radii.length >> 1];
  if (R < 15 || R > 80 || radii.filter(r => r < 0.55 * R).length > 0.04 * radii.length || bins.size < 30) return null;

  // Repeated pieces (a CAD array): same triangle count and surface, all round the loop. The fewest that
  // still go evenly round the bracelet are its links (claws repeat four times a link; baskets once).
  const stats = a.shells.map(sh => shellStats(parts, sh)), groups = new Map<string, number[]>();
  const stoneShells = new Set(a.stones.map(s => s.shell));
  a.shells.forEach((sh, i) => { const key = `${stoneShells.has(i) ? 's' : 'm'}|${sh.triangles.length}|${Math.round(stats[i].area * 4)}`; let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(i); });
  const candidates = [...groups.values()].filter(g => g.length >= MIN_LINKS && g.length <= MAX_LINKS * 4).sort((x, y) => x.length - y.length || stats[y[0]].area - stats[x[0]].area);
  let best: { anchors: { t: number; p: Vec3 }[]; odd: number } | null = null;
  for (const group of candidates) {
    const items = group.map(i => ({ t: angle(stats[i].c), p: stats[i].c, r: radius(stats[i].c) }));
    if (items.some(x => x.r < 0.7 * R || x.r > 1.35 * R)) continue;
    items.sort((x, y) => x.t - y.t);
    // Pieces side by side across the width (a double row) belong to the same link.
    const near = 0.3 * TAU / items.length, clusters: (typeof items)[] = [];
    for (const x of items) { const last = clusters[clusters.length - 1]; if (last && x.t - last[last.length - 1].t < near) last.push(x); else clusters.push([x]); }
    if (clusters.length > 1) { const first = clusters[0], last = clusters[clusters.length - 1]; if (first[0].t + TAU - last[last.length - 1].t < near) { clusters[0] = [...last.map(x => ({ ...x, t: x.t - TAU })), ...first]; clusters.pop(); } }
    if (clusters.length < MIN_LINKS || clusters.length > MAX_LINKS) continue;
    const found = clusters.map(cl => { const p: Vec3 = [0, 0, 0]; for (const x of cl) for (let k = 0; k < 3; k++) p[k] += x.p[k] / cl.length; return { t: angle(p), p }; }).sort((x, y) => x.t - y.t);
    const gaps = found.map((x, i) => ((found[(i + 1) % found.length].t - x.t) + TAU) % TAU || TAU), g = [...gaps].sort((x, y) => x - y)[gaps.length >> 1];
    // Evenly spaced, allowing one wider gap where the clasp sits.
    const odd = gaps.filter(x => x < 0.6 * g || x > 1.5 * g).length;
    if (odd > 2 || Math.max(...gaps) > 3.5 * g) continue;
    // A full set (no piece missing at the clasp) beats one with a gap; then the fewest pieces.
    if (!best || odd < best.odd) best = { anchors: found, odd };
    if (!odd) break;
  }
  const anchors = best?.anchors;
  if (!anchors) return null;
  const N = anchors.length, ts = anchors.map(x => x.t);
  // Nearest link by angle (binary search over the sorted link angles).
  const linkOfAngle = (t: number) => {
    let l = 0, h = N; while (l < h) { const m = (l + h) >> 1; if (ts[m] < t) l = m + 1; else h = m; }
    const after = l % N, before = (l - 1 + N) % N, d = (x: number) => Math.min(Math.abs(t - ts[x]), TAU - Math.abs(t - ts[x]));
    return d(after) < d(before) ? after : before;
  };
  const linkOf = (p: Vec3) => linkOfAngle(angle(p));

  // Every piece goes with its nearest link; a piece longer than a third of the bracelet is cut link by link.
  const shellLink = new Int32Array(a.shells.length), triangleLink = new Map<number, Uint16Array>(), metalOf = new Float64Array(N), named = new Float64Array(N);
  const metal = new Set(a.metalShells);
  a.shells.forEach((sh, i) => {
    const extent = len(sub(sh.max, sh.min)), isMetal = metal.has(i), clasp = CLASP_WORDS.test(parts[sh.part].hint);
    if (extent > 0.66 * R) {
      const p = parts[sh.part].positions, list = new Uint16Array(sh.triangles.length);
      sh.triangles.forEach((t, j) => { const o = t * 9; list[j] = linkOf([(p[o] + p[o + 3] + p[o + 6]) / 3, (p[o + 1] + p[o + 4] + p[o + 7]) / 3, (p[o + 2] + p[o + 5] + p[o + 8]) / 3]); if (isMetal) metalOf[list[j]]++; });
      shellLink[i] = -1; triangleLink.set(i, list);
    } else { const k = linkOf(stats[i].c); shellLink[i] = k; if (isMetal) metalOf[k] += sh.triangles.length; if (clasp) named[k] += sh.triangles.length; }
  });

  // Where it opens: beside the clasp (named in the CAD, or the heaviest link), else at the widest gap.
  const gapAfter = (k: number) => ((ts[(k + 1) % N] - ts[k]) + TAU) % TAU;
  const median = [...metalOf].sort((x, y) => x - y)[N >> 1] || 1;
  let open = -1, clasp = '';
  const namedMax = Math.max(...named), heavyMax = Math.max(...metalOf);
  const from = namedMax > 0 ? named : heavyMax > 1.8 * median ? metalOf : null;
  if (from) {
    const k = from.indexOf(Math.max(...from)), prev = (k - 1 + N) % N, next = (k + 1) % N;
    // A box clasp spans two links (tongue and box): open between them; otherwise on the wider side.
    open = from[next] > from[prev] ? k : from[prev] > from[next] ? prev : gapAfter(k) >= gapAfter(prev) ? k : prev;
    const words = a.shells.filter((_, i) => shellLink[i] === k || shellLink[i] === next || shellLink[i] === prev).map(sh => parts[sh.part].hint).join(' ');
    clasp = /lobster/i.test(words) ? 'lobster clasp' : /toggle/i.test(words) ? 'toggle clasp' : /box/i.test(words) ? 'box clasp' : 'clasp';
    if (/figure[\s_-]*(8|eight)|safety/i.test(words)) clasp += ' with figure-eight safety';
  } else { let best = -1; for (let k = 0; k < N; k++) if (gapAfter(k) > best) { best = gapAfter(k); open = k; } }

  // Frames: y points out from the centre, x along the chain toward the next link (increasing angle).
  let perimeter = 0; for (let k = 0; k < N; k++) perimeter += len(sub(anchors[(k + 1) % N].p, anchors[k].p));
  const frames: LinkFrame[] = anchors.map((x, k) => {
    const d = sub(x.p, c), r = normalize(sub(d, n.map(q => q * dot(d, n)) as Vec3)), tx = normalize(cross(n, r));
    return { order: (k - (open + 1) + N) % N, o: x.p, x: tx, y: r, z: cross(tx, r) };
  });
  const pitch = perimeter / N, round = (x: number, k = 10) => Math.round(x * k) / k;
  const info: BraceletInfo = { links: N, pitch: round(pitch, 1000), length_mm: round(N * pitch), width_mm: round(hi - lo), clasp };
  return { nodes: frames.map(f => ({ name: `Bracelet link ${f.order + 1}`, parent: -1, o: f.o, x: f.x, y: f.y, z: f.z, extras: { ames_link: f.order } })),
    shellNode: shellLink.map(k => k < 0 ? -2 : k), triangleNode: triangleLink, nodeOf: linkOf, extras: { ames_bracelet: info }, info };
}
