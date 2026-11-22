// Morph the portrait twin to the customer's own face.
//
// The bust carries MediaPipe's 468 canonical face landmarks twice (public/portrait-twin/face-landmarks-v1.json):
// C, the canonical average face placed in the bust frame, and B, the same landmarks pinned to the bust's skin.
// From the camera we average a few steady, frontal frames of the customer's landmarks, align them to C with a
// similarity transform (so head pose, distance and image scale drop out), and keep what is left: how this face
// differs from the average face, landmark by landmark. Those differences move B, and a smooth Gaussian field carries
// them over the skin around it, fading to nothing away from the face. Pure maths, no three.js: tested by
// scripts/test-face-morph.mjs.

export type P3 = [number, number, number];
export type FaceLandmarkAsset = { C: P3[]; B: P3[] };
export type FaceShape = { version: 1; deltas: P3[] };     // what the device stores: mm, bust frame, one per landmark

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: P3) => Math.hypot(a[0], a[1], a[2]);
const centroid = (ps: P3[]) => mul(ps.reduce(add, [0, 0, 0] as P3), 1 / ps.length);

/** A MediaPipe face landmark (normalised image x, y; z in roughly x's scale, smaller = nearer) in a right-handed,
 *  y-up, z-toward-the-camera frame in pixels. The subject's left lands at +x, as on the bust. */
export function fromImage(l: { x: number; y: number; z: number }, width: number, height: number): P3 {
  return [l.x * width, -l.y * height, -l.z * width];
}

/** Largest eigenvector of a symmetric 4x4 matrix (Jacobi rotations). */
function topEigenvector(m: number[][]): number[] {
  const a = m.map(r => r.slice()), v: number[][] = [0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 4; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 4; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  let best = 0; for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** The similarity (rotation, uniform scale, translation) that best maps `from` onto `to` (Horn's method), applied
 *  to `from`. */
export function alignSimilar(from: P3[], to: P3[]): P3[] {
  const cf = centroid(from), ct = centroid(to);
  const f = from.map(p => sub(p, cf)), t = to.map(p => sub(p, ct));
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < f.length; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += f[i][r] * t[i][c];
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const [w, x, y, z] = topEigenvector(N);
  const R = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
  const rotated = f.map(p => [0, 1, 2].map(r => R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) as P3);
  const scale = Math.sqrt(t.reduce((s, p) => s + p[0] ** 2 + p[1] ** 2 + p[2] ** 2, 0) / Math.max(1e-9, rotated.reduce((s, p) => s + p[0] ** 2 + p[1] ** 2 + p[2] ** 2, 0)));
  return rotated.map(p => add(mul(p, scale), ct));
}

/** How this face differs from the canonical face, per landmark, in mm in the bust frame. Depth from a single camera
 *  is the least certain axis, so it counts for less; any one landmark moves at most `limit` mm. */
export function faceDeltas(user: P3[], asset: FaceLandmarkAsset, { depth = 0.6, limit = 12 } = {}): P3[] {
  const C = asset.C, n = Math.min(user.length, C.length);
  const aligned = alignSimilar(user.slice(0, n), C.slice(0, n));
  const raw = aligned.map((p, i) => { const d = sub(p, C[i]); return [d[0], d[1], d[2] * depth] as P3; });
  const mean = centroid(raw);                                         // nothing global: only the shape changes
  return raw.map(d => { const e = sub(d, mean), l = len(e); return l > limit ? mul(e, limit / l) : e; });
}

/** Average several frames of landmarks (each already from fromImage), landmark by landmark. */
export function averageFrames(frames: P3[][]): P3[] {
  const n = Math.min(...frames.map(f => f.length));
  return Array.from({ length: n }, (_, i) => centroid(frames.map(f => f[i])));
}

/** The displacement field: at any point of the bust (mm), the landmark differences nearby, Gaussian-weighted; it
 *  fades to zero where no landmark is near (the back of the head, the neck), so nothing outside the face moves. */
export function morphField(asset: FaceLandmarkAsset, deltas: P3[], sigma = 11, floor = 0.06) {
  const B = asset.B, k = -1 / (2 * sigma * sigma), reach2 = (3.2 * sigma) ** 2;
  const lo: P3 = [Infinity, Infinity, Infinity], hi: P3 = [-Infinity, -Infinity, -Infinity];
  for (const b of B) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], b[j]); hi[j] = Math.max(hi[j], b[j]); }
  const reach = Math.sqrt(reach2);
  return (p: P3): P3 => {
    if (p[0] < lo[0] - reach || p[0] > hi[0] + reach || p[1] < lo[1] - reach || p[1] > hi[1] + reach || p[2] < lo[2] - reach || p[2] > hi[2] + reach) return [0, 0, 0];
    let wx = 0, wy = 0, wz = 0, ws = 0;
    for (let i = 0; i < B.length; i++) {
      const dx = p[0] - B[i][0], dy = p[1] - B[i][1], dz = p[2] - B[i][2], r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > reach2) continue;
      const w = Math.exp(r2 * k), d = deltas[i];
      wx += w * d[0]; wy += w * d[1]; wz += w * d[2]; ws += w;
    }
    const s = 1 / (ws + floor);
    return [wx * s, wy * s, wz * s];
  };
}

/** Is a set of frames steady enough to trust (the face held still)? Mean landmark jitter after alignment, in mm. */
export function jitter(frames: P3[][], asset: FaceLandmarkAsset) {
  const aligned = frames.map(f => alignSimilar(f.slice(0, asset.C.length), asset.C));
  const mean = averageFrames(aligned);
  let s = 0, n = 0;
  for (const f of aligned) for (let i = 0; i < f.length; i++) { s += len(sub(f[i], mean[i])); n++; }
  return s / Math.max(1, n);
}

export const FACE_SHAPE_KEY = 'ames-face-shape';
export function readFaceShape(): FaceShape | null {
  try { const v = JSON.parse(localStorage.getItem(FACE_SHAPE_KEY) ?? 'null'); return v?.version === 1 && Array.isArray(v.deltas) ? v : null; } catch { return null; }
}
export function saveFaceShape(deltas: P3[]) {
  try { localStorage.setItem(FACE_SHAPE_KEY, JSON.stringify({ version: 1, deltas: deltas.map(d => d.map(x => Math.round(x * 10) / 10)) })); } catch { /* private mode */ }
}
export function forgetFaceShape() { try { localStorage.removeItem(FACE_SHAPE_KEY); } catch { /* private mode */ } }
