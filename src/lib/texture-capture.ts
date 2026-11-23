// System 2's capture: a slow guided head turn, 10–15 frames for the skin texture. Every camera frame is gated (sharp,
// exposed, the whole face, not clipped) and placed in one of 13 turn bins from about 40 degrees left to 40 degrees
// right; a bin keeps its sharpest frame. The turn is done when it has at least 10 frames covering the left, the front
// and the right. Every rejection says why, in a short spoken-style prompt, and the guidance says where to turn next.
// Pure logic (no camera), tested by scripts/test-texture-capture.mjs.
import { headAngle, type Gate, type Lm, type Px } from './face-scan';

export const TURN = { bins: 13, min: -0.62, max: 0.62, need: 10, maxFrames: 15, side: 0.18, perSide: 3, front: 2 };
export const QUALITY = { sharpness: 60, darkest: 0.24, brightest: 0.85, clipped: 0.015 };
export type TexFrame<T> = { turn: number; sharpness: number; data: T };

/** Fraction of the face's pixels with a channel at 250 or above (clipped highlights). */
export function clippedFraction(img: Px, l: Lm[]) {
  const xs = l.map(p => p.x * img.width), ys = l.map(p => p.y * img.height);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(img.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(img.height - 1, Math.ceil(Math.max(...ys)));
  let n = 0, c = 0; const st = Math.max(1, Math.floor((x1 - x0) / 160));
  for (let y = y0; y <= y1; y += st) for (let x = x0; x <= x1; x += st) { const i = 4 * (y * img.width + x); n++; if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) >= 250) c++; }
  return n ? c / n : 0;
}

export class TextureCapture<T> {
  readonly frames: (TexFrame<T> | null)[] = new Array(TURN.bins).fill(null);
  binOf(turn: number) { return Math.round((Math.max(TURN.min, Math.min(TURN.max, turn)) - TURN.min) / (TURN.max - TURN.min) * (TURN.bins - 1)); }
  /** Offer a frame. `gate` is checkFrame's result for it (its sharpness and brightness are used; its angle verdict is
   *  not, since every angle of the turn is wanted). Returns whether it was kept and what to say. */
  offer(l: Lm[] | null, gate: Gate, clipped: number, data: () => T): { kept: boolean; prompt: string } {
    if (!l || l.length < 468) return { kept: false, prompt: 'Looking for your face…' };
    if (gate.reason && /inside the frame|closer/.test(gate.reason)) return { kept: false, prompt: gate.reason };
    if (gate.sharpness < QUALITY.sharpness) return { kept: false, prompt: 'A little slower: that one was blurred.' };
    if (gate.brightness < QUALITY.darkest) return { kept: false, prompt: 'Too dark: face a window or a lamp.' };
    if (gate.brightness > QUALITY.brightest || clipped > QUALITY.clipped) return { kept: false, prompt: 'Too bright on your face: step out of direct light.' };
    const turn = headAngle(l).turn, b = this.binOf(turn), cur = this.frames[b];
    let kept = false;
    if (!cur || gate.sharpness > cur.sharpness * 1.1) { this.frames[b] = { turn, sharpness: gate.sharpness, data: data() }; kept = true; }
    return { kept, prompt: this.guidance() };
  }
  count() { return this.frames.filter(Boolean).length; }
  coverage() {
    const f = this.frames.filter(Boolean) as TexFrame<T>[];
    return { left: f.filter(x => x.turn < -TURN.side).length, front: f.filter(x => Math.abs(x.turn) <= TURN.side).length, right: f.filter(x => x.turn > TURN.side).length };
  }
  done() { const c = this.coverage(); return this.count() >= TURN.need && c.left >= TURN.perSide && c.right >= TURN.perSide && c.front >= TURN.front; }
  /** What to do next, as a short spoken-style prompt. ("left" and "right" are the customer's, the camera is mirrored.) */
  guidance() {
    const c = this.coverage();
    if (this.done()) return 'That’s the whole turn. Hold still a moment…';
    if (c.front < TURN.front) return 'Look at the camera, then turn slowly.';
    if (c.left < TURN.perSide) return 'Now turn slowly to your left…';
    if (c.right < TURN.perSide) return 'Now slowly back, and on to your right…';
    return 'Keep turning slowly, side to side…';
  }
  /** The kept frames, best first within the maximum. */
  result() { return (this.frames.filter(Boolean) as TexFrame<T>[]).sort((a, b) => b.sharpness - a.sharpness).slice(0, TURN.maxFrames); }
}
