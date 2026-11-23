// System 1 — true face reconstruction, the licence-free route (FLAME, under DECA/EMOCA, is non-commercial): the
// parametric head is first solved with its identity morphs (portrait-fit.ts), then refined PER VERTEX toward the
// customer's own scan, so it carries what no morph can: this nose's exact line, this jaw, this asymmetry.
//
//   1. For each of MediaPipe's 468 face landmarks, every frame says where it really is. Each frame's offset from the
//      solved head is taken in that frame's camera space, where x and y are sharp and depth is soft (a single photo's
//      depth regresses toward an average face), so depth counts little; the profiles see one side well and the other
//      side barely. One 3x3 weighted least squares per landmark joins the frames: the front fixes x and y, the
//      profiles fix depth.
//   2. Clean-up, so noise never becomes shape: a soft threshold (sub-millimetre offsets are detector noise), a
//      smoothing over neighbouring landmarks, a cap on size, and no change at all around the eyes (the eyeballs are
//      rigid; the lids must stay on them).
//   3. The landmark offsets spread to every skin vertex as a smooth field (normalised Gaussian weights) that fades to
//      nothing away from the face, so the scalp, ears, neck and every jewellery anchor stay where the rig has them.
//
// The record is small (landmark positions and offsets, 0.1 mm) and saved with the twin. Flag 'face-refine'; with it off,
// or with no record, the twin is the morph solve alone.
import type { P3 } from './face-morph';
import type { Pose, ScanFrame } from './portrait-fit';

export type FaceRefine = { v: 1; at: number[]; d: number[] };    // 468 x 3 each, mm, the head's frame (base scale)

export const REFINE = {
  depthWeight: 0.08,       // camera depth vs x/y
  profileFar: 0.1,         // the far side of a profile
  noiseMm: 0.3,            // soft threshold: offsets below this are detector noise
  smoothMm: 5,             // neighbour smoothing radius
  maxMm: 7,                // cap on any offset
  eyeQuietMm: [7, 15] as [number, number],   // no change within 7 mm of an eye opening, full change beyond 15 mm
  spreadMm: 6,             // the field's Gaussian width over the skin
};
const N = 468;
const EYES = [[33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]].flat();

