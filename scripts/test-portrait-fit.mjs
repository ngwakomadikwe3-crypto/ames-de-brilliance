// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-portrait-fit.mjs
// The multi-view face fit on the real parametric head (public/portrait-twin/portrait-head-v2.glb), no browser.
// Two synthetic people with known shapes are "photographed" from the front, both profiles and chin-up with MediaPipe-
// like errors (depth far noisier than x and y, the far side of a profile poorly seen); the fit must recover each face,
// keep the two apart, beat a front-only fit on depth (nose projection), and give plausible spectacle measurements.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { anchorsFromUV, basisFor, bakeIdentity, measureSpectacles, meshPointsMm, anchoredPoints } from '../src/lib/portrait-head.ts';
import { fitHead, landmarksAt, similarity, applyPose, unPose } from '../src/lib/portrait-fit.ts';

let ok = 0; const pass = m => { ok++; console.log('ok -', m); };
await MeshoptDecoder.ready;
const meta = JSON.parse(readFileSync(new URL('../public/portrait-twin/portrait-head-v2.json', import.meta.url), 'utf8'));
async function loadHead() {
  const f = readFileSync(new URL('../public/portrait-twin/portrait-head-v2.glb', import.meta.url)); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const g = await new Promise((r, j) => l.parse(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength), '', r, j));
  const head = g.scene; head.scale.setScalar(1000); head.updateMatrixWorld(true);
  let skin; head.traverse(o => { if (o.isMesh && /head.?skin/i.test(o.name)) skin = o; });
  return { head, skin };
}
const { head, skin } = await loadHead();
const anchors = anchorsFromUV(skin.geometry, meta.landmarks.uv);
const B = basisFor(skin, head, anchors, meta.identity);
assert.equal(B.n, 478); assert.equal(B.names.length, 114); assert.ok(B.names.includes("id:age-old"), "age is a shape");
const W = name => B.names.indexOf(name);
const person = spec => { const w = new Array(B.names.length).fill(0); for (const [k, v] of Object.entries(spec)) { assert.ok(W(k) >= 0, k); w[W(k)] = v; } return w; };
const A = person({ 'id:base-cau-female': 1, 'id:nose-scale-horiz-decr': 0.6, 'id:chin-width-decr': 0.5, 'id:mouth-upperlip-volume-incr': 0.7, 'id:cheek-bones-incr': 0.5, 'id:nose-scale-depth-decr': 0.5 });
const Bp = person({ 'id:base-afr-male': 0.7, 'id:base-asi-male': 0.3, 'id:chin-width-incr': 0.8, 'id:nose-scale-horiz-incr': 0.6, 'id:head-square': 0.5, 'id:neck-scale-horiz-incr': 0.7, 'id:nose-scale-depth-incr': 0.6, 'id:mouth-lowerlip-volume-incr': 0.6 });

let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const rot = (yaw, pitch) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  return Rx.map(r => [0, 1, 2].map(c => r[0] * Ry[0][c] + r[1] * Ry[1][c] + r[2] * Ry[2][c])); };
// A single photo's depth is mostly the detector's prior: MediaPipe's z regresses toward an average face. Model that
// honestly: each frame's camera depth keeps only 40% of how this face differs from the average face, plus noise.
const AVG = landmarksAt(B, B.names.map(n => (n.startsWith('id:base-') ? 1 / 6 : 0)));
function shoot(w, kind, yaw, pitch) {
  const L = landmarksAt(B, w), pose = { R: rot(yaw, pitch), s: 3.1, t: [640, -480, 0] };
  const toward = pose.R[2][0];
  return { kind, points: L.map((p, i) => { const q = applyPose(pose, p), qa = applyPose(pose, AVG[i]); q[2] = qa[2] + 0.4 * (q[2] - qa[2]); const far = Math.abs(yaw) > 0.5 && Math.sign(p[0]) * Math.sign(toward) < 0 && Math.abs(p[0]) > 12;
    const sxy = (far ? 3 : 0.6) * pose.s, sz = (far ? 6 : 3) * pose.s; return [q[0] + gauss() * sxy, q[1] + gauss() * sxy, q[2] + gauss() * sz]; }) };
}
const scan = w => [shoot(w, 'front', 0, 0), shoot(w, 'left', 1.15, 0), shoot(w, 'right', -1.15, 0), shoot(w, 'up', 0, -0.35)];
const err = (P, Q) => { const pose = similarity(P.slice(0, 468), Q.slice(0, 468)); let s = 0; for (let i = 0; i < 468; i++) { const p = applyPose(pose, P[i]); s += Math.hypot(p[0] - Q[i][0], p[1] - Q[i][1], p[2] - Q[i][2]); } return s / 468; };

