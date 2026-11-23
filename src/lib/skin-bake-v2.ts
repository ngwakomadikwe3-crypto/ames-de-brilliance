// System 2: the de-lit multi-frame skin texture (flag 'skin-v2'; replaces the single-photo projection of skin-bake.ts,
// which stays one release as the fallback).
//
// METHOD (simple, verifiable):
//  1. De-light every frame before anything is merged. The fitted head gives each skin point its normal in that photo's
//     camera. The photo's skin luminance is fitted as a smooth function of that normal: second-order
//     spherical harmonics (9 terms), i.e. the irradiance of ANY distant lighting, times one average skin colour. Two
//     robust passes drop freckles, moles, brows and cast shadows from the fit. Dividing the photo by its fitted
//     shading leaves the skin's colour relative to its average: the room's light, its direction and its colour are gone.
//  2. Align densely. Every frame's de-lit projection is registered to the front frame IN UV SPACE by pyramidal optical
//     flow on the fine detail (log luminance minus its own blur, so leftover shading cannot pull it). The landmark
//     pose only seeds the projection; the flow does the fine alignment (uvFlow, test:uv-flow: under one texel).
//  3. Fuse with a 25 % trimmed mean by luminance per texel (a median for three or fewer frames), weighted by how
//     squarely and how sharply each frame sees it. Cast shadows and highlights move across the face as the head turns
//     in a fixed room, so at any texel they are the outliers, and are dropped rather than averaged into mottling.
//     The map is 2048 texels across the face's UV region (the single-photo map is 1024).
//  4. Maps from the merged albedo: the colour ratio to its own ~2 mm average (fine detail at full strength) times the
//     2-6 mm band at MID_BAND (where leftover de-light shading lives), colour detail at half strength (the twin's LAB tone and zones keep the
//     broad colour, exactly as before), a normal map from the ratio's luminance as a height field (pores, fine lines),
//     a roughness map (finer and darker detail slightly rougher), and the SSS weight (the ratio's redness, read in the
//     shader).
//
// FAILURE MODES (documented, by design visible as "no photo detail", never as a patch):
//  - Cast shadows that stay put in every frame (a very low light from straight in front) are not outliers; the
//    6 mm high-pass removes their broad part but a sharp shadow edge under the nose can survive.
//  - Spherical harmonics model distant light; a lamp very close to the face leaves a residual gradient (removed by
//    the high-pass beyond ~6 mm).
//  - A face no frame sees within 60 degrees (under the chin, behind the jaw) gets no photo detail: Layer A shows there.
//  - Motion blur below the capture gate still softens the merge; the sharpness weight limits it.
import {
  BufferAttribute, BufferGeometry, Camera, DataTexture, DoubleSide, FloatType, GLSL3, HalfFloatType, LinearFilter, LinearMipmapLinearFilter,
  Matrix3, Mesh, NearestFilter, OneFactor, AddEquation, CustomBlending, NoBlending, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, Vector4,
  WebGLRenderer, WebGLRenderTarget,
} from 'three';
import type { P3 } from './face-morph';
import type { Pose } from './portrait-fit';
import { dilate, feather } from './skin-bake';

export type V2View = { img: { data: Uint8ClampedArray; width: number; height: number }; pose: Pose; oval: [number, number][]; sharpness: number };
export type V2Input = { points: P3[]; normals: P3[]; uv: ArrayLike<number>; index: ArrayLike<number>; views: V2View[]; tone: number[]; eyes: P3[][];
  rect: [number, number, number, number]; size?: number };
export type SkinV2 = { map: string; conf: string; maps: string; rect: [number, number, number, number]; coverage: number;
  stats: { ms: number; frames: number; shFitRms: number[]; flowTexels: number[]; ncc: number[][] } };
let flowStats: number[] = [], nccStats: number[][] = [];

const OVAL = 36;
/** Strength of the 2-6 mm band in the final map (the de-light residual lives there; 0 = fine detail only). */
export const MID_BAND = 0;
const lin = (v: number) => (v / 255) ** 2.2;
const sh9 = (n: number[]) => [1, n[1], n[2], n[0], n[0] * n[1], n[1] * n[2], 3 * n[2] * n[2] - 1, n[0] * n[2], n[0] * n[0] - n[1] * n[1]];
const rows = (p: Pose) => new Matrix3().set(p.R[0][0], p.R[0][1], p.R[0][2], p.R[1][0], p.R[1][1], p.R[1][2], p.R[2][0], p.R[2][1], p.R[2][2]);

function insidePoly(poly: [number, number][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < xi + (y - yi) / (yj - yi) * (xj - xi)) inside = !inside; }
  return inside;
}
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

