// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-face-refine.mjs
// System 1 (face-refine.ts) on the real parametric head, no browser. A person with shape NO morph can make (a nose
// bent to one side, one jaw wider, one cheek hollow) is "photographed" from the front, both profiles and chin-up with
// MediaPipe-like errors. The morph solve gets the face as close as its morphs allow; the per-vertex refinement must
// then bring the nose and jaw markedly closer to the truth, never disturb the scalp, ears or neck, keep the eye
// openings exactly where the eyeballs are, and do no harm to a face the morphs already explain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { anchorsFromUV, basisFor, bakeIdentity, meshPointsMm, anchoredPoints } from '../src/lib/portrait-head.ts';
import { fitHead, landmarksAt, similarity, applyPose } from '../src/lib/portrait-fit.ts';
import { solveRefine, refineField, REFINE } from '../src/lib/face-refine.ts';
Object.assign(REFINE, JSON.parse(process.env.OPT ?? '{}'));

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
const H0 = await loadHead();
const anchors = anchorsFromUV(H0.skin.geometry, meta.landmarks.uv);
const B = basisFor(H0.skin, H0.head, anchors, meta.identity.filter(n => !/head-scale-/.test(n)));
const named = spec => Object.fromEntries(Object.entries(spec));
const vec = spec => B.names.map(n => spec[n] ?? 0);

let seed = 31; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const rot = (yaw, pitch) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  return Rx.map(r => [0, 1, 2].map(c => r[0] * Ry[0][c] + r[1] * Ry[1][c] + r[2] * Ry[2][c])); };
const AVG = landmarksAt(B, B.names.map(n => (n.startsWith('id:base-') ? 1 / 6 : 0)));
function shoot(L, kind, yaw, pitch) {
  const pose = { R: rot(yaw, pitch), s: 3.1, t: [640, -480, 0] }, toward = pose.R[2][0];
  return { kind, points: L.map((p, i) => { const q = applyPose(pose, p), qa = applyPose(pose, AVG[i] ?? p); q[2] = qa[2] + 0.4 * (q[2] - qa[2]);
    const far = Math.abs(yaw) > 0.5 && Math.sign(p[0]) * Math.sign(toward) < 0 && Math.abs(p[0]) > 12;
    const sxy = (far ? 3 : 0.6) * pose.s, sz = (far ? 6 : 3) * pose.s; return [q[0] + gauss() * sxy, q[1] + gauss() * sxy, q[2] + gauss() * sz]; }) };
}
const scan = L => [shoot(L, 'front', 0, 0), shoot(L, 'left', 1.15, 0), shoot(L, 'right', -1.15, 0), shoot(L, 'up', 0, -0.35)];

// a person: morph identity, plus (optionally) shape off the morph space
async function person(spec, quirks) {
  const { head, skin } = await loadHead(); bakeIdentity(head, named(spec));
  let pts = meshPointsMm(skin, head); const lm = anchoredPoints(pts, anchors);
  if (quirks) pts = pts.map(p => { const q = [...p]; for (const k of quirks(lm)) { const d2 = (p[0] - k.at[0]) ** 2 + (p[1] - k.at[1]) ** 2 + (p[2] - k.at[2]) ** 2, w = Math.exp(-d2 / (2 * k.r * k.r)); for (let c = 0; c < 3; c++) q[c] += w * k.d[c]; } return q; });
  return { pts, lm: anchoredPoints(pts, anchors) };
}
async function solveAndBake(truth, useRefine) {
  const frames = scan(truth.lm), fit = fitHead(B, frames);
  const w = Object.fromEntries(B.names.map((n, i) => [n, fit.weights[i]]));
  const refine = useRefine ? solveRefine(fit.landmarks, frames, fit.poses) : null;
  const { head, skin } = await loadHead(); bakeIdentity(head, w, refine);
  return { pts: meshPointsMm(skin, head), refine };
}
// vertex error in a region, after aligning the face (landmarks) rigidly + scale
function regionErr(P, T, centre, r, onFace = true) {
  const pose = similarity(anchoredPoints(P, anchors).slice(0, 468), anchoredPoints(T, anchors).slice(0, 468));
  let s = 0, n = 0;
  const L = anchoredPoints(T, anchors).slice(0, 468);
  T.forEach((t, i) => { if (Math.hypot(t[0] - centre[0], t[1] - centre[1], t[2] - centre[2]) > r) return;
    if (onFace && !L.some(l => Math.hypot(t[0] - l[0], t[1] - l[1], t[2] - l[2]) < 6)) return;   /* the surface the camera sees */ const p = applyPose(pose, P[i]); s += Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]); n++; });
  return s / n;
}

