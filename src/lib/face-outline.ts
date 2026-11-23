// System 1, the outline fit: the face's own outline in each scan photo (face-segment.ts) moves the head's jaw, cheeks,
// temples and chin; the landmarks keep the features (the morph solve, as before). Neither source touches the other's
// territory. All three capture angles are fitted together.
//
// Each round, per photo: the head's occluding contour (skin vertices in the outline territory whose normal is side-on to
// that camera) is projected with the frame's fitted pose; from each contour point a search along its outward 2D normal
// finds where the photo's face-skin ends; the gap, back in the head's frame, is that vertex's observation. All
// observations of all photos are then spread as ONE smooth field (Gaussian, 10 mm) and smoothed again over the mesh, so
// a single noisy edge can never make a lump; the field is clamped and faded to exactly zero outside the face.
//
// Hard limits: the scalp, ears, neck and every vertex beyond 10 mm of the face's landmarks get exactly zero (the
// eyeballs are separate meshes and are never moved; the lids sit in the feature territory). The result is a sparse
// per-vertex record (FaceRefine v2) baked like the identity.
import type { P3 } from './face-morph';
import type { Pose } from './portrait-fit';
import { SEG, type Segmentation } from './face-segment';

export type OutlineRefine = { v: 2; idx: number[]; d: number[] };    // vertex indices of the head skin, mm offsets (0.01)
export type OutlineView = { pose: Pose; seg: Segmentation; width: number; height: number };

export const OUTLINE = {
  rounds: 3, gain: 0.7,
  contourCos: 0.3,          // |normal . view| below this: side-on, part of the outline
  searchPx: 28,             // how far along the 2D normal the photo's edge is looked for
  spreadMm: 10,             // Gaussian spread of the observations
  laplace: 4,               // mesh smoothing passes of the field
  maxMm: 6,                 // clamp
  faceMm: [4, 10] as [number, number],   // full effect within 4 mm of a landmark, exactly zero beyond 10 mm
};
// the features' territory (landmarks): nose, lips, eyes, brows; the outline never moves these
const NOSE = [1, 2, 4, 5, 6, 19, 94, 97, 98, 326, 327, 195, 197, 48, 278, 64, 294, 115, 344, 220, 440, 45, 275, 168, 122, 351];
const LIPS = [0, 13, 14, 17, 37, 267, 61, 291, 78, 308, 39, 269, 40, 270, 84, 314, 91, 321, 146, 375, 181, 405, 81, 311, 82, 312, 87, 317];
const EYES = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
const BROWS = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 46, 53, 52, 65, 55, 276, 283, 282, 295, 285];
const FEATURES: [number[], number][] = [[NOSE, 13], [LIPS, 11], [EYES, 12], [BROWS, 9]];

