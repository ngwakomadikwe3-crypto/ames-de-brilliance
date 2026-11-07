// AMES CAD analysis: pure geometry shared by the browser converter and the server check.
// Everything here works on world-space triangle soups in millimetres (no DOM, no three.js scene).
import { ANY_GEM_WORD, deduceGem, isSurfaceGem, type GemGuess } from './gems';

export type Vec3 = [number, number, number];
export type Cut = 'round' | 'oval' | 'pear' | 'cushion' | 'radiant';
/** A source part: one mesh of the CAD file, flattened to world-space triangles (mm).
 * hint: every name around it (for sorting); own: only its own object, layer and material names
 * (for the stone type, so a "Ruby halo ring" group does not turn its diamonds into rubies). */
export type SourcePart = { name: string; hint: string; own?: string; color: Vec3 | null; positions: Float32Array };
export type Shell = { part: number; triangles: Uint32Array; vertexCount: number; min: Vec3; max: Vec3 };
/** A stone found in the design, in its own frame: +y is the table, +z the length (pear: toward the point).
 * cut: an AMES studio cut that replaces the facets, or null to keep the jeweller's own facets (shape names it). */
export type Stone = { part: number; shell: number; cut: Cut | null; shape: string; width: number; length: number; depth: number;
  center: Vec3; x: Vec3; y: Vec3; z: Vec3; melee: boolean; reason: string; gem: GemGuess };
const STUDIO_CUTS = new Set<string>(['round', 'oval', 'pear', 'cushion', 'radiant']);
/** Cut shapes named in CAD object, layer or material names. */
const SHAPE_WORDS: [RegExp, string][] = [[/princess|square[\s_-]*brilliant/i, 'princess'], [/asscher/i, 'asscher'], [/emerald[\s_-]*cut|step[\s_-]*cut|octagon/i, 'emerald cut'],
  [/baguette/i, 'baguette'], [/marquise|navette/i, 'marquise'], [/heart/i, 'heart'], [/trillion|trilliant|triangle/i, 'trillion'], [/cabochon|\bcab\b/i, 'cabochon'],
  [/rose[\s_-]*cut/i, 'rose cut'], [/briolette|\bbeads?\b|sphere|\bball\b/i, 'bead'], [/radiant/i, 'radiant'], [/cushion/i, 'cushion'], [/\bpear\b|teardrop/i, 'pear'], [/\boval\b/i, 'oval'], [/\bround\b/i, 'round']];

const GEM_WORDS = new RegExp(ANY_GEM_WORD.source + '|crystal|rhinestone', 'i');
const METAL_WORDS = /gold|platinum|silver|metal|alloy|rhodium|palladium|titanium|steel|prong|claw|shank|band|setting|head|gallery|basket|bezel|bail|chain|link|clasp|post|hook|wire|mount/i;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const normalize = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Weld coincident vertices (0.001 mm grid) and split each part into connected shells. */
export function splitShells(parts: SourcePart[]): Shell[] {
  const shells: Shell[] = [];
  parts.forEach((part, partIndex) => {
    const p = part.positions, vertCount = p.length / 3, triCount = vertCount / 3;
    if (!triCount) return;
    // Open-addressing hash of quantised positions → welded vertex id.
    let size = 1; while (size < vertCount * 2) size <<= 1;
    const table = new Int32Array(size).fill(-1), ids = new Int32Array(vertCount), keys: number[] = [];
    let next = 0;
    for (let v = 0; v < vertCount; v++) {
      const x = Math.round(p[v * 3] * 1000), y = Math.round(p[v * 3 + 1] * 1000), z = Math.round(p[v * 3 + 2] * 1000);
      let h = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0) & (size - 1);
      for (;;) {
        const slot = table[h];
        if (slot < 0) { table[h] = next; keys.push(x, y, z); ids[v] = next++; break; }
        if (keys[slot * 3] === x && keys[slot * 3 + 1] === y && keys[slot * 3 + 2] === z) { ids[v] = slot; break; }
        h = (h + 1) & (size - 1);
      }
    }
    const parent = new Int32Array(next); for (let i = 0; i < next; i++) parent[i] = i;
    const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const unite = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (let t = 0; t < triCount; t++) { unite(ids[t * 3], ids[t * 3 + 1]); unite(ids[t * 3], ids[t * 3 + 2]); }
    const groups = new Map<number, number[]>();
    for (let t = 0; t < triCount; t++) { const r = find(ids[t * 3]); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(t); }
    for (const tris of groups.values()) {
      const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity], seen = new Set<number>();
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const v = t * 3 + k; seen.add(ids[v]);
        for (let a = 0; a < 3; a++) { const c = p[v * 3 + a]; if (c < min[a]) min[a] = c; if (c > max[a]) max[a] = c; }
      }
      shells.push({ part: partIndex, triangles: Uint32Array.from(tris), vertexCount: seen.size, min, max });
    }
  });
  return shells;
}

