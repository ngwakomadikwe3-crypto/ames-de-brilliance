import { Builder, Part, facing, qmat, V, deg, THREE } from './lib.mjs';
const b = new Builder(), metal = new Part();
const FRONT = V(0, 0, 1);
function rrect(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function rrectPath(w, h, r) { return rrect(w, h, r).getSpacedPoints(400).slice(0, -1); }
// Case: 38 mm square, softly rounded, 8 mm tall, with a 29 mm aperture.
const CASE = 38, APER = 28.6, DEPTH = 7.6, FACE = DEPTH + .6; // front face: depth + .35 + bevel .25
const frame = rrect(CASE, CASE, 7); frame.holes.push(rrect(APER, APER, 3.6));
metal.add(new THREE.ExtrudeGeometry(frame, { depth: DEPTH + .35, bevelEnabled: true, bevelThickness: .25, bevelSize: .25, bevelSegments: 2, curveSegments: 18 }));
metal.add(new THREE.ExtrudeGeometry(rrect(CASE - 2, CASE - 2, 6.4), { depth: 1.2, bevelEnabled: true, bevelThickness: .4, bevelSize: .4, bevelSegments: 3, curveSegments: 18 }), new THREE.Matrix4().makeTranslation(0, 0, -1.4));
// Pavé bezel: one row of 2.1 mm stones on the 33.4 mm centre line, bright rims either side, beads between stones.
const line = rrectPath(33.4, 33.4, 5.4); const per = line.length; const N = 42;
const rimO = rrectPath(37.0, 37.0, 6.8).map(p => V(p.x, p.y, FACE + .25)), rimI = rrectPath(29.8, 29.8, 4.0).map(p => V(p.x, p.y, FACE + .25));
metal.tube(rimO.filter((_, i) => i % 4 === 0), .34, true, null, 8); metal.tube(rimI.filter((_, i) => i % 4 === 0), .34, true, null, 8);
for (let i = 0; i < N; i++) { const p = line[Math.round(i * per / N) % per], q = line[Math.round((i + .5) * per / N) % per];
  b.stone(`Bezel diamond ${i}`, 'round', 2.8, 2.8, qmat(V(p.x, p.y, FACE + .14), facing(FRONT, V(0, 1, 0))));
  const t = V(q.x, q.y, 0).normalize(); metal.ball(V(q.x, q.y, FACE + .2), .28, null, 10);
  metal.ball(V(q.x * .955, q.y * .955, FACE + .2), .24, null, 8); metal.ball(V(q.x * 1.045, q.y * 1.045, FACE + .2), .24, null, 8); }
// Dial, recessed, with hands at ten past ten.
const dial = new THREE.PlaneGeometry(APER - .2, APER - .2); dial.translate(0, 0, DEPTH - 1.6);
{ const uv = dial.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
const dialMat = b.material('Dial enamel', [1, 1, 1, 1], 0, .32);
dialMat.setBaseColorTexture(b.doc.createTexture('AMES dial').setImage(new Uint8Array((await import('fs')).readFileSync('dial.png'))).setMimeType('image/png'));
b.node('Dial', b.mesh('Dial', dial, dialMat));
const blue = b.material('Blued hands | polished metal', [.16, .3, .72, 1], .55, .22);
function hand(len, w, z, angle) { const s = new THREE.Shape(); s.moveTo(0, -len * .18); s.lineTo(w / 2, 0); s.lineTo(w * .3, len * .8); s.lineTo(0, len); s.lineTo(-w * .3, len * .8); s.lineTo(-w / 2, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .22, bevelEnabled: false }); g.rotateZ(-angle); g.translate(0, 0, z); return g; }
// Hands are separate nodes authored pointing at 12 and pivoting on the dial centre.
// The viewer turns them to the viewer's local time (ames_watch_hand), so the watch keeps time.
const HAND_ANGLE = { hour: 305 * deg, minute: 60 * deg, second: 180 * deg }; // still image: ten past ten
for (const [kind, len, w, z] of [['hour', 8.2, 1.7, DEPTH - 1.3], ['minute', 12.2, 1.3, DEPTH - 1.0], ['second', 12.8, .42, DEPTH - .72]]) {
  const g = hand(len, w, z, 0); g.computeVertexNormals();
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -HAND_ANGLE[kind]);
  b.node(`${kind[0].toUpperCase() + kind.slice(1)} hand`, b.mesh(`${kind} hand`, g, blue), new THREE.Matrix4().compose(V(0, 0, 0), q, V(1, 1, 1)), { ames_watch_hand: kind });
}
const cap = new THREE.CylinderGeometry(.75, .75, .5, 20); cap.rotateX(90 * deg); cap.translate(0, 0, DEPTH - .4); cap.computeVertexNormals();
b.node('Hand cap', b.mesh('Hand cap', cap, blue));
// Fluted crown at three o'clock capped with a single diamond.
metal.add(new THREE.CylinderGeometry(2.4, 2.4, 3.2, 24), new THREE.Matrix4().compose(V(CASE / 2 + 1.9, 0, DEPTH / 2), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 90 * deg), V(1, 1, 1)));
for (let i = 0; i < 12; i++) { const a = i * 30 * deg; metal.rod(V(CASE / 2 + .5, 2.45 * Math.cos(a), DEPTH / 2 + 2.45 * Math.sin(a)), V(CASE / 2 + 3.4, 2.45 * Math.cos(a), DEPTH / 2 + 2.45 * Math.sin(a)), .22, 6); }
b.stone('Crown diamond', 'round', 2.3, 2.3, qmat(V(CASE / 2 + 3.55, 0, DEPTH / 2), facing(V(1, 0, 0), V(0, 1, 0))));
// Integrated lug blocks, paved across the top face.
for (const sy of [1, -1]) {
  metal.add(new THREE.ExtrudeGeometry(rrect(23, 6, 1.6), { depth: 5.75, bevelEnabled: true, bevelThickness: .2, bevelSize: .2, bevelSegments: 2 }), new THREE.Matrix4().makeTranslation(0, sy * (CASE / 2 + 2.2), .6));
  for (let k = 0; k < 6; k++) b.stone(`Lug diamond ${sy > 0 ? 'top' : 'bottom'} ${k}`, 'round', 2.8, 2.8, qmat(V(-8.75 + k * 3.5, sy * (CASE / 2 + 2.2), 6.7), facing(FRONT, V(0, 1, 0))));
}
// Bracelet: a closed loop of paved links standing behind the head, as on a display cushion.
const path = new THREE.CatmullRomCurve3([V(0, 25.4, 2.2), V(0, 30, -3), V(0, 33.5, -16), V(0, 31, -32), V(0, 20, -44), V(0, 0, -48), V(0, -20, -44), V(0, -31, -32), V(0, -33.5, -16), V(0, -30, -3), V(0, -25.4, 2.2)], false, 'centripetal');
const total = path.getLength(), LINK = 7.4, links = Math.floor(total / LINK);
for (let i = 0; i < links; i++) {
  const u = (i + .5) / links, p = path.getPointAt(u), t = path.getTangentAt(u), n = V(0, -t.z, t.y).normalize(); // outward in y-z
  if (n.dot(p.clone().sub(V(0, 0, -23))) < 0) n.negate();
  const q = facing(n, t), m = qmat(p, q);
  const link = new THREE.ExtrudeGeometry(rrect(20, total / links - .7, 1.5), { depth: 2.9, bevelEnabled: true, bevelThickness: .22, bevelSize: .2, bevelSegments: 2 });
  link.rotateX(-90 * deg); link.translate(0, -1.45, 0); // local: width x, length z, thickness y (face +y)
  metal.add(link, m);
  for (let k = 0; k < 5; k++) b.stone(`Link ${i} diamond ${k}`, 'round', 3.2, 3.2, m.clone().multiply(qmat(V(-7.4 + k * 3.7, 1.86, 0), new THREE.Quaternion())));
  for (let k = 0; k < 4; k++) for (const dz of [-1.75, 1.75]) metal.ball(V(-5.55 + k * 3.7, 1.75, dz), .3, m, 8);
}
b.node('Case, bezel, lugs and bracelet', b.mesh('White gold case', metal.merged(), b.metal));
await b.write(process.argv[2] ?? 'watch.glb'); console.log('gems', b.gemCount);
