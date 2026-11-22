// Idle life and reactions for the portrait twin, as expression-morph weights and small head motions.
//  - blink every 2.5-6 s (now and then a double blink), quick down and a slower lift;
//  - breathing: a slow rise and fall of the head and shoulders;
//  - micro sway: slow, layered noise in the head's turn, nod and tilt (about a degree);
//  - mouth: every 6-12 s a small natural movement (lips part slightly, relax, a faint press);
//  - delight(): a genuine (Duchenne) smile when a piece goes on: over about half a second the mouth corners rise, the
//    cheeks lift, the eyes narrow at the corners and the brows soften; held 2.5 s; then it settles into a soft
//    pleased resting smile. Once per call: it never starts on its own.
// Every weight moves through a critically damped spring, so lips move with weight and never snap or wobble.
export type Weights = Record<string, number>;
export type SmileMix = Record<string, number>;      // the customer's own smile, calibrated from the scan's smile frame

const ease = (t: number) => t * t * (3 - 2 * t);

/** Hard caps: a cheek raise is small, a squint barely narrows the eyes, so the eyes stay open in every smile. */
export const CAPS: Record<string, number> = { 'ex:cheeks-up': 0.3, 'ex:squint': 0.15, 'ex:brows-soft': 0.3 };
export class FaceLife {
  private t = 0; private nextBlink = 1.5; private blinkAt = -10; private doubleBlink = false;
  private nextMouth = 7; private mouthAt = -10; private mouthKind = 0;
  private delightAt = -100; private resting = 0;
  private w: Weights = {}; private v: Weights = {};
  private smile: SmileMix; private rand: () => number;
  constructor(smile: SmileMix = { 'ex:smile': 0.85, 'ex:cheeks-up': 0.3 }, rand: () => number = Math.random) { this.smile = smile; this.rand = rand; }

  /** A piece went on (or was tapped): one warm smile, then a pleased resting smile. */
  delight() { this.delightAt = this.t; }

  step(dt: number, reducedMotion = false) {
    this.t += dt;
    const target: Weights = {};
    // blink
    if (this.t > this.nextBlink) { this.blinkAt = this.t; this.doubleBlink = this.rand() < 0.15; this.nextBlink = this.t + 2.5 + this.rand() * 3.5; }
    const blink = (at: number) => { const s = this.t - at; return s < 0 ? 0 : s < 0.07 ? s / 0.07 : s < 0.22 ? 1 - (s - 0.07) / 0.15 : 0; };
    const b = Math.max(blink(this.blinkAt), this.doubleBlink ? blink(this.blinkAt + 0.32) : 0);
    // delight: rise 0.5 s, hold 2.5 s, settle 1.4 s into the resting smile
    const d = this.t - this.delightAt;
    let warm = 0;
    if (d >= 0 && d < 0.38) warm = ease(d / 0.38);                          // (the springs add ~0.12 s: risen by ~0.5 s)
    else if (d >= 0.38 && d < 3) warm = 1;
    else if (d >= 3 && d < 4.4) { warm = 1 - ease((d - 3) / 1.4) * (1 - 0.22); this.resting = 0.22; }
    else if (d >= 4.4) warm = this.resting;
    for (const [k, v] of Object.entries(this.smile)) target[k] = (target[k] ?? 0) + v * warm;
    target['ex:squint'] = 0.12 * warm;                 // eyes narrow a touch (Duchenne), never close
    target['ex:brows-soft'] = 0.2 * warm;
    target['ex:part'] = (target['ex:part'] ?? 0) + 0.15 * warm;                          // the lips part a little: the upper teeth show
    // occasional natural mouth movement (not while smiling broadly)
    if (!reducedMotion && this.t > this.nextMouth) { this.mouthAt = this.t; this.mouthKind = Math.floor(this.rand() * 3); this.nextMouth = this.t + 6 + this.rand() * 6; }
    const m = this.t - this.mouthAt, mouth = m < 0 || m > 1.6 ? 0 : Math.sin(Math.PI * m / 1.6) * (1 - warm);
    const key = ['ex:part', 'ex:relaxed', 'ex:purse'][this.mouthKind];
    target[key] = (target[key] ?? 0) + [0.14, 0.3, 0.1][this.mouthKind] * mouth;
    // springs: blinks are fast; the mouth and cheeks soft and weighty
    const keys = new Set([...Object.keys(target), ...Object.keys(this.w), 'ex:blink-l', 'ex:blink-r']);
    for (const k of keys) {
      const goal = k === 'ex:blink-l' || k === 'ex:blink-r' ? b : Math.min(target[k] ?? 0, CAPS[k] ?? 1);
      const omega = k.startsWith('ex:blink') ? 60 : 9, x = this.w[k] ?? 0, v = this.v[k] ?? 0;
      // critically damped, solved exactly so a slow frame (large dt) can never make it overshoot or blow up
      const e = x - goal, c = v + omega * e, ex = Math.exp(-omega * dt);
      this.w[k] = Math.min(1.2, Math.max(0, goal + (e + c * dt) * ex)); this.v[k] = (c - omega * (e + c * dt)) * ex;
    }
    // breathing and sway (radians and mm)
    const breath = reducedMotion ? 0 : Math.sin(this.t * 2 * Math.PI * 0.23);
    const n = (f: number, p: number) => Math.sin(this.t * f + p) * 0.6 + Math.sin(this.t * f * 2.3 + p * 1.7) * 0.4;
    const sway = reducedMotion ? { yaw: 0, pitch: 0, roll: 0 } : { yaw: 0.012 * n(0.37, 1), pitch: 0.008 * n(0.29, 2) - 0.004 * breath, roll: 0.006 * n(0.21, 3) };
    return { weights: { ...this.w }, breath: breath * 0.7, sway };
  }
}
