// Sort a piece into its Boutique category from its names and its shape.
import { eigen3, type Vec3 } from './geometry';

export type Category = 'ring' | 'earrings' | 'necklace' | 'bracelet' | 'watch' | 'accessory';
export type Classification = { category: Category; confidence: 'high' | 'medium' | 'low'; reasons: string[] };

const WORDS: [Category, RegExp][] = [
  ['watch', /\b(watch|dial|bezel insert|crown|wristwatch|chronograph|timepiece)\b/i],
  ['earrings', /\b(earrings?|studs?|hoops?|huggies?|drops?|dangles?|ear ?cuffs?|climbers?|jhumkas?)\b/i],
  ['bracelet', /\b(bracelets?|bangles?|tennis|cuffs?|wristband|anklets?)\b/i],
  ['necklace', /\b(necklaces?|pendants?|chains?|chokers?|lockets?|collars?|riviere|lavalier)\b/i],
  ['ring', /\b(rings?|band|solitaire|engagement|signet|eternity|wedding|halo ring)\b/i],
  ['accessory', /\b(brooch|cufflinks?|tie ?(clip|pin|bar)|hair ?pin|tiara|crown jewel|charm|keyring|pin)\b/i],
];

/** Loop test in one plane: points all round a centre with an empty middle. Returns the inner radius or 0. */
function loopRadius(points: Float32Array, u: Vec3, v: Vec3): number {
  const n = points.length / 3; if (n < 50) return 0;
  let cu = 0, cv = 0; const pu = new Float32Array(n), pv = new Float32Array(n);
  for (let i = 0; i < n; i++) { pu[i] = points[i * 3] * u[0] + points[i * 3 + 1] * u[1] + points[i * 3 + 2] * u[2]; pv[i] = points[i * 3] * v[0] + points[i * 3 + 1] * v[1] + points[i * 3 + 2] * v[2]; }
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < n; i++) { minU = Math.min(minU, pu[i]); maxU = Math.max(maxU, pu[i]); minV = Math.min(minV, pv[i]); maxV = Math.max(maxV, pv[i]); }
  // Centre: middle of the hole, estimated from the middle of the bounding box, refined once.
  cu = (minU + maxU) / 2; cv = (minV + maxV) / 2;
  const bins = 48, minR = new Array(bins).fill(Infinity);
  for (let pass = 0; pass < 2; pass++) {
    minR.fill(Infinity);
    for (let i = 0; i < n; i++) { const du = pu[i] - cu, dv = pv[i] - cv, r = Math.hypot(du, dv), b = Math.min(bins - 1, Math.floor((Math.atan2(dv, du) + Math.PI) / (2 * Math.PI) * bins)); if (r < minR[b]) minR[b] = r; }
    if (pass === 0) { // shift the centre toward the middle of the inner boundary
      let su = 0, sv = 0, k = 0;
      for (let b = 0; b < bins; b++) if (Number.isFinite(minR[b])) { const a = (b + 0.5) / bins * 2 * Math.PI - Math.PI; su += Math.cos(a) * minR[b]; sv += Math.sin(a) * minR[b]; k++; }
      if (k) { cu += su / k; cv += sv / k; }
    }
  }
  const covered = minR.filter(Number.isFinite).length; if (covered < bins * 0.85) return 0;
  const sorted = minR.filter(Number.isFinite).sort((a, b) => a - b), inner = sorted[Math.floor(sorted.length * 0.15)];
  const outer = Math.max((maxU - minU), (maxV - minV)) / 2;
  if (inner < outer * 0.35) return 0;
  // Nothing may sit inside the hole.
  let inside = 0; for (let i = 0; i < n; i++) if (Math.hypot(pu[i] - cu, pv[i] - cv) < inner * 0.7) inside++;
  return inside / n < 0.01 ? inner : 0;
}