/** Step 1: this frame's shading, per channel, as 9 SH coefficients over the camera-space normal. */
export function fitShading(v: V2View, points: P3[], normals: P3[], eyes: P3[][]) {
  const { R, s, t } = v.pose, W = v.img.width, H = v.img.height, eyePts = eyes.flat();
  // a coarse z-buffer: only skin the camera actually sees
  const cell = 4, gw = Math.ceil(W / cell), gh = Math.ceil(H / cell), zb = new Float32Array(gw * gh).fill(-Infinity);
  const q = points.map(p => [0, 1, 2].map(r => s * (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) + t[r]));
  for (const x of q) { const X = Math.floor(x[0] / cell), Y = Math.floor(-x[1] / cell); if (X >= 0 && Y >= 0 && X < gw && Y < gh && x[2] > zb[Y * gw + X]) zb[Y * gw + X] = x[2]; }
  const S: { y: number[]; c: number[] }[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const n = normals[i], nc = [0, 1, 2].map(r => R[r][0] * n[0] + R[r][1] * n[1] + R[r][2] * n[2]);
    if (nc[2] < 0.25) continue;
    const x = q[i][0], y = -q[i][1]; if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) continue;
    const X = Math.floor(x / cell), Y = Math.floor(y / cell); if (q[i][2] < zb[Y * gw + X] - 3 * s) continue;
    if (!insidePoly(v.oval, x, y)) continue;
    if (eyePts.some(e => (points[i][0] - e[0]) ** 2 + (points[i][1] - e[1]) ** 2 + (points[i][2] - e[2]) ** 2 < 49)) continue;
    const c = [0, 0, 0]; let k = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const o = 4 * ((Math.round(y) + dy) * W + Math.round(x) + dx); c[0] += lin(v.img.data[o]); c[1] += lin(v.img.data[o + 1]); c[2] += lin(v.img.data[o + 2]); k++; }
    S.push({ y: sh9(nc), c: c.map(z => z / k) });
  }
  let keep = S.map(() => true); const coef: number[][] = [[], [], []]; let rms = 0;
  for (let pass = 0; pass < 3; pass++) {
    rms = 0;
    // one fit on luminance (the light's shape), every channel divided by it: a per-channel fit left colour mottling
    { const A = Array.from({ length: 9 }, () => new Array(9).fill(0)), b = new Array(9).fill(0);
      S.forEach((p, i) => { if (!keep[i]) return; const L = 0.2126 * p.c[0] + 0.7152 * p.c[1] + 0.0722 * p.c[2]; for (let a = 0; a < 9; a++) { b[a] += p.y[a] * L; for (let c2 = 0; c2 < 9; c2++) A[a][c2] += p.y[a] * p.y[c2]; } });
      const tr = A[0][0] || 1; for (let a = 1; a < 9; a++) A[a][a] += (a >= 4 ? 0.05 : 0.01) * tr;   // gentle on the second order
      const k = solve(A, b); coef[0] = k; coef[1] = k; coef[2] = k; }
    // drop what the smooth shading does not explain (freckles, moles, brows, cast shadows, highlights)
    const res = S.map(p => { const e = [0, 1, 2].map(ch => p.y.reduce((a, y, j) => a + y * coef[ch][j], 0)); return (p.c[0] + p.c[1] + p.c[2]) / Math.max(1e-4, e[0] + e[1] + e[2]) - 1; });
    const live = res.filter((_, i) => keep[i]).map(Math.abs).sort((a, b) => a - b), mad = live[Math.floor(live.length / 2)] || 0.05;
    rms = Math.sqrt(res.filter((_, i) => keep[i]).reduce((a, r) => a + r * r, 0) / Math.max(1, live.length));
    keep = res.map(r => Math.abs(r) < 2.5 * mad / 0.6745);
  }
  return { coef, rms, samples: S.length };
}

