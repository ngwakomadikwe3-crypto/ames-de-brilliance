// Fit the parametric portrait head (public/portrait-twin/portrait-head-v2.glb) to a face scan: every accepted frame
// at once (front, both profiles, chin-up, the sweep), not one frame at a time.
//
// The head's landmarks are linear in its identity morphs: L(w) = L0 + sum_k w_k D_k (each landmark is a fixed point
// of a skin triangle, stored as a UV position). Each scan frame gives MediaPipe's 478 landmarks. Alternate:
//   1. per frame, the similarity (rotation, scale, translation) that best maps the current head onto that frame;
//   2. all frames together, the identity weights that best explain every frame brought back into the head's frame,
//      with depth (the camera's own z, the least certain axis from one photo) counting for less, the far side of a
//      profile counting for less, and the weights bounded and gently pulled toward the average face.
// Pure maths: tested by scripts/test-portrait-fit.mjs on the real head.
import type { P3 } from './face-morph';

export type HeadBasis = {
  names: string[];            // identity morph names, 'id:*'
  L0: Float64Array;           // n landmarks x 3, mm, head frame (x: the figure's left, y up, z out of the face)
  D: Float64Array;            // K x n x 3, mm per unit weight
  n: number;
};
export type FrameKind = 'front' | 'left' | 'right' | 'up' | 'sweep' | 'smile';
export type ScanFrame = { kind: FrameKind; points: P3[] };   // fromImage() pixels: x right, y up, z toward the camera
export type Pose = { R: number[][]; s: number; t: P3 };
export type FitResult = { weights: number[]; poses: Pose[]; residualMm: number[]; landmarks: P3[] };

const N_FACE = 468;           // the iris points (468-477) are for scale, not shape

/** Head landmarks for the given weights. */
export function landmarksAt(b: HeadBasis, w: ArrayLike<number>): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < b.n; i++) {
    let x = b.L0[i * 3], y = b.L0[i * 3 + 1], z = b.L0[i * 3 + 2];
    for (let k = 0; k < w.length; k++) { const wk = w[k]; if (!wk) continue; const o = (k * b.n + i) * 3; x += wk * b.D[o]; y += wk * b.D[o + 1]; z += wk * b.D[o + 2]; }
    out.push([x, y, z]);
  }
  return out;
}

/** Largest eigenvector of a symmetric 4x4 (Jacobi). */
function topEigen(m: number[][]): number[] {
  const a = m.map(r => r.slice()), v: number[][] = [0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 4; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 4; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
    }
  }
  let best = 0; for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** Weighted similarity (Horn): the pose mapping `from` (head) onto `to` (a frame). */
