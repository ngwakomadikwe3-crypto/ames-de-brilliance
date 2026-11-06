// AMES pear-drop earrings: pear stud (point up), kite-set square, long pear drop (point up).
import { Builder, Part, setting, facing, qmat, V, deg, THREE, CROWN, PAVILION } from './lib2.mjs';
const b = new Builder(), metal = new Part(), FRONT = V(0, 0, 1), UP = V(0, 1, 0);
function piece(x) {
  const top = { W: 5.6, L: 7.6, c: V(x, 0, 0) };
  const kite = { W: 3.3, L: 3.3, c: V(x, -6.75, 0) };
  const drop = { W: 10.6, L: 16.4, c: V(x, -17.6, 0) };
  const mTop = qmat(top.c, facing(FRONT, UP));
  const mKite = qmat(kite.c, facing(FRONT, UP).multiply(new THREE.Quaternion().setFromAxisAngle(UP, 45 * deg)));
  const mDrop = qmat(drop.c, facing(FRONT, UP));
  b.stone('Pear stud diamond', 'pear', top.W, top.L, mTop);
  b.stone('Kite diamond', 'radiant', kite.W, kite.L, mKite);
  b.stone('Pear drop diamond', 'pear', drop.W, drop.L, mDrop);
  // Fine claws: V-tip at each pear's point, then shoulders and base; four corners on the kite.
  setting(metal, 'pear', top.W, top.L, mTop, { claws: [90, 335, 205].map(a => a * deg), clawR: .26, vTip: true });
  setting(metal, 'radiant', kite.W, kite.L, mKite, { claws: [45, 135, 225, 315].map(a => a * deg), clawR: .2 });
  setting(metal, 'pear', drop.W, drop.L, mDrop, { claws: [90, 18, 162, 300, 240].map(a => a * deg), clawR: .32, vTip: true });
  // Slim hinged links behind the stones: stud base to kite, kite to the drop's point.
  const z = -1.05;
  const link = (y0, y1, r) => { metal.rod(V(x, y0, z), V(x, y1, z), .22, .22); metal.add(new THREE.TorusGeometry(r, .16, 8, 24), new THREE.Matrix4().compose(V(x, (y0 + y1) / 2, z), new THREE.Quaternion().setFromAxisAngle(UP, 90 * deg), V(1, 1, 1))); };
  link(-3.4, -5.0, .42); link(-8.5, -9.7, .42);
  // Post and a small butterfly back hidden behind the stud.
  metal.rod(V(x, .5, -1.3), V(x, .5, -9), .38, .38, null, 14);
  const back = new THREE.CylinderGeometry(1.7, 1.7, .45, 28); back.rotateX(90 * deg); back.translate(x, .5, -6.6); metal.add(back);
}
piece(-9); piece(9);
b.node('Claw settings and post', b.mesh('White gold settings', metal.merged(), b.metal));
await b.write(process.argv[2] ?? 'earrings.glb', { raw: process.argv[3] }); console.log('stones', b.gemCount);
