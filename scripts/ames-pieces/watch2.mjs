// AMES iced watch v2: fully iced ("bust-down") square case, lugs and bracelet; white Roman dial; live hands.
import { readFileSync } from 'fs';
import { Builder, Part, facing, qmat, V, deg, THREE } from './lib2.mjs';
const b = new Builder(), metal = new Part(), FRONT = V(0, 0, 1);
const MD = 1.5, PITCH = 1.62; // melee diameter and spacing (mm)
function rrect(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); return s; }
/** Evenly spaced points (and outward normals) round a rounded square. */
function ring(size, r, pitch) { const s = rrect(size, size, r), len = s.getLength(), n = Math.round(len / pitch), out = [];
  for (let i = 0; i < n; i++) { const u = i / n, p = s.getPointAt(u), t = s.getTangentAt(u); out.push({ p: V(p.x, p.y, 0), n: V(t.y, -t.x, 0).normalize() }); } return out; }
const ext = (shape, depth, bevel = .22) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 });
const meleeAt = (group, pos, normal, up = V(0, 0, 1)) => b.melee(group, MD, qmat(pos, facing(normal, Math.abs(normal.dot(up)) > .9 ? V(0, 1, 0) : up)));
const bead = (pos, m) => metal.ball(pos, .24, m, 6);

// Case: 38 mm square, 8.2 mm tall, 29 mm aperture; front face at z = FACE.
const CASE = 38, APER = 29, H = 7.6, FACE = H + .22, R = 6.2;
const frame = rrect(CASE, CASE, R); frame.holes.push(rrect(APER, APER, 3.4)); metal.add(ext(frame, H));
const backPlate = ext(rrect(CASE - 1.6, CASE - 1.6, R - .8), 1.2, .35); backPlate.translate(0, 0, -1.5); metal.add(backPlate);
// Front: three rows of melee across the bezel, beads between rows.
for (const [k, size] of [[0, 36.6], [1, 33.6], [2, 30.6]].map(([k, s]) => [k, s])) {
  const pts = ring(size, R - 1.4 - k * 1.5, PITCH);
  for (const { p } of pts) meleeAt('bezel', V(p.x, p.y, FACE + .04), FRONT);
  if (k < 2) for (const { p, n } of ring(size - 1.5, R - 2.1 - k * 1.5, PITCH)) bead(V(p.x, p.y, FACE + .12));
}
// Sides: three rows facing outward round the case band.
for (const z of [1.6, 3.75, 5.9]) for (const { p, n } of ring(CASE + .22 * 2, R + .22, PITCH)) meleeAt('case side', p.clone().add(n.clone().multiplyScalar(.04)).setZ(z), n);
// Dial and hands (hands are live nodes turned to the viewer's local time by the AMES viewer).
const dial = new THREE.PlaneGeometry(APER - .2, APER - .2); dial.translate(0, 0, H - 1.7);
{ const uv = dial.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
const dialMat = b.material('Dial enamel', [1, 1, 1, 1], 0, .32);
dialMat.setBaseColorTexture(b.doc.createTexture('AMES dial').setImage(new Uint8Array(readFileSync('dial.png'))).setMimeType('image/png'));
b.node('Dial', b.mesh('Dial', dial, dialMat));
const blue = b.material('Blued hands | polished metal', [.16, .3, .72, 1], .55, .22);
function hand(len, w, z) { const s = new THREE.Shape(); s.moveTo(0, -len * .18); s.lineTo(w / 2, 0); s.lineTo(w * .3, len * .8); s.lineTo(0, len); s.lineTo(-w * .3, len * .8); s.lineTo(-w / 2, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: false }); g.translate(0, 0, z); g.computeVertexNormals(); return g; }
const STILL = { hour: 305 * deg, minute: 60 * deg, second: 210 * deg }; // ten past ten for still images
for (const [kind, len, w, z] of [['hour', 8.4, 1.7, H - 1.4], ['minute', 12.4, 1.3, H - 1.1], ['second', 13, .4, H - .82]])
{ // A pivot node carries the turn (and ames_watch_hand); the mesh sits under it so mesh quantization never moves the pivot.
  const name = `${kind[0].toUpperCase() + kind.slice(1)} hand`, q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -STILL[kind]);
  const pivot = b.doc.createNode(name).setRotation(q.toArray()).setExtras({ ames_watch_hand: kind }); b.root.addChild(pivot);
  pivot.addChild(b.doc.createNode(name + ' mesh').setMesh(b.mesh(`${kind} hand`, hand(len, w, z), blue))); }
