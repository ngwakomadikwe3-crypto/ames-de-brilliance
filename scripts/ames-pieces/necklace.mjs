// AMES pear-fringe riviera necklace: a line of round brilliants in four-claw baskets with a graduated
// fringe of pear drops at the front, the largest pear at the centre, and a box clasp at the nape.
// Original AMES design (a classic fringe riviera); not a copy of any house's piece.
//
// Built like the tennis bracelet so it can be unclasped and laid flat: each link is its own node (local
// frame +x along the chain, +y the stone's table, origin the link centre) tagged ames_link = its place in
// the flat line from the clasp. Each pear hangs from its link on a small bail, in its own node at the hinge
// (ames_dangle), so it swings. Worn pose: front of the necklace faces +z, up is +y, millimetres.
import { Builder, Part, heroCut, setting, facing, qmat, V, deg, THREE, CROWN } from './lib2.mjs';
const b = new Builder();
const LENGTH = 420, D = 2.6, PITCH = 2.95, h = D * .5;
// The worn shape: round the neck, dipping to a soft V at the front.
const shape = (phi, s) => V(50 * s * Math.sin(phi), -100 * s * ((1 + Math.cos(phi)) / 2) ** 3, 46 * s * Math.cos(phi));
const lengthAt = s => { let L = 0, p = shape(0, s); for (let i = 1; i <= 2000; i++) { const q = shape(i / 2000 * 2 * Math.PI, s); L += q.distanceTo(p); p = q; } return L; };
let s = 1; for (let k = 0; k < 6; k++) s *= LENGTH / lengthAt(s);
const curve = new THREE.CatmullRomCurve3(Array.from({ length: 720 }, (_, i) => shape(i / 720 * 2 * Math.PI, s)), true, 'centripetal');
const N = Math.round(curve.getLength() / PITCH), pts = curve.getSpacedPoints(N).slice(0, N);
// Link i = 0 at the front centre; the clasp sits at the nape, between links CLASP and CLASP + 1.
const CLASP = Math.floor(N / 2), arc = i => Math.min(i, N - i) * PITCH;
const DIAMOND_ARC = 150, FRINGE = 21; // diamonds 135 mm either side of the centre; 21 pears a side + the centre one
const down = V(0, -1, 0);
let frames = pts.map((p, i) => {
  const t = pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize();
  const out = V(p.x, 0, p.z).normalize().add(V(0, .35, 0)), y = out.sub(t.clone().multiplyScalar(out.dot(t))).normalize();
  return { p, x: t, y };
});
// Lay-flat side: the drops must fall on the far side of the line from the ruler (local -z).
const zOf = f => new THREE.Vector3().crossVectors(f.x, f.y);
const flip = down.dot(zOf(frames[0])) > 0;
frames = frames.map(f => { const x = flip ? f.x.clone().negate() : f.x; const z = new THREE.Vector3().crossVectors(x, f.y);
  return { p: f.p, x, y: f.y, z, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, f.y, z)) }; });
// Order along the flat line, counted from the clasp in the direction of each link's +x.
const step = flip ? -1 : 1, first = flip ? CLASP : (CLASP + 1) % N, orderOf = i => (((i - first) * step) % N + N) % N;
const last = (first - step + N) % N; // the link on the other side of the clasp

const sq = (r, y) => [V(-r, y, -r), V(r, y, -r), V(r, y, r), V(-r, y, r)];
/** One link's metal in its own frame: a basket with claws (diamond links) or a slim box link (plain links),
 * a hinge pin halfway to each neighbour (not across the clasp), and the clasp halves on the clasp links. */
function linkMetal(i, diamond) {
  const m = new Part();
  if (diamond) {
    for (const [r, y, w] of [[h * .98, -.1 * D, .17], [h * .62, -.36 * D, .15]]) { const c = sq(r, y); for (let k = 0; k < 4; k++) m.rod(c[k], c[(k + 1) % 4], w, w, null, 8); }
    for (const k of [0, 1, 2, 3]) m.rod(sq(h * .98, -.1 * D)[k], sq(h * .62, -.36 * D)[k], .15, .15, null, 8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const shoulder = V(sx * h * .78, .03 * D, sz * h * .78), tip = V(sx * h * .62, CROWN * D * .36, sz * h * .62), foot = V(sx * h * .7, -.2 * D, sz * h * .7);
      m.rod(foot, shoulder, .17, .19, null, 8); m.rod(shoulder, tip, .19, .14, null, 8); m.ball(tip, .15, null, 8, .6);
    }
  } else { const c = sq(h * .7, -.2 * D).map(v => v.multiply(V(1.15, 1, .75))); for (let k = 0; k < 4; k++) m.rod(c[k], c[(k + 1) % 4], .26, .26, null, 8); }
  const pinY = -.36 * D, back = i === first ? 0 : -PITCH / 2, front = i === last ? 0 : PITCH / 2;
  if (front - back > .01) m.rod(V(back, pinY, 0), V(front, pinY, 0), .22, .22, null, 8);
  if (i === last) { const g = new THREE.BoxGeometry(2.4, .9, 1.8); g.translate(1.0, -.62 * D, 0); m.add(g); }
  if (i === first) { const g = new THREE.BoxGeometry(2.6, 1.05, 2.0); g.translate(-1.0, -.62 * D, 0); m.add(g);
    const safety = new THREE.TorusGeometry(.5, .13, 6, 16); safety.rotateY(Math.PI / 2); safety.translate(-1.9, -.62 * D, 1.1); m.add(safety); }
  return m.merged();
}

