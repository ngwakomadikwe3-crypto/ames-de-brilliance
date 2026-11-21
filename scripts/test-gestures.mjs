// node --experimental-strip-types scripts/test-gestures.mjs
// Synthetic hands (forward kinematics, metres) in every pose, spun to random 3D orientations, through the
// pose classifier and the controller state machine. No camera needed.
import assert from 'node:assert/strict';
import { classifyPose, fingerExtension, pinchRatio, GestureController } from '../src/lib/gesture-controller.ts';

const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z), mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const rotX = (v, a) => V(v.x, v.y * Math.cos(a) - v.z * Math.sin(a), v.y * Math.sin(a) + v.z * Math.cos(a));
const rotZ = (v, a) => V(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a), v.z);
// right hand, back of hand +z, fingers +y, thumb toward -x (metres)
const MCP = [V(-0.024, 0.088, 0), V(-0.004, 0.092, 0), V(0.015, 0.086, 0), V(0.032, 0.076, 0)];
const LEN = [[0.042, 0.025, 0.021], [0.046, 0.029, 0.023], [0.043, 0.027, 0.022], [0.034, 0.02, 0.019]];
const SPLAY = [-0.12, -0.03, 0.06, 0.16];
// curls in degrees per joint (MCP, PIP, DIP); positive bends toward the palm (-z)
function hand({ fingers, thumb }) {
  const p = new Array(21);
  p[0] = V(0, 0, 0);
  for (let f = 0; f < 4; f++) {
    let dir = rotZ(V(0, 1, 0), -SPLAY[f]), at = MCP[f], angle = 0;
    p[5 + 4 * f] = at;
    for (let k = 0; k < 3; k++) {
      angle += fingers[f][k] * Math.PI / 180;
      const seg = rotX(dir, -angle);
      at = add(at, mul(seg, LEN[f][k])); p[6 + 4 * f + k] = at;
    }
  }
  // thumb: CMC, then three segments; 'out' = abducted away from the palm, 'tucked' = across the curled fingers
  p[1] = V(-0.022, 0.025, -0.012);
  if (thumb === 'touch-index' || thumb?.spread !== undefined) {
    const tip = p[8], gap = thumb === 'touch-index' ? 0.006 : thumb.spread;
    p[4] = add(tip, V(-gap * 0.8, -gap * 0.3, -gap * 0.5));
    p[2] = V(-0.04, 0.045, -0.02); p[3] = mul(add(p[2], p[4]), 0.5);
  } else if (thumb === 'out') { p[2] = V(-0.045, 0.045, -0.012); p[3] = V(-0.062, 0.068, -0.01); p[4] = V(-0.075, 0.088, -0.008); }
  else { p[2] = V(-0.032, 0.05, -0.03); p[3] = V(-0.018, 0.065, -0.045); p[4] = V(0.0, 0.07, -0.05); }   // tucked across
  return p;
}
const CURLED = [80, 100, 60], STRAIGHT = [0, 5, 3];
const POSES = {
  palm: hand({ fingers: [STRAIGHT, STRAIGHT, STRAIGHT, STRAIGHT], thumb: 'out' }),
  point: hand({ fingers: [STRAIGHT, CURLED, CURLED, CURLED], thumb: 'tucked' }),
  two: hand({ fingers: [STRAIGHT, STRAIGHT, CURLED, CURLED], thumb: 'tucked' }),
  fist: hand({ fingers: [CURLED, CURLED, CURLED, CURLED], thumb: 'tucked' }),
  pinch: hand({ fingers: [[30, 40, 20], [45, 60, 30], CURLED, CURLED], thumb: 'touch-index' }),
};
// random rigid rotation (+ translation, + 10 % size variation)
function spin(p, seed) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const q = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5], n = Math.hypot(...q); const [x, y, z, w] = q.map(v => v / n);
  const R = (v) => { const tx = 2 * (y * v.z - z * v.y), ty = 2 * (z * v.x - x * v.z), tz = 2 * (x * v.y - y * v.x);
    return V(v.x + w * tx + (y * tz - z * ty), v.y + w * ty + (z * tx - x * tz), v.z + w * tz + (x * ty - y * tx)); };
  const scale = 0.9 + 0.2 * r(), t = V(r() - 0.5, r() - 0.5, r());
  return p.map(v => add(mul(R(v), scale), t));
}

// 1. every pose, 200 orientations each
for (const [name, p] of Object.entries(POSES)) {
  let ok = 0;
  for (let s = 1; s <= 200; s++) if (classifyPose(spin(p, s * 7919)) === name) ok++;
  assert.equal(ok, 200, `${name}: recognised in ${ok}/200 orientations`);
  console.log(`ok pose ${name.padEnd(5)} 200/200 orientations  extended=${fingerExtension(p).map(b => (b ? 1 : 0)).join('')}  pinch=${pinchRatio(p).toFixed(2)}`);
}

