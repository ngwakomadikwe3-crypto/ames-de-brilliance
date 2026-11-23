// The wand gestures (wand-gestures.ts), on synthetic hands (forward kinematics, metres) at random orientations:
// classification at any angle, activation and cooldown timing, velocity motion (dead zone, clamp, smooth stop),
// the confidence gate, freeze/reset, and a 60 s random stress test (no false triggers, no stuck states).
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { WandController, classify, fingerStates, MAX_SPEED } from '../src/lib/wand-gestures.ts';

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
  wand: null, double: null,
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

POSES.wand = POSES.point; POSES.double = POSES.two; delete POSES.point; delete POSES.two;
const RAD = Math.PI / 180;
// 1. every pose recognised at 200 random orientations (frame-by-frame classifier, no history)
for (const [name, p] of Object.entries(POSES)) {
  let ok = 0;
  for (let s = 1; s <= 200; s++) { const q = spin(p, s * 7919); if (classify(q, fingerStates(q), false) === name) ok++; }
  assert.equal(ok, 200, `${name}: ${ok}/200 orientations`);
}
console.log('ok - wand, double, pinch, palm, fist recognised at 200/200 random orientations each');

// a hand of a given pose aimed along a direction (its index, or index+middle, pointing there), rolled about it
function aimed(pose, dir, roll = 0, noise = 0, seed = 1) {
  const p = POSES[pose], tipMcp = (a, b) => new Vector3(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z).normalize();
  const f = pose === 'double' ? tipMcp(8, 5).add(tipMcp(12, 9)).normalize() : tipMcp(8, 5);
  const q = new Quaternion().setFromUnitVectors(f, new Vector3(...dir).normalize()).premultiply(new Quaternion().setFromAxisAngle(new Vector3(...dir).normalize(), roll));
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  return p.map(v => { const w = new Vector3(v.x, v.y, v.z).applyQuaternion(q); return V(w.x + r(), w.y + r() + 0.0, w.z + 0.4 + r()); });
}
const dirFrom = (upDeg, leftDeg) => [Math.sin(leftDeg * RAD), -Math.sin(upDeg * RAD), -Math.cos(upDeg * RAD) * Math.cos(leftDeg * RAD)];   // image y down; z toward the camera is -
const FPS = 30, DT = 1000 / FPS;
function run(c, t0, ms, make, conf = 0.95) { let o, t = t0; for (; t < t0 + ms; t += DT) o = c.step(make(t), conf, t); return { o, t }; }

// 2. activation needs 250 ms; a wand at ANY roll (palm up, down, sideways) classifies and drives the same way
for (let roll = 0; roll < 360; roll += 18) {
  const c = new WandController();
  let r = run(c, 0, 200, () => aimed('wand', dirFrom(50, 0), roll * RAD));
  assert.notEqual(c.pose, 'wand', 'not before 250 ms');
  r = run(c, r.t, 1500, () => aimed('wand', dirFrom(50, 0), roll * RAD));
  assert.equal(c.pose, 'wand', `wand locks in at roll ${roll}`);
  assert.ok(r.o.velocity.pitch < -0.9 * MAX_SPEED * (42 / 47), `aim up -> tilts up at roll ${roll} (${(r.o.velocity.pitch / RAD).toFixed(0)} deg/s)`);
  const c2 = new WandController();
  const r2 = run(c2, 0, 1500, () => aimed('double', dirFrom(0, 40), roll * RAD));
  assert.equal(c2.pose, 'double', `double wand at roll ${roll}, never two wands`);
  assert.ok(r2.o.velocity.yaw < 0, `double aimed to the customer's left turns left at roll ${roll}`);
}
console.log('ok - wand and double wand classify and steer correctly at 20/20 rolls (palm up, down, sideways)');

// 3. point and hold: smooth continuous spin, clamped, no jitter or runaway; release to the dead zone stops in 300 ms
{ const c = new WandController(); let t = 0, speeds = [], mid = [], angle = 0;
  for (; t < 6000; t += DT) { const o = c.step(aimed('wand', dirFrom(t < 3500 ? -70 : -30, 0), 0.3, 0.0015, t), 0.95, t); if (t > 4500) mid.push(o.velocity.pitch); if (t > 1500 && t < 3500) speeds.push(o.velocity.pitch); angle += o.velocity.pitch * DT / 1000; }
  const mx = Math.max(...speeds.map(Math.abs)), mean = speeds.reduce((a, b) => a + b) / speeds.length, mm = mid.reduce((a, b) => a + b) / mid.length, jit = Math.max(...mid.map(s => Math.abs(s - mm)));
  assert.ok(mx <= MAX_SPEED + 1e-9, `never above 120 deg/s (${(mx / RAD).toFixed(1)})`);
  assert.ok(mean > 0.95 * MAX_SPEED, `aim down 70 deg: full speed downward (${(mean / RAD).toFixed(0)} deg/s)`);
  assert.ok(jit < 3 * RAD, `aim 30 deg: a steady part speed under 1.5 mm landmark noise (${(mm / RAD).toFixed(0)} +- ${(jit / RAD).toFixed(2)} deg/s)`);
  assert.ok(Math.abs(angle) > 2 * Math.PI, `continuous rotation past 360 deg (${(angle / RAD).toFixed(0)})`);
  let stopAt = -1;
  for (const t0 = t; t < t0 + 1000; t += DT) { const o = c.step(aimed('wand', dirFrom(3, 0), 0.3, 0.0015, t), 0.95, t); if (stopAt < 0 && Math.abs(o.velocity.pitch) < 2 * RAD) stopAt = t - t0; }
  assert.ok(stopAt >= 0 && stopAt <= 300, `back in the dead zone: stops within 300 ms (${stopAt.toFixed(0)} ms)`);
  console.log(`ok - point and hold: ${(mean / RAD).toFixed(0)} deg/s at full aim, ${(mm / RAD).toFixed(0)} +- ${(jit / RAD).toFixed(2)} deg/s at 30 deg, past 360 deg, stops in ${stopAt.toFixed(0)} ms`); }

