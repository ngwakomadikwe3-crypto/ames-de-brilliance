// AMES diamond tennis bracelet v3: same design as v2 (3.3 mm brilliants, shared fine claws, slim square
// baskets, hidden hinges), built link by link so the viewer can open the box clasp and lay the
// bracelet flat to show its length and width.
//
// Each link is its own node (local frame: +x along the chain, +y the stone's table, origin the stone),
// tagged ames_link = its place in the flat line counted from the clasp. The clasp is split between the
// links either side of it. The piece root carries ames_bracelet: pitch, link count, length and width (mm).
import { Builder, Part, heroCut, V, deg, THREE, CROWN } from './lib2.mjs';
const b = new Builder();
const D = 3.3, PITCH = 3.62, RX = 30.5, RZ = 25.5, h = D * .5;
const curve = new THREE.EllipseCurve(0, 0, RX, RZ, 0, 2 * Math.PI, false, 0);
const N = Math.round(curve.getLength() / PITCH), pts = curve.getSpacedPoints(N).slice(0, N).map(p => V(p.x, 0, p.y));
const CLASP = Math.round(N * .75);
const frames = pts.map((p, i) => {
  const t = pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize(), out = V(t.z, 0, -t.x); if (out.dot(p) < 0) out.negate();
  const y = out.clone().multiplyScalar(Math.cos(30 * deg)).add(V(0, Math.sin(30 * deg), 0)).normalize();
  const x = t.clone().sub(y.clone().multiplyScalar(t.dot(y))).normalize(), z = new THREE.Vector3().crossVectors(x, y);
  return { p, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)) };
});
const sq = (s, y) => [V(-s, y, -s), V(s, y, -s), V(s, y, s), V(-s, y, s)];
/** One link's basket, claws and hinge pin in its own frame; the clasp links lose the pin across the clasp. */
function linkMetal(i) {
  const m = new Part();
  for (const [s, y, r] of [[h * .98, -.1 * D, .2], [h * .62, -.36 * D, .17]]) { const c = sq(s, y); for (let k = 0; k < 4; k++) m.rod(c[k], c[(k + 1) % 4], r, r, null, 8); }
  for (const k of [0, 1, 2, 3]) m.rod(sq(h * .98, -.1 * D)[k], sq(h * .62, -.36 * D)[k], .17, .17, null, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const shoulder = V(sx * h * .78, .03 * D, sz * h * .78), tip = V(sx * h * .62, CROWN * D * .36, sz * h * .62), foot = V(sx * h * .7, -.2 * D, sz * h * .7);
    m.rod(foot, shoulder, .2, .22, null, 8); m.rod(shoulder, tip, .22, .16, null, 8); m.ball(tip, .17, null, 8, .6);
  }
  // Hinge pin: half towards each neighbour, meeting the neighbour's half under the gap.
  const pinY = -.36 * D, back = i === (CLASP + 1) % N ? 0 : -PITCH / 2, front = i === CLASP ? 0 : PITCH / 2;
  if (front - back > .01) m.rod(V(back, pinY, 0), V(front, pinY, 0), .26, .26, null, 8);
  // Box clasp, split: the tongue on the clasp link, the box on the next link.
  if (i === CLASP) { const g = new THREE.BoxGeometry(2.4, .9, 2.0); g.translate(1.0, -.62 * D, 0); m.add(g); }
  if (i === (CLASP + 1) % N) { const g = new THREE.BoxGeometry(2.6, 1.05, 2.2); g.translate(-1.0, -.62 * D, 0); m.add(g);
    const safety = new THREE.TorusGeometry(.55, .14, 6, 16); safety.rotateY(Math.PI / 2); safety.translate(-1.9, -.62 * D, 1.2); m.add(safety); }
  return m.merged();
}
let width = 0;
for (let i = 0; i < N; i++) {
  const { p, q } = frames[i], order = (i - (CLASP + 1) + N) % N;
  const link = b.doc.createNode(`Bracelet link ${order}`).setTranslation(p.toArray()).setRotation(q.toArray()).setExtras({ ames_link: order });
  b.root.addChild(link);
  b.gemCount++;
  link.addChild(b.doc.createNode(`Tennis diamond ${i}`).setMesh(b.mesh(`Tennis diamond ${i}`, heroCut('round', D, D), b.gem))
    .setExtras({ ames_optical_mode: 'closed-dielectric-visual', ames_gemstone_id: 'stone-diamond', ames_cut: 'round' }));
  const metal = linkMetal(i); metal.computeBoundingBox(); width = Math.max(width, metal.boundingBox.max.z - metal.boundingBox.min.z, D);
  link.addChild(b.doc.createNode(`Link setting ${i}`).setMesh(b.mesh(`White gold tennis link ${i}`, metal, b.metal)));
}
const length = Math.round(N * PITCH * 10) / 10;
b.root.setExtras({ ames_bracelet: { links: N, pitch: PITCH, length_mm: length, width_mm: Math.round(width * 10) / 10, clasp: 'box clasp with figure-eight safety' } });
await b.write(process.argv[2] ?? 'bracelet3.glb', { raw: process.argv[3] });
console.log('links', N, 'stones', b.gemCount, 'length', length, 'mm width', width.toFixed(2), 'mm');
