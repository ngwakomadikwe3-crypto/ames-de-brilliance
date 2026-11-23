import { refineField, type FaceRefine } from './face-refine';
import type { OutlineRefine } from './face-outline';
// The parametric portrait head at runtime: its landmarks (from UV positions), its identity and expression bases for
// fitting, baking a fitted identity into the mesh (expressions stay live morphs), and the spectacle measurements.
import { BufferAttribute, Matrix3, Matrix4, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three';
import type { HeadBasis } from './portrait-fit';
import type { P3 } from './face-morph';
import { saneLimits } from './portrait-weights';

export const HEAD_URL = '/portrait-twin/portrait-head-v2.glb', HEAD_META_URL = '/portrait-twin/portrait-head-v2.json', LIP_ZONES_URL = '/portrait-twin/lip-zones-v1.png';
export type HeadMeta = { identity: string[]; expressions: string[]; landmarks: { uv: ([number, number] | null)[]; mm: (P3 | null)[] };
  lips: { outer: number[]; inner: number[]; uvRect: [number, number, number, number]; rangeMm: number }; eyes: { left: P3; right: P3 } };
export type Anchor = { tri: [number, number, number]; bary: [number, number, number] } | null;

/** Each landmark as a fixed point of a skin triangle: found by its UV position (stored as Blender writes UVs, V up;
 *  glTF and three.js have V = 1 - v). The lip-zone map uses the same convention: t = (1 - uv.y - rect[1]) / height. */
export function anchorsFromUV(g: BufferGeometry, uvs: ([number, number] | null)[]): Anchor[] {
  const uv = g.getAttribute('uv'), idx = g.getIndex()!;
  return uvs.map(q0 => {
    if (!q0) return null;
    const q = [q0[0], 1 - q0[1]];                                   // stored in Blender's UV convention; glTF flips V
    let best: Anchor = null, bestOut = Infinity;
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const ax = uv.getX(a), ay = uv.getY(a), v0x = uv.getX(b) - ax, v0y = uv.getY(b) - ay, v1x = uv.getX(c) - ax, v1y = uv.getY(c) - ay;
      const den = v0x * v1y - v1x * v0y; if (Math.abs(den) < 1e-14) continue;
      const px = q[0] - ax, py = q[1] - ay, w1 = (px * v1y - v1x * py) / den, w2 = (v0x * py - px * v0y) / den, w0 = 1 - w1 - w2;
      const out = Math.max(0, -w0, -w1, -w2);                     // 0 inside the triangle
      if (out < bestOut) { bestOut = out; best = { tri: [a, b, c], bary: [w0, w1, w2] }; if (out === 0) break; }
    }
    return best;
  });
}

/** Positions (mm, head frame) of the mesh's vertices and morph deltas: applies the mesh's transform (the compressed
 *  model quantises positions under a node scale) and the head's scale to millimetres. */
function toMm(mesh: Mesh, head: Object3D) {
  head.updateMatrixWorld(true);
  // the frame is the head's parent (or the world): the head itself is the glTF scene scaled to mm
  const frame = head.parent ? new Matrix4().copy(head.parent.matrixWorld).invert() : new Matrix4();
  const M = frame.multiply(mesh.matrixWorld);
  const L = new Matrix3().setFromMatrix4(M);
  return { point: (v: Vector3) => v.applyMatrix4(M), dir: (v: Vector3) => v.applyMatrix3(L) };
}

/** A linear basis for the anchored landmarks over the named morphs of a mesh. Head frame in mm when the head group
 *  carries the scale to mm (the twin scales the glTF scene by 1000). */
