// AMES watch roll: a cylindrical tan-leather travel case for three diamond watches, with cream saddle
// stitching, a snap tab, a beige suede lining and three watch pillows. The lid is hinged along the back
// (node at the hinge, ames_open: the viewer swings it open about its x axis on request or on a tap).
// Original AMES design of a classic watch roll. Axis along x; front +z; up +y; millimetres.
import { Builder, Part, V, deg, THREE } from './lib2.mjs';
const b = new Builder();
const L = 232, RO = 48, T = 2.6, RI = RO - T, CAP = 3.2, LID_L = L - 2 * CAP - .6;
const leather = b.material('Tan leather | visual study', [.105, .04, .016, 1], 0, .55);
const suede = b.material('Beige suede lining', [.34, .27, .18, 1], 0, .95);
const thread = b.material('Cream thread', [.7, .62, .48, 1], 0, .7);
const snapMetal = b.material('Nickel snap | polished metal', [.86, .86, .84, 1], 1, .12);
// phi is measured round the x axis from +y (top) toward +z (front): front 90, bottom 180, back 270.
/** Box-projected texture coordinates: 1 unit = 256 mm (kept within 0..1 for quantization), so the viewer's grain keeps its size. */
function mmUv(g) { const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getY(i), p.getZ(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]; uv[i * 2] = u / 256 + .5; uv[i * 2 + 1] = v / 256 + .5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
const at = (phi, r) => V(0, r * Math.cos(phi * deg), r * Math.sin(phi * deg));
/** A slice of tube between radii r0..r1 and angles phi0..phi1, length len along x centred on x0. */
function sector(r0, r1, phi0, phi1, len, x0 = 0, bevel = .6) {
  const s = new THREE.Shape(), a0 = (phi0 + 90) * deg, a1 = (phi1 + 90) * deg;
  s.moveTo(r1 * Math.cos(a0), r1 * Math.sin(a0)); s.absarc(0, 0, r1, a0, a1, false);
  s.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1)); s.absarc(0, 0, r0, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: len - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: Math.min(bevel, (r1 - r0) / 2 - .05), bevelSegments: 2, curveSegments: 96 });
  g.rotateY(90 * deg); g.translate(x0 - len / 2 + bevel, 0, 0); return g;
}
const disc = (r, t, x) => { const g = new THREE.CylinderGeometry(r, r, t, 96); g.rotateZ(90 * deg); g.translate(x, 0, 0); return g; };
/** Saddle stitching: short dashes along a path (points sampled every 4 mm). */
function stitch(part, pts) { for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], c = pts[i + 1], m = a.clone().lerp(c, .62); part.rod(a, m, .34, .34, null, 6); } }
const arcPts = (x, r, phi0, phi1) => { const n = Math.max(2, Math.round(Math.abs(phi1 - phi0) * deg * r / 4)); return Array.from({ length: n + 1 }, (_, i) => at(phi0 + (phi1 - phi0) * i / n, r).setX(x)); };
const linePts = (phi, r, x0, x1) => { const n = Math.round(Math.abs(x1 - x0) / 4); return Array.from({ length: n + 1 }, (_, i) => at(phi, r).setX(x0 + (x1 - x0) * i / n)); };

// Body: the lower shell from the front edge round the bottom to the hinge, both end caps, the lining.
const BODY = [74, 300], LID = [300, 434];
const body = new Part(), bodyLining = new Part(), bodyThread = new Part();
body.add(sector(RI, RO, BODY[0], BODY[1], LID_L + .6));
for (const sx of [-1, 1]) body.add(disc(RO, CAP, sx * (L / 2 - CAP / 2)));
bodyLining.add(sector(RI - .9, RI, BODY[0] + 1, BODY[1] - 1, LID_L - .4, 0, 0));
for (const sx of [-1, 1]) bodyLining.add(disc(RI - .2, .8, sx * (L / 2 - CAP - .4)));
for (const sx of [-1, 1]) { const x = sx * (L / 2 + .02); stitch(bodyThread, arcPts(x, RO - 3.4, 0, 360).map(p => p.setX(x))); }
stitch(bodyThread, linePts(BODY[0] + 4, RO + .12, -LID_L / 2 + 4, LID_L / 2 - 4));
// The snap's lower half on the body front, under the tab.
const stud = new THREE.CylinderGeometry(3.2, 3.2, 1.2, 32); stud.rotateX(90 * deg); stud.translate(0, 0, 0);
{ const p = at(99, RO + .5), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), p.clone().normalize()); stud.applyQuaternion(q); stud.translate(p.x, p.y, p.z); }
b.node('Case body', b.mesh('Tan leather body', mmUv(body.merged()), leather));
b.node('Case body lining', b.mesh('Suede body lining', mmUv(bodyLining.merged()), suede));
b.node('Case body stitching', b.mesh('Cream stitching body', bodyThread.merged(), thread));
b.node('Snap stud', b.mesh('Snap stud', stud.clone(), snapMetal));

