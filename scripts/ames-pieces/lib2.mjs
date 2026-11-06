// AMES piece builder v2: real brilliant geometry, tapered claws, merged pavé, meshopt output.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, quantize, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { createStudioBrilliantGeometry, createRoundBrilliantGeometry } from './eng.mjs';
export { THREE };
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const deg = Math.PI / 180;
export const CROWN = 0.161, PAVILION = 0.443; // the engine's round brilliant: 34.5 deg crown, 40.9 deg pavilion

/** Girdle outline with the engine's formulas (unit, table axis +y, pear point +z). */
export function outlinePoint(outline, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (outline === 'pear') return [c * (.78 - .25 * s), 1.28 * s];
  if (outline === 'radiant') { const e = Math.min(1 / Math.max(Math.abs(c), Math.abs(s)), 1.75 / (Math.abs(c) + Math.abs(s))); return [c * e, s * e]; }
  return [c, s];
}
export function girdle(outline, W, L, n = 96) {
  const raw = []; for (let i = 0; i < n; i++) raw.push(outlinePoint(outline, i * 2 * Math.PI / n));
  const xs = raw.map(p => p[0]), zs = raw.map(p => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const sx = W / (Math.max(...xs) - Math.min(...xs)), sz = L / (Math.max(...zs) - Math.min(...zs));
  return raw.map(([x, z]) => V((x - cx) * sx, 0, (z - cz) * sz));
}
/** Fit a unit cut to an exact girdle width W, length L and the brilliant's depth. */
function fit(g, W, L) {
  g = g.clone(); g.computeBoundingBox(); const b = g.boundingBox, s = b.getSize(V()), c = b.getCenter(V());
  const d = Math.min(W, L); g.translate(-c.x, -b.min.y, -c.z);
  g.scale(W / s.x, d * (CROWN + PAVILION) / s.y, L / s.z); g.translate(0, -PAVILION * d, 0); return g;
}
const cutCache = {};
export const heroCut = (outline, W, L) => fit(cutCache[outline] ??= createStudioBrilliantGeometry(outline), W, L);
/** Melee: a light single-cut brilliant (octagonal table, 16-sided girdle, pointed culet).
 * At 1-2 mm nobody can count facets, and it is a quarter of the full brilliant's weight. */
const meleeUnit = (() => { const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + .5) * Math.PI / 4; pts.push(V(.56 * Math.cos(a), .322, .56 * Math.sin(a))); }
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; pts.push(V(Math.cos(a), 0, Math.sin(a))); }
  pts.push(V(0, -.886, 0)); return new ConvexGeometry(pts); })();
export const meleeCut = D => fit(meleeUnit, D, D);

function clean(g) { g = g.index ? g : mergeVertices(g, 1e-6); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }
export class Part {
  constructor() { this.list = []; }
  add(g, m) { if (m) g.applyMatrix4(m); this.list.push(clean(g)); return this; }
  /** Tapered rod between two points. */
  rod(a, b, r0, r1 = r0, m, seg = 12) { const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return this.add(g, m); }
  ball(p, r, m, seg = 12, squash = 1) { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * .7 | 0)); g.scale(1, squash, 1); g.translate(p.x, p.y, p.z); return this.add(g, m); }
  tube(points, r, closed = true, m, seg = 8) { const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    return this.add(new THREE.TubeGeometry(curve, Math.max(48, points.length * 2), r, seg, closed), m); }
  merged() { const g = mergeGeometries(this.list, false); g.computeVertexNormals(); return g; }
}
/** Fine claw setting in the stone's frame (table +y), baked through m: tapered claws that
 * bend over the crown edge, a slim gallery wire under the girdle and an inner basket wire. */
