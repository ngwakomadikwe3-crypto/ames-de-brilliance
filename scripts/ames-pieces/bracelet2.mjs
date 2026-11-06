// AMES diamond tennis bracelet v2: 3.3 mm brilliants, shared fine claws, slim square baskets, hidden hinges.
import { Builder, Part, facing, qmat, V, deg, THREE, CROWN, PAVILION } from './lib2.mjs';
const b = new Builder(), metal = new Part();
const D = 3.3, PITCH = 3.62, RX = 30.5, RZ = 25.5;
const curve = new THREE.EllipseCurve(0, 0, RX, RZ, 0, 2 * Math.PI, false, 0);
const N = Math.round(curve.getLength() / PITCH), pts = curve.getSpacedPoints(N).slice(0, N).map(p => V(p.x, 0, p.y));
const frames = pts.map((p, i) => { const t = pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize(), out = V(t.z, 0, -t.x); if (out.dot(p) < 0) out.negate();
  const face = out.clone().multiplyScalar(Math.cos(30 * deg)).add(V(0, Math.sin(30 * deg), 0)).normalize(); return { p, t, m: qmat(p, facing(face, t)) }; });
for (let i = 0; i < N; i++) {
  const { m } = frames[i], h = D * .5;
  b.stone(`Tennis diamond ${i}`, 'round', D, D, m);
  // Square basket: thin top frame under the girdle and a lower frame, joined at the corners.
  const sq = (s, y) => [V(-s, y, -s), V(s, y, -s), V(s, y, s), V(-s, y, s)];
  for (const [s, y, r] of [[h * .98, -.1 * D, .2], [h * .62, -.36 * D, .17]]) { const c = sq(s, y); for (let k = 0; k < 4; k++) metal.rod(c[k], c[(k + 1) % 4], r, r, m, 8); }
  for (const k of [0, 1, 2, 3]) metal.rod(sq(h * .98, -.1 * D)[k], sq(h * .62, -.36 * D)[k], .17, .17, m, 8);
  // Claws on the four corners between stones (adjacent baskets share the gap), tapered and bent over.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const shoulder = V(sx * h * .78, .03 * D, sz * h * .78), tip = V(sx * h * .62, CROWN * D * .36, sz * h * .62), foot = V(sx * h * .7, -.2 * D, sz * h * .7);
    metal.rod(foot, shoulder, .2, .22, m, 8); metal.rod(shoulder, tip, .22, .16, m, 8); metal.ball(tip, .17, m, 8, .6);
  }
  // Hinge pin to the next basket, hidden below.
  const here = V(0, -.36 * D, 0).applyMatrix4(m), there = V(0, -.36 * D, 0).applyMatrix4(frames[(i + 1) % N].m);
  metal.rod(here, there, .26, .26, null, 8);
}
// Box clasp with a figure-eight safety, at the back under the line.
const back = frames[Math.round(N * .75)];
const clasp = new THREE.BoxGeometry(2.2, 1.0, 5.2); clasp.applyMatrix4(qmat(V(0, -.62 * D, 0), new THREE.Quaternion())); metal.add(clasp, back.m);
b.node('Tennis bracelet setting', b.mesh('White gold tennis line', metal.merged(), b.metal));
await b.write(process.argv[2] ?? 'bracelet.glb', { raw: process.argv[3] }); console.log('stones', b.gemCount);
