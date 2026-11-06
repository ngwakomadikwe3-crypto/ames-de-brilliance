import { Builder, Part, setting, facing, qmat, V, deg, THREE } from './lib.mjs';
const b = new Builder(), metal = new Part();
// 41 round brilliants of 3.4 mm in four-claw baskets around a 60 mm oval, as if lying on a tray.
const N = 41, D = 3.4, RX = 31, RZ = 26;
const curve = new THREE.EllipseCurve(0, 0, RX, RZ, 0, 2 * Math.PI, false, 0);
const pts = curve.getSpacedPoints(N).slice(0, N);
for (let i = 0; i < N; i++) {
  const p = V(pts[i].x, 0, pts[i].y), next = V(pts[(i + 1) % N].x, 0, pts[(i + 1) % N].y), prev = V(pts[(i + N - 1) % N].x, 0, pts[(i + N - 1) % N].y);
  const t = next.clone().sub(prev).normalize(), outward = V(t.z, 0, -t.x); if (outward.dot(p) < 0) outward.negate();
  const face = outward.clone().multiplyScalar(Math.cos(28 * deg)).add(V(0, Math.sin(28 * deg), 0)).normalize(); // tilt up as the bracelet rests
  const m = qmat(p, facing(face, t));
  b.stone(`Tennis diamond ${i}`, 'round', D, D, m);
  setting(metal, 'round', D, D, m, { claws: [45, 135, 225, 315].map(a => a * deg), clawR: .3 });
  // Square box under each stone and a hinge to the next box.
  const box = new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); const h = D * .52; s.moveTo(-h, -h); s.lineTo(h, -h); s.lineTo(h, h); s.lineTo(-h, h); s.closePath(); const hole = new THREE.Path(); const k = h * .72; hole.moveTo(-k, -k); hole.lineTo(-k, k); hole.lineTo(k, k); hole.lineTo(k, -k); hole.closePath(); s.holes.push(hole); return s; })(), { depth: 1.0, bevelEnabled: true, bevelThickness: .15, bevelSize: .15, bevelSegments: 2 });
  box.rotateX(-90 * deg); box.translate(0, -1.75, 0); metal.add(box, m);
  const here = V(0, -1.3, 0).applyMatrix4(m), there = V(0, -1.3, 0).applyMatrix4(qmat(next, facing(face, t)));
  metal.rod(here, there, .32, 10);
}
// Box clasp tongue with a safety bar, tucked under the stones at the back.
const back = V(0, -1.6, -RZ - .3); metal.add(new THREE.BoxGeometry(5.2, 1.4, 2.2), new THREE.Matrix4().makeTranslation(back.x, back.y - .6, back.z));
b.node('Tennis bracelet setting', b.mesh('White gold tennis line', metal.merged(), b.metal));
await b.write(process.argv[2] ?? 'bracelet.glb'); console.log('gems', b.gemCount);