const ID = { 'id:base-afr-male': 0.55, 'id:base-cau-male': 0.45, 'id:nose-scale-horiz-incr': 0.5, 'id:chin-width-incr': 0.4, 'id:cheek-bones-incr': 0.4 };
const quirks = lm => [
  { at: lm[1], r: 9, d: [3.2, 0, 0] },                 // the nose tip bent to the figure's left
  { at: lm[4], r: 8, d: [1.8, 0, 0.6] },
  { at: lm[172], r: 14, d: [-3.5, -1.5, 0] },          // one jaw angle wider and lower
  { at: lm[123], r: 11, d: [0, 0, -2.5] },             // one cheek hollow
];
const truth = await person(ID, quirks);
const morphOnly = await solveAndBake(truth, false); seed = 31;
const refined = await solveAndBake(truth, true);
const regions = { nose: [truth.lm[1], 16], jaw: [truth.lm[172], 22], cheek: [truth.lm[123], 18] };
for (const [name, [c, r]] of Object.entries(regions)) {
  const a = regionErr(morphOnly.pts, truth.pts, c, r), b = regionErr(refined.pts, truth.pts, c, r);
  console.log(`   ${name}: morph solve ${a.toFixed(2)} mm, refined ${b.toFixed(2)} mm`);
  assert.ok(b < a * 0.7, `${name}: refinement at least 30% closer`);
}
pass('the nose, jaw and cheek no morph can make are brought markedly closer per vertex');

// silhouette in the front photo: the projected jaw and nose outline against the truth's
{ const f = { R: rot(0, 0), s: 1, t: [0, 0, 0] };
  const outline = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 1, 4, 5, 48, 278, 64, 294];
  const sil = P => { const L = anchoredPoints(P, anchors), T = truth.lm, pose = similarity(L.slice(0, 468), T.slice(0, 468)); return outline.reduce((s, i) => { const p = applyPose(f, applyPose(pose, L[i])), t = applyPose(f, T[i]); return s + Math.hypot(p[0] - t[0], p[1] - t[1]); }, 0) / outline.length; };
  const a = sil(morphOnly.pts), b = sil(refined.pts);
  console.log(`   front silhouette (jaw line and nose outline): morph solve ${a.toFixed(2)} mm, refined ${b.toFixed(2)} mm`);
  assert.ok(b < a * 0.75); pass('the front silhouette at the jaw and nose is tighter than the morph solve'); }

// nothing moves away from the face: scalp, ears, neck; and the eye openings stay on the eyeballs
{ const field = refineField(refined.pts, refined.refine), lm = anchoredPoints(refined.pts, anchors);
  const faceZ = Math.min(...[234, 454].map(i => lm[i][2])), chin = lm[152][1];
  let worstBack = 0, worstNeck = 0; refined.pts.forEach((p, i) => { const m = Math.hypot(...field[i]); if (p[2] < faceZ - 25) worstBack = Math.max(worstBack, m); if (p[1] < chin - 45) worstNeck = Math.max(worstNeck, m); });
  const eyeLm = [33, 133, 159, 145, 263, 362, 386, 374], eyeMove = Math.max(...eyeLm.map(i => { const at = [refined.refine.at[i * 3], refined.refine.at[i * 3 + 1], refined.refine.at[i * 3 + 2]]; return Math.hypot(...refineField([at], refined.refine)[0]); }));
  console.log(`   largest move: behind the ears ${worstBack.toFixed(2)} mm, neck ${worstNeck.toFixed(2)} mm, eye openings ${eyeMove.toFixed(2)} mm`);
  assert.ok(worstBack < 0.3 && worstNeck < 0.3 && eyeMove < 0.6);
  pass('scalp, ears and neck stay put (every jewellery anchor keeps its place); the lids stay on the eyeballs'); }

// a face the morphs already explain: the refinement does no harm
{ seed = 9; const plain = await person(ID, null), m = await solveAndBake(plain, false); seed = 9; const r = await solveAndBake(plain, true);
  const whole = P => regionErr(P, plain.pts, plain.lm[6], 70);
  console.log(`   in-model face, whole face: morph solve ${whole(m.pts).toFixed(2)} mm, refined ${whole(r.pts).toFixed(2)} mm`);
  assert.ok(whole(r.pts) <= whole(m.pts) + 0.1); pass('a face the morphs already explain is not made worse (noise never becomes shape)'); }

// the record is small enough to keep with the twin
{ const bytes = JSON.stringify(refined.refine).length; console.log(`   saved record ${(bytes / 1024).toFixed(1)} KB`); assert.ok(bytes < 24000); pass('the refinement record is small'); }
console.log(`${ok} ok`);
