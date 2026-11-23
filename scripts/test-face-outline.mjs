// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-face-outline.mjs
// The outline fit's hard limits (face-outline.ts) on the real head: the scalp, ears and neck get exactly zero weight,
// the features (nose, lips, eyes, brows) are never outline, and the weight fades smoothly (no step) to zero.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { anchorsFromUV, bakeIdentity, meshPointsMm, anchoredPoints } from '../src/lib/portrait-head.ts';
import { outlineMasks } from '../src/lib/face-outline.ts';
await MeshoptDecoder.ready;
const meta = JSON.parse(readFileSync('public/portrait-twin/portrait-head-v2.json', 'utf8'));
const f = readFileSync('public/portrait-twin/portrait-head-v2.glb'); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await new Promise((r, j) => l.parse(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength), '', r, j));
const head = g.scene; head.scale.setScalar(1000); head.updateMatrixWorld(true);
let skin; head.traverse(o => { if (o.isMesh && /head.?skin/i.test(o.name)) skin = o; });
bakeIdentity(head, { 'id:base-afr-male': 0.5, 'id:base-cau-female': 0.5 });
const pts = meshPointsMm(skin, head), lm = anchoredPoints(pts, anchorsFromUV(skin.geometry, meta.landmarks.uv));
const { weight, outline } = outlineMasks(pts, lm, undefined, skin.geometry.index.array);
const earX = Math.min(Math.abs(lm[234][0]), Math.abs(lm[454][0])) - 4, earZ = (lm[234][2] + lm[454][2]) / 2 + 6;
let scalp = 0, neck = 0, ears = 0, moving = 0, features = 0, step = 0;
pts.forEach((p, i) => {
  if (p[1] > lm[10][1] - 6) scalp = Math.max(scalp, weight[i]);
  if (p[1] < lm[152][1] - 10) neck = Math.max(neck, weight[i]);
  if (Math.abs(p[0]) > earX && p[2] < earZ) ears = Math.max(ears, weight[i]);
  if (weight[i] > 0) moving++;
  for (const k of [1, 4, 13, 14, 159, 386, 105, 334]) if (Math.hypot(p[0] - lm[k][0], p[1] - lm[k][1], p[2] - lm[k][2]) < 6 && outline[i]) features++;
});
const idx = skin.geometry.index.array;
for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) { const u = idx[t + a], v = idx[t + (a + 1) % 3]; step = Math.max(step, Math.abs(weight[u] - weight[v])); }
{ let worst = [0, 0, 0]; for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) { const u = idx[t + a], v = idx[t + (a + 1) % 3], d = Math.abs(weight[u] - weight[v]); if (d > worst[0]) worst = [d, u, v]; } if (process.env.DBG) console.log("worst", worst, pts[worst[1]], pts[worst[2]], weight[worst[1]], weight[worst[2]], lm[10], lm[152]); }
console.log(`   ${moving} of ${pts.length} skin vertices may move; max weight on scalp ${scalp}, neck ${neck}, ears ${ears}; largest weight step along an edge ${step.toFixed(2)}`);
assert.equal(scalp, 0); assert.equal(neck, 0); assert.equal(ears, 0); assert.equal(features, 0, 'features are never outline');
assert.ok(step < 0.5, 'the weight fades, never steps');
console.log('ok - outline fit: scalp, ears and neck exactly untouched, features left to the landmarks, smooth fade');