export function basisFor(mesh: Mesh, head: Object3D, anchors: Anchor[], names: string[]) {
  const g = mesh.geometry, pos = g.getAttribute('position'), dict = mesh.morphTargetDictionary!, morph = g.morphAttributes.position ?? [];
  const t = toMm(mesh, head), n = anchors.length, K = names.length, v = new Vector3();
  const L0 = new Float64Array(n * 3), D = new Float64Array(K * n * 3);
  anchors.forEach((a, i) => {
    if (!a) return;
    for (let j = 0; j < 3; j++) {
      t.point(v.fromBufferAttribute(pos, a.tri[j])); L0[i * 3] += a.bary[j] * v.x; L0[i * 3 + 1] += a.bary[j] * v.y; L0[i * 3 + 2] += a.bary[j] * v.z;
      names.forEach((name, k) => {
        const attr = morph[dict[name]]; t.dir(v.fromBufferAttribute(attr, a.tri[j]));
        const o = (k * n + i) * 3; D[o] += a.bary[j] * v.x; D[o + 1] += a.bary[j] * v.y; D[o + 2] += a.bary[j] * v.z;
      });
    }
  });
  return { names, L0, D, n } as HeadBasis;
}

/** Bake identity weights into every part of the head (skin, eyes, teeth, tongue) and keep only the expression morphs
 *  live. Normals are recomputed and welded across UV seams. */
export function bakeIdentity(head: Object3D, weights: Record<string, number>, refine?: FaceRefine | OutlineRefine | null) {
  head.traverse(o => {
    const mesh = o as Mesh; if (!mesh.isMesh || (!mesh.morphTargetDictionary && !mesh.userData.allMorphs)) return;
    const g = mesh.geometry, dict = mesh.morphTargetDictionary ?? {}, morph = g.morphAttributes.position ?? [], src = g.getAttribute('position');
    if (!mesh.userData.basePositions) {
      const b = new Float32Array(src.count * 3);
      for (let i = 0; i < src.count; i++) { b[i * 3] = src.getX(i); b[i * 3 + 1] = src.getY(i); b[i * 3 + 2] = src.getZ(i); }
      mesh.userData.basePositions = b;
    }
    // the full morph set is kept on first bake, so baking again (a new scan) still sees the identity morphs
    if (!mesh.userData.allMorphs) mesh.userData.allMorphs = { dict: { ...dict }, morph };
    const all = mesh.userData.allMorphs as { dict: Record<string, number>; morph: BufferAttribute[] };
    const out = Float32Array.from(mesh.userData.basePositions as Float32Array);
    for (const [name, w] of Object.entries(weights)) {
      const at = all.dict[name]; if (at === undefined || !w) continue;
      const d = all.morph[at]; for (let i = 0; i < d.count; i++) { out[i * 3] += w * d.getX(i); out[i * 3 + 1] += w * d.getY(i); out[i * 3 + 2] += w * d.getZ(i); }
    }
    g.setAttribute('position', new BufferAttribute(out, 3));
    // System 1: the per-vertex refinement toward the customer's own scan (skin only; face-refine.ts)
    if (refine && /head.?skin/i.test(mesh.name)) {
      const d: P3[] = refine.v === 2 ? (() => { const z = Array.from({ length: src.count }, () => [0, 0, 0] as P3); refine.idx.forEach((i, k) => { if (i < z.length) z[i] = [refine.d[k * 3], refine.d[k * 3 + 1], refine.d[k * 3 + 2]]; }); return z; })()
        : refineField(meshPointsMm(mesh, head), refine);
      const inv = new Matrix3().setFromMatrix4(new Matrix4().copy(head.parent ? new Matrix4().copy(head.parent.matrixWorld).invert() : new Matrix4()).multiply(mesh.matrixWorld)).invert();
      const v = new Vector3();
      for (let i = 0; i < d.length; i++) { if (!d[i][0] && !d[i][1] && !d[i][2]) continue; v.set(d[i][0], d[i][1], d[i][2]).applyMatrix3(inv); out[i * 3] += v.x; out[i * 3 + 1] += v.y; out[i * 3 + 2] += v.z; }
    }
    // keep the expression morphs only
    const live = Object.keys(all.dict).filter(nm => nm.startsWith('ex:') || nm.startsWith('ar:'));   // the idle and the live-mirror expressions stay live
    delete g.morphAttributes.normal;
    if (live.length) {
      // as plain floats: the compressed model stores morphs as normalised int16, which three's morph texture reads raw
      g.morphAttributes.position = live.map(nm => { const src = all.morph[all.dict[nm]], f = new Float32Array(src.count * 3);
        for (let i = 0; i < src.count; i++) { f[i * 3] = src.getX(i); f[i * 3 + 1] = src.getY(i); f[i * 3 + 2] = src.getZ(i); }
        return new BufferAttribute(f, 3); });
      mesh.morphTargetDictionary = Object.fromEntries(live.map((nm, i) => [nm, i])); mesh.morphTargetInfluences = live.map(() => 0);
    } else {                                    // nothing live (eyes): no morphing at all, or three.js compiles an empty morph shader
      delete g.morphAttributes.position; mesh.morphTargetDictionary = undefined; mesh.morphTargetInfluences = undefined;
    }
    g.deleteAttribute('normal'); g.computeVertexNormals(); weldNormals(g); g.computeBoundingSphere();
  });
}

