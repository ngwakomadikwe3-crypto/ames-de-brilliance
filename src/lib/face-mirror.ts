// Live expression mirroring: MediaPipe FaceLandmarker's 52 blendshape channels (ARKit names) drive the twin's 'ar:*'
// shapes every frame, and its eye-look channels turn the eyeballs. Each channel is smoothed like the hand tracking:
// a One Euro filter (steady when still, quick when moving), a dead zone (a resting face reads as exactly neutral, no
// shimmer) and a velocity clamp (one bad frame cannot snap the face). As a mirror, the customer's left side drives the
// twin's right side (the twin faces them).
import { OneEuro } from './ar/one-euro';

export type Category = { categoryName: string; score: number };
export const GAZE = ['eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight'];
/** Channels whose MakeHuman-built shape is gentler than the face it mirrors. */
const GAIN: Record<string, number> = { cheekPuff: 2 };
const swapSide = (n: string) => n.endsWith('Left') ? n.slice(0, -4) + 'Right' : n.endsWith('Right') ? n.slice(0, -5) + 'Left' : n;

export type MirrorOptions = { mirror?: boolean; deadZone?: number; maxRatePerSec?: number; minCutoff?: number; beta?: number };
export class FaceMirror {
  private filter: OneEuro; private names: string[] = []; private last: number[] = []; private lastT = -1;
  private o: Required<MirrorOptions>;
  constructor(opt: MirrorOptions = {}) {
    // tuned for ~100 ms response: a step reaches 90 % in about 3 frames at 30 fps, while a still face does not shimmer
    this.o = { mirror: true, deadZone: 0.06, maxRatePerSec: 12, minCutoff: 1.2, beta: 5, ...opt };
    this.filter = new OneEuro(this.o.minCutoff, this.o.beta, 1.2);
  }
  reset() { this.filter.reset(); this.last = []; this.lastT = -1; }
  /** One frame of blendshapes in; the twin's morph weights ('ar:*') and eye gaze (radians) out. */
  update(cats: Category[], now: number) {
    if (!this.names.length || this.names.length !== cats.length) { this.names = cats.map(c => c.categoryName); this.reset(); }
    const dz = this.o.deadZone;
    const raw = cats.map(c => { const v = Math.max(0, Math.min(1, c.score)); return v <= dz ? 0 : (v - dz) / (1 - dz); });
    let f = this.filter.filter(raw, now);
    const dt = this.lastT < 0 ? 0 : (now - this.lastT) / 1000; this.lastT = now;
    if (this.last.length === f.length && dt > 0) {
      const step = this.o.maxRatePerSec * dt;
      f = f.map((v, i) => Math.max(this.last[i] - step, Math.min(this.last[i] + step, v)));
    }
    this.last = f;
    const weights: Record<string, number> = {}, by: Record<string, number> = {};
    this.names.forEach((n, i) => {
      const name = this.o.mirror ? swapSide(n) : n;
      by[name] = f[i];
      if (!GAZE.includes(n) && n !== '_neutral') weights['ar:' + name] = Math.max(0, Math.min(1, f[i])) * (GAIN[name] ?? 1);
    });
    // gaze per twin eye (yaw + toward the twin's own left, pitch + up): out/in are relative to each eye
    const g = (side: 'Left' | 'Right') => {
      const out = by['eyeLookOut' + side] ?? 0, inn = by['eyeLookIn' + side] ?? 0;
      const toLeft = side === 'Left' ? out - inn : inn - out;           // the twin's left eye looks out toward its left
      const lim = (v: number, m: number) => Math.max(-m, Math.min(m, v));               // eyes turn within the lids' range
      return { yaw: lim(toLeft * 0.45, 0.35), pitch: lim(((by['eyeLookUp' + side] ?? 0) - (by['eyeLookDown' + side] ?? 0)) * 0.3, 0.22) };
    };
    return { weights, gaze: { left: g('Left'), right: g('Right') } };
  }
}
