// AMES iced watch v3: iced square case (half the diamonds of v2: full bezel, one row round the case band,
// two rows on the lugs, a paved centre stripe on each bracelet link with polished flanks); white Roman dial;
// live hands. Built link by link so it can be unclasped: the head and each bracelet link are their own node
// (local frame +x along the strap, +y the face), tagged ames_link = place in the flat line from the clasp and
// ames_flat_x = where it lies when laid flat (the head is wider than a link). Fold-over clasp at six o'clock.
import { readFileSync } from 'fs';
import { Builder, Part, facing, qmat, V, deg, THREE } from './lib2.mjs';
const b = new Builder(), metal = new Part(), FRONT = V(0, 0, 1);
// The head: a link node in the strap's frame (x toward twelve o'clock, y the dial), and inside it a node back in
// the watch's own frame (dial +z), so the case, dial and hands keep their coordinates and the hands turn about z.
const H0 = 7.6, headFrame = new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0)).setPosition(0, 0, H0 / 2);
const headNode = b.doc.createNode('Watch head (strap link)'), headInner = b.doc.createNode('Watch head');
{ const p = V(), q = new THREE.Quaternion(), sc = V(); headFrame.decompose(p, q, sc); headNode.setTranslation(p.toArray()).setRotation(q.toArray());
  headFrame.clone().invert().decompose(p, q, sc); headInner.setTranslation(p.toArray()).setRotation(q.toArray()); }
b.root.addChild(headNode); headNode.addChild(headInner);
const MD = 1.5, PITCH = 1.62; // melee diameter and spacing (mm)
function rrect(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); return s; }
/** Evenly spaced points (and outward normals) round a rounded square. */
function ring(size, r, pitch) { const s = rrect(size, size, r), len = s.getLength(), n = Math.round(len / pitch), out = [];
  for (let i = 0; i < n; i++) { const u = i / n, p = s.getPointAt(u), t = s.getTangentAt(u); out.push({ p: V(p.x, p.y, 0), n: V(t.y, -t.x, 0).normalize() }); } return out; }
const ext = (shape, depth, bevel = .22, curveSegments = 20) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments });
const meleeAt = (group, pos, normal, up = V(0, 0, 1), D = MD) => b.melee(group, D, qmat(pos, facing(normal, Math.abs(normal.dot(up)) > .9 ? V(0, 1, 0) : up)), headInner);
const bead = (pos, m) => metal.ball(pos, .24, m, 5);

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
// Sides: one row facing outward round the middle of the case band.
for (const z of [3.75]) for (const { p, n } of ring(CASE + .22 * 2, R + .22, 2.1)) meleeAt('case side', p.clone().add(n.clone().multiplyScalar(.04)).setZ(z), n, V(0, 0, 1), 1.95);
// Dial and hands (hands are live nodes turned to the viewer's local time by the AMES viewer).
const dial = new THREE.PlaneGeometry(APER - .2, APER - .2); dial.translate(0, 0, H - 1.7);
{ const uv = dial.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
const dialMat = b.material('Dial enamel', [1, 1, 1, 1], 0, .32);
dialMat.setBaseColorTexture(b.doc.createTexture('AMES dial').setImage(new Uint8Array(readFileSync('dial.jpg'))).setMimeType('image/jpeg'));
b.node('Dial', b.mesh('Dial', dial, dialMat), null, null, headInner);
const blue = b.material('Blued hands | polished metal', [.16, .3, .72, 1], .55, .22);
function hand(len, w, z) { const s = new THREE.Shape(); s.moveTo(0, -len * .18); s.lineTo(w / 2, 0); s.lineTo(w * .3, len * .8); s.lineTo(0, len); s.lineTo(-w * .3, len * .8); s.lineTo(-w / 2, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: false }); g.translate(0, 0, z); g.computeVertexNormals(); return g; }
const STILL = { hour: 305 * deg, minute: 60 * deg, second: 210 * deg }; // ten past ten for still images
for (const [kind, len, w, z] of [['hour', 8.4, 1.7, H - 1.4], ['minute', 12.4, 1.3, H - 1.1], ['second', 13, .4, H - .82]])
{ // A pivot node carries the turn (and ames_watch_hand); the mesh sits under it so mesh quantization never moves the pivot.
  const name = `${kind[0].toUpperCase() + kind.slice(1)} hand`, q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -STILL[kind]);
  const pivot = b.doc.createNode(name).setRotation(q.toArray()).setExtras({ ames_watch_hand: kind }); headInner.addChild(pivot);
  pivot.addChild(b.doc.createNode(name + ' mesh').setMesh(b.mesh(`${kind} hand`, hand(len, w, z), blue))); }