/** Bake the de-lit multi-frame skin texture. */
export function bakeSkinV2(input: V2Input, renderer?: WebGLRenderer): SkinV2 {
  const t0 = performance.now(), size = input.size ?? 2048, own = !renderer;
  const r = renderer ?? new WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
  const views = input.views.slice(0, 16), n = input.points.length;
  const fits = views.map(v => fitShading(v, input.points, input.normals, input.eyes));
  const geo = new BufferGeometry(), P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { P.set(input.points[i], i * 3); N.set(input.normals[i], i * 3); UV.set([input.uv[i * 2], input.uv[i * 2 + 1], 0], i * 3); }
  geo.setAttribute('position', new BufferAttribute(UV, 3)); geo.setAttribute('aP', new BufferAttribute(P, 3)); geo.setAttribute('aN', new BufferAttribute(N, 3));
  geo.setIndex(new BufferAttribute(Uint32Array.from(input.index), 1));
  const cam = new Camera(), disposables: { dispose(): void }[] = [geo];
  const floatOk = r.extensions.has('EXT_color_buffer_float');
  const acc = [new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })];   // (the per-frame pass never reads it)
  disposables.push(...acc);
  const depthRT = new WebGLRenderTarget(512, 512, { type: floatOk ? FloatType : HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
  disposables.push(depthRT);
  const eyePts: Vector3[] = []; for (const c of input.eyes) for (const p of c.slice(0, 16)) eyePts.push(new Vector3(...p));
  while (eyePts.length < 32) eyePts.push(new Vector3(0, 1e5, 0));
  const depthMat = new ShaderMaterial({ glslVersion: GLSL3, side: DoubleSide,
    uniforms: { uR: { value: new Matrix3() }, uS: { value: 1 }, uT: { value: new Vector3() }, uWH: { value: new Vector2() }, uZ: { value: new Vector2() } },
    vertexShader: `in vec3 aP; uniform mat3 uR; uniform float uS; uniform vec3 uT; uniform vec2 uWH, uZ; out float vZ;
      void main() { vec3 q = uS * (uR * aP) + uT; vZ = q.z; gl_Position = vec4(q.x / uWH.x * 2.0 - 1.0, 1.0 + 2.0 * q.y / uWH.y, 1.0 - 2.0 * (q.z - uZ.x) / (uZ.y - uZ.x), 1.0); }`,
    fragmentShader: `in float vZ; out vec4 o; void main() { o = vec4(vZ, 0.0, 0.0, 1.0); }` });
  const bakeMat = new ShaderMaterial({ glslVersion: GLSL3, side: DoubleSide, transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    uniforms: { uPhoto: { value: null }, uDepth: { value: null }, uMean: { value: null }, uPass: { value: 0 }, uR: { value: new Matrix3() }, uS: { value: 1 }, uT: { value: new Vector3() },
      uWH: { value: new Vector2() }, uSH: { value: [] as Vector3[] }, uOval: { value: [] as Vector2[] }, uFeather: { value: 1 }, uSharp: { value: 1 },
      uOne: { value: 0 }, uTone: { value: new Vector3(...input.tone) }, uEye: { value: eyePts }, uRect: { value: new Vector4(...input.rect) } },
    vertexShader: `in vec3 aP; in vec3 aN; out vec3 vP; out vec3 vN; uniform vec4 uRect;
      void main() { vP = aP; vN = aN; gl_Position = vec4((position.xy - uRect.xy) / uRect.zw * 2.0 - 1.0, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; in vec3 vP; in vec3 vN; out vec4 o;
      uniform sampler2D uPhoto, uDepth, uMean; uniform float uPass, uS, uFeather, uSharp, uOne; uniform mat3 uR; uniform vec3 uT; uniform vec2 uWH;
      uniform vec3 uSH[9]; uniform vec2 uOval[${OVAL}]; uniform vec3 uTone; uniform vec3 uEye[32];
      vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      float insideOval(vec2 px) { float d = 1e9; bool inside = false;
        for (int i = 0; i < ${OVAL}; i++) { vec2 a = uOval[i], b = uOval[(i + 1) % ${OVAL}], ab = b - a;
          float t = clamp(dot(px - a, ab) / dot(ab, ab), 0.0, 1.0); d = min(d, length(px - a - ab * t));
          if ((a.y > px.y) != (b.y > px.y) && px.x < a.x + (px.y - a.y) / (b.y - a.y) * (b.x - a.x)) inside = !inside; }
        return inside ? d : -d; }
      void main() {
        vec3 n = normalize(vN), nc = uR * n;
        vec3 q = uS * (uR * vP) + uT; vec2 uv = vec2(q.x / uWH.x, -q.y / uWH.y);
        float w = smoothstep(0.5, 0.7, nc.z);                                  // within 60 degrees, full from ~45
        w *= step(0.01, uv.x) * step(0.01, uv.y) * step(uv.x, 0.99) * step(uv.y, 0.99);
        if (w <= 0.0) discard;
        float dz = texture(uDepth, vec2(uv.x, 1.0 - uv.y)).r - q.z; w *= 1.0 - smoothstep(3.0, 6.0, dz / uS);   // hidden
        w *= smoothstep(0.0, uFeather, insideOval(vec2(q.x, -q.y)));
        float eye = 1e9; for (int i = 0; i < 32; i++) eye = min(eye, length(vP - uEye[i])); w *= smoothstep(2.0, 4.5, eye);
        vec3 c = lin(texture(uPhoto, uv).rgb);
        w *= 1.0 - smoothstep(0.9, 0.97, max(c.r, max(c.g, c.b)));          // clipped
        vec3 cn = c / max(1e-3, lum(c)), tn = uTone / max(1e-3, lum(uTone)); w *= 1.0 - smoothstep(0.35, 0.6, length(cn - tn));   // skin-coloured
        // de-light: divide by this frame's fitted shading at this normal (camera space)
        float Y[9]; Y[0] = 1.0; Y[1] = nc.y; Y[2] = nc.z; Y[3] = nc.x; Y[4] = nc.x * nc.y; Y[5] = nc.y * nc.z; Y[6] = 3.0 * nc.z * nc.z - 1.0; Y[7] = nc.x * nc.z; Y[8] = nc.x * nc.x - nc.y * nc.y;
        vec3 E = vec3(0.0); for (int j = 0; j < 9; j++) E += Y[j] * uSH[j];
        vec3 d = c / max(E, vec3(0.02));
        w *= nc.z * nc.z * uSharp;                                             // squarer and sharper frames count more
        if (uPass > 0.5) {                                                     // robust pass: far from the mean, down-weighted
          vec4 m = texelFetch(uMean, ivec2(gl_FragCoord.xy), 0); vec3 mu = m.rgb / max(m.a, 1e-4);
          float dev = lum(d) / max(1e-3, lum(mu)) - 1.0; w *= exp(-dev * dev / 0.012);
        }
        if (w <= 1e-4) discard;
        o = uOne > 0.5 ? vec4(clamp(d * 0.5, 0.0, 1.0), clamp(w, 0.0, 1.0)) : vec4(d * w, w);
      }` });
  disposables.push(depthMat, bakeMat);
  const dScene = new Scene(); dScene.add(new Mesh(geo, depthMat));
  const bScene = new Scene(); bScene.add(new Mesh(geo, bakeMat));
  const photos = views.map(v => { const t = new DataTexture(new Uint8Array(v.img.data.buffer.slice(0)), v.img.width, v.img.height, RGBAFormat, UnsignedByteType);
    t.flipY = false; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.needsUpdate = true; disposables.push(t); return t; });
  const maxSharp = Math.max(...views.map(v => v.sharpness), 1);
  // the region of the map any frame can see (texels): every frame is read back only there
  const [rx, ry, rw, rh] = input.rect; let u0 = size, v0 = size, u1 = 0, v1 = 0;
  for (let i = 0; i < n; i++) {
    const nn = input.normals[i]; if (!views.some(v => v.pose.R[2][0] * nn[0] + v.pose.R[2][1] * nn[1] + v.pose.R[2][2] * nn[2] > 0.45)) continue;
    const x = (input.uv[i * 2] - rx) / rw * size, y = (input.uv[i * 2 + 1] - ry) / rh * size;
    if (x < 0 || y < 0 || x >= size || y >= size) continue; u0 = Math.min(u0, x); v0 = Math.min(v0, y); u1 = Math.max(u1, x); v1 = Math.max(v1, y);
  }
  const X0 = Math.max(0, Math.floor(u0) - 8), Y0 = Math.max(0, Math.floor(v0) - 8), RW = Math.min(size, Math.ceil(u1) + 8) - X0, RH = Math.min(size, Math.ceil(v1) + 8) - Y0;
  // 1-2. every frame de-lit and projected on its own (no blending), read back over that region
  const one = new WebGLRenderTarget(size, size, { type: UnsignedByteType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  disposables.push(one);
  bakeMat.blending = NoBlending; bakeMat.transparent = false;
  const frames: Uint8Array[] = views.map((v, k) => {
    const zs = input.points.map(p => v.pose.s * (v.pose.R[2][0] * p[0] + v.pose.R[2][1] * p[1] + v.pose.R[2][2] * p[2]) + v.pose.t[2]);
    depthMat.uniforms.uR.value = rows(v.pose); depthMat.uniforms.uS.value = v.pose.s; depthMat.uniforms.uT.value.set(...v.pose.t);
    depthMat.uniforms.uWH.value.set(v.img.width, v.img.height); depthMat.uniforms.uZ.value.set(Math.min(...zs) - 10, Math.max(...zs) + 10);
    depthRT.setSize(512, Math.round(512 * v.img.height / v.img.width));
    r.setRenderTarget(depthRT); r.setClearColor(0x000000, 0); r.clear(); r.render(dScene, cam);
    const U = bakeMat.uniforms;
    U.uPhoto.value = photos[k]; U.uDepth.value = depthRT.texture; U.uMean.value = acc[0].texture; U.uPass.value = 0;
    U.uR.value = rows(v.pose); U.uS.value = v.pose.s; U.uT.value.set(...v.pose.t); U.uWH.value.set(v.img.width, v.img.height);
    U.uSH.value = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(j => new Vector3(fits[k].coef[0][j], fits[k].coef[1][j], fits[k].coef[2][j]));
    U.uOval.value = v.oval.slice(0, OVAL).map(([x, y]) => new Vector2(x, y));
    U.uFeather.value = 0.05 * Math.hypot(v.oval[8][0] - v.oval[28][0], v.oval[8][1] - v.oval[28][1]); U.uSharp.value = v.sharpness / maxSharp;
    U.uOne.value = 1;
    r.setRenderTarget(one); r.setClearColor(0x000000, 0); r.clear(); r.render(bScene, cam);
    const buf = new Uint8Array(RW * RH * 4); r.readRenderTargetPixels(one, X0, Y0, RW, RH, buf); return buf;
  });
  r.setRenderTarget(null);
  // 3. dense alignment in UV space: every frame registered to the front frame (index 0) by pyramidal optical flow
  nccStats = []; const ref = 0, flows: (Float32Array | null)[] = frames.map((f, k) => (k === ref ? null : uvFlow(frames[ref], f, RW, RH)));
  // safety net: a frame's alignment is kept only if it raises its fine-detail correlation with the front frame
  const refD = detailBand(frames[ref], RW, RH);
  const aligned = frames.map((f, k) => { if (!flows[k]) return f; const a = warp(f, flows[k]!, RW, RH), before = ncc(refD, detailBand(f, RW, RH)), after = ncc(refD, detailBand(a, RW, RH));
    nccStats.push([+before.toFixed(2), +after.toFixed(2)]); if (after > before + 0.02) return a; flows[k] = null; return f; });
  flowStats = flows.filter(Boolean).map(fl => { let m = 0, c = 0; for (let i = 0; i < fl!.length; i += 2) { const l = Math.hypot(fl![i], fl![i + 1]); if (l > 0) { m += l; c++; } } return c ? +(m / c).toFixed(2) : 0; });
  // 4. fusion: per texel, a 25 % trimmed mean by luminance across the aligned frames (a median for 3 or fewer)
  const px = new Uint8Array(size * size * 4), sv: { l: number; r: number; g: number; b: number; w: number }[] = [];
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const o = (y * RW + x) * 4; sv.length = 0;
    for (const f of aligned) { const w = f[o + 3] / 255; if (w > 0.04) sv.push({ l: 0.2126 * f[o] + 0.7152 * f[o + 1] + 0.0722 * f[o + 2], r: f[o], g: f[o + 1], b: f[o + 2], w }); }
    if (!sv.length) continue;
    sv.sort((a, b) => a.l - b.l);
    const cut = sv.length >= 4 ? Math.floor(sv.length * 0.25) : 0, keep = sv.length === 3 ? [sv[1]] : sv.slice(cut, sv.length - cut);
    let R = 0, G = 0, B = 0, W = 0; for (const q of keep) { R += q.r * q.w; G += q.g * q.w; B += q.b * q.w; W += q.w; }
    const t = ((Y0 + y) * size + X0 + x) * 4; px[t] = R / W; px[t + 1] = G / W; px[t + 2] = B / W;
    px[t + 3] = Math.min(255, Math.round(255 * Math.min(1, sv.reduce((a, q) => a + q.w, 0) * 3)));
  }
  disposables.forEach(d => d.dispose()); if (own) r.dispose();
  // 5. maps: the ratio to its own ~6 mm average (colour detail at half strength), the normal and roughness from it
  const mmPerTexel = texelMm(input, size), rad = Math.max(2, Math.round(6 / mmPerTexel));
  const ratio = highPass(px, size, rad, Math.max(1, Math.round(2 / mmPerTexel)));
  feather(ratio, size, 2); dilate(ratio, size, 14);
  const maps = detailMaps(ratio, size);
  let covered = 0; for (let i = 3; i < ratio.length; i += 4) if (ratio[i] > 128) covered++;
  const enc = encode(ratio, maps, size);
  return { ...enc, rect: input.rect, coverage: covered / (size * size), stats: { ms: Math.round(performance.now() - t0), frames: views.length, shFitRms: fits.map(f => +f.rms.toFixed(3)), flowTexels: flowStats, ncc: nccStats } };
}

/** Average size of one texel on the face, mm (from the mesh's 3D vs UV areas). */
function texelMm(input: V2Input, size: number) {
  let a3 = 0, a2 = 0; const p = input.points, u = input.uv, ix = input.index, [, , rw, rh] = input.rect;
  for (let t = 0; t < ix.length; t += 3) { const [i, j, k] = [ix[t], ix[t + 1], ix[t + 2]];
    const uA = [u[i * 2], u[i * 2 + 1]], uB = [u[j * 2], u[j * 2 + 1]], uC = [u[k * 2], u[k * 2 + 1]];
    if ([uA, uB, uC].some(q => q[0] < input.rect[0] || q[1] < input.rect[1] || q[0] > input.rect[0] + rw || q[1] > input.rect[1] + rh)) continue;
    const e1 = [0, 1, 2].map(c => p[j][c] - p[i][c]), e2 = [0, 1, 2].map(c => p[k][c] - p[i][c]);
    a3 += 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
    a2 += 0.5 * Math.abs((uB[0] - uA[0]) * (uC[1] - uA[1]) - (uC[0] - uA[0]) * (uB[1] - uA[1])) / (rw * rh) * size * size; }
  return a2 > 0 ? Math.sqrt(a3 / a2) : 0.2;
}
/** rgb/2 + conf -> the colour ratio to the ~radius average (x0.5), soft-limited like the single-photo map. */
function highPass(px: Uint8Array, size: number, rad: number, fine: number) {
  // two bands: the fine detail (freckles, pores, moles: the ratio to a ~2 mm average) at full strength, and the
  // mid band (2 to 6 mm, where leftover de-light shading lives) at 30 %
  const blur = (r: number) => { const wv = new Float32Array(size * size); for (let i = 0; i < size * size; i++) wv[i] = px[i * 4 + 3] / 255;
    const W = boxBlur(wv, size, r); return [0, 1, 2].map(c => { const a = new Float32Array(size * size); for (let i = 0; i < size * size; i++) a[i] = px[i * 4 + c] * wv[i]; const b = boxBlur(a, size, r); return b.map((v, i) => v / Math.max(1e-3, W[i])); }); };
  const b2 = blur(fine), b6 = blur(rad), out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    if (!px[i * 4 + 3]) continue;
    const rel = [0, 1, 2].map(c => (px[i * 4 + c] / Math.max(1, b2[c][i])) * Math.pow(Math.max(1, b2[c][i]) / Math.max(1, b6[c][i]), MID_BAND));
    const rl = 0.2126 * rel[0] + 0.7152 * rel[1] + 0.0722 * rel[2];
    for (let c = 0; c < 3; c++) { let r = rl * (1 + 0.5 * (rel[c] / Math.max(1e-3, rl) - 1));    // colour detail at half strength: no chroma mottling
      r = 1 + 0.45 * Math.tanh((r - 1) / 0.45); out[i * 4 + c] = Math.max(1, Math.min(255, Math.round(r * 0.5 * 255))); }
    out[i * 4 + 3] = px[i * 4 + 3];
  }
  return out;
}
function boxBlur(a: Float32Array, size: number, r: number) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  for (let y = 0; y < size; y++) { let s = 0; const row = y * size; for (let x = -r; x <= r; x++) s += a[row + Math.min(size - 1, Math.max(0, x))];
    for (let x = 0; x < size; x++) { tmp[row + x] = s / (2 * r + 1); s += a[row + Math.min(size - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < size; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
    for (let y = 0; y < size; y++) { out[y * size + x] = s / (2 * r + 1); s += tmp[Math.min(size - 1, y + r + 1) * size + x] - tmp[Math.max(0, y - r) * size + x]; } }
  return out;
}
/** Normal (x, y as 0.5 +- 0.5) and roughness from the ratio's luminance: a height field of the fine detail. */
function detailMaps(ratio: Uint8Array, size: number) {
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) h[i] = ratio[i * 4 + 3] ? Math.log(Math.max(1, 0.2126 * ratio[i * 4] + 0.7152 * ratio[i * 4 + 1] + 0.0722 * ratio[i * 4 + 2]) / 127.5) : 0;
  const out = new Uint8Array(size * size * 4);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x, gx = (h[i + 1] - h[i - 1]) * 0.5, gy = (h[i + size] - h[i - size]) * 0.5;
    out[i * 4] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, -gx * 4)));
    out[i * 4 + 1] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, -gy * 4)));
    out[i * 4 + 2] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, -h[i] * 1.5 + Math.hypot(gx, gy) * 3)));   // darker or busier: rougher
    out[i * 4 + 3] = 255;
  }
  return out;
}
function encode(ratio: Uint8Array, maps: Uint8Array, size: number) {
  const jpeg = (fill: (img: ImageData) => void, s: number, q: number) => { const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d')!, img = g.createImageData(s, s); fill(img); g.putImageData(img, 0, 0); return c.toDataURL('image/jpeg', q); };
  const map = jpeg(img => { for (let i = 0; i < size * size; i++) { const e = !(ratio[i * 4] || ratio[i * 4 + 1] || ratio[i * 4 + 2]); img.data[i * 4] = e ? 128 : ratio[i * 4]; img.data[i * 4 + 1] = e ? 128 : ratio[i * 4 + 1]; img.data[i * 4 + 2] = e ? 128 : ratio[i * 4 + 2]; img.data[i * 4 + 3] = 255; } }, size, 0.88);
  const mp = jpeg(img => { img.data.set(maps); for (let i = 0; i < size * size; i++) if (!ratio[i * 4 + 3]) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 128; } }, size, 0.85);
  const s = 256, k = size / s;
  const conf = jpeg(img => { for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { let a = 0; for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) a += ratio[((y * k + dy) * size + x * k + dx) * 4 + 3];
    const o = (y * s + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = a / (k * k); img.data[o + 3] = 255; } }, s, 0.92);
  return { map, conf, maps: mp };
}