// Three watch pillows: soft domed tops, bottoms following the shell.
function pillow(x) {
  const w = 68, top = 15, dome = 6, R = 40, ys = -Math.sqrt(R * R - (w / 2) ** 2), s = new THREE.Shape();
  // Shape coords: u = -z, v = y (as in sector()).
  s.moveTo(-w / 2, top); s.quadraticCurveTo(0, top + 2 * dome, w / 2, top); s.lineTo(w / 2, ys);
  const a0 = Math.atan2(ys, w / 2), a1 = Math.atan2(ys, -w / 2); s.absarc(0, 0, R, a0, a1 + (a1 > a0 ? -2 * Math.PI : 0), true); s.lineTo(-w / 2, top);
  const len = 66, bv = 3.2, g = new THREE.ExtrudeGeometry(s, { depth: len - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 4, curveSegments: 48 });
  g.rotateY(90 * deg); g.translate(x - len / 2 + bv, -3, 0); return g;
}
const pillows = new Part(); for (const x of [-70, 0, 70]) pillows.add(pillow(x));
b.node('Watch pillows', b.mesh('Suede watch pillows', mmUv(pillows.merged()), suede));

// Lid: hinged at the back edge; everything on it is authored round the hinge.
const hinge = at(LID[0], RO), lid = b.doc.createNode('Case lid (hinged)').setTranslation(hinge.toArray())
  .setExtras({ ames_open: { axis: [1, 0, 0], angle: -112, label: 'case' } });
b.root.addChild(lid);
const back = g => g.isVector3 ? g.sub(hinge) : (g.translate(-hinge.x, -hinge.y, -hinge.z), g);
const lidLeather = new Part(), lidLining = new Part(), lidThread = new Part();
lidLeather.add(back(sector(RI, RO, LID[0], LID[1], LID_L)));
lidLining.add(back(sector(RI - .9, RI, LID[0] + 1, LID[1] - 1, LID_L - 1, 0, 0)));
// The tab: a short strap from the lid's front edge down over the body, stitched round, with the snap cap.
lidLeather.add(back(sector(RO + .05, RO + 1.7, LID[1] - 364, LID[1] - 360 + 31, 24, 0, .5)));
const capG = new THREE.CylinderGeometry(3.6, 3.6, 1.6, 32); capG.rotateX(90 * deg);
{ const p = at(99, RO + 2.4), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), p.clone().normalize()); capG.applyQuaternion(q); capG.translate(p.x, p.y, p.z); }
for (const x of [-9.5, 9.5]) stitch(lidThread, arcPts(x, RO + 1.85, 74, 102).map(p => back(p)));
stitch(lidThread, linePts(102, RO + 1.85, -9.5, 9.5).map(p => back(p)));
stitch(lidThread, linePts(LID[1] - 360 - 4, RO + .12, -LID_L / 2 + 4, -14).map(p => back(p.clone())));
stitch(lidThread, linePts(LID[1] - 360 - 4, RO + .12, 14, LID_L / 2 - 4).map(p => back(p.clone())));
for (const sx of [-1, 1]) stitch(lidThread, arcPts(sx * (LID_L / 2 - 3.2), RO + .12, LID[0] + 4, LID[1] - 4).map(p => back(p.clone())));
stitch(lidThread, linePts(LID[0] + 4, RO + .12, -LID_L / 2 + 4, LID_L / 2 - 4).map(p => back(p.clone())));
b.node('Case lid', b.mesh('Tan leather lid', mmUv(lidLeather.merged()), leather), null, null, lid);
b.node('Case lid lining', b.mesh('Suede lid lining', mmUv(lidLining.merged()), suede), null, null, lid);
b.node('Case lid stitching', b.mesh('Cream stitching lid', lidThread.merged(), thread), null, null, lid);
b.node('Snap cap', b.mesh('Snap cap', back(capG), snapMetal), null, null, lid);
await b.write(process.argv[2] ?? 'watch-case.glb', { raw: process.argv[3] });
console.log('watch case', L, 'x', 2 * RO, 'mm');