export function setting(part, outline, W, L, m, { claws, clawR, gallery = true, basket = true, vTip = false }) {
  const d = Math.min(W, L), g = girdle(outline, W, L, 192);
  for (const a of claws) {
    const i = Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 192) % 192, p = g[i];
    const n = V(p.x, 0, p.z).normalize(), r = vTip && Math.abs(a - Math.PI / 2) < .01 ? clawR * 1.25 : clawR;
    const tip = p.clone().add(n.clone().multiplyScalar(-r * .35)); tip.y = CROWN * d * .32;      // pressed onto the crown
    const shoulder = p.clone().add(n.clone().multiplyScalar(r * .55)); shoulder.y = .02 * d;    // outside the girdle
    const foot = p.clone().multiplyScalar(.62).add(n.clone().multiplyScalar(r * .2)); foot.y = -PAVILION * d * .88;
    part.rod(foot, shoulder, r * .8, r, m, 10); part.rod(shoulder, tip, r, r * .78, m, 10);
    part.ball(shoulder, r, m, 10); part.ball(tip, r * .8, m, 10, .6);
  }
  if (gallery) part.tube(g.filter((_, i) => i % 6 === 0).map(p => { const v = p.clone().multiplyScalar(.985); v.y = -.06 * d; return v; }), clawR * .55, true, m, 8);
  if (basket) part.tube(g.filter((_, i) => i % 6 === 0).map(p => { const v = p.clone().multiplyScalar(.55); v.y = -.3 * d; return v; }), clawR * .5, true, m, 8);
}
export const qmat = (pos, q) => new THREE.Matrix4().compose(pos, q, V(1, 1, 1));
/** Rotation sending local +y (table) to `face` and local +z (pear point / reference) toward `up`. */
export function facing(face, up) { const y = face.clone().normalize(), z = up.clone().sub(y.clone().multiplyScalar(up.dot(y))).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }

export class Builder {
  constructor() {
    this.doc = new Document(); this.buf = this.doc.createBuffer(); this.scene = this.doc.createScene('AMES'); this.gemCount = 0; this.meleeCount = 0;
    this.root = this.doc.createNode('AMES piece (authored in mm)').setScale([.001, .001, .001]); this.scene.addChild(this.root);
    this.metal = this.material('White gold | visual study', [.87, .86, .84, 1], 1, .05);
    this.gem = this.material('Diamond | closed dielectric', [.99, 1, 1, 1], 0, .012);
    this.pave = new Map();
  }
  material(name, color, metallic, rough) { return this.doc.createMaterial(name).setBaseColorFactor(color).setMetallicFactor(metallic).setRoughnessFactor(rough); }
  mesh(name, geo, material) { const d = this.doc, p = d.createPrimitive();
    p.setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes.position.array)).setBuffer(this.buf));
    p.setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes.normal.array)).setBuffer(this.buf));
    if (geo.attributes.uv) p.setAttribute('TEXCOORD_0', d.createAccessor().setType('VEC2').setArray(new Float32Array(geo.attributes.uv.array)).setBuffer(this.buf));
    if (geo.index) p.setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint32Array(geo.index.array)).setBuffer(this.buf));
    p.setMaterial(material); return d.createMesh(name).addPrimitive(p); }
  node(name, mesh, matrix, extras) { const n = this.doc.createNode(name).setMesh(mesh);
    if (matrix) { const p = V(), q = new THREE.Quaternion(), s = V(); matrix.decompose(p, q, s); n.setTranslation(p.toArray()).setRotation(q.toArray()).setScale(s.toArray()); }
    if (extras) n.setExtras(extras); this.root.addChild(n); return n; }
  /** A hero stone: its own node and real brilliant facets; ames_cut lets the engine refit it. */
  stone(name, outline, W, L, matrix) { this.gemCount++;
    return this.node(name, this.mesh(name, heroCut(outline, W, L), this.gem), matrix, { ames_optical_mode: 'closed-dielectric-visual', ames_gemstone_id: 'stone-diamond', ames_cut: outline }); }
  /** Melee for pavé: collected per group and written as one ray-traced mesh. */
  melee(group, D, matrix) { this.meleeCount++; if (!this.pave.has(group)) this.pave.set(group, []); this.pave.get(group).push(meleeCut(D).applyMatrix4(matrix)); }
  flushPave() { for (const [group, list] of this.pave) { this.gemCount++;
      this.node(`Pavé · ${group}`, this.mesh(`Pavé ${group}`, mergeGeometries(list, false), this.gem), null, { ames_optical_mode: 'closed-dielectric-visual', ames_gemstone_id: 'stone-diamond', ames_pave: true }); } }
  async write(path, { raw } = {}) {
    this.flushPave();
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
    await MeshoptEncoder.ready; await MeshoptDecoder.ready;
    await this.doc.transform(dedup(), prune());
    if (raw) await io.write(raw, this.doc);
    await this.doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizeNormal: 10 }));
    await io.write(path, this.doc);
  }
}