let diamonds = 0, longest = 0;
for (let i = 0; i < N; i++) {
  const f = frames[i], order = orderOf(i), diamond = arc(i) <= DIAMOND_ARC;
  const link = b.doc.createNode(`Necklace link ${order + 1}`).setTranslation(f.p.toArray()).setRotation(f.q.toArray()).setExtras({ ames_link: order });
  b.root.addChild(link);
  if (diamond) { b.gemCount++; diamonds++; (b.heroes ??= []).push({ name: `Riviera diamond ${i}`, outline: 'round', W: D, L: D });
    link.addChild(b.doc.createNode(`Riviera diamond ${i}`).setMesh(b.mesh(`Riviera diamond ${i}`, heroCut('round', D, D), b.gem))
      .setExtras({ ames_optical_mode: 'closed-dielectric-visual', ames_gemstone_id: 'stone-diamond', ames_cut: 'round' })); }
  link.addChild(b.doc.createNode(`Necklace link setting ${i}`).setMesh(b.mesh(`White gold necklace link ${i}`, linkMetal(i, diamond), b.metal)));

  // The fringe: a pear on every second link at the front, graduated to the largest at the centre.
  const k = i <= N / 2 ? i : i - N;
  if (Math.abs(k) % 2 || Math.abs(k) > FRINGE * 2) continue;
  const centre = k === 0, t = Math.abs(k) / (FRINGE * 2);
  const W = centre ? 6.2 : 4.4 - 1.8 * t, L = W * (centre ? 1.5 : 1.45);
  // In the link's frame: straight down when worn, from the underside of the basket.
  const inv = f.q.clone().invert(), dn = down.clone().applyQuaternion(inv), outward = V(f.p.x, 0, f.p.z).normalize().applyQuaternion(inv);
  const hinge = dn.clone().multiplyScalar(h * .95).add(V(0, -.2 * D, 0)), gap = centre ? 2.6 : 0.95;
  const drop = b.doc.createNode(`Pear drop ${k}`).setTranslation(hinge.toArray()).setExtras({ ames_dangle: { hinge: 'pear' } });
  link.addChild(drop);
  // The pear in the drop's frame: table facing out, point up toward the bail.
  const centreAt = dn.clone().multiplyScalar(gap + L / 2), q = facing(outward, dn.clone().negate()), mPear = qmat(centreAt, q);
  b.stone(`Pear drop diamond ${k}`, 'pear', W, L, mPear, drop); diamonds++;
  const metal = new Part();
  setting(metal, 'pear', W, L, mPear, { claws: [90, 18, 162, 300, 240].map(a => a * deg), clawR: Math.max(.16, W * .045), vTip: true });
  // Bail: a small ring on the hinge and a short stem to the pear's point (with a link for the centre pear).
  const side = new THREE.Vector3().crossVectors(dn, outward).normalize();
  metal.add(new THREE.TorusGeometry(.42, .13, 8, 20), new THREE.Matrix4().makeBasis(side, dn, outward).premultiply(new THREE.Matrix4().makeTranslation(0, 0, 0)));
  metal.rod(dn.clone().multiplyScalar(.42), dn.clone().multiplyScalar(gap + .15), .16, .16, null, 8);
  if (centre) metal.add(new THREE.TorusGeometry(.5, .14, 8, 20), new THREE.Matrix4().makeBasis(outward, dn, side).setPosition(dn.clone().multiplyScalar(1.4)));
  drop.addChild(b.doc.createNode(`Pear drop setting ${k}`).setMesh(b.mesh(`White gold pear setting ${k}`, metal.merged(), b.metal)));
  longest = Math.max(longest, gap + L + h);
}
const length = Math.round(N * PITCH * 10) / 10;
b.root.setExtras({ ames_bracelet: { kind: 'necklace', lay: 'hang', links: N, pitch: PITCH, length_mm: length, width_mm: Math.round((D + .4) * 10) / 10,
  drop_mm: Math.round(longest * 10) / 10, clasp: 'box clasp with figure-eight safety', stones: diamonds, stone: 'Diamond' } });
await b.write(process.argv[2] ?? 'necklace.glb', { raw: process.argv[3] });
console.log('links', N, 'diamonds', diamonds, 'pears', FRINGE * 2 + 1, 'length', length, 'longest drop', longest.toFixed(1), 'flip', flip);
