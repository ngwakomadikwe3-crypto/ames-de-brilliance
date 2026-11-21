// The customer's 3D hand: built once from their saved shape (a smooth surface around tapered finger bones, a
// flattened palm and an oval wrist), skinned to a 21-joint skeleton, textured with their photo on the back of
// the hand, and posed live by moving bones only (the surface is never rebuilt while tracking).
// Units are millimetres; rest pose: flat hand, back of the hand toward +z, fingers toward +y, wrist at the origin.
import { Bone, BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Skeleton, SkinnedMesh, Vector3, type Material } from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HandShape, Mm3 } from './hand-profile';

type Seg = { a: Vector3; b: Vector3; ra: number; rb: number; bone: number; flat?: number };
const v = (p: Mm3) => new Vector3(p[0], p[1], p[2]);
export const PARENT = [-1, 0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19];

/** Bone segments with radii: finger widths taper toward the tips; metacarpals and palm move with the wrist bone. */
export function segments(shape: HandShape): Seg[] {
  const J = shape.joints.map(v), out: Seg[] = [];
  const r = shape.fingers.map(w => w / 2);
  for (let f = 0; f < 5; f++) {
    const base = 1 + 4 * f;
    const taper = f === 0 ? [1.18, 1.0, 0.92, 0.8] : [1.04, 0.96, 0.86, 0.74];
    for (let k = 0; k < 3; k++) out.push({ a: J[base + k], b: J[base + k + 1], ra: r[f] * taper[k], rb: r[f] * taper[k + 1], bone: base + k });
    // Metacarpal: wrist to knuckle, inside the palm.
    out.push({ a: f === 0 ? J[0].clone().lerp(J[1], 0.2) : J[0].clone().lerp(J[base], 0.25), b: J[base], ra: r[f] * 1.05, rb: r[f] * 1.12, bone: 0, flat: 1.45 });
  }
  // Palm: a fan of flattened bars across the knuckle line and the heel of the hand.
  const heel = J[0].clone().lerp(J[9], 0.25);
  out.push({ a: J[5], b: J[17], ra: r[1] * 1.1, rb: r[4] * 1.1, bone: 0, flat: 1.5 });
  out.push({ a: heel.clone().lerp(J[5], 0.5), b: heel.clone().lerp(J[17], 0.5), ra: shape.palm * 0.16, rb: shape.palm * 0.15, bone: 0, flat: 1.7 });
  out.push({ a: J[0], b: heel, ra: shape.wrist * 0.42, rb: shape.palm * 0.2, bone: 0, flat: shape.wrist / shape.wristDepth });
  // Wrist and forearm: an oval cylinder below the wrist landmark.
  const down = J[0].clone().sub(J[9]).normalize();
  out.push({ a: J[0].clone().addScaledVector(down, 8), b: J[0].clone().addScaledVector(down, 150), ra: shape.wrist / 2, rb: shape.wrist / 2 * 1.1, bone: 0, flat: shape.wrist / shape.wristDepth });
  return out;
}

function segDistance(p: Vector3, s: Seg, t = { t: 0 }) { return segDist(p.x, p.y, p.z, s, t); }
function segDist(px: number, py: number, pz: number, s: Seg, t = { t: 0 }) {
  const ax = s.a.x, ay = s.a.y, az = s.a.z, bx = s.b.x - ax, by = s.b.y - ay, bz = s.b.z - az;
  const len2 = Math.max(1e-6, bx * bx + by * by + bz * bz);
  const u = Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by + (pz - az) * bz) / len2));
  t.t = u;
  const dx = px - ax - bx * u, dy = py - ay - by * u, dz = (pz - az - bz * u) * (s.flat ?? 1);   // flat: palm and wrist oval
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (s.ra + (s.rb - s.ra) * u);
}
const smin = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); };