function weldNormals(g: BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal') as BufferAttribute, sums = new Map<string, number[]>();
  const key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < n.count; i++) { const k = key(i), s = sums.get(k) ?? [0, 0, 0]; s[0] += n.getX(i); s[1] += n.getY(i); s[2] += n.getZ(i); sums.set(k, s); }
  for (let i = 0; i < n.count; i++) { const s = sums.get(key(i))!, l = Math.hypot(s[0], s[1], s[2]) || 1; n.setXYZ(i, s[0] / l, s[1] / l, s[2] / l); }
  n.needsUpdate = true;
}

export type Spectacles = {
  pdMm: number;                  // pupil distance
  bridgeWidthMm: number;         // nose width where the pads sit (at the mid bridge, 6 mm behind its front line)
  bridgeProjectionMm: number;    // how far the bridge stands in front of the eye corners (pad height)
  templeWidthMm: number;         // head width at the temples, where the arms pass
  earRest: { left: P3; right: P3 };   // where the arms rest on top of the ear roots (head frame, mm)
  eyeToEarMm: number;            // from the corneal plane back to the ear rest: the arm length the frame needs
  source: 'scan' | 'fitted';
};

/** Measure the fitted head (mm, head frame) for spectacles, scaled so its pupil distance is `pdMm` when the scan
 *  measured one from the irises. */
export function measureSpectacles(skin: P3[], landmarks: P3[], eyes: { left: P3; right: P3 }, pdMm?: number): Spectacles {
  const pdModel = Math.hypot(eyes.left[0] - eyes.right[0], eyes.left[1] - eyes.right[1], eyes.left[2] - eyes.right[2]);
  const k = pdMm ? pdMm / pdModel : 1;
  // pads rest on the sides of the nose at the mid bridge (landmark 6), a few mm behind its front line
  const bridge = landmarks[6], cornerZ = (landmarks[133][2] + landmarks[362][2]) / 2, eyeY = (eyes.left[1] + eyes.right[1]) / 2, eyeZ = (eyes.left[2] + eyes.right[2]) / 2;
  const padY = bridge[1], padZ = bridge[2] - 6;
  let lo = Infinity, hi = -Infinity;
  for (const p of skin) if (Math.abs(p[1] - padY) < 1.5 && Math.abs(p[2] - padZ) < 1.5 && Math.abs(p[0]) < 16) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
  let temple = 0;
  for (const p of skin) if (Math.abs(p[1] - (eyeY + 8)) < 2 && p[2] < eyeZ - 25 && p[2] > eyeZ - 60) temple = Math.max(temple, Math.abs(p[0]));
  const ear = (sign: number) => {
    const root = skin.filter(p => Math.sign(p[0]) === sign && Math.abs(p[0]) > temple * 0.92 && p[1] > eyeY - 30 && p[1] < eyeY + 15 && p[2] < eyeZ - 55 && p[2] > eyeZ - 115);
    const top = root.reduce((a, b) => (b[1] > a[1] ? b : a), [0, -Infinity, 0] as P3);
    return [top[0] * k, top[1] * k, top[2] * k] as P3;
  };
  const left = ear(1), right = ear(-1);
  return { pdMm: pdMm ?? pdModel, bridgeWidthMm: (hi - lo) * k, bridgeProjectionMm: (bridge[2] - cornerZ) * k, templeWidthMm: 2 * temple * k,
    earRest: { left, right }, eyeToEarMm: (eyeZ + 12) * k - (left[2] + right[2]) / 2, source: pdMm ? 'scan' : 'fitted' };
}