const cap = new THREE.CylinderGeometry(.75, .75, .4, 20); cap.rotateX(90 * deg); cap.translate(0, 0, H - .55); b.node('Hand cap', b.mesh('Hand cap', cap, blue));
// Crown at three o'clock: fluted, capped with a single diamond.
const crown = new THREE.CylinderGeometry(2.3, 2.3, 3.2, 36); crown.rotateZ(90 * deg); crown.translate(CASE / 2 + 1.9, 0, H / 2); metal.add(crown);
for (let i = 0; i < 18; i++) { const a = i * 20 * deg; metal.rod(V(CASE / 2 + .5, 2.33 * Math.cos(a), H / 2 + 2.33 * Math.sin(a)), V(CASE / 2 + 3.4, 2.33 * Math.cos(a), H / 2 + 2.33 * Math.sin(a)), .16, .16, null, 5); }
b.stone('Crown diamond', 'round', 2.4, 2.4, qmat(V(CASE / 2 + 3.55, 0, H / 2), facing(V(1, 0, 0), V(0, 1, 0))));
// Lugs: integrated blocks carrying the bracelet, paved on top.
for (const sy of [1, -1]) {
  const lug = ext(rrect(23, 6.4, 1.4), H - .8); lug.translate(0, sy * (CASE / 2 + 2.2), .6); metal.add(lug);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 13; c++) meleeAt('lugs', V(-9.72 + c * PITCH + (r % 2) * PITCH / 2, sy * (CASE / 2 + .7 + r * 1.42), H + .05), FRONT);
}
// Bracelet: a closed loop of paved links standing behind the head, as on a display cushion.
const path = new THREE.CatmullRomCurve3([V(0, 25.4, 2.4), V(0, 30, -3), V(0, 33.5, -16), V(0, 31, -32), V(0, 20, -44), V(0, 0, -48), V(0, -20, -44), V(0, -31, -32), V(0, -33.5, -16), V(0, -30, -3), V(0, -25.4, 2.4)], false, 'centripetal');
const total = path.getLength(), links = Math.floor(total / 7.6), LEN = total / links - .55;
for (let i = 0; i < links; i++) {
  const u = (i + .5) / links, p = path.getPointAt(u), t = path.getTangentAt(u), n = V(0, -t.z, t.y).normalize();
  if (n.dot(p.clone().sub(V(0, 0, -23))) < 0) n.negate();
  const m = qmat(p, facing(n, t));
  const link = ext(rrect(20, LEN, 1.1), 2.6, .2); link.rotateX(-90 * deg); link.translate(0, -1.3 - .2, 0); metal.add(link, m); // local: width x, length z, face +y
  for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) {
    const x = -8.9 + c * PITCH + (r % 2) * PITCH / 2, z = -LEN / 2 + .95 + r * ((LEN - 1.9) / 3);
    b.melee('bracelet', MD, m.clone().multiply(qmat(V(x, 1.36, z), new THREE.Quaternion())));
  }
  // Edge rails left and right, polished.
  for (const sx of [-1, 1]) metal.rod(V(sx * 9.95, 1.2, -LEN / 2 + .5), V(sx * 9.95, 1.2, LEN / 2 - .5), .28, .28, m, 8);
}
b.node('Case, lugs and bracelet', b.mesh('White gold case', metal.merged(), b.metal));
await b.write(process.argv[2] ?? 'watch.glb', { raw: process.argv[3] }); console.log('stones', b.gemCount, 'melee', b.meleeCount);
