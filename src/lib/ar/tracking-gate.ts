// When to show the piece. Show after 3 consecutive confident frames; when the hand is lost or a frame jumps,
// hold the last pose for 500 ms, then hide. Never snap to a default position.
export type GateState = 'hidden' | 'tracking' | 'holding';
export class TrackingGate {
  private streak = 0;
  private lastGood = -Infinity;
  private shown = false;
  private confirm: number; private hold: number;
  constructor(confirm = 3, hold = 500) { this.confirm = confirm; this.hold = hold; }
  reset() { this.streak = 0; this.lastGood = -Infinity; this.shown = false; }
  update(confident: boolean, now: number): GateState {
    if (confident) {
      this.streak++;
      if (this.streak >= this.confirm) { this.shown = true; this.lastGood = now; return 'tracking'; }
    } else this.streak = 0;
    if (this.shown && now - this.lastGood < this.hold) return 'holding';
    this.shown = false;
    return 'hidden';
  }
}

/** Rejects single-frame tracking errors: a hand cannot cross a quarter of the frame, or change size by 35%, in one frame. */
export function plausibleStep(prev: { x: number; y: number; size: number } | null, next: { x: number; y: number; size: number }, dt: number) {
  if (!prev) return true;
  const frames = Math.max(1, dt / 33);
  const travel = Math.hypot(next.x - prev.x, next.y - prev.y);
  const growth = Math.abs(Math.log(next.size / prev.size));
  return travel <= 0.25 * frames && growth <= 0.35 * frames;
}
