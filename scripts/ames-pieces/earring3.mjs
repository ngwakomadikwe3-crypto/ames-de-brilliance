// AMES pear-drop earrings v3: same design as v2 (pear stud point up, kite-set square, long pear drop),
// now hinged so the viewer can let them dangle. The kite hangs from the stud and the drop from the kite:
// each is a node at its hinge (ames_dangle), and its stones and metal sit under it, so it swings about the hinge.
import { Builder, Part, setting, facing, qmat, V, deg, THREE } from './lib2.mjs';
const b = new Builder(), FRONT = V(0, 0, 1), UP = V(0, 1, 0), Z = -1.05;
/** Geometry authored in piece coordinates, moved into a hinge node's frame (origin at the hinge). */
const at = (o, m) => new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z).multiply(m ?? new THREE.Matrix4());
function piece(x, side) {
  const top = { W: 5.6, L: 7.6, c: V(x, 0, 0) }, kite = { W: 3.3, L: 3.3, c: V(x, -6.75, 0) }, drop = { W: 10.6, L: 16.4, c: V(x, -17.6, 0) };
  const mTop = qmat(top.c, facing(FRONT, UP));
  const mKite = qmat(kite.c, facing(FRONT, UP).multiply(new THREE.Quaternion().setFromAxisAngle(UP, 45 * deg)));
  const mDrop = qmat(drop.c, facing(FRONT, UP));
  // Hinges: the kite hangs from the stud's base, the drop from the kite's lower link.
  const hingeKite = V(x, -3.5, Z), hingeDrop = V(x, -8.6, Z);
  const kiteNode = b.doc.createNode(`${side} earring kite (hinged)`).setTranslation(hingeKite.toArray()).setExtras({ ames_dangle: { hinge: 'kite' } });
  const dropNode = b.doc.createNode(`${side} earring drop (hinged)`).setTranslation(hingeDrop.clone().sub(hingeKite).toArray()).setExtras({ ames_dangle: { hinge: 'drop' } });
  b.root.addChild(kiteNode); kiteNode.addChild(dropNode);
  b.stone(`${side} pear stud diamond`, 'pear', top.W, top.L, mTop);
  b.stone(`${side} kite diamond`, 'radiant', kite.W, kite.L, at(hingeKite, mKite), kiteNode);
  b.stone(`${side} pear drop diamond`, 'pear', drop.W, drop.L, at(hingeDrop, mDrop), dropNode);
  const stud = new Part(), kiteMetal = new Part(), dropMetal = new Part();
  setting(stud, 'pear', top.W, top.L, mTop, { claws: [90, 335, 205].map(a => a * deg), clawR: .26, vTip: true });
  setting(kiteMetal, 'radiant', kite.W, kite.L, at(hingeKite, mKite), { claws: [45, 135, 225, 315].map(a => a * deg), clawR: .2 });
  setting(dropMetal, 'pear', drop.W, drop.L, at(hingeDrop, mDrop), { claws: [90, 18, 162, 300, 240].map(a => a * deg), clawR: .32, vTip: true });
  // Slim hinged links behind the stones, each going with the part that hangs from it.
  const link = (part, o, y0, y1, r) => { part.rod(V(x, y0, Z).sub(o), V(x, y1, Z).sub(o), .22, .22); part.add(new THREE.TorusGeometry(r, .16, 8, 24), new THREE.Matrix4().compose(V(x, (y0 + y1) / 2, Z).sub(o), new THREE.Quaternion().setFromAxisAngle(UP, 90 * deg), V(1, 1, 1))); };
  link(kiteMetal, hingeKite, -3.4, -5.0, .42); link(dropMetal, hingeDrop, -8.5, -9.7, .42);
  // Post and a small butterfly back hidden behind the stud.
  stud.rod(V(x, .5, -1.3), V(x, .5, -9), .38, .38, null, 14);
  const back = new THREE.CylinderGeometry(1.7, 1.7, .45, 28); back.rotateX(90 * deg); back.translate(x, .5, -6.6); stud.add(back);
  b.node(`${side} stud setting and post`, b.mesh(`White gold stud ${side}`, stud.merged(), b.metal));
  b.node(`${side} kite setting`, b.mesh(`White gold kite ${side}`, kiteMetal.merged(), b.metal), null, null, kiteNode);
  b.node(`${side} drop setting`, b.mesh(`White gold drop ${side}`, dropMetal.merged(), b.metal), null, null, dropNode);
}
piece(-9, 'Left'); piece(9, 'Right');
await b.write(process.argv[2] ?? 'earrings3.glb', { raw: process.argv[3] }); console.log('stones', b.gemCount);