// 2. state machine and effects, frame by frame (30 fps)
const g = new GestureController(); let t = 1000; const frame = (pose, x = 0.5, y = 0.5) => { t += 33; return g.step(spin(POSES[pose], 99), x, y, t); };
let sum = 0;
for (let i = 0; i < 3; i++) frame('point', 0.2);
for (let i = 0; i <= 60; i++) sum += frame('point', 0.2 + 0.67 * i / 60).dx;
for (let i = 0; i < 20; i++) sum += frame('point', 0.87).dx;                      // let the smoothing settle
assert.equal(g.state, 'TRACKING');
assert.ok(Math.abs(sum * 180 - 360) < 25, `index sweep across 2/3 of the frame turns ~360° (got ${(sum * 180).toFixed(0)}°)`);
console.log(`ok point turns ${(sum * 180).toFixed(0)}° for a 2/3-frame sweep`);

let tilt = 0;
for (let i = 0; i < 3; i++) frame('two', 0.5, 0.2);
for (let i = 0; i <= 60; i++) tilt += frame('two', 0.5, 0.2 + 0.67 * i / 60).dy;
for (let i = 0; i < 20; i++) tilt += frame('two', 0.5, 0.87).dy;
assert.ok(Math.abs(tilt * 180 - 360) < 25, `two fingers tilt ~360° (got ${(tilt * 180).toFixed(0)}°)`);
console.log(`ok two fingers tilt ${(tilt * 180).toFixed(0)}°`);

for (let i = 0; i < 4; i++) frame('palm');
assert.equal(g.state, 'FROZEN', 'open palm freezes');
let whileFrozen = 0; for (let i = 0; i < 10; i++) whileFrozen += Math.abs(frame('palm', 0.2 + i * 0.05).dx);
assert.equal(whileFrozen, 0, 'nothing turns while frozen');
let after = 0;
for (let i = 0; i < 3; i++) frame('point', 0.3);
assert.equal(g.state, 'TRACKING', 'pointing releases the freeze');
for (let i = 0; i <= 20; i++) after += frame('point', 0.3 + 0.3 * i / 20).dx;
assert.ok(after > 0.15, 'rotation works again after the freeze');
console.log(`ok palm freezes and un-freezes; turning resumes (${(after * 180).toFixed(0)}°)`);

let zoom = 1;
for (let i = 0; i < 3; i++) frame('pinch');
const pinchAt = (gap) => { t += 33; return g.step(spin(hand({ fingers: [[30, 40, 20], [45, 60, 30], CURLED, CURLED], thumb: { spread: gap } }), 99), 0.5, 0.5, t); };
for (let i = 0; i <= 45; i++) zoom *= pinchAt(0.006 + 0.05 * i / 45).zoom;
for (let i = 0; i < 15; i++) zoom *= pinchAt(0.056).zoom;
assert.equal(g.pose, 'pinch', 'spreading keeps the pinch');
assert.ok(zoom > 1.6, `spreading zooms in (×${zoom.toFixed(2)})`);
let out = 1;
for (let i = 0; i <= 45; i++) out *= pinchAt(0.056 - 0.05 * i / 45).zoom;
for (let i = 0; i < 15; i++) out *= pinchAt(0.006).zoom;
assert.ok(out < 0.65, `closing zooms out (×${out.toFixed(2)})`);
console.log(`ok pinch zooms in ×${zoom.toFixed(2)} and out ×${out.toFixed(2)}`);

let resets = 0; for (let i = 0; i < 30; i++) if (frame('fist').reset) resets++;
assert.equal(resets, 1, 'a held fist resets exactly once');
console.log('ok fist resets once after ½ s');

g.lost(t += 33); assert.equal(g.state, 'SHOWCASE');
frame('point'); assert.equal(g.state, 'TRACKING');
console.log('ok SHOWCASE -> TRACKING -> FROZEN -> TRACKING -> SHOWCASE');

// 3. real-camera noise: 3 mm landmark jitter, fingertip shake, and one garbage frame in eight
{
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const noisy = (p) => p.map(v => V(v.x + rnd() * 0.006, v.y + rnd() * 0.006, v.z + rnd() * 0.006));
  const n = new GestureController(); let tt = 0, turned = 0;
  for (let i = 0; i < 90; i++) {
    tt += 33; const x = 0.2 + 0.67 * Math.min(1, i / 70) + rnd() * 0.006;
    const p = i % 8 === 5 ? noisy(POSES.two) : noisy(spin(POSES.point, 99));   // every 8th frame misreads
    turned += n.step(i % 8 === 5 ? p : p, x, 0.5, tt).dx;
  }
  assert.ok(turned * 180 > 300, `with jitter and misread frames the sweep still turns (${(turned * 180).toFixed(0)}°)`);
  console.log(`ok noisy point sweep still turns ${(turned * 180).toFixed(0)}° (pose held through misreads)`);
}

// 4. switching gestures never throws the piece: point at the right of the frame, then two fingers at the centre
{
  const s = new GestureController(); let tt = 0, spurious = 0;
  for (let i = 0; i < 10; i++) { tt += 33; s.step(spin(POSES.point, 99), 0.75, 0.5, tt); }
  for (let i = 0; i < 6; i++) { tt += 33; const o = s.step(spin(POSES.two, 99), 0.5, 0.5, tt); spurious += Math.abs(o.dx) + Math.abs(o.dy); }
  assert.ok(spurious * 180 < 1, `no stray turn while the gesture changes (got ${(spurious * 180).toFixed(1)}°)`);
  console.log(`ok switching gestures moves nothing (${(spurious * 180).toFixed(2)}°)`);
}
