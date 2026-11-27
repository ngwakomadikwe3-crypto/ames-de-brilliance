// The live try-on's reality layer: the camera-look measurement, the face anchors and the earring pendulum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLook, easeLook } from '../src/lib/ar/reality.ts';
import { FaceCalibration, Pendulum, unproject } from '../src/lib/ar/face-anchor.ts';

const frame = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = 4 * (y * w + x); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return d; };

test('a clean, flat frame has no grain; a noisy one has some', () => {
  const clean = measureLook(frame(64, 48, () => [120, 120, 120]), 64, 48);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const noisy = measureLook(frame(64, 48, () => { const v = 120 + (rnd() - 0.5) * 6; return [v, v, v]; }), 64, 48);
  assert.equal(clean.grain, 0);
  assert.ok(noisy.grain > 0.002 && noisy.grain < 0.06, `grain ${noisy.grain}`);
});

test('black level and white clip follow the picture', () => {
  const look = measureLook(frame(64, 48, x => { const v = 20 + (x / 63) * 200; return [v, v, v]; }), 64, 48);
  assert.ok(look.black > 0.07 && look.black < 0.1, `black ${look.black}`);
  assert.ok(look.white > 0.8 && look.white <= 0.9, `white ${look.white}`);
  const half = easeLook({ black: 0, white: 1, grain: 0, soft: 0, saturation: 1 }, look, 0.5);
  assert.ok(Math.abs(half.black - look.black / 2) < 1e-9);
});

test('the face anchors are symmetric and the lobes sit outside the head stand-in', () => {
  // a face at 40 cm, facing the camera: identity rotation, translation (0, 0, -40)
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -40, 1];
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const at = (i, x, y, z) => { lm[i] = { x, y, z }; };
  at(234, 0.38, 0.48, 0.02); at(454, 0.62, 0.48, 0.02); at(132, 0.40, 0.58, 0.01); at(361, 0.60, 0.58, 0.01);
  at(152, 0.5, 0.66, -0.01); at(10, 0.5, 0.30, -0.02); at(1, 0.5, 0.50, -0.06);
  const cal = new FaceCalibration(3);
  for (let i = 0; i < 3; i++) cal.add(lm, m, 4 / 3);
  assert.ok(cal.ready);
  const { bust, head } = cal.anchors();
  assert.equal(bust.earlobe_l[0], -bust.earlobe_r[0]);
  assert.ok(bust.earlobe_l[0] > head.radii[0] + 10, 'lobe outside the head ellipsoid');
  assert.ok(bust.earlobe_l[1] < 0 && bust.neck.centre[1] < bust.earlobe_l[1], 'lobes above the neck');
  // un-projecting the image centre at zero depth offset lands on the optical axis at the head's depth
  const c = unproject({ x: 0.5, y: 0.5, z: 0 }, m, 4 / 3);
  assert.deepEqual(c.map(v => Math.round(v * 1000) / 1000), [0, 0, -40]);
});

test('an earring swings and settles hanging straight down', () => {
  const p = new Pendulum();
  let a = p.step([0, 0], [0, 0, -40], 0);
  for (let i = 0; i < 6; i++) a = p.step([0, 0], [i * 0.8, 0, -40], 1 / 30);   // the head moves sideways
  assert.ok(Math.abs(a[1]) > 0.001, 'it swings');
  for (let i = 0; i < 300; i++) a = p.step([0.2, -0.1], [4, 0, -40], 1 / 30);
  assert.ok(Math.abs(a[0] - 0.2) < 0.01 && Math.abs(a[1] + 0.1) < 0.01, `settles ${a}`);
});