// ---- dense alignment in UV space ----------------------------------------------------------------------------------
// Both images are reduced to their fine detail (log luminance minus its own ~6 texel blur), so the residual shading
// left by the de-lighting cannot pull the flow; only texels both frames see take part. Pyramidal Lucas-Kanade
// (4 levels, 4 iterations each, 7-texel Gaussian windows), the flow smoothed by confidence between iterations and
// capped at 24 texels. The landmark pose already placed every frame within a few texels: the flow does the rest.
function detail(f: Uint8Array, W: number, H: number) {
  const L = new Float32Array(W * H), M = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { M[i] = f[i * 4 + 3] > 20 ? 1 : 0; L[i] = M[i] ? Math.log(1 + 0.2126 * f[i * 4] + 0.7152 * f[i * 4 + 1] + 0.0722 * f[i * 4 + 2]) : 0; }
  return { D: L, M };
}
/** Band-pass at a pyramid level: log luminance minus its own ~3 texel masked blur. */
function band(L: Float32Array, M: Float32Array, W: number, H: number) {
  const bl = gblur(L.map((v, i) => v * M[i]), W, H, 3), bm = gblur(M, W, H, 3);
  return L.map((v, i) => (M[i] && bm[i] > 0.2 ? v - bl[i] / bm[i] : 0));
}
function gblur(a: Float32Array, W: number, H: number, sigma: number) {   // three box passes ~ Gaussian
  let x = a; const r = Math.max(1, Math.round(sigma * 0.87));
  for (let k = 0; k < 3; k++) x = box2(x, W, H, r);
  return x;
}
function box2(a: Float32Array, W: number, H: number, r: number) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; const row = y * W; for (let x = -r; x <= r; x++) s += a[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) { t[row + x] = s / n; s += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) { o[y * W + x] = s / n; s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
  return o;
}
function down(a: Float32Array, W: number, H: number) {
  const w = W >> 1, h = H >> 1, o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = 2 * y * W + 2 * x; o[y * w + x] = (a[i] + a[i + 1] + a[i + W] + a[i + W + 1]) / 4; }
  return { a: o, w, h };
}
const sample = (a: Float32Array, W: number, H: number, x: number, y: number) => {
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
  return (a[y0 * W + x0] * (1 - fx) + a[y0 * W + x1] * fx) * (1 - fy) + (a[y1 * W + x0] * (1 - fx) + a[y1 * W + x1] * fx) * fy;
};
/** Flow (u, v per texel of the reference grid): reference texel x corresponds to frame texel x + flow. */
export function uvFlow(refF: Uint8Array, frmF: Uint8Array, W: number, H: number, levels = 4, iters = 6, cap = 16) {
  const A = detail(refF, W, H), B = detail(frmF, W, H);
  const raw: { R: Float32Array; F: Float32Array; MR: Float32Array; MF: Float32Array; w: number; h: number }[] = [{ R: A.D, F: B.D, MR: A.M, MF: B.M, w: W, h: H }];
  for (let l = 1; l < levels; l++) { const p = raw[l - 1], r = down(p.R.map((v, i) => v * p.MR[i]), p.w, p.h), f = down(p.F.map((v, i) => v * p.MF[i]), p.w, p.h), mr = down(p.MR, p.w, p.h), mf = down(p.MF, p.w, p.h);
    raw.push({ R: r.a.map((v, i) => (mr.a[i] > 0 ? v / mr.a[i] : 0)), F: f.a.map((v, i) => (mf.a[i] > 0 ? v / mf.a[i] : 0)), MR: mr.a.map(v => (v > 0.99 ? 1 : 0)), MF: mf.a.map(v => (v > 0.99 ? 1 : 0)), w: r.w, h: r.h }); }
  const pyr = raw.map(p => ({ R: band(p.R, p.MR, p.w, p.h), F: band(p.F, p.MF, p.w, p.h), M: p.MR.map((m, i) => m * p.MF[i]), w: p.w, h: p.h }));
  let U = new Float32Array(pyr[levels - 1].w * pyr[levels - 1].h), V = new Float32Array(U.length);
  for (let l = levels - 1; l >= 0; l--) {
    const { R, F, M, w, h } = pyr[l];
    if (l < levels - 1) { // upsample the coarser flow
      const pw = pyr[l + 1].w, ph = pyr[l + 1].h, U2 = new Float32Array(w * h), V2 = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { U2[y * w + x] = 2 * sample(U, pw, ph, x / 2, y / 2); V2[y * w + x] = 2 * sample(V, pw, ph, x / 2, y / 2); }
      U = U2; V = V2;
    }
    // reference gradients (inverse compositional: fixed per level)
    const Ix = new Float32Array(w * h), Iy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; Ix[i] = (R[i + 1] - R[i - 1]) / 2; Iy[i] = (R[i + w] - R[i - w]) / 2; }
    const sg = 1.8, gxx = gblur(Ix.map((v, i) => v * v * M[i]), w, h, sg), gxy = gblur(Ix.map((v, i) => v * Iy[i] * M[i]), w, h, sg), gyy = gblur(Iy.map((v, i) => v * v * M[i]), w, h, sg);
    for (let it = 0; it < iters; it++) {
      const Et = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (M[i]) Et[i] = sample(F, w, h, x + U[i], y + V[i]) - R[i]; }
      const bx = gblur(Ix.map((v, i) => v * Et[i] * M[i]), w, h, sg), by = gblur(Iy.map((v, i) => v * Et[i] * M[i]), w, h, sg);
      const conf = new Float32Array(w * h), dU = new Float32Array(w * h), dV = new Float32Array(w * h);
      const trs = Array.from(gxx, (v, i) => v + gyy[i]).filter(v => v > 0).sort((a2, b2) => a2 - b2), trRef = trs[Math.floor(trs.length * 0.75)] || 1;
      for (let i = 0; i < w * h; i++) {
        const a = gxx[i], b = gxy[i], c = gyy[i], det = a * c - b * b, tr = a + c;
        if (det <= 1e-16 || tr < 1e-9 || det / (tr * tr) < 0.02) continue;     // no texture or an edge only: no update
        dU[i] = -(c * bx[i] - b * by[i]) / det; dV[i] = -(-b * bx[i] + a * by[i]) / det; conf[i] = (det / (tr * tr)) * Math.min(1, tr / trRef);   // corner-ness x texture energy
      }
      // smooth the update by confidence (textureless texels take their neighbours' flow)
      const cs = gblur(conf, w, h, 5), us = gblur(dU.map((v, i) => v * conf[i]), w, h, 5), vs = gblur(dV.map((v, i) => v * conf[i]), w, h, 5);
      const capL = cap / 2 ** l;
      for (let i = 0; i < w * h; i++) if (cs[i] > 1e-4) {
        U[i] = Math.max(-capL, Math.min(capL, U[i] + Math.max(-0.5, Math.min(0.5, us[i] / cs[i]))));
        V[i] = Math.max(-capL, Math.min(capL, V[i] + Math.max(-0.5, Math.min(0.5, vs[i] / cs[i]))));
      }
    }
  }
  const Us = gblur(U, W, H, 4), Vs = gblur(V, W, H, 4);                    // a smooth warp: no swirls
  const out = new Float32Array(W * H * 2); for (let i = 0; i < W * H; i++) { out[i * 2] = Us[i]; out[i * 2 + 1] = Vs[i]; }
  return out;
}
/** The frame resampled onto the reference grid along the flow (weight kept; outside the frame: none). */
export function warp(f: Uint8Array, flow: Float32Array, W: number, H: number) {
  const o = new Uint8Array(f.length), ch = [0, 1, 2, 3].map(c => Float32Array.from({ length: W * H }, (_, i) => f[i * 4 + c]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, sx = x + flow[i * 2], sy = y + flow[i * 2 + 1];
    // nearest weight check: never borrow colour from texels the frame did not see
    const ni = Math.round(sy) * W + Math.round(sx); if (sx < 0 || sy < 0 || sx > W - 1 || sy > H - 1 || f[ni * 4 + 3] < 20) continue;
    for (let c = 0; c < 4; c++) o[i * 4 + c] = Math.round(sample(ch[c], W, H, sx, sy));
  }
  return o;
}

function detailBand(f: Uint8Array, W: number, H: number) { const d = detail(f, W, H); return { D: band(d.D, d.M, W, H), M: d.M }; }
function ncc(a: { D: Float32Array; M: Float32Array }, b: { D: Float32Array; M: Float32Array }) {
  let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.D.length; i++) if (a.M[i] && b.M[i]) { ab += a.D[i] * b.D[i]; aa += a.D[i] ** 2; bb += b.D[i] ** 2; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}