/** Build the skinned hand. uvFrom: rest-pose landmark positions -> photo texture coordinates (affine fit). */
export function buildHand(shape: HandShape, material: Material, textureUv?: [number, number][], resolution = 120) {
  const segs = segments(shape);
  const pts = segs.flatMap(s => [s.a, s.b]);
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  pts.forEach(p => { min.min(p); max.max(p); });
  const margin = Math.max(...segs.map(s => Math.max(s.ra, s.rb))) * 1.6;
  min.addScalar(-margin); max.addScalar(margin);
  const centre = min.clone().add(max).multiplyScalar(0.5), extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
  const mc = new MarchingCubes(resolution, material, false, false, 120000);
  mc.isolation = 0;
  const size = mc.size, half = mc.halfsize;
  const boxes = segs.map(s => { const r = Math.max(s.ra, s.rb) + 10; return [Math.min(s.a.x, s.b.x) - r, Math.max(s.a.x, s.b.x) + r, Math.min(s.a.y, s.b.y) - r, Math.max(s.a.y, s.b.y) + r, Math.min(s.a.z, s.b.z) - r, Math.max(s.a.z, s.b.z) + r]; });
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x - half) / half * extent + centre.x, py = (y - half) / half * extent + centre.y, pz = (z - half) / half * extent + centre.z;
    let d = 12;                                                  // anything further than 12 mm outside is just "outside"
    for (let k = 0; k < segs.length; k++) {
      const b = boxes[k];
      if (px < b[0] || px > b[1] || py < b[2] || py > b[3] || pz < b[4] || pz > b[5]) continue;
      d = smin(d, segDist(px, py, pz, segs[k]), 3.5);
    }
    mc.field[x + size * (y + size * z)] = -d;
  }
  mc.update();
  const raw = new BufferGeometry();
  const count = mc.count;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    pos[i] = mc.positionArray[i] * extent + centre.x; pos[i + 1] = mc.positionArray[i + 1] * extent + centre.y; pos[i + 2] = mc.positionArray[i + 2] * extent + centre.z;
  }
  raw.setAttribute('position', new BufferAttribute(pos, 3));
  mc.geometry.dispose();
  const geometry = mergeVertices(raw, 1e-3); raw.dispose();
  geometry.computeVertexNormals();
  // Marching cubes winds faces for a field that grows outward; make the normals point out of the hand.
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const probe = new Vector3(), n = new Vector3();
  let outward = 0;
  for (let i = 0; i < position.count; i += 97) {
    probe.fromBufferAttribute(position, i); n.fromBufferAttribute(normal, i);
    let d = Infinity; for (const s of segs) d = smin(d, segDistance(probe.clone().addScaledVector(n, 1.5), s), 3.5);
    outward += d > 0 ? 1 : -1;
  }
  if (outward < 0) {
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) { const a = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, a); }
    geometry.computeVertexNormals();
  }
  // Skin weights: the two nearest bones, blended softly across each joint.
  const skinIndex = new Uint16Array(position.count * 4), skinWeight = new Float32Array(position.count * 4);
  const dorsal = new Float32Array(position.count), nail = new Float32Array(position.count);
  const J = shape.joints.map(v);
  const t = { t: 0 };
  for (let i = 0; i < position.count; i++) {
    probe.fromBufferAttribute(position, i); n.fromBufferAttribute(normal, i);
    const best = new Map<number, number>();
    for (const s of segs) {
      const d = Math.max(0, segDistance(probe, s, t));
      const w = Math.exp(-(d * d) / (2 * 4.5 * 4.5));
      best.set(s.bone, Math.max(best.get(s.bone) ?? 0, w));
    }
    const top = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
    top.forEach(([bone, w], k) => { skinIndex[i * 4 + k] = bone; skinWeight[i * 4 + k] = w / total; });
    // Back of the hand: facing +z, above the middle of the hand's thickness.
    dorsal[i] = Math.max(0, Math.min(1, (n.z + 0.15) / 0.5));
    for (const tip of [4, 8, 12, 16, 20]) {
      const a = J[tip - 1], b = J[tip], ab = b.clone().sub(a), u = probe.clone().sub(a).dot(ab) / ab.lengthSq();
      const across = probe.clone().sub(a.clone().addScaledVector(ab, Math.max(0, Math.min(1, u))));
      const w = shape.fingers[(tip - 4) / 4] / 2;
      if (u > 0.45 && u < 1.15 && n.z > 0.45 && Math.hypot(across.x, across.y) < w * 0.62) nail[i] = Math.min(1, (u - 0.45) / 0.15);
    }
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  geometry.setAttribute('dorsal', new BufferAttribute(dorsal, 1));
  geometry.setAttribute('nail', new BufferAttribute(nail, 1));
  // Photo texture: an affine map from rest-pose (x, y) to the photo, fitted on the 21 landmarks.
  const uv = new Float32Array(position.count * 2);
  if (textureUv?.length === 21) {
    const map = affine(J.map(j => [j.x, j.y] as [number, number]), textureUv);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i);
      uv[i * 2] = map[0] * x + map[1] * y + map[2]; uv[i * 2 + 1] = map[3] * x + map[4] * y + map[5];
    }
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  // Skeleton at the rest joints; every bone starts unrotated, so its axes are the model axes.
  const bones = J.map(() => new Bone());
  bones.forEach((b, i) => {
    b.name = 'hand-' + i;
    if (PARENT[i] >= 0) { bones[PARENT[i]].add(b); b.position.copy(J[i]).sub(J[PARENT[i]]); } else b.position.copy(J[i]);
  });
  const mesh = new SkinnedMesh(geometry, material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  mesh.frustumCulled = false;
  return { mesh, bones, rest: J };
}

