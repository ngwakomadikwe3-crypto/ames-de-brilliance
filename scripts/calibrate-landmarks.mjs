// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/calibrate-landmarks.mjs <subjects...>
// Where MediaPipe actually puts each of its 468 face landmarks on OUR head, versus where the head's anchors (UV-mapped
// landmarks) say they are. Renders of the parametric head with known shapes (the harness's synthetic subjects,
// public/_scan/<s>-*.json with <s>-truth.json) are read by the real detector; for each landmark, the offset that best
// explains all three views (front sharp in x and y, the turns for depth) is that landmark's systematic bias.
// Writes public/portrait-twin/landmark-bias-v1.json. Leave-one-out: calibrated on the others, judged on each.
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { anchorsFromUV, anchoredPoints } from '../src/lib/portrait-head.ts';
import { similarity, unPose } from '../src/lib/portrait-fit.ts';
import { landmarkOffsets } from '../src/lib/face-refine.ts';
import { fromImage } from '../src/lib/face-morph.ts';

await MeshoptDecoder.ready;
const meta = JSON.parse(readFileSync('public/portrait-twin/portrait-head-v2.json', 'utf8'));
const f = readFileSync('public/portrait-twin/portrait-head-v2.glb'); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
const g = await new Promise((r, j) => l.parse(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength), '', r, j));
let skin; g.scene.traverse(o => { if (o.isMesh && /head.?skin/i.test(o.name)) skin = o; });
const anchors = anchorsFromUV(skin.geometry, meta.landmarks.uv);
const N = 468, W = 960, H = 1280;
const subjects = process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b'];
const data = subjects.map(s => {
  const t = JSON.parse(readFileSync(`public/_scan/${s}-truth.json`, 'utf8')), T = [];
  for (let i = 0; i < t.skin.length; i += 3) T.push([t.skin[i], t.skin[i + 1], t.skin[i + 2]]);
  const lm = anchoredPoints(T, anchors).slice(0, N);
  const frames = [['front', 'front'], ['side-a', 'left'], ['side-b', 'right']].map(([step, kind]) => ({ kind, points: JSON.parse(readFileSync(`public/_scan/${s}-${step}.json`, 'utf8')).map(p => fromImage(p, W, H)) }));
  return { s, lm, frames };
});
// poses: similarity with depth counting little, refined once with the bias (so a biased landmark does not tilt the pose)
const poseFor = (lm, fr, bias) => { const L = lm.map((p, i) => bias ? [p[0] + bias[i][0], p[1] + bias[i][1], p[2] + bias[i][2]] : p);
  const P = similarity(L.map(p => [p[0], p[1], p[2]]), fr.points.slice(0, N).map(p => [p[0], p[1], p[2]]));
  // translation again on true depth (the rotation and scale from the squashed fit are kept)
  const mean = a => [0, 1, 2].map(c => a.reduce((s, p) => s + p[c], 0) / a.length), ms = mean(L), mt = mean(fr.points.slice(0, N));
  P.t = [0, 1, 2].map(r => mt[r] - P.s * (P.R[r][0] * ms[0] + P.R[r][1] * ms[1] + P.R[r][2] * ms[2])); return P; };
function fixZ(pose, lm, fr) { // the similarity above was on squashed depth; recompute translation z on the true scale
  return pose; }
function calibrate(set) {
  const sum = Array.from({ length: N }, () => [0, 0, 0]), wt = new Array(N).fill(0);
  for (const d of set) {
    let bias = null;
    for (let it = 0; it < 3; it++) {
      const poses = d.frames.map(fr => poseFor(d.lm, fr, bias));
      const { raw, conf } = landmarkOffsets(d.lm, d.frames, poses);
      bias = raw;
      if (it === 2) raw.forEach((v, i) => { for (let c = 0; c < 3; c++) sum[i][c] += conf[i] * v[c]; wt[i] += conf[i]; });
    }
  }
  return sum.map((v, i) => v.map(x => (wt[i] ? x / wt[i] : 0)));
}
// judge: the front view's 2D error of the (biased) truth landmarks against the detector, in mm, after one similarity
function judge(d, bias) {
  const fr = d.frames[0], pose = poseFor(d.lm, fr, bias); let e = 0;
  d.lm.forEach((p, i) => { const q = bias ? [p[0] + bias[i][0], p[1] + bias[i][1], p[2] + bias[i][2]] : p, o = unPose(pose, fr.points[i]); e += Math.hypot(o[0] - q[0], o[1] - q[1]); });
  return e / N;
}
for (const d of data) {
  const others = data.filter(x => x !== d); if (!others.length) continue;
  const b = calibrate(others);
  console.log(`${d.s}: anchors vs detector ${judge(d, null).toFixed(2)} mm; with the bias from ${others.map(x => x.s).join('+')} ${judge(d, b).toFixed(2)} mm`);
}
const bias = calibrate(data), mag = bias.map(v => Math.hypot(...v)).sort((a, b) => a - b);
console.log(`bias over ${subjects.join('+')}: median ${mag[N >> 1].toFixed(2)} mm, 90th ${mag[Math.floor(N * 0.9)].toFixed(2)} mm, max ${mag[N - 1].toFixed(2)} mm`);
if (!process.env.DRY) { writeFileSync('public/portrait-twin/landmark-bias-v1.json', JSON.stringify({ v: 1, subjects, bias: bias.flat().map(x => Math.round(x * 10) / 10) })); console.log('wrote public/portrait-twin/landmark-bias-v1.json'); }
void fixZ;
