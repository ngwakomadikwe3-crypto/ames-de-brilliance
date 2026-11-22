// node --experimental-strip-types scripts/test-face-morph.mjs
// The portrait twin's face morph on the real landmark asset, with synthetic "camera" faces: the canonical face seen
// at an angle, at another scale and place, then a face made wider, then noise.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignSimilar, faceDeltas, morphField, averageFrames, jitter } from '../src/lib/face-morph.ts';

const asset = JSON.parse(readFileSync(new URL('../public/portrait-twin/face-landmarks-v1.json', import.meta.url), 'utf8'));
assert.equal(asset.C.length, 468); assert.equal(asset.B.length, 468);
const rot = (p, yaw, pitch) => { const [x, y, z] = p; const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)]; };
const camera = (face, yaw = 0.3, pitch = -0.15, s = 2.7, t = [310, -220, -40]) => face.map(p => rot(p, yaw, pitch).map((v, i) => v * s + t[i]));
const maxLen = ds => Math.max(...ds.map(d => Math.hypot(...d)));
let ok = 0; const pass = name => { ok++; console.log('ok -', name); };

// 1. pose, scale and position drop out: the canonical face seen any way gives no differences
const back = alignSimilar(camera(asset.C), asset.C);
assert.ok(maxLen(back.map((p, i) => p.map((v, j) => v - asset.C[i][j]))) < 1e-6);
assert.ok(maxLen(faceDeltas(camera(asset.C), asset)) < 1e-6);
pass('alignment recovers rotation, scale and translation exactly');

// 2. a face 12% wider (about the centre) comes back as outward x differences on the cheeks, not as a size change
const cx = asset.C.reduce((s, p) => s + p[0], 0) / 468;
const wide = asset.C.map(p => [cx + (p[0] - cx) * 1.12, p[1], p[2]]);
const d = faceDeltas(camera(wide, -0.2, 0.1, 1.9), asset);
const cheekL = 454, cheekR = 234;                                   // MediaPipe face-oval points at the cheekbones
assert.ok(d[cheekL][0] > 2 && d[cheekR][0] < -2, `cheeks ${d[cheekL][0].toFixed(2)} ${d[cheekR][0].toFixed(2)}`);
assert.ok(Math.abs(d[1][0]) < 1, 'nose tip stays on the midline');
pass(`a wider face widens the cheeks (${d[cheekL][0].toFixed(1)} mm, ${d[cheekR][0].toFixed(1)} mm)`);

// 3. the field moves the face and leaves the back of the head and the neck alone
const field = morphField(asset, d);
const atCheek = field(asset.B[cheekL]);
assert.ok(atCheek[0] > 1, 'skin at the cheek moves out');
const behind = [0, asset.B[10][1], asset.B[10][2] - 150], neck = [0, asset.B[152][1] - 90, asset.B[152][2] - 40];
assert.ok(Math.hypot(...field(behind)) < 0.05 && Math.hypot(...field(neck)) < 0.05);
pass('the field moves the face only');

// 4. limits: no landmark moves more than 12 mm, depth counts for less
const wild = asset.C.map((p, i) => i === 1 ? [p[0], p[1], p[2] + 60] : p);
const dw = faceDeltas(camera(wild), asset);
assert.ok(maxLen(dw) <= 12 + 1e-9);
pass('a wild landmark is capped at 12 mm');

// 5. averaging frames and the steadiness measure
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const frames = Array.from({ length: 20 }, () => camera(asset.C.map(p => p.map(v => v + rnd() * 1.2))));
assert.ok(jitter(frames, asset) < 1, 'steady frames read as steady');
assert.ok(maxLen(faceDeltas(averageFrames(frames), asset)) < 1.2, 'averaged noise leaves little behind');
pass('frames average out and read as steady');
console.log(`${ok} ok`);