/** Symmetric 3x3 eigen-decomposition (Jacobi). Returns eigenvectors sorted by ascending eigenvalue. */
export function eigen3(m: number[][]): { values: number[]; vectors: Vec3[] } {
  const a = m.map(r => [...r]), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 32; sweep++) {
    let off = 0; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += a[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-20) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  return { values: order.map(i => a[i][i]), vectors: order.map(i => normalize([v[0][i], v[1][i], v[2][i]])) };
}

/** Unique vertices of a shell (up to `limit`, evenly strided). */
function shellPoints(part: SourcePart, shell: Shell, limit = 6000): Vec3[] {
  const p = part.positions, out: Vec3[] = [], seen = new Set<string>();
  const stride = Math.max(1, Math.floor(shell.triangles.length * 3 / limit));
  for (let i = 0; i < shell.triangles.length * 3; i += stride) {
    const v = shell.triangles[Math.floor(i / 3)] * 3 + (i % 3), key = `${p[v * 3].toFixed(4)},${p[v * 3 + 1].toFixed(4)},${p[v * 3 + 2].toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); out.push([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]); }
  }
  return out;
}
function triangle(part: SourcePart, t: number): [Vec3, Vec3, Vec3] {
  const p = part.positions, o = t * 9;
  return [[p[o], p[o + 1], p[o + 2]], [p[o + 3], p[o + 4], p[o + 5]], [p[o + 6], p[o + 7], p[o + 8]]];
}
/** 2D convex hull area (monotone chain). */
function hullArea(points: [number, number][]) {
  if (points.length < 3) return 0;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list: [number, number][]) => { const h: [number, number][] = []; for (const p of list) { while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  const hull = [...chain(pts), ...chain([...pts].reverse())];
  let area = 0; for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; area += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(area) / 2;
}

/**
 * Decide whether a shell is a cut stone and, if so, find its table, outline and cut.
 * A faceted stone is a small closed convex solid with a large flat table on one side,
 * a pointed pavilion on the other and many facet directions. Names override geometry.
 */
export function analyseStone(part: SourcePart, shell: Shell, partIndex: number, shellIndex: number): Stone | null {
  const named = GEM_WORDS.test(part.hint) ? 'gem' : METAL_WORDS.test(part.hint) ? 'metal' : '';
  if (named === 'metal' || shell.triangles.length > 30000 || shell.triangles.length < 8) return null;
  const pts = shellPoints(part, shell);
  if (pts.length < 6) return null;
  const c: Vec3 = [0, 0, 0]; for (const q of pts) { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) { const d = sub(q, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
  const { vectors } = eigen3(cov);
  let y = vectors[0];
  // Extents along the thin axis and flat area near each end.
  let lo = Infinity, hi = -Infinity; for (const q of pts) { const h = dot(sub(q, c), y); if (h < lo) lo = h; if (h > hi) hi = h; }
  const depth = hi - lo; if (depth <= 0) return null;
  let flatHi = 0, flatLo = 0, area = 0, signedVolume = 0; const normals = new Set<string>();
  for (const t of shell.triangles) {
    const [a, b, d] = triangle(part, t), n = cross(sub(b, a), sub(d, a)), ar = len(n) / 2; if (!ar) continue;
    area += ar; signedVolume += dot(a, cross(b, d)) / 6;
    const nn = scale(n, 1 / (2 * ar)); normals.add(nn.map(v => Math.round(v * 12)).join(','));
    if (Math.abs(dot(nn, y)) > 0.995) {
      const h = (dot(sub(a, c), y) + dot(sub(b, c), y) + dot(sub(d, c), y)) / 3;
      if (h > hi - depth * 0.04) flatHi += ar; else if (h < lo + depth * 0.04) flatLo += ar;
    }
  }
  if (flatLo > flatHi) { y = scale(y, -1); [flatHi, flatLo] = [flatLo, flatHi]; [lo, hi] = [-hi, -lo]; }
  // In-plane frame: z along the longer outline direction.
  let z = normalize(sub(vectors[2], scale(y, dot(vectors[2], y)))), x = cross(y, z);
  const extent = (axis: Vec3) => { let a = Infinity, b = -Infinity; for (const q of pts) { const v = dot(sub(q, c), axis); if (v < a) a = v; if (v > b) b = v; } return b - a; };
  if (extent(x) > extent(z)) { const nz = x; x = scale(z, -1); z = nz; }
  const xs: number[] = [], zs: number[] = [], plane: [number, number][] = [];
  for (const q of pts) { const d = sub(q, c); const px = dot(d, x), pz = dot(d, z); xs.push(px); zs.push(pz); plane.push([px, pz]); }
  const width = Math.max(...xs) - Math.min(...xs), length = Math.max(...zs) - Math.min(...zs);
  const outlineArea = Math.PI * width * length / 4, hull = hullArea(plane), fill = hull / (width * length);
  const ratio = depth / Math.max(width, 1e-6), table = flatHi / outlineArea;
  const looksCut = table > 0.12 && flatLo < 0.08 * outlineArea && normals.size >= 10 && ratio > 0.28 && ratio < 1.05 && Math.abs(signedVolume) > 0;
  if (!(named === 'gem' || looksCut)) return null;
  const own = part.own ?? part.hint, gem = deduceGem(own, part.color), shapeName = SHAPE_WORDS.find(([re]) => re.test(own))?.[1];
  const base = { part: partIndex, shell: shellIndex, width, length, depth, x, y, z, melee: false, gem };
  const boxCenter = (): Vec3 => { const mx = (Math.max(...xs) + Math.min(...xs)) / 2, mz = (Math.max(...zs) + Math.min(...zs)) / 2;
    return [0, 1, 2].map(a => c[a] + x[a] * mx + y[a] * (lo + hi) / 2 + z[a] * mz) as Vec3; };
  // Cabochons, beads, pearls and opaque stones keep their own surfaces.
  if (!looksCut || isSurfaceGem(gem.id)) {
    const shape = shapeName && !STUDIO_CUTS.has(shapeName) ? shapeName : ratio > 0.8 && flatHi < 0.05 * outlineArea ? 'bead' : 'cabochon';
    return { ...base, cut: null, shape, center: boxCenter(), reason: named === 'gem' ? `named “${part.name}”, kept as modelled` : 'polished stone, kept as modelled' };
  }
  // Step cuts (emerald, asscher, baguette) have facets facing only the outline's sides.
  const azimuths = new Set<number>();
  for (const t of shell.triangles) {
    const [a, b, d] = triangle(part, t), n = normalize(cross(sub(b, a), sub(d, a))), up = Math.abs(dot(n, y));
    if (up > 0.1 && up < 0.99) azimuths.add(Math.round(Math.atan2(dot(n, z), dot(n, x)) / (Math.PI / 18)));
  }
  const stepCut = azimuths.size <= 18, aspect = length / Math.max(width, 1e-6);
  // Pear: the narrow end is the point; point +z toward it.
  const zmin = Math.min(...plane.map(q => q[1])), widthNear = (sign: number) => { const band = plane.filter(q => (sign > 0 ? q[1] - zmin > 0.72 * length : q[1] - zmin < 0.28 * length)); return band.length ? Math.max(...band.map(q => q[0])) - Math.min(...band.map(q => q[0])) : 0; };
  const wTop = widthNear(1), wBottom = widthNear(-1);
  // Width near the very tips: a marquise narrows to points, an oval stays round.
  const tip = (sign: number) => { const band = plane.filter(q => (sign > 0 ? q[1] - zmin > 0.9 * length : q[1] - zmin < 0.1 * length)); return band.length ? Math.max(...band.map(q => q[0])) - Math.min(...band.map(q => q[0])) : 0; };
  const pointed = tip(1) < 0.5 * width && tip(-1) < 0.5 * width;
  const elongated = length / width > 1.1, asym = Math.abs(wTop - wBottom) / Math.max(wTop, wBottom, 1e-6) > 0.25;
  let cut: Cut | null, shape: string;
  if (elongated && asym || shapeName === 'pear') { cut = 'pear'; if (wTop > wBottom) { z = scale(z, -1); x = scale(x, -1); } }
  else if (aspect > 1.45 && pointed) cut = null;
  else if (fill < 0.6) cut = null;
  else if (fill > 0.965 || (fill > 0.86 && stepCut)) cut = null;
  else if (fill > 0.9) cut = 'radiant';
  else if (fill > 0.83) cut = 'cushion';
  else cut = elongated ? 'oval' : 'round';
  shape = cut || (aspect > 1.45 && pointed ? 'marquise' : fill < 0.6 ? 'trillion'
    : stepCut ? (aspect < 1.12 ? 'asscher' : aspect > 1.7 ? 'baguette' : 'emerald cut') : aspect < 1.12 ? 'princess' : 'rectangular brilliant');
  // A cut named in the file wins over the measured outline.
  if (shapeName) { shape = shapeName; cut = STUDIO_CUTS.has(shapeName) ? shapeName as Cut : null; }
  // Centre on the outline's bounding box (girdle plane between lo and hi).
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2, midZ = (Math.max(...zs) + Math.min(...zs)) / 2;
  const center: Vec3 = [c[0] + x[0] * midX + y[0] * (lo + hi) / 2 + z[0] * midZ, c[1] + x[1] * midX + y[1] * (lo + hi) / 2 + z[1] * midZ, c[2] + x[2] * midX + y[2] * (lo + hi) / 2 + z[2] * midZ];
  return { ...base, x, z, cut, shape, center,
    reason: (named === 'gem' ? `named “${part.name}”` : `faceted solid with a table (${Math.round(table * 100)}% of outline)`) + (cut ? '' : `, ${shape} kept with its own facets`) };
}

export type Analysis = { stones: Stone[]; metalShells: number[]; size: Vec3; triangles: number };
export function analyse(parts: SourcePart[]): Analysis & { shells: Shell[] } {
  const shells = splitShells(parts), stones: Stone[] = [], metalShells: number[] = [];
  shells.forEach((shell, i) => { const s = analyseStone(parts[shell.part], shell, shell.part, i); if (s) stones.push(s); else metalShells.push(i); });
  // Melee: small stones in a design that has several of them.
  const largest = Math.max(0, ...stones.map(s => s.width));
  for (const s of stones) s.melee = s.width < 2.4 && (stones.length > 6 || s.width < largest * 0.6);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const sh of shells) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], sh.min[a]); max[a] = Math.max(max[a], sh.max[a]); }
  return { shells, stones, metalShells, size: sub(max, min), triangles: shells.reduce((n, s) => n + s.triangles.length, 0) };
}

/** Pick the unit scale (to mm) for files that do not declare units: jewellery is 4-300 mm. */
export function guessUnitScale(largest: number): { factor: number; unit: 'mm' | 'cm' | 'm' | 'in' } {
  for (const [unit, factor] of [['mm', 1], ['cm', 10], ['in', 25.4], ['m', 1000]] as const) if (largest * factor >= 4 && largest * factor <= 320) return { factor, unit };
  return largest < 4 ? { factor: 1000, unit: 'm' } : { factor: 1, unit: 'mm' };
}

/** Evenly sampled points of the given shells (for category analysis). */
export function samplePoints(parts: SourcePart[], shells: Shell[], which: number[], limit = 40000): Float32Array {
  const total = which.reduce((n, i) => n + shells[i].triangles.length, 0), stride = Math.max(1, total / limit), out: number[] = [];
  let acc = 0;
  for (const i of which) { const sh = shells[i], p = parts[sh.part].positions;
    for (const t of sh.triangles) { acc += 1; if (acc >= stride) { acc -= stride; out.push((p[t * 9] + p[t * 9 + 3] + p[t * 9 + 6]) / 3, (p[t * 9 + 1] + p[t * 9 + 4] + p[t * 9 + 7]) / 3, (p[t * 9 + 2] + p[t * 9 + 5] + p[t * 9 + 8]) / 3); } } }
  return Float32Array.from(out);
}
export { dot, cross, sub, len, scale };