const cap = new THREE.CylinderGeometry(.75, .75, .4, 20); cap.rotateX(90 * deg); cap.translate(0, 0, H - .55); b.node('Hand cap', b.mesh('Hand cap', cap, blue), null, null, headInner);
// Crown at three o'clock: fluted, capped with a single diamond.
const crown = new THREE.CylinderGeometry(2.3, 2.3, 3.2, 36); crown.rotateZ(90 * deg); crown.translate(CASE / 2 + 1.9, 0, H / 2); metal.add(crown);
for (let i = 0; i < 18; i++) { const a = i * 20 * deg; metal.rod(V(CASE / 2 + .5, 2.33 * Math.cos(a), H / 2 + 2.33 * Math.sin(a)), V(CASE / 2 + 3.4, 2.33 * Math.cos(a), H / 2 + 2.33 * Math.sin(a)), .16, .16, null, 5); }
b.stone('Crown diamond', 'round', 2.4, 2.4, qmat(V(CASE / 2 + 3.55, 0, H / 2), facing(V(1, 0, 0), V(0, 1, 0))), headInner);
// Lugs: integrated blocks carrying the bracelet, paved on top.
for (const sy of [1, -1]) {
  const lug = ext(rrect(23, 6.4, 1.4), H - .8); lug.translate(0, sy * (CASE / 2 + 2.2), .6); metal.add(lug);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 13; c++) meleeAt('lugs', V(-9.72 + c * PITCH + (r % 2) * PITCH / 2, sy * (CASE / 2 + 1.41 + r * 1.42), H + .05), FRONT);
}
// Bracelet: a closed loop of paved links standing behind the head, as on a display cushion.
const path = new THREE.CatmullRomCurve3([V(0, 25.4, 2.4), V(0, 30, -3), V(0, 33.5, -16), V(0, 31, -32), V(0, 20, -44), V(0, 0, -48), V(0, -20, -44), V(0, -31, -32), V(0, -33.5, -16), V(0, -30, -3), V(0, -25.4, 2.4)], false, 'centripetal');
const total = path.getLength(), links = Math.floor(total / 7.6), LEN = total / links - .55, PB = total / links;
const CLASP = Math.floor(links / 2); // the fold-over clasp opens between links CLASP - 1 and CLASP, at six o'clock
const HEAD_SPAN = 2 * 25.4, nodes = [];
for (let i = 0; i < links; i++) {
  const u = (i + .5) / links, p = path.getPointAt(u), t = path.getTangentAt(u), n = V(0, -t.z, t.y).normalize();
  if (n.dot(p.clone().sub(V(0, 0, -23))) < 0) n.negate();
  const y = n.clone().sub(t.clone().multiplyScalar(n.dot(t))).normalize(), z = new THREE.Vector3().crossVectors(t, y);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, y, z));
  const node = b.doc.createNode(`Bracelet link ${i + 1}`).setTranslation(p.toArray()).setRotation(q.toArray()); b.root.addChild(node);
  // In the link's frame: length along x, width along z, face +y.
  const m = new Part(), link = ext(rrect(LEN, 20, 1.1), 2.6, .2, 5); link.rotateX(-90 * deg); link.translate(0, -1.3 - .2, 0); m.add(link);
  // A paved centre stripe (three rows of two), polished flanks and edge rails.
  for (let r = 0; r < 3; r++) for (const c of [-1, 1]) b.melee(`bracelet ${i + 1}`, 1.95, qmat(V(-LEN / 2 + 1.2 + r * ((LEN - 2.4) / 2), 1.36, c * 1.05), new THREE.Quaternion()), node);
  for (const sz of [-1, 1]) { m.rod(V(-LEN / 2 + .5, 1.2, sz * 9.95), V(LEN / 2 - .5, 1.2, sz * 9.95), .28, .28, null, 8); m.rod(V(-LEN / 2 + .6, 1.32, sz * 2.45), V(LEN / 2 - .6, 1.32, sz * 2.45), .16, .16, null, 6); }
  // Fold-over clasp under the six o'clock links: the blade on one side, the catch on the other.
  if (i === CLASP - 1) { const g = new THREE.BoxGeometry(5.2, .8, 15); g.translate(LEN / 2 - 2, -1.95, 0); m.add(g); }
  if (i === CLASP) { const g = new THREE.BoxGeometry(5.6, 1.1, 16); g.translate(-LEN / 2 + 2.2, -2.05, 0); m.add(g);
    for (const sz of [-1, 1]) m.rod(V(-LEN / 2 - .2, -1.6, sz * 7.2), V(-LEN / 2 + 1.6, -2.5, sz * 7.2), .3, .3, null, 6); }
  b.node(`Bracelet link ${i + 1} metal`, b.mesh(`White gold bracelet link ${i + 1}`, m.merged(), b.metal), null, null, node);
  nodes[i] = node;
}
// The flat line from the clasp: links CLASP..end (toward six o'clock lug), the head, then links 0..CLASP-1.
const line = [...nodes.slice(CLASP).map(n => ({ n, span: PB })), { n: headNode, span: HEAD_SPAN }, ...nodes.slice(0, CLASP).map(n => ({ n, span: PB }))];
const length = line.reduce((a, x) => a + x.span, 0); let acc = -length / 2;
line.forEach((x, order) => { x.n.setExtras({ ames_link: order, ames_flat_x: Math.round((acc + x.span / 2) * 1000) / 1000 }); acc += x.span; });
b.node('Case and lugs', b.mesh('White gold case', metal.merged(), b.metal), null, null, headInner);
b.root.setExtras({ ames_bracelet: { kind: 'watch', lay: 'hang', links: line.length, pitch: Math.round(PB * 1000) / 1000, length_mm: Math.round(length * 10) / 10, width_mm: 20, drop_mm: 0,
  clasp: 'fold-over clasp', stones: b.meleeCount + 1, stone: 'Diamond' } });
await b.write(process.argv[2] ?? 'watch.glb', { raw: process.argv[3] }); console.log('stones', b.gemCount, 'melee', b.meleeCount, 'links', links, 'line', length.toFixed(1));
