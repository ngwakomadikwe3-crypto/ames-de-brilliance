// The realistic hand twin. A sculpted template (scripts/blender/create_realistic_hand.py, built on the MIT WebXR
// generic hand) is fitted to the customer's measurements: every bone keeps the template's direction but takes the
// customer's length, fingers take their width, the palm their breadth and length. Skin follows by blending the
// per-bone fits with the skin weights, so nothing tears at the joints. Then the same 21-bone skeleton as the
// tracking pipeline (bone i sits at landmark i) is bound at the fitted joints, so solvePose drives it unchanged.
import {
  Bone, BufferAttribute, BufferGeometry, Float32BufferAttribute, Mesh, Quaternion, Skeleton, SkinnedMesh, Vector3, type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PARENT, affine } from './clone-hand';
import type { HandShape, Mm3 } from './hand-profile';
import type { TemplateMeasure } from './hand-morph';

const MID_JOINT = [3, 6, 10, 14, 18], BASE_SEG = [[2, 3, 0.4], [5, 6, 0.38], [9, 10, 0.38], [13, 14, 0.38], [17, 18, 0.38]] as const;

export const HAND_TEMPLATE_URL = '/hand-twin/realistic-hand-v1.glb';

export interface HandTemplate {
  skin: BufferGeometry; nails: BufferGeometry;
  joints: Vector3[]; relaxed: Quaternion[]; chainS: number[][];
  measure: { fingers: number[]; fingersMid: number[]; palm: number; wrist: number; wristDepth: number };
}

/** Float copy of an attribute (quantised glTF data -> plain millimetres). */
function floatCopy(a: BufferAttribute, size = a.itemSize) {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = a.getComponent(i, k);
  return new Float32BufferAttribute(out, size);
}

export async function loadHandTemplate(url = HAND_TEMPLATE_URL): Promise<HandTemplate> {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  return parseHandTemplate(await loader.loadAsync(url));
}

/** The template from a loaded glTF (also used by the rig test, which parses the file without a browser). */
export function parseHandTemplate(gltf: { scene: import('three').Object3D; parser: { json: unknown } }): HandTemplate {
  const extras = (gltf.parser.json as { extras?: { ames_hand_template?: Record<string, unknown> } }).extras?.ames_hand_template;
  if (!extras) throw new Error('Hand template data missing');
  gltf.scene.updateMatrixWorld(true);
  const take = (name: string, rename: Record<string, string>) => {
    let found: Mesh | undefined;
    gltf.scene.traverse(o => { if ((o as Mesh).isMesh && o.name.toLowerCase().includes(name)) found = o as Mesh; });
    if (!found) throw new Error(`Hand template mesh ${name} missing`);
    const src = found.geometry, g = new BufferGeometry();
    // undo the quantisation transform on the node: positions back to millimetres
    const pos = floatCopy(src.getAttribute('position') as BufferAttribute); pos.applyMatrix4(found.matrixWorld);
    const nor = floatCopy(src.getAttribute('normal') as BufferAttribute);     // quantisation is scale + offset only
    for (let i = 0; i < nor.count; i++) { const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i), l = Math.hypot(x, y, z) || 1; nor.setXYZ(i, x / l, y / l, z / l); }
    g.setAttribute('position', pos); g.setAttribute('normal', nor);
    g.setAttribute('skinIndex', src.getAttribute('skinIndex')); g.setAttribute('skinWeight', floatCopy(src.getAttribute('skinWeight') as BufferAttribute));
    for (const [from, to] of Object.entries(rename)) g.setAttribute(to, floatCopy(src.getAttribute(from) as BufferAttribute));
    g.setIndex(src.getIndex());
    src.dispose();
    return g;
  };
  const skin = take('skin', { _finger: 'aFinger', _skin: 'aSkin', _palm: 'aPalm' });
  const nails = take('nail', { _nail: 'aNail' });
  const t = extras as { joints: Mm3[]; relaxed: number[][]; chainS: number[][]; measure: Omit<HandTemplate['measure'], 'fingersMid'> };
  const joints = t.joints.map(j => new Vector3(...j));
  // widths at the middle joints, measured on the mesh the same way as the base widths, calibrated to them
  const fingersMid = MID_JOINT.map((j, f) => {
    const [a, b, at] = BASE_SEG[f];
    const own = f === 0 ? [1, 2, 3, 4] : [5, 6, 7, 8].map(x => x + 4 * (f - 1));
    const base = crossWidth(skin, joints[a].clone().lerp(joints[b], at), joints[b].clone().sub(joints[a]), own);
    const mid = crossWidth(skin, joints[j], joints[j + 1].clone().sub(joints[PARENT[j]]), own);
    return base > 0 && mid > 0 ? t.measure.fingers[f] * mid / base : t.measure.fingers[f] * 0.9;
  });
  return {
    skin, nails, chainS: t.chainS, measure: { ...t.measure, fingersMid },
    joints,
    relaxed: t.relaxed.map(q => new Quaternion(q[0], q[1], q[2], q[3])),
  };
}

