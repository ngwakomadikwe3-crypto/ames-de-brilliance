// Pinch-to-zoom for the live try-on. Thumb tip and index tip distance, in palm widths (3D, so turning the hand
// does not read as a pinch). Pinch must be seen 3 frames in a row and held 250 ms to start, ends 300 ms after it
// stops, then 400 ms cooldown. Changes under 8% of hand size are ignored; zoom is logarithmic, at most 15% a second.
export const PINCH_HOLD = 250, PINCH_RELEASE = 300, PINCH_COOLDOWN = 400;
export class PinchZoom {
  zoom = 1;
  private frames = 0; private since = 0; private active = false; private lostAt = 0; private cooldown = 0;
  private anchor = 0; private last = 0;
  private min: number; private max: number; private sensitivity: number;
  /** sensitivity: the app's master SENSITIVITY (lib/view-gesture), 0.5 by default. */
  constructor(sensitivity = 0.5, min = 1, max = 2.5) { this.sensitivity = sensitivity; this.min = min; this.max = max; }
  reset() { this.zoom = 1; this.frames = 0; this.active = false; this.lostAt = 0; this.cooldown = 0; }
  /** pinching: the pose classifier says "pinch" this frame; gap: thumb-index distance / palm width. */
  step(pinching: boolean, gap: number, now: number): { active: boolean; zoom: number } {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0; this.last = now;
    const gain = Math.max(0.05, Math.min(1, this.sensitivity));
    if (!pinching) {
      this.frames = 0;
      if (this.active) {
        this.lostAt ||= now;
        if (now - this.lostAt >= PINCH_RELEASE) { this.active = false; this.cooldown = now + PINCH_COOLDOWN; this.lostAt = 0; }
      }
      return { active: this.active, zoom: this.zoom };
    }
    this.lostAt = 0;
    if (!this.active) {
      if (now < this.cooldown) return { active: false, zoom: this.zoom };
      if (++this.frames === 1) this.since = now;
      if (this.frames < 3 || now - this.since < PINCH_HOLD) return { active: false, zoom: this.zoom };
      this.active = true; this.anchor = gap;
    }
    const deadZone = 0.08 / (2 * gain);                       // 8% of hand size at the default sensitivity
    const travel = gap - this.anchor;
    if (Math.abs(travel) < deadZone || !dt) return { active: true, zoom: this.zoom };
    const limit = Math.log(1.15) * dt;
    const step = Math.max(-limit, Math.min(limit, (travel - Math.sign(travel) * deadZone) * gain * dt * 4));
    this.zoom = Math.max(this.min, Math.min(this.max, this.zoom * Math.exp(step)));
    return { active: true, zoom: this.zoom };
  }
}