/** Least squares 2D affine map from points a to points b: [m00, m01, m02, m10, m11, m12]. */
export function affine(a: [number, number][], b: [number, number][]) {
  // Normal equations for [x y 1] * M = target, solved per output coordinate.
  const ata = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], atb = [[0, 0, 0], [0, 0, 0]];
  a.forEach(([x, y], i) => {
    const r = [x, y, 1];
    for (let j = 0; j < 3; j++) { for (let k = 0; k < 3; k++) ata[j][k] += r[j] * r[k]; atb[0][j] += r[j] * b[i][0]; atb[1][j] += r[j] * b[i][1]; }
  });
  const inv = invert3(ata);
  const solve = (rhs: number[]) => [0, 1, 2].map(j => inv[j][0] * rhs[0] + inv[j][1] * rhs[1] + inv[j][2] * rhs[2]);
  return [...solve(atb[0]), ...solve(atb[1])];
}
function invert3(m: number[][]) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}

// --- live posing ---------------------------------------------------------------------------------------------------
const frameOf = (p0: Vector3, p5: Vector3, p9: Vector3, p17: Vector3) => {
  const y = p9.clone().sub(p0).normalize();
  const x = p17.clone().sub(p5); x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new Vector3().crossVectors(x, y);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
};

/**
 * Bone rotations that put the rest hand into a live pose, keeping the customer's own bone lengths.
 * live: 21 points in the hand model's space (millimetres, already mirrored to match the model's hand).
 * Returns local quaternions per bone (root first) to be eased into the skeleton.
 */
export function solvePose(rest: Vector3[], live: Vector3[]) {
  const restFrame = frameOf(rest[0], rest[5], rest[9], rest[17]);
  const liveFrame = frameOf(live[0], live[5], live[9], live[17]);
  const world: Quaternion[] = [];
  world[0] = liveFrame.clone().multiply(restFrame.clone().invert());
  const local: Quaternion[] = [world[0].clone()];
  for (let i = 1; i < 21; i++) {
    const parent = world[PARENT[i]];
    const tip = i % 4 === 0;
    if (tip) { world[i] = parent.clone(); local[i] = new Quaternion(); continue; }
    const restDir = rest[i + 1].clone().sub(rest[i]).normalize().applyQuaternion(world[0]);
    const liveDir = live[i + 1].clone().sub(live[i]).normalize();
    // Swing only (no twist): the shortest turn from where the root put this bone to where it is now.
    world[i] = new Quaternion().setFromUnitVectors(restDir, liveDir).multiply(world[0]);
    local[i] = parent.clone().invert().multiply(world[i]);
  }
  return local;
}

/** Is the live hand the other hand from the scanned one? Compare which way the palm frame's z points vs the back of the hand. */
export function handednessFlip(live: Vector3[], dorsal: Vector3, scanned: 'right' | 'left') {
  const y = live[9].clone().sub(live[0]).normalize(), x = live[17].clone().sub(live[5]).normalize();
  const z = new Vector3().crossVectors(x, y);
  const liveRight = z.dot(dorsal) > 0;                         // in the rest frame a right hand's z is its back
  return liveRight !== (scanned === 'right');
}