/** Width of the finger through `c` across its direction `dir` (side to side, as a photo of the back sees it), over the
 *  vertices the finger's own bones carry most (so a neighbouring finger never counts). */
function crossWidth(g: BufferGeometry, c: Vector3, dir: Vector3, bones: number[]) {
  const d = dir.clone().normalize(), lat = d.clone().cross(new Vector3(0, 0, 1)).normalize(), p = new Vector3();
  const pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    if (!bones.includes(best)) continue;
    p.fromBufferAttribute(pos, i).sub(c);
    if (Math.abs(p.dot(d)) > 1.2) continue;
    const x = p.dot(lat); lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return hi > lo ? hi - lo : 0;
}

/** The template's measurements in the form the hand morph compares a customer's hand with. */
export function templateMeasure(t: HandTemplate): TemplateMeasure {
  return { joints: t.joints.map(j => [j.x, j.y, j.z] as Mm3), fingers: [...t.measure.fingers], fingersMid: [...t.measure.fingersMid], palm: t.measure.palm, wrist: t.measure.wrist, wristDepth: t.measure.wristDepth };
}

/** The template's own measurements as a HandShape (used when the customer has not scanned their hand). */
export function templateShape(t: HandTemplate): HandShape {
  return { joints: t.joints.map(j => [j.x, j.y, j.z] as Mm3), fingers: [...t.measure.fingers], palm: t.measure.palm, wrist: t.measure.wrist, wristDepth: t.measure.wristDepth, side: 'right' };
}

const clampRatio = (r: number) => (Number.isFinite(r) && r > 0 ? Math.min(1.25, Math.max(0.8, r)) : 1);
const dist = (a: Mm3, b: Mm3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fingerOf = (b: number) => (b >= 1 && b <= 4 ? 0 : b >= 5 ? Math.floor((b - 5) / 4) + 1 : -1);

/** Fitted joints plus the per-bone scale used to carry the skin. */
export function fitTemplate(t: HandTemplate, shape: HandShape) {
  const T = t.joints, S = shape.joints;
  const sx = clampRatio(shape.palm / t.measure.palm);
  const sy = clampRatio(dist(S[0], S[9]) / T[0].distanceTo(T[9]));
  const sz = (sx + sy) / 2;
  const wristX = clampRatio(shape.wrist / t.measure.wrist), wristZ = clampRatio(shape.wristDepth / t.measure.wristDepth);
  const rest: Vector3[] = new Array(21);
  const lenRatio = new Array(21).fill(1), widthRatio = new Array(21).fill(1);
  rest[0] = new Vector3();
  for (let b = 1; b < 21; b++) {
    const p = PARENT[b];
    if (p === 0) { rest[b] = new Vector3(T[b].x * sx, T[b].y * sy, T[b].z * sz); continue; }
    const r = clampRatio(dist(S[b], S[p]) / T[b].distanceTo(T[p]));
    lenRatio[p] = r;
    rest[b] = rest[p].clone().add(T[b].clone().sub(T[p]).multiplyScalar(r));
  }
  // thickness: the base phalanx (and the thumb's metacarpal) from the base width, the phalanges beyond it from the
  // middle-joint width when the shape has one
  const mid = (shape as HandShape & { fingersMid?: number[] }).fingersMid;
  for (let b = 1; b < 21; b++) {
    const f = fingerOf(b); if (f < 0) continue;
    const beyond = f === 0 ? b >= 3 : (b - 5) % 4 >= 1;
    widthRatio[b] = clampRatio(beyond && mid ? mid[f] / t.measure.fingersMid[f] : shape.fingers[f] / t.measure.fingers[f]);
  }
  return { rest, lenRatio, widthRatio, palm: new Vector3(sx, sy, sz), wristX, wristZ };
}

/** Carry template positions to the fitted hand: each bone's fit (scale along/across the bone), blended by weight. */
function carry(g: BufferGeometry, t: HandTemplate, fit: ReturnType<typeof fitTemplate>) {
  const pos = g.getAttribute('position') as BufferAttribute, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
  const out = new Float32Array(pos.count * 3), p = new Vector3(), q = new Vector3(), acc = new Vector3();
  const dirs = t.joints.map((j, b) => (b > 0 && b % 4 !== 0 && b < 20 ? t.joints[b + 1].clone().sub(j).normalize() : new Vector3(0, 1, 0)));
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w <= 0) continue;
      const b = si.getComponent(i, k);
      if (b === 0) {
        // palm and forearm: palm scale, easing to the wrist's own width and depth below the wrist crease
        const below = Math.min(1, Math.max(0, -p.y / 30));
        q.set(p.x * (fit.palm.x + (fit.wristX - fit.palm.x) * below), p.y * fit.palm.y, p.z * (fit.palm.z + (fit.wristZ - fit.palm.z) * below));
      } else {
        const d = dirs[b], rel = p.clone().sub(t.joints[b]), along = rel.dot(d);
        const across = rel.addScaledVector(d, -along).multiplyScalar(fit.widthRatio[b]);
        q.copy(fit.rest[b]).addScaledVector(d, along * fit.lenRatio[b]).add(across);
      }
      acc.addScaledVector(q, w);
    }
    out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
  }
  const geo = g.clone(); geo.setAttribute('position', new Float32BufferAttribute(out, 3)); geo.computeBoundingSphere();
  return geo;
}

