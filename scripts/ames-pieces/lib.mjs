import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
export { THREE };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Girdle outline in the engine's own formulas (unit, table axis +y, pear point +z). */
export function outlinePoint(outline, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (outline === 'pear') return [c * (.78 - .25 * s), 1.28 * s];
  if (outline === 'radiant') { const e = Math.min(1 / Math.max(Math.abs(c), Math.abs(s)), 1.75 / (Math.abs(c) + Math.abs(s))); return [c * e, s * e]; }
  if (outline === 'oval') return [c, s * 1.3];
  return [c, s];
}
/** Girdle curve scaled to an exact width (x) and length (z), centred. */
export function girdle(outline, W, L, n = 96) {
  const raw = []; for (let i = 0; i < n; i++) raw.push(outlinePoint(outline, i * 2 * Math.PI / n));
  const xs = raw.map(p => p[0]), zs = raw.map(p => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const sx = W / (Math.max(...xs) - Math.min(...xs)), sz = L / (Math.max(...zs) - Math.min(...zs));
  return raw.map(([x, z]) => V((x - cx) * sx, 0, (z - cz) * sz));
}
export const CROWN = 0.17, PAVILION = 0.45;
/** Convex placeholder; the engine refits a full brilliant to these exact bounds. */
export function gemPlaceholder(outline, W, L) {
  const g = girdle(outline, W, L, 48), d = Math.min(W, L), pts = [];
  for (const p of g) { pts.push(V(p.x, .012 * d, p.z), V(p.x, -.012 * d, p.z), V(p.x * .56, CROWN * d, p.z * .56), V(p.x * .62, -.14 * d, p.z * .62)); }
  pts.push(V(0, -PAVILION * d, 0));
  const geo = new ConvexGeometry(pts); return geo;
}
function clean(g) { g = g.index ? g : mergeVertices(g, 1e-7); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }
export class Part {
  constructor() { this.list = []; }
  add(g, m) { if (m) g.applyMatrix4(m); this.list.push(clean(g)); return this; }
  /** Cylinder between two points. */
  rod(a, b, r, seg = 14, m) { const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return this.add(g, m); }
  ball(p, r, m, seg = 14) { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * .7 | 0)); g.translate(p.x, p.y, p.z); return this.add(g, m); }
  tube(points, r, closed = true, m, seg = 10) { const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    return this.add(new THREE.TubeGeometry(curve, Math.max(48, points.length * 2), r, seg, closed), m); }
  merged() { const g = mergeGeometries(this.list, false); g.computeVertexNormals(); return g; }
}
/** A claw setting built in the stone's local frame (table +y), baked through matrix m. */
export function setting(part, outline, W, L, m, { claws, clawR, gallery = true, basket = true }) {
  const d = Math.min(W, L), g = girdle(outline, W, L, 96);
  const out = p => { const v = p.clone(); const r = Math.hypot(v.x, v.z) || 1; return v; };
  for (const a of claws) {
    const i = Math.round(((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 96) % 96, p = g[i];
    const n = V(p.x, 0, p.z).normalize();
    const top = p.clone().add(n.clone().multiplyScalar(clawR * .35)); top.y = CROWN * d * .42;
    const low = p.clone().multiplyScalar(.72).add(n.clone().multiplyScalar(clawR * .3)); low.y = -PAVILION * d * .92;
    part.rod(low, top, clawR, 12, m); part.ball(top, clawR * 1.12, m, 12); part.ball(low, clawR, m, 10);
  }
  if (gallery) part.tube(g.filter((_, i) => i % 4 === 0).map(p => { const v = p.clone().multiplyScalar(.96); v.y = -.07 * d; return v; }), clawR * .72, true, m, 8);
  if (basket) part.tube(g.filter((_, i) => i % 4 === 0).map(p => { const v = p.clone().multiplyScalar(.6); v.y = -.24 * d; return v; }), clawR * .62, true, m, 8);
}
export const deg = Math.PI / 180;
export const mat4 = (pos, euler, order = 'XYZ') => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler, order)), V(1, 1, 1));
export const qmat = (pos, q) => new THREE.Matrix4().compose(pos, q, V(1, 1, 1));
/** Rotation that sends local +y (table) to `face` and local +z (pear point / reference) toward `up`. */
export function facing(face, up) { const y = face.clone().normalize(), z = up.clone().sub(y.clone().multiplyScalar(up.dot(y))).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }
export { V };

export class Builder {
  constructor() { this.doc = new Document(); this.buf = this.doc.createBuffer(); this.scene = this.doc.createScene('AMES'); this.meshes = new Map(); this.gemCount = 0; this.root = this.doc.createNode('AMES piece (authored in mm)').setScale([.001, .001, .001]); this.scene.addChild(this.root);
    this.metal = this.doc.createMaterial('White gold | visual study').setBaseColorFactor([.87, .86, .84, 1]).setMetallicFactor(1).setRoughnessFactor(.05);
    this.gem = this.doc.createMaterial('Diamond | closed dielectric').setBaseColorFactor([.99, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(.012); }
  material(name, color, metallic, rough) { return this.doc.createMaterial(name).setBaseColorFactor(color).setMetallicFactor(metallic).setRoughnessFactor(rough); }
  mesh(name, geo, material) { const d = this.doc, p = d.createPrimitive();
    p.setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes.position.array)).setBuffer(this.buf));
    p.setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes.normal.array)).setBuffer(this.buf));
    if (geo.attributes.uv) p.setAttribute('TEXCOORD_0', d.createAccessor().setType('VEC2').setArray(new Float32Array(geo.attributes.uv.array)).setBuffer(this.buf));
    if (geo.index) { const n = geo.attributes.position.count; p.setIndices(d.createAccessor().setType('SCALAR').setArray(n > 65535 ? new Uint32Array(geo.index.array) : new Uint16Array(geo.index.array)).setBuffer(this.buf)); }
    p.setMaterial(material); return d.createMesh(name).addPrimitive(p); }
  node(name, mesh, matrix, extras) { const n = this.doc.createNode(name).setMesh(mesh); if (matrix) { const p = V(), q = new THREE.Quaternion(), s = V(); matrix.decompose(p, q, s); n.setTranslation(p.toArray()).setRotation(q.toArray()).setScale(s.toArray()); }
    if (extras) n.setExtras(extras); this.root.addChild(n); return n; }
  /** One shared placeholder mesh per cut and size; one node per stone. */
  stone(name, outline, W, L, matrix) { const key = `${outline}:${W.toFixed(5)}:${L.toFixed(5)}`;
    if (!this.meshes.has(key)) this.meshes.set(key, this.mesh(`Diamond ${outline} ${(W * 1000).toFixed(1)}mm`, gemPlaceholder(outline, W, L), this.gem));
    this.gemCount++; return this.node(name, this.meshes.get(key), matrix, { ames_optical_mode: 'closed-dielectric-visual', ames_gemstone_id: 'stone-diamond', ames_cut: outline }); }
  async write(path) { await new NodeIO().write(path, this.doc); }
}