/** Every vertex of a mesh in the head frame (mm). */
export function meshPointsMm(mesh: Mesh, head: Object3D): P3[] {
  const t = toMm(mesh, head), pos = mesh.geometry.getAttribute('position'), v = new Vector3(), out: P3[] = [];
  for (let i = 0; i < pos.count; i++) { t.point(v.fromBufferAttribute(pos, i)); out.push([v.x, v.y, v.z]); }
  return out;
}
export function anchoredPoints(points: P3[], anchors: Anchor[]): P3[] {
  return anchors.map(a => (a ? [0, 1, 2].map(c => a.bary[0] * points[a.tri[0]][c] + a.bary[1] * points[a.tri[1]][c] + a.bary[2] * points[a.tri[2]][c]) as P3 : [0, 0, 0] as P3));
}

/** Load the parametric head and its metadata (the twin and the scan both use it). The returned scene is scaled to mm. */
export async function loadPortraitHead() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const [gltf, meta] = await Promise.all([loader.loadAsync(HEAD_URL), fetch(HEAD_META_URL).then(r => r.json() as Promise<HeadMeta>)]);
  const head = gltf.scene; head.scale.setScalar(1000);
  const parts: Record<string, Mesh> = {};
  head.traverse(o => { const m = o as Mesh; if (m.isMesh) parts[m.name.replace(/_/g, ' ').toLowerCase()] = m; });
  const skin = parts['head skin'];
  const anchors = anchorsFromUV(skin.geometry, meta.landmarks.uv);
  // each target's largest movement of the skin (mm), and from it the target's sane range (portrait-weights.ts)
  head.updateMatrixWorld(true);
  const sc = new Vector3().setFromMatrixScale(skin.matrixWorld).x, maxMm: Record<string, number> = {};
  for (const [name, at] of Object.entries(skin.morphTargetDictionary ?? {})) {
    const a = skin.geometry.morphAttributes.position![at]; let m = 0;
    for (let i = 0; i < a.count; i++) m = Math.max(m, Math.hypot(a.getX(i), a.getY(i), a.getZ(i)));
    maxMm[name] = m * sc;
  }
  return { head, meta, parts, skin, anchors, maxMm, limits: saneLimits(maxMm) };
}

/** Eye centres of the (baked) head, mm, head frame. */
export function eyeCentres(parts: Record<string, Mesh>, head: Object3D) {
  // the eyeball's own centre: the middle of its box across and up, and its radius in from the back (the cornea and iris
  // shells in front would pull a plain mean forward, and an eye turning about a point in front of its centre swings
  // its back out through the lids)
  const c = (m: Mesh) => { const p = meshPointsMm(m, head), lo = [0, 1, 2].map(i => Math.min(...p.map(q => q[i]))), hi = [0, 1, 2].map(i => Math.max(...p.map(q => q[i])));
    const r = Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 2; return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] + r] as P3; };
  return { left: c(parts['eye left']), right: c(parts['eye right']) };
}