const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const d2 = (a: P3, b: P3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Where the outline may move each vertex (0..1, exactly 0 on the protected parts), and which vertices are outline. */
export function outlineMasks(points: P3[], lm: P3[], opt = OUTLINE, index?: ArrayLike<number>) {
  const L = lm.slice(0, 468), scalpY = lm[10][1] - 6, neckY = lm[152][1] - 10;
  const earX = Math.min(Math.abs(lm[234][0]), Math.abs(lm[454][0])) - 4, earZ = (lm[234][2] + lm[454][2]) / 2 + 6;
  const weight = new Float32Array(points.length), outline = new Uint8Array(points.length);
  points.forEach((p, i) => {
    if (p[1] > scalpY || p[1] < neckY || (Math.abs(p[0]) > earX && p[2] < earZ)) return;      // scalp, neck, ears: zero
    let near = Infinity; for (const l of L) { const d = d2(p, l); if (d < near) near = d; }
    near = Math.sqrt(near); if (near >= opt.faceMm[1]) return;                               // off the face: zero
    let w = 1 - smooth01(opt.faceMm[0], opt.faceMm[1], near);
    w *= smooth01(scalpY, scalpY - 8, p[1]) * smooth01(neckY, neckY + 8, p[1]);              // fade into the protected parts
    w *= 1 - smooth01(earX - 8, earX, Math.abs(p[0])) * smooth01(earZ + 8, earZ, p[2]);         // and into the ears
    // the features belong to the landmarks: no outline movement there, faded over 6 mm
    let fd = Infinity; for (const [ids, r] of FEATURES) for (const k of ids) fd = Math.min(fd, Math.sqrt(d2(p, lm[k])) - r);
    weight[i] = w * smooth01(0, 6, fd); outline[i] = fd > 0 ? 1 : 0;
  });
  // smooth the weight over the mesh (long edges must not step), then restore the exact zeros of the protected parts
  if (index) {
    const adj: number[][] = points.map(() => []);
    for (let t = 0; t < index.length; t += 3) for (let a = 0; a < 3; a++) { const u = index[t + a], v = index[t + (a + 1) % 3]; adj[u].push(v); adj[v].push(u); }
    const hard = points.map(p => p[1] > scalpY || p[1] < neckY || (Math.abs(p[0]) > earX && p[2] < earZ));
    for (let pass = 0; pass < 6; pass++) {
      const next = Float32Array.from(weight, (w, i) => (hard[i] || !adj[i].length ? 0 : Math.min(w, 0.5 * w + 0.5 * adj[i].reduce((a, j) => a + weight[j], 0) / adj[i].length)));
      weight.set(next);
    }
  }
  return { weight, outline };
}

function normalsOf(points: P3[], index: ArrayLike<number>): P3[] {
  const n = points.map(() => [0, 0, 0] as P3);
  for (let t = 0; t < index.length; t += 3) {
    const a = points[index[t]], b = points[index[t + 1]], c = points[index[t + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const k of [index[t], index[t + 1], index[t + 2]]) for (let c2 = 0; c2 < 3; c2++) n[k][c2] += f[c2];
  }
  // seam duplicates (same position) share one normal
  const key = (p: P3) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`, sum = new Map<string, number[]>();
  points.forEach((p, i) => { const s = sum.get(key(p)) ?? [0, 0, 0]; for (let c = 0; c < 3; c++) s[c] += n[i][c]; sum.set(key(p), s); });
  return points.map(p => { const s = sum.get(key(p))!, l = Math.hypot(s[0], s[1], s[2]) || 1; return [s[0] / l, s[1] / l, s[2] / l] as P3; });
}

function solve3(A: number[], b: number[]): P3 | null {
  const [a, b1, c, d, e, f, g, h, i] = A, det = a * (e * i - f * h) - b1 * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [e * i - f * h, c * h - b1 * i, b1 * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b1 * g - a * h, a * e - b1 * d];
  return [0, 1, 2].map(r => (inv[r * 3] * b[0] + inv[r * 3 + 1] * b[1] + inv[r * 3 + 2] * b[2]) / det) as P3;
}

/** One photo's observations: contour vertex -> offset (mm, head frame) that puts it on the photo's face edge. */
function observe(points: P3[], normals: P3[], use: Uint8Array, view: OutlineView, opt = OUTLINE, stats?: number[]) {
  const { pose: { R, s, t }, seg, width, height } = view, sx = seg.width / width, sy = seg.height / height;
  // a coarse z-buffer of the whole head in this photo: a contour vertex hidden behind the head (the underside of the
  // chin seen from the front) is not on the outline and gives no observation
  const cell = 3, gw = Math.ceil(width / cell), gh = Math.ceil(height / cell), zbuf = new Float32Array(gw * gh).fill(-Infinity);
  const proj = points.map(p => [0, 1, 2].map(r => s * (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) + t[r]));
  for (const q of proj) { const X = Math.floor(q[0] / cell), Y = Math.floor(-q[1] / cell); if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue; const k = Y * gw + X; if (q[2] > zbuf[k]) zbuf[k] = q[2]; }
  const toCam = [R[2][0], R[2][1], R[2][2]];                     // the camera's z axis in the head's frame
  const label = (x: number, y: number) => { const X = Math.round(x * sx), Y = Math.round(y * sy); return X < 0 || Y < 0 || X >= seg.width || Y >= seg.height ? SEG.background : seg.labels[Y * seg.width + X]; };
  const obs: { i: number; d: P3; px: number; py: number; ux: number; uy: number; r: number }[] = [];
  points.forEach((p, i) => {
    if (!use[i]) return;
    const n = normals[i], facing = n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2];
    if (Math.abs(facing) > opt.contourCos) return;
    const q = proj[i], X = Math.floor(q[0] / cell), Y = Math.floor(-q[1] / cell);
    if (X < 0 || Y < 0 || X >= gw || Y >= gh || q[2] < zbuf[Y * gw + X] - 4 * s) return;          // hidden
    const m = [0, 1, 2].map(r => R[r][0] * n[0] + R[r][1] * n[1] + R[r][2] * n[2]);
    const ml = Math.hypot(m[0], m[1]); if (ml < 0.5) return;
    const ux = m[0] / ml, uy = -m[1] / ml, px = q[0], py = -q[1];        // image: y down
    // the photo's face edge along the outward normal: the face -> not-face step closest to the contour point
    let best = Infinity;
    for (let k = -opt.searchPx; k < opt.searchPx; k++) {
      const a = label(px + ux * k, py + uy * k) === SEG.face, b = label(px + ux * (k + 1), py + uy * (k + 1)) === SEG.face;
      if (a && !b && Math.abs(k + 0.5) < Math.abs(best)) best = k + 0.5;
    }
    if (!Number.isFinite(best)) return;
    stats?.push(best);
    const mm = best / s, dirCam = [ux, -uy, 0];
    obs.push({ i, px, py, ux, uy, r: best, d: [0, 1, 2].map(c => mm * (R[0][c] * dirCam[0] + R[1][c] * dirCam[1] + R[2][c] * dirCam[2])) as P3 });
  });
  return obs;
}

/** The outline fit: per-vertex offsets for the head skin (head frame, mm, base scale). */
export function solveOutline(base: P3[], index: ArrayLike<number>, lm: P3[], views: OutlineView[], opt = OUTLINE, debug?: string[]): OutlineRefine & { observations: number[] } {
  const { weight, outline } = outlineMasks(base, lm, opt, index);
  const D = base.map(() => [0, 0, 0] as P3), nObs: number[] = [];
  const active = base.map((_, i) => i).filter(i => weight[i] > 0);
  // neighbours on the mesh for the smoothing passes
  const adj: number[][] = base.map(() => []);
  for (let t = 0; t < index.length; t += 3) for (let a = 0; a < 3; a++) { const u = index[t + a], v = index[t + (a + 1) % 3]; adj[u].push(v); adj[v].push(u); }
  // seam duplicates move together
  const key = (p: P3) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`, groups = new Map<string, number[]>();
  base.forEach((p, i) => { if (weight[i] > 0) (groups.get(key(p)) ?? groups.set(key(p), []).get(key(p))!).push(i); });
  const s2 = 2 * opt.spreadMm * opt.spreadMm, cut = 9 * s2;
  for (let round = 0; round < opt.rounds; round++) {
    const cur = base.map((p, i) => [p[0] + D[i][0], p[1] + D[i][1], p[2] + D[i][2]] as P3), normals = normalsOf(cur, index);
    // each photo's placement first: the 2D shift and scale that best explain its outline gaps (the landmark pose can be
    // a little off), so the shape only takes what placement cannot
    views = views.map(v => {
      for (let k = 0; k < 2; k++) {
        const o = observe(cur, normals, outline, v, opt); if (o.length < 30) break;
        const cx = o.reduce((a, b) => a + b.px, 0) / o.length, cy = o.reduce((a, b) => a + b.py, 0) / o.length;
        const A = new Array(9).fill(0), b = [0, 0, 0];
        for (const q of o) { const row = [q.ux, q.uy, q.ux * (q.px - cx) + q.uy * (q.py - cy)]; for (let a = 0; a < 3; a++) { b[a] += row[a] * q.r; for (let c = 0; c < 3; c++) A[a * 3 + c] += row[a] * row[c]; } }
        A[0] += 1e-3; A[4] += 1e-3; A[8] += 1e-3 * (A[8] || 1);
        const x = solve3(A, b); if (!x) break;
        const ds = Math.max(-0.08, Math.min(0.08, x[2])), c3 = [cx, -cy, v.pose.t[2]];
        v = { ...v, pose: { R: v.pose.R, s: v.pose.s * (1 + ds), t: [c3[0] + (1 + ds) * (v.pose.t[0] - c3[0]) + x[0], c3[1] + (1 + ds) * (v.pose.t[1] - c3[1]) - x[1], v.pose.t[2]] as P3 } };
      }
      return v;
    });
    const obs = views.flatMap((v, vi) => { const st: number[] = []; const o = observe(cur, normals, outline, v, opt, st);
      if (debug) debug.push(`round ${round} view ${vi}: ${o.length} obs, mean ${(st.reduce((a, b) => a + b, 0) / Math.max(1, st.length)).toFixed(1)} px, mean |r| ${(st.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, st.length)).toFixed(1)} px`);
      return o; }); nObs.push(obs.length);
    if (!obs.length) break;
    // one smooth field from every photo's observations
    const upd = new Map<number, P3>();
    for (const i of active) {
      const p = cur[i], acc = [0, 0, 0]; let W = 0;
      for (const o of obs) { const dd = d2(p, cur[o.i]); if (dd > cut) continue; const w = Math.exp(-dd / s2); W += w; for (let c = 0; c < 3; c++) acc[c] += w * o.d[c]; }
      if (W) upd.set(i, acc.map(v => (v / (W + 0.5)) * opt.gain) as P3);
    }
    for (const [i, u] of upd) for (let c = 0; c < 3; c++) D[i][c] += u[c];
    // smooth over the mesh (no lumps), then the masks and the clamp
    for (let pass = 0; pass < opt.laplace; pass++) {
      const next = active.map(i => { const nb = adj[i].filter(j => weight[j] > 0); if (!nb.length) return D[i];
        return [0, 1, 2].map(c => 0.5 * D[i][c] + 0.5 * nb.reduce((a, j) => a + D[j][c], 0) / nb.length) as P3; });
      active.forEach((i, k) => { D[i] = next[k]; });
    }
    for (const g of groups.values()) { const m = [0, 1, 2].map(c => g.reduce((a, i) => a + D[i][c], 0) / g.length) as P3; for (const i of g) D[i] = [...m] as P3; }
    for (const i of active) { const w = weight[i], l = Math.hypot(...D[i]), k = l > opt.maxMm ? opt.maxMm / l : 1; D[i] = D[i].map(v => v * k) as P3; void w; }
  }
  const idx: number[] = [], d: number[] = [];
  for (const i of active) { const v = D[i].map(x => x * weight[i]); if (Math.hypot(v[0], v[1], v[2]) < 0.02) continue; idx.push(i); d.push(...v.map(x => Math.round(x * 100) / 100)); }
  return { v: 2, idx, d, observations: nObs };
}