export function similarity(from: P3[], to: P3[], wts?: number[]): Pose {
  const n = from.length, w = wts ?? new Array(n).fill(1); let W = 0;
  const cf: P3 = [0, 0, 0], ct: P3 = [0, 0, 0];
  for (let i = 0; i < n; i++) { W += w[i]; for (let j = 0; j < 3; j++) { cf[j] += w[i] * from[i][j]; ct[j] += w[i] * to[i][j]; } }
  for (let j = 0; j < 3; j++) { cf[j] /= W; ct[j] /= W; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let sf = 0, st = 0;
  for (let i = 0; i < n; i++) {
    const f = [0, 1, 2].map(j => from[i][j] - cf[j]), t = [0, 1, 2].map(j => to[i][j] - ct[j]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += w[i] * f[r] * t[c];
    sf += w[i] * (f[0] ** 2 + f[1] ** 2 + f[2] ** 2); st += w[i] * (t[0] ** 2 + t[1] ** 2 + t[2] ** 2);
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const [q0, q1, q2, q3] = topEigen([[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]]);
  const R = [
    [q0 * q0 + q1 * q1 - q2 * q2 - q3 * q3, 2 * (q1 * q2 - q0 * q3), 2 * (q1 * q3 + q0 * q2)],
    [2 * (q1 * q2 + q0 * q3), q0 * q0 - q1 * q1 + q2 * q2 - q3 * q3, 2 * (q2 * q3 - q0 * q1)],
    [2 * (q1 * q3 - q0 * q2), 2 * (q2 * q3 + q0 * q1), q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3],
  ];
  let num = 0;                                                            // scale: sum w (t . R f) / sum w |f|^2
  for (let i = 0; i < n; i++) {
    const f = [0, 1, 2].map(j => from[i][j] - cf[j]), t = [0, 1, 2].map(j => to[i][j] - ct[j]);
    const rf = [0, 1, 2].map(r => R[r][0] * f[0] + R[r][1] * f[1] + R[r][2] * f[2]);
    num += w[i] * (t[0] * rf[0] + t[1] * rf[1] + t[2] * rf[2]);
  }
  const s = num / Math.max(1e-12, sf);
  const Rc = [0, 1, 2].map(r => R[r][0] * cf[0] + R[r][1] * cf[1] + R[r][2] * cf[2]);
  return { R, s, t: [ct[0] - s * Rc[0], ct[1] - s * Rc[1], ct[2] - s * Rc[2]] };
}
export const applyPose = (p: Pose, x: P3): P3 => [0, 1, 2].map(r => p.s * (p.R[r][0] * x[0] + p.R[r][1] * x[1] + p.R[r][2] * x[2]) + p.t[r]) as P3;
/** A frame point brought back into the head's frame (mm). */
export const unPose = (p: Pose, y: P3): P3 => { const d = [y[0] - p.t[0], y[1] - p.t[1], y[2] - p.t[2]];
  return [0, 1, 2].map(c => (p.R[0][c] * d[0] + p.R[1][c] * d[1] + p.R[2][c] * d[2]) / p.s) as P3; };

/** How much each landmark of a frame counts: a profile sees one side of the face well and the other side not at all. */
function visibility(kind: FrameKind, head: P3[], pose: Pose): number[] {
  if (kind === 'front' || kind === 'smile' || kind === 'up') return head.map(() => 1);
  // the side facing the camera: head x rotated into camera space; the camera looks down -z, so facing = normal-ish x
  const toward = pose.R[2][0];                                            // camera z of the head's +x axis
  return head.map(p => { const side = Math.sign(p[0]) * Math.sign(toward); return Math.abs(p[0]) < 12 ? 1 : side > 0 ? 1 : 0.15; });
}

export type FitOptions = { upper?: number[]; iterations?: number; depthWeight?: number; prior?: number; macro?: number[]; sweeps?: number; macroWeight?: number; profiles?: boolean };

/** Fit identity weights to every frame together. Joint Gauss-Newton over the shape (bounded to [0, 1]) and every
 *  frame's pose (rotation, scale, translation), so pose and shape never chase each other. Residuals are in each
 *  frame's own camera space, in mm (divided by that frame's scale), with the camera's depth counting `depthWeight`. */
export function fitHead(b: HeadBasis, frames: ScanFrame[], opt: FitOptions = {}): FitResult {
  const K = b.names.length, n = Math.min(b.n, N_FACE);
  const macro = opt.macro ?? b.names.map((m, i) => (m.startsWith('id:base-') ? i : -1)).filter(i => i >= 0);
  const used = frames.filter(f => f.kind !== 'smile'), F = used.length, P = K + 7 * F;
  const w = new Float64Array(K); for (const i of macro) w[i] = 1 / macro.length;
  const alpha = opt.depthWeight ?? 0.35;
  let poses: Pose[] = used.map(f => similarity(landmarksAt(b, w).slice(0, n), f.points.slice(0, n)));
  const x = new Float64Array(P), lo = new Float64Array(P).fill(-1e9), hi = new Float64Array(P).fill(1e9);
  for (let k = 0; k < K; k++) { lo[k] = 0; hi[k] = opt.upper?.[k] ?? 1; }        // each target within its sane range
  for (let it = 0; it < (opt.iterations ?? 10); it++) {
    const head = landmarksAt(b, w);
    const A = new Float64Array(P * P), c = new Float64Array(P);
    used.forEach((f, fi) => {
      const pose = poses[fi], R = pose.R, s = pose.s, vis = opt.profiles === false ? head.map(() => 1) : visibility(f.kind, head, pose);
      const ws = 1 / (s * s), off = K + 7 * fi;
      const row = new Float64Array(P);
      for (let i = 0; i < n; i++) {
        const L = head[i], o = f.points[i];
        const RL0 = [0, 1, 2].map(r => R[r][0] * b.L0[i * 3] + R[r][1] * b.L0[i * 3 + 1] + R[r][2] * b.L0[i * 3 + 2]);
        const RL = [0, 1, 2].map(r => R[r][0] * L[0] + R[r][1] * L[1] + R[r][2] * L[2]);
        // -[L]x : rows of the skew matrix of L, times -1
        const Lx = [[0, L[2], -L[1]], [-L[2], 0, L[0]], [L[1], -L[0], 0]];
        for (let ax = 0; ax < 3; ax++) {
          const wt = vis[i] * ws * (ax === 2 ? alpha : 1);
          if (!wt) continue;
          row.fill(0);
          // shape: s R D_k ; the residual target for absolute weights is o - s R L0 - t
          for (let k = 0; k < K; k++) { const o3 = (k * b.n + i) * 3; row[k] = s * (R[ax][0] * b.D[o3] + R[ax][1] * b.D[o3 + 1] + R[ax][2] * b.D[o3 + 2]); }
          // pose increments at the current shape: rotation (R (I + [w]x)), scale (1 + ds), translation
          for (let q = 0; q < 3; q++) row[off + q] = s * (R[ax][0] * Lx[0][q] + R[ax][1] * Lx[1][q] + R[ax][2] * Lx[2][q]);
          row[off + 3] = s * RL[ax]; row[off + 4 + ax] = 1;
          const target = o[ax] - s * RL0[ax] - pose.t[ax];
          for (let p = 0; p < P; p++) { const rp = row[p]; if (!rp) continue; c[p] += wt * rp * target; for (let q = p; q < P; q++) if (row[q]) A[p * P + q] += wt * rp * row[q]; }
        }
      }
    });
    for (let p = 0; p < P; p++) for (let q = 0; q < p; q++) A[p * P + q] = A[q * P + p];
    let mean = 0; for (let k = 0; k < K; k++) mean += A[k * P + k]; mean /= K;
    const lam = (opt.prior ?? 0.0005) * mean, mu = (opt.macroWeight ?? 2) * mean;
    for (let k = 0; k < K; k++) A[k * P + k] += lam;
    for (const i of macro) { for (const j of macro) A[i * P + j] += mu; c[i] += mu; }
    for (let p = K; p < P; p++) A[p * P + p] += 1e-6 * (1 + A[p * P + p]);   // a little damping on the pose steps
    for (let k = 0; k < K; k++) x[k] = w[k];
    for (let p = K; p < P; p++) x[p] = 0;
    boundedLeastSquaresBox(A, c, x, P, lo, hi);
    for (let k = 0; k < K; k++) w[k] = x[k];
    poses = poses.map((pose, fi) => {
      const o = K + 7 * fi, om = [x[o], x[o + 1], x[o + 2]], th = Math.hypot(om[0], om[1], om[2]);
      let E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      if (th > 1e-12) { const k3 = om.map(v => v / th), C = Math.cos(th), S = Math.sin(th), V = 1 - C;
        E = [[C + k3[0] * k3[0] * V, k3[0] * k3[1] * V - k3[2] * S, k3[0] * k3[2] * V + k3[1] * S],
             [k3[1] * k3[0] * V + k3[2] * S, C + k3[1] * k3[1] * V, k3[1] * k3[2] * V - k3[0] * S],
             [k3[2] * k3[0] * V - k3[1] * S, k3[2] * k3[1] * V + k3[0] * S, C + k3[2] * k3[2] * V]]; }
      const R = pose.R.map(r => [0, 1, 2].map(cc => r[0] * E[0][cc] + r[1] * E[1][cc] + r[2] * E[2][cc]));
      return { R, s: pose.s * (1 + x[o + 3]), t: [pose.t[0] + x[o + 4], pose.t[1] + x[o + 5], pose.t[2] + x[o + 6]] as P3 };
    });
  }
  const head = landmarksAt(b, w);
  const residualMm = used.map((f, fi) => { let s = 0; for (let i = 0; i < n; i++) { const o = unPose(poses[fi], f.points[i]); s += Math.hypot(o[0] - head[i][0], o[1] - head[i][1]); } return s / n; });
  return { weights: Array.from(w), poses, residualMm, landmarks: head };
}

/** As boundedLeastSquares, with a lower and upper bound per weight. */
export function boundedLeastSquaresBox(A: Float64Array, c: Float64Array, w: Float64Array, K: number, lo: Float64Array, hi: Float64Array) {
  boundedCore(A, c, w, K, lo, hi);
}

/** Solve min 1/2 w'Aw - c'w with lo <= w <= hi exactly (Lawson-Hanson active set, Cholesky on the free weights).
 *  `w` holds a feasible start and receives the answer. */
export function boundedLeastSquares(A: Float64Array, c: Float64Array, w: Float64Array, K: number, lo: number, hi: number) {
  boundedCore(A, c, w, K, new Float64Array(K).fill(lo), new Float64Array(K).fill(hi));
}
function boundedCore(A: Float64Array, c: Float64Array, w: Float64Array, K: number, LO: Float64Array, HI: Float64Array) {
  for (let i = 0; i < K; i++) w[i] = Math.min(HI[i], Math.max(LO[i], w[i]));
  const grad = () => { const g = new Float64Array(K); for (let k = 0; k < K; k++) { let s = c[k]; for (let l = 0; l < K; l++) s -= A[k * K + l] * w[l]; g[k] = s; } return g; };
  const atLo = new Uint8Array(K), atHi = new Uint8Array(K);
  for (let k = 0; k < K; k++) { atLo[k] = w[k] <= LO[k] ? 1 : 0; atHi[k] = w[k] >= HI[k] ? 1 : 0; }
  for (let outer = 0; outer < 4 * K + 20; outer++) {
    // solve on the free set
    for (let inner = 0; inner < 2 * K + 10; inner++) {
      const F: number[] = []; for (let k = 0; k < K; k++) if (!atLo[k] && !atHi[k]) F.push(k);
      if (!F.length) break;
      const n = F.length, M = new Float64Array(n * n), r = new Float64Array(n);
      for (let a = 0; a < n; a++) {
        let s = c[F[a]];
        for (let l = 0; l < K; l++) if (atLo[l] || atHi[l]) s -= A[F[a] * K + l] * w[l];
        r[a] = s;
        for (let bb = 0; bb < n; bb++) M[a * n + bb] = A[F[a] * K + F[bb]];
        M[a * n + a] += 1e-9 * (1 + M[a * n + a]);
      }
      const z = cholSolve(M, r, n); if (!z) break;
      // move toward z, stopping at the first bound
      let step = 1, hit = -1;
      for (let a = 0; a < n; a++) {
        const k = F[a], d = z[a] - w[k];
        if (z[a] < LO[k] && d < 0) { const t = (LO[k] - w[k]) / d; if (t < step) { step = t; hit = k; } }
        if (z[a] > HI[k] && d > 0) { const t = (HI[k] - w[k]) / d; if (t < step) { step = t; hit = k; } }
      }
      for (let a = 0; a < n; a++) w[F[a]] += step * (z[a] - w[F[a]]);
      if (hit < 0) break;
      for (let a = 0; a < n; a++) { const k = F[a]; if (w[k] <= LO[k] + 1e-12) { w[k] = LO[k]; atLo[k] = 1; } else if (w[k] >= HI[k] - 1e-12) { w[k] = HI[k]; atHi[k] = 1; } }
    }
    // release the bound weight whose gradient most wants to come off its bound
    const g = grad(); let best = -1, bestV = 1e-10;
    for (let k = 0; k < K; k++) { const v = atLo[k] ? g[k] : atHi[k] ? -g[k] : 0; if (v > bestV) { bestV = v; best = k; } }
    if (best < 0) return;
    atLo[best] = 0; atHi[best] = 0;
  }
}

function cholSolve(M: Float64Array, r: Float64Array, n: number): Float64Array | null {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = M[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    if (i === j) { if (s <= 0) return null; L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = r[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

/** Calibrate the expression morphs to the customer's own smile: with identity fixed, the mix of expression morphs
 *  that best explains the smile frame's mouth (and cheeks). Returns weights for the expression basis. */
export function fitExpression(identity: P3[], E: { names: string[]; D: Float64Array; n: number }, smile: ScanFrame, ids: number[]): number[] {
  const pose = similarity(ids.map(i => identity[i]), ids.map(i => smile.points[i]));      // pose from the stable upper face
  const K = E.names.length, A = new Float64Array(K * K), c = new Float64Array(K), w = new Array(K).fill(0);
  for (let i = 0; i < Math.min(E.n, N_FACE); i++) {
    const o = unPose(pose, smile.points[i]); const r = [o[0] - identity[i][0], o[1] - identity[i][1], (o[2] - identity[i][2]) * 0.35];
    for (let k = 0; k < K; k++) {
      const ok = (k * E.n + i) * 3; const dk = [E.D[ok], E.D[ok + 1], E.D[ok + 2] * 0.35];
      c[k] += dk[0] * r[0] + dk[1] * r[1] + dk[2] * r[2];
      for (let l = 0; l < K; l++) { const ol = (l * E.n + i) * 3; A[k * K + l] += dk[0] * E.D[ol] + dk[1] * E.D[ol + 1] + dk[2] * E.D[ol + 2] * 0.35; }
    }
  }
  for (let k = 0; k < K; k++) A[k * K + k] += 1e-3 + 0.02 * A[k * K + k];
  for (let sweep = 0; sweep < 300; sweep++) for (let k = 0; k < K; k++) {
    let g = c[k]; for (let l = 0; l < K; l++) if (l !== k) g -= A[k * K + l] * w[l];
    w[k] = Math.min(1.2, Math.max(0, g / A[k * K + k]));
  }
  return w;
}

/** Millimetres per pixel in a front frame from the irises (adult horizontal iris diameter is about 11.7 mm). */
export function irisScale(front: ScanFrame) {
  const p = front.points; if (p.length < 478) return null;
  const diam = (c: number) => (Math.hypot(p[c + 1][0] - p[c + 3][0], p[c + 1][1] - p[c + 3][1]) + Math.hypot(p[c + 2][0] - p[c + 4][0], p[c + 2][1] - p[c + 4][1])) / 2;
  const d = (diam(468) + diam(473)) / 2;
  return d > 4 ? 11.7 / d : null;
}
