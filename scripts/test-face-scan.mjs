// The guided face scan's gates: good frames pass; a blurry, half-lit, dark, cropped or wrong-angle frame is rejected
// with a reason the customer can act on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFrame, headAngle, regionalTones } from '../src/lib/face-scan.ts';

const marks = JSON.parse(readFileSync(new URL('./fixtures/face-marks-front.json', import.meta.url)));   // 468 MediaPipe landmarks (our own render)
const W = 640, H = 480;
let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// a skin-like photo: warm tone, pores and fine texture (sharp), lit evenly
function photo({ blur = 0, light = x => 1, gain = 1 } = {}) {
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.75 + 0.5 * rnd();
  let a = lum;
  for (let k = 0; k < blur; k++) {                     // box blur passes
    const b = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[(y + dy) * W + x + dx]; b[y * W + x] = s / 9; }
    a = b;
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = a[i] * light(x / W) * gain;
    data[4 * i] = 190 * v; data[4 * i + 1] = 140 * v; data[4 * i + 2] = 110 * v; data[4 * i + 3] = 255;
  }
  return { data, width: W, height: H };
}
// head poses from the front landmarks: turn about the vertical axis through the face, tilt the chin up, smile
const centre = marks.reduce((c, p) => ({ x: c.x + p.x / marks.length, y: c.y + p.y / marks.length, z: c.z + p.z / marks.length }), { x: 0, y: 0, z: 0 });
let front = marks;
const pose = (yaw = 0, pitch = 0, from = front) => from.map(p => {
  let x = (p.x - centre.x) * W, y = (p.y - centre.y) * H, z = (p.z - centre.z) * W;
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
  return { x: centre.x + x / W, y: centre.y + y / H, z: centre.z + z / W };
});
// square the fixture to the camera (the render it came from was turned a little)
{ const t = y => headAngle(pose(y, 0, marks)).turn; let lo = -0.6, hi = 0.6; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (Math.sign(t(m)) === Math.sign(t(lo))) lo = m; else hi = m; } front = pose((lo + hi) / 2, 0, marks); }
console.log('fixture turn', headAngle(marks).turn.toFixed(3), '-> squared', headAngle(front).turn.toFixed(3), 'tilt', headAngle(front).tilt.toFixed(2));
const smile = () => front.map((p, i) => i === 61 || i === 291 ? { ...p, x: p.x + (i === 61 ? -1 : 1) * 0.02, y: p.y - 0.01 } : p);

const good = photo();
const r = (step, img, l, f, a) => checkFrame(step, img, l, f, a);
assert.equal(r('front', good, front).ok, true, `a sharp, evenly lit front frame passes (${JSON.stringify(r('front', good, front))})`);
// rejections
const blurry = r('front', photo({ blur: 4 }), front);
assert.equal(blurry.ok, false); assert.match(blurry.reason, /blurry/i, 'blur is rejected');
const halfLit = r('front', photo({ light: x => (x < 0.53 ? 1 : 0.38) }), front);
assert.equal(halfLit.ok, false); assert.match(halfLit.reason, /shadow/i, 'a half-lit face is rejected');
assert.match(r('front', photo({ gain: 0.25 }), front).reason, /dark/i, 'a dark frame is rejected');
assert.match(r('front', good, null).reason, /looking/i, 'no face: keep looking');
assert.match(r('front', good, front.map(p => ({ ...p, x: p.x + 0.2 }))).reason, /inside the frame/i, 'a cropped face is rejected');
assert.match(r('front', good, pose(0.5)).reason, /straight/i, 'front must look straight at the camera');
// the profile steps: turned far enough, and the second the other way
const left = pose(0.6), right = pose(-0.6);
assert.ok(Math.abs(headAngle(left).turn) > 0.22, 'synthetic profile is turned');
assert.match(r('side-a', good, pose(0.1), front).reason, /further/i, 'a small turn is not a profile');
assert.equal(r('side-a', good, left, front).ok, true, 'a profile passes');
assert.match(r('side-b', good, left, front, left).reason, /other way/i, 'the second profile must face the other way');
assert.equal(r('side-b', good, right, front, left).ok, true);
// chin up and smile
assert.match(r('up', good, front, front).reason, /chin/i, 'chin-up needs the chin lifted');
assert.equal(r('up', good, pose(0, -0.45), front).ok, true, 'a lifted chin passes');
assert.match(r('smile', good, front, front).reason, /smile/i, 'a neutral face is not the smile frame');
assert.equal(r('smile', good, smile(), front).ok, true, 'a smile passes');
// tones come from the photo
const t = regionalTones(good, front);
assert.ok(/^#[0-9a-f]{6}$/.test(t.base) && parseInt(t.base.slice(1, 3), 16) > parseInt(t.base.slice(5, 7), 16), 'regional tones are warm skin colours');
console.log('ok - good frames pass; blurry, half-lit, dark, cropped and wrong-angle frames are rejected with a reason');
