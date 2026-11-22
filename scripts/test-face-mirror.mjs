// Live mirroring: quick (a step reaches 90 % within ~100 ms), steady (a held expression with sensor noise does not
// shimmer), neutral at rest (dead zone), mirrored (the customer's left drives the twin's right), gaze to the eyes.
import assert from 'node:assert/strict';
import { FaceMirror, GAZE } from '../src/lib/face-mirror.ts';

const NAMES = ['_neutral', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', ...GAZE, 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthSmileLeft',
  'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight'];
assert.equal(NAMES.length, 52);
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const frame = (set, noise = 0.02) => NAMES.map(n => ({ categoryName: n, score: Math.max(0, (set[n] ?? 0.02) + (rnd() - 0.5) * 2 * noise) }));
const fps = 30, dt = 1000 / fps;
// 1. at rest: exactly neutral (the dead zone eats sensor noise)
{ const m = new FaceMirror(); let mx = 0; for (let t = 0; t < 2000; t += dt) { const o = m.update(frame({}), t); mx = Math.max(mx, ...Object.values(o.weights)); }
  assert.ok(mx < 0.02, `a resting face is neutral (max ${mx.toFixed(3)})`); }
// 2. the customer raises their LEFT brow: the twin's RIGHT outer brow rises, within ~100 ms
{ const m = new FaceMirror(); for (let t = 0; t < 500; t += dt) m.update(frame({}), t);
  let reached = -1, other = 0; for (let t = 500; t < 1500; t += dt) { const o = m.update(frame({ browOuterUpLeft: 0.8 }), t); other = Math.max(other, o.weights['ar:browOuterUpLeft']);
    if (reached < 0 && o.weights['ar:browOuterUpRight'] >= 0.9 * (0.8 - 0.06) / 0.94) reached = t - 500; }
  assert.ok(reached >= 0 && reached <= 120, `mirrored brow raise reaches 90 % in ${reached} ms`);
  assert.ok(other < 0.02, 'the other brow stays still'); }
// 3. a held smirk with noise: steady (frame-to-frame change small)
{ const m = new FaceMirror(); const vals = []; for (let t = 0; t < 3000; t += dt) vals.push(m.update(frame({ mouthSmileRight: 0.6 }, 0.04), t).weights['ar:mouthSmileLeft']);
  const tail = vals.slice(-60); let jit = 0; for (let i = 1; i < tail.length; i++) jit = Math.max(jit, Math.abs(tail[i] - tail[i - 1]));
  assert.ok(jit < 0.02, `a held expression does not jitter (max frame step ${jit.toFixed(3)})`); }
// 4. one bad frame cannot snap the face (velocity clamp)
{ const m = new FaceMirror(); for (let t = 0; t < 1000; t += dt) m.update(frame({}), t); const o = m.update(frame({ jawOpen: 1 }), 1000 + dt);
  assert.ok(o.weights['ar:jawOpen'] <= 12 * (1000 + dt - Math.floor(1000 / dt) * dt) / 1000 + 1e-6, `a single-frame spike is limited (${o.weights['ar:jawOpen'].toFixed(3)})`); }
// 5. gaze: the customer looks to their right (right eye out, left eye in): mirrored, the twin looks to its left
{ const m = new FaceMirror(); let g; for (let t = 0; t < 800; t += dt) g = m.update(frame({ eyeLookOutRight: 0.7, eyeLookInLeft: 0.7 }), t).gaze;
  assert.ok(g.left.yaw > 0.2 && g.right.yaw > 0.2, `both eyes turn the same way (${g.left.yaw.toFixed(2)}, ${g.right.yaw.toFixed(2)})`); }
// 6. cheek puff and every channel name map to a twin shape
{ const m = new FaceMirror(); const o = m.update(frame({}), 0); assert.equal(Object.keys(o.weights).length, 52 - 1 - 8, '43 shapes driven, 8 gaze channels turn the eyes'); }
console.log('ok - mirroring: neutral at rest, mirrored, <=120 ms, steady, spike-limited, gaze');
