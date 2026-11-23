// node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-texture-capture.mjs
// System 2's guided head turn (texture-capture.ts): per-frame quality gates with a spoken-style reason, coverage of the
// left, front and right, the sharpest frame per angle kept, and 10-15 frames at the end.
import assert from 'node:assert/strict';
import { TextureCapture, TURN, clippedFraction } from '../src/lib/texture-capture.ts';
// a synthetic face: 478 landmarks whose nose sits between the face edges according to the turn
const face = turn => { const l = Array.from({ length: 478 }, (_, i) => ({ x: 0.3 + 0.4 * ((i * 37) % 100) / 100, y: 0.25 + 0.5 * ((i * 53) % 100) / 100, z: 0 }));
  l[234] = { x: 0.3, y: 0.5, z: 0 }; l[454] = { x: 0.7, y: 0.5, z: 0 }; l[1] = { x: 0.5 + turn * 0.4, y: 0.55, z: 0 }; l[10] = { x: 0.5, y: 0.2, z: 0 }; l[152] = { x: 0.5, y: 0.8, z: 0 }; return l; };
const good = { ok: true, sharpness: 120, balance: 1, brightness: 0.5 };
const cap = new TextureCapture();
assert.match(cap.offer(face(0), { ...good, sharpness: 20 }, 0, () => 1).prompt, /slower/);
assert.match(cap.offer(face(0), { ...good, brightness: 0.1 }, 0, () => 1).prompt, /dark/);
assert.match(cap.offer(face(0), good, 0.05, () => 1).prompt, /bright/);
assert.match(cap.offer(null, good, 0, () => 1).prompt, /Looking/);
assert.equal(cap.count(), 0, 'nothing bad is kept');
let p = cap.offer(face(0), good, 0, () => 1); assert.ok(p.kept);
p = cap.offer(face(0.02), good, 0, () => 1); assert.match(p.prompt, /camera|left/);
for (const t of [-0.1, 0.1]) cap.offer(face(t), good, 0, () => 1);
assert.match(cap.guidance(), /left/, 'front done: turn left');
for (let t = -0.1; t >= -0.62; t -= 0.1) cap.offer(face(t), good, 0, () => 1);
assert.match(cap.guidance(), /right/, 'left done: turn right');
assert.ok(!cap.done());
for (let t = 0.1; t <= 0.62; t += 0.1) cap.offer(face(t), good, 0, () => 1);
assert.ok(cap.done(), `turn complete with ${cap.count()} frames`); const c = cap.coverage();
assert.ok(c.left >= 3 && c.right >= 3 && c.front >= 2 && cap.count() >= TURN.need && cap.result().length <= TURN.maxFrames);
// a sharper frame at the same angle replaces the kept one; a blurrier one does not
const k = new TextureCapture(); k.offer(face(0.3), good, 0, () => 'a'); k.offer(face(0.3), { ...good, sharpness: 100 }, 0, () => 'b'); k.offer(face(0.3), { ...good, sharpness: 200 }, 0, () => 'c');
assert.equal(k.result()[0].data, 'c');
// clipped highlights are counted on the face only
const W = 100, H = 100, data = new Uint8ClampedArray(W * H * 4).fill(120); for (let i = 0; i < 300; i++) data.set([255, 255, 255, 255], (50 * W + 30 + (i % 40)) * 4 + Math.floor(i / 40) * W * 4);
assert.ok(clippedFraction({ data, width: W, height: H }, face(0)) > 0.01);
console.log(`ok - texture capture: gates with reasons, left/front/right coverage (${c.left}/${c.front}/${c.right}), sharpest kept, ${cap.count()} frames`);
