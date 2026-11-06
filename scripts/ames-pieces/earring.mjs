import { Builder, Part, setting, facing, qmat, V, deg, THREE } from './lib.mjs';
const b = new Builder(), metal = new Part();
const FRONT = V(0, 0, 1);
function piece(xOff) {
  // Top pear stud, point down toward the drop.
  const top = { W: 5, L: 7, c: V(xOff, 0, 0), q: facing(FRONT, V(0, -1, 0)) };
  // Square stone set on point (kite).
  const kq = facing(FRONT, V(0, -1, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 45 * deg));
  const kite = { W: 4, L: 4, c: V(xOff, -7.25, 0), q: kq };
  // Large pear drop, point up toward the kite.
  const drop = { W: 10, L: 14, c: V(xOff, -19.1, 0), q: facing(FRONT, V(0, 1, 0)) };
  const m = s => qmat(s.c, s.q);
  b.stone('Pear stud diamond', 'pear', top.W, top.L, m(top));
  b.stone('Kite diamond', 'radiant', kite.W, kite.L, m(kite));
  b.stone('Pear drop diamond', 'pear', drop.W, drop.L, m(drop));
  // Claws: pear point + shoulders; square corners; V-tip on the drop's point.
  const pearClaws = [90 * deg, 215 * deg, 325 * deg];
  setting(metal, 'pear', top.W, top.L, m(top), { claws: pearClaws, clawR: .34 });
  setting(metal, 'radiant', kite.W, kite.L, m(kite), { claws: [45, 135, 225, 315].map(a => a * deg), clawR: .3 });
  setting(metal, 'pear', drop.W, drop.L, m(drop), { claws: [90 * deg, 20 * deg, 160 * deg, 235 * deg, 305 * deg], clawR: .46 });
  // Jump rings between the stones (behind the girdle so they read as a hinge).
  const ring = (y, r, t) => metal.add(new THREE.TorusGeometry(r, t, 10, 28), new THREE.Matrix4().compose(V(xOff, y, -1.1), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 90 * deg), V(1, 1, 1)));
  ring(-3.95, .55, .2); ring(-10.75, .6, .22);
  metal.rod(V(xOff, -3.2, -1.1), V(xOff, -4.6, -1.1), .2); metal.rod(V(xOff, -10.1, -1.1), V(xOff, -11.6, -1.1), .2);
  // Post and butterfly back behind the stud.
  metal.rod(V(xOff, .4, -1.2), V(xOff, .4, -9.5), .4, 14);
  metal.add(new THREE.CylinderGeometry(1.9, 1.9, .5, 28), new THREE.Matrix4().compose(V(xOff, .4, -6.8), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 90 * deg), V(1, 1, 1)));
}
piece(-8.5); piece(8.5);
b.node('Claw settings and post', b.mesh('White gold settings', metal.merged(), b.metal));
await b.write(process.argv[2] ?? 'earring.glb'); console.log('gems', b.gemCount);
