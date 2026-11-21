// Atelier physics: a small fixed-timestep solver for jewellery that moves.
//   * Chains and straps: verlet points joined by distance constraints, closed or open, that collide with smooth
//     shapes (sphere, capsule, oval cylinder: the wrist, a finger, the neck and bust) and settle under gravity.
//   * Drops (earrings, pendants, fringe pears): damped pendulums hanging from a moving pivot.
// Runs at 120 Hz decoupled from rendering; the renderer reads interpolated states. Plain arithmetic, no browser.
//
// Rapier was evaluated first (see docs/atelier-physics.md): correct, but 4.3 MB of JavaScript+WASM and ~1.4 ms
// per step for one 60-link bracelet on a desktop CPU, several times that on a phone. These pieces need only
// particles, distance constraints and smooth colliders, which this solver does in microseconds.
export type Vec = [number, number, number];
export const PHYSICS_HZ = 120;

export type Collider =
  | { kind: 'sphere'; centre: Vec; radius: number }
  | { kind: 'capsule'; a: Vec; b: Vec; radius: number }
  /** Oval cylinder: centre, unit axis, unit `side` (the half-width direction), half-width, half-depth, half-length. */
  | { kind: 'oval'; centre: Vec; axis: Vec; side: Vec; halfWidth: number; halfDepth: number; halfLength: number };

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Push point p out of a collider (with a skin gap). Returns true if it moved. */
export function collide(p: Vec, c: Collider, gap = 0): boolean {
  if (c.kind === 'sphere') return pushOut(p, c.centre, c.radius + gap);
  if (c.kind === 'capsule') {
    const ab = sub(c.b, c.a), t = Math.max(0, Math.min(1, dot(sub(p, c.a), ab) / Math.max(1e-12, dot(ab, ab))));
    return pushOut(p, [c.a[0] + ab[0] * t, c.a[1] + ab[1] * t, c.a[2] + ab[2] * t], c.radius + gap);
  }
  const d = sub(p, c.centre), along = dot(d, c.axis);
  if (Math.abs(along) > c.halfLength) return false;
  const depthDir = cross(c.axis, c.side);
  const x = dot(d, c.side), y = dot(d, depthDir);
  const a = c.halfWidth + gap, b = c.halfDepth + gap;
  const k = (x / a) ** 2 + (y / b) ** 2;
  if (k >= 1) return false;
  // Scale radially out to the oval (close enough to the nearest point for these gentle shapes).
  const s = 1 / Math.sqrt(Math.max(k, 1e-12));
  const nx = x * s - x, ny = y * s - y;
  for (let i = 0; i < 3; i++) p[i] += c.side[i] * nx + depthDir[i] * ny;
  return true;
}
function pushOut(p: Vec, centre: Vec, r: number) {
  const d = sub(p, centre), len = Math.hypot(d[0], d[1], d[2]);
  if (len >= r) return false;
  const s = len > 1e-12 ? r / len : 1;
  if (len <= 1e-12) { p[1] = centre[1] + r; return true; }
  for (let i = 0; i < 3; i++) p[i] = centre[i] + d[i] * s;
  return true;
}

/** A chain of points (links, strap segments). Closed for bracelets and watch straps, open for necklaces. */
export class Chain {
  readonly points: Vec[]; private previous: Vec[]; private rest: number[];
  pinned = new Map<number, Vec>();               // index -> world position it is held at (necklace clasp, watch head)
  readonly closed: boolean; damping: number; iterations: number;
  constructor(points: Vec[], closed: boolean, damping = 0.04, iterations = 12) {
    this.closed = closed; this.damping = damping; this.iterations = iterations;
    this.points = points.map(p => [...p] as Vec); this.previous = points.map(p => [...p] as Vec);
    const n = points.length, segs = closed ? n : n - 1;
    this.rest = Array.from({ length: segs }, (_, i) => Math.hypot(...sub(points[(i + 1) % n], points[i])));
  }
  /** Move everything rigidly (the wrist moved): keeps velocities, so the piece follows without lag or ringing. */
  carry(transform: (p: Vec) => Vec) {
    for (let i = 0; i < this.points.length; i++) { const p = transform(this.points[i]), q = transform(this.previous[i]); this.points[i] = p; this.previous[i] = q; }
  }
  step(dt: number, gravity: Vec, colliders: Collider[], gap = 0) {
    const n = this.points.length, keep = 1 - this.damping;
    for (let i = 0; i < n; i++) {
      const p = this.points[i], q = this.previous[i];
      const v: Vec = [(p[0] - q[0]) * keep, (p[1] - q[1]) * keep, (p[2] - q[2]) * keep];
      this.previous[i] = [...p] as Vec;
      for (let k = 0; k < 3; k++) p[k] += v[k] + gravity[k] * dt * dt;
    }
    const segs = this.rest.length;
    for (let it = 0; it < this.iterations; it++) {
      for (let s = 0; s < segs; s++) {
        const a = this.points[s], b = this.points[(s + 1) % n];
        const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]) || 1e-12, diff = (len - this.rest[s]) / len;
        const wa = this.pinned.has(s) ? 0 : 0.5, wb = this.pinned.has((s + 1) % n) ? 0 : 0.5;
        const total = wa + wb || 1;
        for (let k = 0; k < 3; k++) { a[k] += d[k] * diff * (wa / total); b[k] -= d[k] * diff * (wb / total); }
      }
      for (const [i, at] of this.pinned) this.points[i] = [...at] as Vec;
      for (const p of this.points) for (const c of colliders) collide(p, c, gap);
    }
  }
}

/** A drop hanging from a pivot: a point at fixed length, damped, so it swings and settles like the real thing. */
export class Pendulum {
  bob: Vec; private previous: Vec; readonly length: number; damping: number;
  constructor(pivot: Vec, length: number, damping = 0.025) {
    this.length = length; this.damping = damping;
    this.bob = [pivot[0], pivot[1] - length, pivot[2]]; this.previous = [...this.bob] as Vec;
  }
  step(dt: number, pivot: Vec, gravity: Vec, colliders: Collider[] = []) {
    const keep = 1 - this.damping, p = this.bob, q = this.previous;
    const next: Vec = [0, 0, 0];
    for (let k = 0; k < 3; k++) next[k] = p[k] + (p[k] - q[k]) * keep + gravity[k] * dt * dt;
    this.previous = [...p] as Vec;
    const d = sub(next, pivot), len = Math.hypot(d[0], d[1], d[2]) || 1e-12;
    for (let k = 0; k < 3; k++) next[k] = pivot[k] + d[k] / len * this.length;
    for (const c of colliders) collide(next, c);
    this.bob = next;
  }
  /** Unit direction pivot -> bob, for orienting the drop. */
  direction(pivot: Vec): Vec { const d = sub(this.bob, pivot), l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; }
}

/** Fixed-timestep driver: call advance(frameSeconds); it runs whole 1/120 s steps and returns the blend factor. */
export class FixedStep {
  private carry = 0; private readonly onStep: (dt: number) => void; readonly hz: number; private readonly maxSteps: number;
  constructor(onStep: (dt: number) => void, hz = PHYSICS_HZ, maxSteps = 8) { this.onStep = onStep; this.hz = hz; this.maxSteps = maxSteps; }
  advance(seconds: number) {
    const dt = 1 / this.hz;
    this.carry = Math.min(this.carry + Math.max(0, seconds), dt * this.maxSteps);
    while (this.carry >= dt) { this.onStep(dt); this.carry -= dt; }
    return this.carry / dt;
  }
}
