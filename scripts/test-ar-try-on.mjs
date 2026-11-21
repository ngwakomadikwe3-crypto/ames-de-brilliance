// node --experimental-strip-types --test scripts/test-ar-try-on.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { liftHand, cameraFor, DorsalSide, wristFrame, fingerFrame, length, sub, dot } from '../src/lib/ar/hand-pose.ts';
import { TrackingGate, plausibleStep } from '../src/lib/ar/tracking-gate.ts';
import { PinchZoom } from '../src/lib/ar/pinch-zoom.ts';
import { OneEuro } from '../src/lib/ar/one-euro.ts';
import { estimateRoomLight } from '../src/lib/ar/room-light.ts';

// A right hand, back to the camera, fingers up, in MediaPipe world space (metres, y down, z away from camera
// is positive). Palm width 5-17 about 8 cm. Fingers slightly bent toward the palm (away from camera: +z).
function worldHand(bend = 0.012) {
  const p = [];
  p[0] = [0, 0.04, 0];
  const thumb = [[0.03, 0.03, -0.01], [0.05, 0.01, -0.02], [0.065, -0.01, -0.02], [0.075, -0.03, -0.015]]; // palmar = -z? see note
  // Raw camera, back of right hand facing the camera: thumb on the image left (x < 0).
  thumb.forEach((t, i) => (p[1 + i] = [-t[0], t[1], -t[2] + bend]));
  const bases = [-0.035, -0.012, 0.012, 0.037];
  bases.forEach((x, f) => {
    const b = 1 + 4 * (f + 1);
    p[b] = [x, -0.04, 0];
    for (let k = 1; k < 4; k++) p[b + k] = [x, -0.04 - 0.025 * k, bend * k];
  });
  return p.map(([x, y, z]) => ({ x, y, z }));
}
function project(world, cam, depth = 0.45, cx = 0.5, cy = 0.5) {
  // Raw (unmirrored) image of the world hand at a given depth: x right, y down.
  const f = cam.focal;
  return world.map(w => ({ x: cx + (w.x * f / depth) / cam.width, y: cy + (w.y * f / depth) / cam.height, z: w.z }));
}

test('lifting recovers depth and metric palm width', () => {
  const cam = cameraFor(640, 480), world = worldHand();
  const lifted = liftHand(project(world, cam, 0.45), world, cam);
  assert.ok(lifted);
  assert.ok(Math.abs(lifted.depth - 0.45) < 0.01, `depth ${lifted.depth}`);
  const palm = length(sub(lifted.points[5], lifted.points[17]));
  assert.ok(Math.abs(palm - 0.072) < 0.003, `palm ${palm}`);
  // Mirrored: the raw image had the thumb on the left, the selfie view shows it on the right.
  assert.ok(lifted.points[4][0] > lifted.points[0][0]);
});

test('the back of the hand is found from the thumb and finger curl', () => {
  const cam = cameraFor(640, 480), world = worldHand(0.012);
  const lifted = liftHand(project(world, cam), world, cam);
  const side = new DorsalSide();
  let dorsal;
  for (let i = 0; i < 20; i++) dorsal = side.update(lifted.points, -1);     // a wrong prior is overridden
  // Fingers curl away from the camera, so the back of the hand faces the camera (+z).
  assert.ok(dorsal[2] > 0.8, `dorsal ${dorsal}`);
});

test('wrist and ring frames are orthonormal and sized from the palm', () => {
  const cam = cameraFor(640, 480), world = worldHand();
  const { points } = liftHand(project(world, cam), world, cam);
  const dorsal = new DorsalSide().update(points, 1);
  const w = wristFrame(points, dorsal);
  assert.ok(Math.abs(dot(w.axis, w.up)) < 1e-6 && Math.abs(dot(w.axis, w.side)) < 1e-6 && Math.abs(dot(w.up, w.side)) < 1e-6);
  assert.ok(w.halfWidth > 0.02 && w.halfWidth < 0.035, `wrist half width ${w.halfWidth}`);
  const r = fingerFrame(points, dorsal, 3);
  assert.ok(r.radius > 0.006 && r.radius < 0.011, `finger radius ${r.radius}`);
});

test('the piece appears after 3 confident frames, holds 500 ms, then hides', () => {
  const g = new TrackingGate();
  assert.equal(g.update(true, 0), 'hidden');
  assert.equal(g.update(true, 33), 'hidden');
  assert.equal(g.update(true, 66), 'tracking');
  assert.equal(g.update(false, 100), 'holding');
  assert.equal(g.update(false, 500), 'holding');
  assert.equal(g.update(false, 570), 'hidden');
  assert.equal(g.update(true, 600), 'hidden');           // must re-confirm
});

test('single-frame jumps are rejected as tracking errors', () => {
  assert.ok(plausibleStep({ x: .5, y: .5, size: .1 }, { x: .52, y: .5, size: .1 }, 33));
  assert.ok(!plausibleStep({ x: .2, y: .5, size: .1 }, { x: .8, y: .5, size: .1 }, 33));
  assert.ok(!plausibleStep({ x: .5, y: .5, size: .1 }, { x: .5, y: .5, size: .2 }, 33));
});

test('pinch zoom: held 250 ms before it starts, dead zone, at most 15% per second', () => {
  const z = new PinchZoom();
  let t = 0, out;
  for (; t < 200; t += 33) out = z.step(true, 0.3, t);
  assert.equal(out.active, false);
  for (; t < 400; t += 33) out = z.step(true, 0.3, t);
  assert.equal(out.active, true);
  out = z.step(true, 0.33, t += 33);                     // 3% of hand size: inside the dead zone
  assert.equal(out.zoom, 1);
  const start = t;
  for (; t < start + 1000; t += 33) out = z.step(true, 1.3, t);
  assert.ok(out.zoom > 1 && out.zoom <= 1.151, `zoom ${out.zoom}`);
  // Release after 300 ms, then a 400 ms cooldown before a new pinch can start.
  for (const end = t + 340; t < end; t += 33) out = z.step(false, 0, t);
  assert.equal(out.active, false);
  out = z.step(true, 0.3, t += 33);
  assert.equal(out.active, false);
});

test('One Euro: still input is still, moving input follows', () => {
  const f = new OneEuro(1, 5);
  let out;
  let seed = 1; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.004;
  const still = [];
  for (let t = 0; t < 2000; t += 33) { out = f.filter([0.5 + noise()], t); if (t > 500) still.push(out[0]); }
  const jitter = Math.max(...still) - Math.min(...still);
  assert.ok(jitter < 0.0015, `jitter ${jitter}`);
  for (let t = 2000; t < 2500; t += 33) out = f.filter([0.5 + (t - 2000) / 1000], t);
  assert.ok(out[0] > 0.9, `lag ${out[0]}`);
});

test('room light: brightness and the side the light comes from', () => {
  const w = 8, h = 6, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = 4 * (y * w + x), v = x >= 6 ? 250 : 40; data.set([v, v, v, 255], i); }
  const light = estimateRoomLight(data, w, h);
  assert.ok(light.direction[0] > 0.3, `direction ${light.direction}`);
  assert.ok(light.luminance > 0.1 && light.luminance < 0.5);
});