/** Build the fitted, skinned hand (skin + nails on one skeleton). Same contract as buildHand. */
export function buildRealHand(t: HandTemplate, shape: HandShape, skin: Material, nail: Material, textureUv?: [number, number][]) {
  const fit = fitTemplate(t, shape);
  const skinGeo = carry(t.skin, t, fit), nailGeo = carry(t.nails, t, fit);
  // photo texture: affine map from the fitted rest (x, y) to the photo, fitted on the 21 landmarks
  const pos = skinGeo.getAttribute('position'), uv = new Float32Array(pos.count * 2);
  if (textureUv?.length === 21) {
    const map = affine(fit.rest.map(j => [j.x, j.y] as [number, number]), textureUv);
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); uv[i * 2] = map[0] * x + map[1] * y + map[2]; uv[i * 2 + 1] = map[3] * x + map[4] * y + map[5]; }
  }
  skinGeo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const bones = fit.rest.map(() => new Bone());
  bones.forEach((b, i) => {
    b.name = 'hand-' + i;
    if (PARENT[i] >= 0) { bones[PARENT[i]].add(b); b.position.copy(fit.rest[i]).sub(fit.rest[PARENT[i]]); } else b.position.copy(fit.rest[i]);
  });
  const mesh = new SkinnedMesh(skinGeo, skin);
  mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  mesh.bind(skeleton);
  const nails = new SkinnedMesh(nailGeo, nail); nails.name = 'nails';
  mesh.add(nails); nails.updateMatrixWorld(true); nails.bind(skeleton, mesh.matrixWorld);
  mesh.frustumCulled = nails.frustumCulled = false;
  nails.castShadow = true; nails.receiveShadow = true;
  // the plate sits on the nail bed, nearly coplanar with the skin: drawn after the skin and pulled forward in depth
  nails.renderOrder = 2; if (nail) Object.assign(nail, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  return { mesh, nails, bones, rest: fit.rest, relaxed: t.relaxed.map(q => q.clone()), chainS: t.chainS };
}

export { clampPose } from './joint-limits';

/** How far each joint is bent, 0 (straight) .. 1 (90 degrees): drives crease depth in the skin shader. */
export function jointBends(bones: Bone[], into: Float32Array) {
  for (let i = 0; i < 21; i++) { const w = Math.min(1, Math.abs(bones[i].quaternion.w)); into[i] = Math.min(1.2, 2 * Math.acos(w) / (Math.PI / 2)); }
  return into;
}