// 4. the confidence gate: garbage frames change nothing
{ const c = new WandController(); let r = run(c, 0, 1000, () => aimed('wand', dirFrom(40, 0)));
  const before = c.state; r = run(c, r.t, 600, () => spin(POSES.fist, 3), 0.2);
  assert.equal(c.state, before); assert.equal(c.pose, 'wand', 'low-confidence fist frames do not reset or release');
  assert.ok(!r.o.reset); console.log('ok - low-confidence frames hold the state'); }

// 5. freeze and reset: palm toggles freeze; frozen: wand does not move, pinch still zooms; fist resets and unfreezes
{ const c = new WandController(); let r = run(c, 0, 600, () => spin(POSES.palm, 5));
  assert.ok(c.frozen, 'palm freezes');
  for (let t = r.t; t < r.t + 700; t += DT) c.lost(t); r.t += 700;                       // hand away, then back
  r = run(c, r.t, 1200, () => aimed('wand', dirFrom(60, 0)));
  assert.ok(c.frozen && c.pose === 'wand' && Math.abs(r.o.velocity.pitch) < 1e-6, 'frozen: the wand does not move the piece');
  for (let t = r.t; t < r.t + 700; t += DT) c.lost(t); r.t += 700;
  let z = 1; for (let t = r.t, k = 0; t < r.t + 1500; t += DT, k++) { const q = spin(POSES.pinch, 4); if (k > 12) { const o = q[8], g = 1 + Math.min(1, (k - 12) / 20) * 2.5; q[4] = V(o.x + (q[4].x - o.x) * g, o.y + (q[4].y - o.y) * g, o.z + (q[4].z - o.z) * g); } z *= c.step(q, 0.95, t).zoom; }
  r.t += 1500;
  assert.ok(c.frozen && z > 1.02, `frozen: the pinch still zooms (x${z.toFixed(3)})`);
  for (let t = r.t; t < r.t + 700; t += DT) c.lost(t); r.t += 700;
  r = run(c, r.t, 700, () => spin(POSES.fist, 6)); assert.equal(c.pose, 'fist'); assert.ok(!c.frozen, 'fist resets and unfreezes');
  console.log('ok - palm freezes, the wand is still while frozen, pinch still zooms, the fist resets'); }

// 6. stress: 60 s of rapid random gesture changes with noise and dropouts. Every lock-in must be a pose that was truly
// held for 250 ms (500 for the fist) just before; the machine never sticks (an idle hand always returns it to rest).
{ const c = new WandController(); let s = 77; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const names = ['wand', 'double', 'pinch', 'palm', 'fist', 'wand', 'pinch'];
  let t = 0, falses = 0, locks = 0, heldSince = 0, cur = 'none', prev = { pose: 'none', held: 0, ended: 0 };
  while (t < 60000) {
    const pose = names[Math.floor(r() * names.length)], dur = 100 + r() * 1400, dir = dirFrom((r() - 0.5) * 160, (r() - 0.5) * 120), roll = r() * 6.28;
    if (pose !== cur) { prev = { pose: cur, held: t - heldSince, ended: t }; cur = pose; heldSince = t; }
    for (const t0 = t; t < t0 + dur; t += DT) {
      const garbage = r() < 0.05;
      const o = c.step(garbage ? spin(POSES[names[Math.floor(r() * 5)]], 13) : (pose === 'wand' || pose === 'double' ? aimed(pose, dir, roll, 0.001, t) : spin(POSES[pose], 1 + Math.floor(t / 1000))), garbage ? 0.3 : 0.95, t);
      if (o.lockedIn) { locks++; const need = c.pose === 'fist' ? 500 : 250; // genuine: the pose being held, held long enough; or the pose just before it, held long enough, locking in within
      // the smoothing lag (150 ms) after the hand changed
      const ok = (c.pose === cur && t - heldSince >= need - DT) || (c.pose === prev.pose && prev.held >= need - DT && t - prev.ended <= 150);
      if (!ok) { falses++; if (falses < 8) console.log('FALSE', c.pose, 'held', cur, Math.round(t - heldSince)); } }
    }
  }
  assert.equal(falses, 0, `no false triggers in 60 s (${locks} lock-ins)`);
  let o; for (const t0 = t; t < t0 + 1200; t += DT) o = c.lost(t);
  assert.ok(['IDLE', 'FROZEN'].includes(c.state) && c.pose === 'none' && Math.abs(o.velocity.yaw) + Math.abs(o.velocity.pitch) < 1e-3, `back at rest after the stress (${c.state})`);
  console.log(`ok - 60 s stress: ${locks} lock-ins, 0 false triggers, no stuck state`); }