function solve3(A: number[], b: number[]): P3 | null {
  const [a, b1, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b1 * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [e * i - f * h, c * h - b1 * i, b1 * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b1 * g - a * h, a * e - b1 * d];
  return [0, 1, 2].map(r => (inv[r * 3] * b[0] + inv[r * 3 + 1] * b[1] + inv[r * 3 + 2] * b[2]) / det) as P3;
}

/** Each landmark's offset from `head` (head frame, mm) that best explains every frame, before any clean-up; and how
 *  much evidence each had. `poses` map `head` into each frame. */
export function landmarkOffsets(head: P3[], frames: ScanFrame[], poses: Pose[], opt = REFINE) {
  const raw: P3[] = [], conf: number[] = [];
  for (let i = 0; i < N; i++) {
    const A = new Array(9).fill(0), b = [0, 0, 0]; let wsum = 0;
    frames.forEach((f, fi) => {
      if (f.kind === 'smile' || !f.points[i]) return;
      const { R, s, t } = poses[fi], L = head[i];
      // visibility: a profile sees the side turned to it (head +x toward the camera when R[2][0] > 0)
      const toward = R[2][0], profile = f.kind === 'left' || f.kind === 'right' || f.kind === 'sweep';
      const vis = !profile || Math.abs(L[0]) < 12 || Math.sign(L[0]) === Math.sign(toward) ? 1 : opt.profileFar;
      const pred = [0, 1, 2].map(r => s * (R[r][0] * L[0] + R[r][1] * L[1] + R[r][2] * L[2]) + t[r]);
      const res = [0, 1, 2].map(r => (f.points[i][r] - pred[r]) / s);          // mm, camera axes
      // minimise sum_ax w_ax ((R d)_ax - res_ax)^2  ->  (R^T W R) d = R^T W res
      for (let ax = 0; ax < 3; ax++) {
        const w = vis * (ax === 2 ? opt.depthWeight : 1);
        for (let p = 0; p < 3; p++) { b[p] += w * R[ax][p] * res[ax]; for (let q = 0; q < 3; q++) A[p * 3 + q] += w * R[ax][p] * R[ax][q]; }
      }
      wsum += vis;
    });
    for (let p = 0; p < 3; p++) A[p * 4] += 1e-3;                             // a whisper of ridge: no wild axis
    const d = wsum ? solve3(A, b) : null;
    raw.push(d ?? [0, 0, 0]); conf.push(wsum);
  }
  return { raw, conf };
}

/** The per-landmark refinement. `head` = the solved head's landmarks (head frame, mm); `poses` map it into each frame. */
export function solveRefine(head: P3[], frames: ScanFrame[], poses: Pose[], opt = REFINE): FaceRefine {
  const { raw, conf } = landmarkOffsets(head, frames, poses, opt);
  // clean-up: soft threshold, neighbour smoothing, cap, quiet eyes
  const soft = raw.map(d => { const l = Math.hypot(...d), k = l > opt.noiseMm ? (l - opt.noiseMm) / l : 0; return d.map(v => v * k) as P3; });
  const s2 = 2 * opt.smoothMm * opt.smoothMm;
  const smooth = head.slice(0, N).map((p, i) => {
    const acc = [0, 0, 0]; let W = 0;
    for (let j = 0; j < N; j++) { const q = head[j], dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd > 9 * s2) continue;
      const w = Math.exp(-dd / s2) * Math.min(1, conf[j]); W += w; for (let c = 0; c < 3; c++) acc[c] += w * soft[j][c]; }
    return (W ? acc.map(v => v / W) : [0, 0, 0]) as P3; void i;
  });
  const eyePts = EYES.map(i => head[i]), [q0, q1] = opt.eyeQuietMm;
  const d = smooth.map((v, i) => {
    const p = head[i], near = Math.min(...eyePts.map(e => Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])));
    const t = Math.min(1, Math.max(0, (near - q0) / (q1 - q0))), quiet = t * t * (3 - 2 * t);
    const l = Math.hypot(...v), cap = l > opt.maxMm ? opt.maxMm / l : 1;
    return v.map(x => x * cap * quiet) as P3;
  });
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { v: 1, at: head.slice(0, N).flat().map(r1), d: d.flat().map(r1) };
}

/** The refinement's displacement at each point (mm, head frame): a smooth field that fades away from the face. */
export function refineField(points: P3[], r: FaceRefine, spread = REFINE.spreadMm): P3[] {
  const n = r.at.length / 3, s2 = 2 * spread * spread, cut = 9 * s2, floor = Math.exp(-(2.2 ** 2) / 2);
  // a coarse grid over the landmarks so each point only visits its neighbours
  const cell = spread * 3, grid = new Map<string, number[]>(), key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let j = 0; j < n; j++) { const k = key(r.at[j * 3], r.at[j * 3 + 1], r.at[j * 3 + 2]); (grid.get(k) ?? grid.set(k, []).get(k)!).push(j); }
  return points.map(p => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell), acc = [0, 0, 0]; let W = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
      const dd = (p[0] - r.at[j * 3]) ** 2 + (p[1] - r.at[j * 3 + 1]) ** 2 + (p[2] - r.at[j * 3 + 2]) ** 2; if (dd > cut) continue;
      const w = Math.exp(-dd / s2); W += w; acc[0] += w * r.d[j * 3]; acc[1] += w * r.d[j * 3 + 1]; acc[2] += w * r.d[j * 3 + 2];
    }
    // normalised where landmarks are dense (the face); fading to zero where they are not (scalp, ears, neck)
    return (W ? acc.map(v => v / (W + floor)) : [0, 0, 0]) as P3;
  });
}
