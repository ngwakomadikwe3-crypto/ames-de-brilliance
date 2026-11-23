// System 2: the de-lit multi-frame skin texture (flag 'skin-v2'; replaces the single-photo projection of skin-bake.ts,
// which stays one release as the fallback).
//
// METHOD (simple, verifiable):
//  1. De-light every frame before anything is merged. The fitted head gives each skin point its normal in that photo's
//     camera. The photo's skin luminance is fitted as a smooth function of that normal: second-order
//     spherical harmonics (9 terms), i.e. the irradiance of ANY distant lighting, times one average skin colour. Two
//     robust passes drop freckles, moles, brows and cast shadows from the fit. Dividing the photo by its fitted
//     shading leaves the skin's colour relative to its average: the room's light, its direction and its colour are gone.
//  2. Merge robustly. Each frame is projected into the face's UV region (only where it sees the skin within 60 degrees
//     of its axis, unhidden, inside the face outline, away from the eyes, skin-coloured, not clipped), weighted by how
//     squarely and how sharply it sees it. A first pass takes the weighted mean; a second pass takes it again with
//     every sample down-weighted by how far it is from that mean. Cast shadows and specular highlights MOVE across the
//     face as the head turns in a fixed room, so in most frames a given spot is neither: the outliers lose.
//  3. Accumulate at 2048 texels across the face's UV region (the single-photo map was 1024): 10-15 frames at slightly
//     different poses each land on the texel grid at a different sub-pixel offset, so the merged map resolves finer
//     detail than any one photo projected alone.
//  4. Maps from the merged albedo: the colour ratio to its own ~6 mm average (colour detail at half strength) (the twin's LAB tone and zones keep the
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
  Matrix3, Mesh, NearestFilter, OneFactor, AddEquation, CustomBlending, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, Vector4,
  WebGLRenderer, WebGLRenderTarget,
} from 'three';
import type { P3 } from './face-morph';
import type { Pose } from './portrait-fit';
import { dilate, feather } from './skin-bake';

export type V2View = { img: { data: Uint8ClampedArray; width: number; height: number }; pose: Pose; oval: [number, number][]; sharpness: number };
export type V2Input = { points: P3[]; normals: P3[]; uv: ArrayLike<number>; index: ArrayLike<number>; views: V2View[]; tone: number[]; eyes: P3[][];
  rect: [number, number, number, number]; size?: number };
export type SkinV2 = { map: string; conf: string; maps: string; rect: [number, number, number, number]; coverage: number;
  stats: { ms: number; frames: number; shFitRms: number[] } };