/** Group points into separate pieces (voxel connectivity, 1.5 mm). */
function clusters(points: Float32Array, voxel = 1.5) {
  const n = points.length / 3, cells = new Map<string, number>(), keys: string[] = [];
  for (let i = 0; i < n; i++) { const k = `${Math.floor(points[i * 3] / voxel)},${Math.floor(points[i * 3 + 1] / voxel)},${Math.floor(points[i * 3 + 2] / voxel)}`; cells.set(k, (cells.get(k) || 0) + 1); keys.push(k); }
  const label = new Map<string, number>(); let count = 0; const sizes: number[] = [], boxes: { min: Vec3; max: Vec3 }[] = [];
  for (const start of cells.keys()) {
    if (label.has(start)) continue; const id = count++; label.set(start, id); const stack = [start];
    while (stack.length) { const k = stack.pop()!, [x, y, z] = k.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const nk = `${x + dx},${y + dy},${z + dz}`; if (cells.has(nk) && !label.has(nk)) { label.set(nk, id); stack.push(nk); } } }
  }
  for (let i = 0; i < count; i++) { sizes.push(0); boxes.push({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }); }
  for (let i = 0; i < n; i++) { const id = label.get(keys[i])!; sizes[id]++; for (let a = 0; a < 3; a++) { boxes[id].min[a] = Math.min(boxes[id].min[a], points[i * 3 + a]); boxes[id].max[a] = Math.max(boxes[id].max[a], points[i * 3 + a]); } }
  return sizes.map((size, i) => ({ size, min: boxes[i].min, max: boxes[i].max })).filter(c => c.size > n * 0.04).sort((a, b) => b.size - a.size);
}

export type ShapeInput = {
  /** Sampled points of the whole piece (metal and stones), mm. */
  points: Float32Array;
  /** Extents (sorted, mm) of each separate metal part, to spot earring posts and similar. */
  metalParts: number[][];
  stones: { width: number }[];
  /** File name, object, layer and material names, and the listing name. */
  names: string;
};

export function classify(input: ShapeInput): Classification {
  const reasons: string[] = [];
  for (const [category, re] of WORDS) { const m = re.exec(input.names); if (m) { reasons.push(`named “${m[0]}”`); return { category, confidence: 'high', reasons }; } }
  const pts = input.points, n = pts.length / 3;
  if (n < 30) return { category: 'accessory', confidence: 'low', reasons: ['too little geometry to judge'] };
  const c: Vec3 = [0, 0, 0]; for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += pts[i * 3 + a] / n;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) { const d = [pts[i * 3] - c[0], pts[i * 3 + 1] - c[1], pts[i * 3 + 2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += d[a] * d[b]; }
  const { vectors } = eigen3(cov);
  // A loop shows in the plane of the two largest axes.
  const inner = loopRadius(pts, vectors[1], vectors[2]) || loopRadius(pts, vectors[0], vectors[2]) || loopRadius(pts, vectors[0], vectors[1]);
  const pieces = clusters(pts);
  const ext = (b: { min: Vec3; max: Vec3 }) => [0, 1, 2].map(a => b.max[a] - b.min[a]).sort((x, y) => y - x);
  if (pieces.length === 2) {
    const [a, b] = pieces.map(ext); const similar = a.every((v, i) => Math.abs(v - b[i]) / Math.max(v, b[i], 0.5) < 0.2);
    if (similar && a[0] < 90) { reasons.push('two matching pieces side by side'); return { category: 'earrings', confidence: 'high', reasons }; }
  }
  if (inner > 0) {
    const d = inner * 2; reasons.push(`a closed loop with a ${d.toFixed(1)} mm opening`);
    if (d >= 12 && d <= 25) return { category: 'ring', confidence: 'high', reasons };
    if (d > 25 && d < 44) return { category: 'bracelet', confidence: 'low', reasons: [...reasons, 'wide for a ring, small for a bracelet'] };
    if (d >= 44 && d <= 95) return { category: 'bracelet', confidence: 'high', reasons };
    if (d > 95) return { category: 'necklace', confidence: 'high', reasons };
  }
  const post = input.metalParts.find(e => e[0] >= 6 && e[0] <= 16 && e[1] <= 1.6 && e[2] >= 0.45 && e[1] / Math.max(e[2], 0.01) < 1.6);
  if (post) { reasons.push(`an ear post about ${post[0].toFixed(0)} mm long`); return { category: 'earrings', confidence: 'medium', reasons }; }
  const size = [0, 1, 2].map(a => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, pts[i * 3 + a]); hi = Math.max(hi, pts[i * 3 + a]); } return hi - lo; }).sort((x, y) => y - x);
  if (size[0] > 150) { reasons.push(`${size[0].toFixed(0)} mm long, the length of a chain`); return { category: 'necklace', confidence: 'medium', reasons }; }
  if (size[0] >= 10 && size[0] <= 65 && input.stones.length) { reasons.push(`a single ${size[0].toFixed(0)} mm piece with stones and no ring opening, read as a pendant`); return { category: 'necklace', confidence: 'low', reasons }; }
  reasons.push('no ring, bracelet, earring or chain shape found');
  return { category: 'accessory', confidence: 'low', reasons };
}