const tA = landmarksAt(B, A), tB = landmarksAt(B, Bp), base = landmarksAt(B, new Array(B.names.length).fill(0).map((_, i) => (B.names[i].startsWith('id:base-') ? 1 / 6 : 0)));
const fA = fitHead(B, scan(A)), fB = fitHead(B, scan(Bp));
const eA = err(fA.landmarks, tA), eB = err(fB.landmarks, tB), apart = err(tA, tB);
console.log(`   true faces differ by ${apart.toFixed(2)} mm on average; fit errors ${eA.toFixed(2)} and ${eB.toFixed(2)} mm (average face vs A: ${err(base, tA).toFixed(2)} mm)`);
assert.ok(eA < 1.0 && eB < 1.0, 'each face recovered within 1 mm on average');
assert.ok(err(fA.landmarks, tA) < err(fA.landmarks, tB) / 3 && err(fB.landmarks, tB) < err(fB.landmarks, tA) / 3, 'each fit resembles its own person, not the other');
pass('two different people are recovered from noisy multi-view scans and stay distinguishable');

// profiles carry depth: a face that differs from the average mostly in depth (nose projection, chin, head depth)
const C = person({ 'id:base-cau-male': 0.5, 'id:base-asi-female': 0.5, 'id:nose-scale-depth-incr': 1, 'id:chin-prognathism-incr': 0.8, 'id:head-scale-depth-incr': 0.6 });
const tC = landmarksAt(B, C);
const depthErr = L => { const pose = similarity(L.slice(0, 468), tC.slice(0, 468)); let s = 0; for (const i of [1, 4, 5, 195, 152, 199, 175, 18]) { const p = applyPose(pose, L[i]); s += Math.abs(p[2] - tC[i][2]); } return s / 8; };
const dFront = depthErr(fitHead(B, [shoot(C, 'front', 0, 0)]).landmarks), dFull = depthErr(fitHead(B, scan(C)).landmarks);
console.log(`   nose and chin depth error: front only ${dFront.toFixed(2)} mm, with profiles ${dFull.toFixed(2)} mm (average face ${depthErr(AVG).toFixed(2)} mm)`);
assert.ok(dFull < dFront * 0.6 && dFull < 1.5);
pass('the profile frames carry depth: nose projection and chin are recovered only with them');

// spectacles on the fitted head
for (const [name, fit] of [['A', fA], ['B', fB]]) {
  const { head: h, skin: s } = await loadHead();
  bakeIdentity(h, Object.fromEntries(B.names.map((n, i) => [n, fit.weights[i]])));
  const pts = meshPointsMm(s, h), lm = anchoredPoints(pts, anchors);
  const eye = nm => { let m; h.traverse(o => { if (o.isMesh && o.name.replace(/_/g, ' ').toLowerCase() === nm) m = o; }); const p = meshPointsMm(m, h); return [0, 1, 2].map(c => p.reduce((a, q) => a + q[c], 0) / p.length); };
  const sp = measureSpectacles(pts, lm, { left: eye('eye left'), right: eye('eye right') }, name === 'A' ? 61 : 66);
  console.log(`   ${name}: PD ${sp.pdMm.toFixed(1)}, bridge width ${sp.bridgeWidthMm.toFixed(1)}, bridge projection ${sp.bridgeProjectionMm.toFixed(1)}, temples ${sp.templeWidthMm.toFixed(1)}, eye to ear ${sp.eyeToEarMm.toFixed(1)} mm`);
  assert.ok(sp.bridgeWidthMm > 10 && sp.bridgeWidthMm < 30 && sp.templeWidthMm > 115 && sp.templeWidthMm < 165 && sp.eyeToEarMm > 70 && sp.eyeToEarMm < 125 && sp.bridgeProjectionMm > 4 && sp.bridgeProjectionMm < 25);
  assert.ok(Number.isFinite(sp.earRest.left[1]) && sp.earRest.left[0] > 0 && sp.earRest.right[0] < 0);
}
pass('spectacle measurements on the fitted heads are anatomically plausible');
void unPose;
console.log(`${ok} ok`);