const OVAL = 36;
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
  const acc = [0, 1].map(() => new WebGLRenderTarget(size, size, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false }));
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
      uTone: { value: new Vector3(...input.tone) }, uEye: { value: eyePts }, uRect: { value: new Vector4(...input.rect) } },
    vertexShader: `in vec3 aP; in vec3 aN; out vec3 vP; out vec3 vN; uniform vec4 uRect;
      void main() { vP = aP; vN = aN; gl_Position = vec4((position.xy - uRect.xy) / uRect.zw * 2.0 - 1.0, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; in vec3 vP; in vec3 vN; out vec4 o;
      uniform sampler2D uPhoto, uDepth, uMean; uniform float uPass, uS, uFeather, uSharp; uniform mat3 uR; uniform vec3 uT; uniform vec2 uWH;
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
        o = vec4(d * w, w);
      }` });
  disposables.push(depthMat, bakeMat);
  const dScene = new Scene(); dScene.add(new Mesh(geo, depthMat));
  const bScene = new Scene(); bScene.add(new Mesh(geo, bakeMat));
  const photos = views.map(v => { const t = new DataTexture(new Uint8Array(v.img.data.buffer.slice(0)), v.img.width, v.img.height, RGBAFormat, UnsignedByteType);
    t.flipY = false; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.needsUpdate = true; disposables.push(t); return t; });
  const maxSharp = Math.max(...views.map(v => v.sharpness), 1);
  for (let pass = 0; pass < 2; pass++) {
    r.setRenderTarget(acc[pass]); r.setClearColor(0x000000, 0); r.clear();
    views.forEach((v, k) => {
      const zs = input.points.map(p => v.pose.s * (v.pose.R[2][0] * p[0] + v.pose.R[2][1] * p[1] + v.pose.R[2][2] * p[2]) + v.pose.t[2]);
      Object.assign(depthMat.uniforms.uR, { value: rows(v.pose) }); depthMat.uniforms.uS.value = v.pose.s; depthMat.uniforms.uT.value.set(...v.pose.t);
      depthMat.uniforms.uWH.value.set(v.img.width, v.img.height); depthMat.uniforms.uZ.value.set(Math.min(...zs) - 10, Math.max(...zs) + 10);
      depthRT.setSize(512, Math.round(512 * v.img.height / v.img.width));
      r.setRenderTarget(depthRT); r.setClearColor(0x000000, 0); r.clear(); r.render(dScene, cam);
      const U = bakeMat.uniforms;
      U.uPhoto.value = photos[k]; U.uDepth.value = depthRT.texture; U.uMean.value = acc[pass ? 0 : 1].texture; U.uPass.value = pass;
      U.uR.value = rows(v.pose); U.uS.value = v.pose.s; U.uT.value.set(...v.pose.t); U.uWH.value.set(v.img.width, v.img.height);
      U.uSH.value = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(j => new Vector3(fits[k].coef[0][j], fits[k].coef[1][j], fits[k].coef[2][j]));
      U.uOval.value = v.oval.slice(0, OVAL).map(([x, y]) => new Vector2(x, y));
      U.uFeather.value = 0.05 * Math.hypot(v.oval[8][0] - v.oval[28][0], v.oval[8][1] - v.oval[28][1]); U.uSharp.value = v.sharpness / maxSharp;
      r.setRenderTarget(acc[pass]); r.autoClear = false; r.render(bScene, cam); r.autoClear = true;
    });
  }
  // normalise into bytes: rgb = de-lit colour / 2, a = confidence
  const norm = new ShaderMaterial({ glslVersion: GLSL3, uniforms: { uAcc: { value: acc[1].texture } }, depthTest: false,
    vertexShader: `void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; uniform sampler2D uAcc; out vec4 o;
      void main() { vec4 a = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0); o = a.a > 1e-4 ? vec4(clamp(a.rgb / a.a * 0.5, 0.0, 1.0), clamp(a.a * 3.0, 0.0, 1.0)) : vec4(0.0); }` });
  const out = new WebGLRenderTarget(size, size, { type: UnsignedByteType, depthBuffer: false });
  disposables.push(norm, out);
  const qScene = new Scene(); qScene.add(new Mesh(new PlaneGeometry(1, 1), norm));
  r.setRenderTarget(out); r.clear(); r.render(qScene, cam); r.setRenderTarget(null);
  const px = new Uint8Array(size * size * 4); r.readRenderTargetPixels(out, 0, 0, size, size, px);
  disposables.forEach(d => d.dispose()); if (own) r.dispose();
  // 4. maps: the ratio to its own ~6 mm average (colour detail at half strength), the normal and roughness from it
  const mmPerTexel = texelMm(input, size), rad = Math.max(2, Math.round(6 / mmPerTexel));
  const ratio = highPass(px, size, rad);
  feather(ratio, size, 2); dilate(ratio, size, 14);
  const maps = detailMaps(ratio, size);
  let covered = 0; for (let i = 3; i < ratio.length; i += 4) if (ratio[i] > 128) covered++;
  const enc = encode(ratio, maps, size);
  return { ...enc, rect: input.rect, coverage: covered / (size * size), stats: { ms: Math.round(performance.now() - t0), frames: views.length, shFitRms: fits.map(f => +f.rms.toFixed(3)) } };
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
function highPass(px: Uint8Array, size: number, rad: number) {
  const ch = [0, 1, 2].map(c => { const a = new Float32Array(size * size), w = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) { const cf = px[i * 4 + 3] / 255; a[i] = px[i * 4 + c] * cf; w[i] = cf; } return [boxBlur(a, size, rad), c === 0 ? boxBlur(w, size, rad) : null] as const; });
  const W = ch[0][1]!, out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    if (!px[i * 4 + 3]) continue;
    const rel = [0, 1, 2].map(c => px[i * 4 + c] / Math.max(1, ch[c][0][i] / Math.max(1e-3, W[i])));
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
