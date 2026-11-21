// Camera gestures for the jewellery viewers, one controller for every surface (HandClasp, the 3D-hand try-on).
//
//   index finger only ........ turn left / right (360°, no stop)
//   index + middle ........... tilt up / down (360°, no stop)
//   pinch, then spread/close . zoom in / out
//   open palm ................ freeze (released the moment the palm pose ends)
//   fist, held ½ s ........... reset the view
//
// Detection is orientation-invariant: it never compares screen Y. A finger is extended when its tip is clearly
// farther from the wrist than its middle joint is; the thumb by its reach from the pinky knuckle relative to
// hand size. Poses must hold for 3 consecutive frames. Pinch distance is a ratio to hand size, not pixels.
//
// States: SHOWCASE (no hand) -> TRACKING (hand seen) <-> FROZEN (palm) ; TRACKING/FROZEN -> SHOWCASE (hand gone).
// Every transition is logged; with debug on, every gesture and its intended effect is logged too.

export type P3 = { x: number; y: number; z: number };
export type GesturePose = 'none' | 'point' | 'two' | 'pinch' | 'palm' | 'fist';
export type ControllerState = 'SHOWCASE' | 'TRACKING' | 'FROZEN';
export interface GestureOutput {
  state: ControllerState; pose: GesturePose; held: number;
  /** turn (x) and tilt (y), in half-turns: the viewers rotate by value × π */
  dx: number; dy: number; zoom: number; reset: boolean; resetProgress: number;
  extended: boolean[]; pinchRatio: number; effect: string;
}

const d = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const EXTENDED_RATIO = 1.1;          // tip-to-wrist > pip-to-wrist × 1.1
export const THUMB_OUT = 0.78;              // thumb tip to pinky knuckle, in hand sizes (wrist -> middle knuckle)
export const CONFIRM_FRAMES = 3;
export const PINCH_ENGAGE = 0.08;           // zoom starts once the pinch ratio moves 8 % from where it began
export const SMOOTHING = 0.3;               // same exponential smoothing as the tracking pipeline
export const TURN_GAIN = 3;                 // a finger moved across two thirds of the frame = one full turn
export const ZOOM_LIMIT_PER_S = Math.log(1.6);
export const RESET_HOLD_MS = 500;

/** Five booleans: thumb, index, middle, ring, pinky. Uses 3D (world) landmarks, so any hand orientation works. */
export function fingerExtension(p: P3[]): boolean[] {
  const wrist = p[0], size = Math.max(1e-6, d(p[0], p[9]));
  const thumb = d(p[4], p[17]) / size > THUMB_OUT;
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => d(p[tip], wrist) > d(p[pip], wrist) * EXTENDED_RATIO);
  return [thumb, ...fingers];
}

/** Pinch distance relative to hand size (thumb tip to index tip ÷ wrist to middle knuckle). */
export const pinchRatio = (p: P3[]) => d(p[4], p[8]) / Math.max(1e-6, d(p[0], p[9]));

/** Strict poses. Order matters: palm and the finger poses before pinch, fist last. */
export function classifyPose(p: P3[], inPinch = false): GesturePose {
  if (p.length !== 21 || !p.every(v => Number.isFinite(v.x + v.y + v.z))) return 'none';
  const [, index, middle, ring, pinky] = fingerExtension(p);
  const ratio = pinchRatio(p);
  // the index tip must not be folded into the palm (that is a fist with the thumb on top, not a pinch)
  const indexOut = d(p[8], p[0]) > d(p[6], p[0]) * 0.92;
  if (index && middle && ring && pinky) return 'palm';
  if (indexOut && !ring && !pinky && (ratio < 0.32 || (inPinch && ratio < 1.1))) return 'pinch';
  if (index && !middle && !ring && !pinky) return 'point';
  if (index && middle && !ring && !pinky) return 'two';
  if (!index && !middle && !ring && !pinky) return 'fist';
  return 'none';
}

const LOG = (...a: unknown[]) => { if (typeof console !== 'undefined') console.info('[gestures]', ...a); };

export class GestureController {
  state: ControllerState = 'SHOWCASE';
  pose: GesturePose = 'none';                 // the active (confirmed) pose
  private candidate: GesturePose = 'none'; private held = 0;
  private last = 0; private anchorX = 0; private anchorY = 0; private haveAnchor = false;
  private pinchRest = 0; private pinchSmooth = 0; private pinchPrev = 0; private zooming = false;
  private fistSince = 0; private fired = false;
  debug: boolean;
  constructor(debug = false) { this.debug = debug; }

  private go(next: ControllerState, why: string) {
    if (next === this.state) return;
    LOG(`${this.state} -> ${next} (${why})`);
    this.state = next;
  }

  /** No hand this frame. */
  lost(now: number): GestureOutput {
    this.candidate = 'none'; this.held = 0; this.pose = 'none'; this.haveAnchor = false; this.zooming = false; this.fistSince = 0; this.fired = false;
    this.go('SHOWCASE', 'hand left the frame'); this.last = now;
    return this.out([false, false, false, false, false], 0, 0, 0, 1, false, 0, 'none');
  }

  /** world: 21 metric landmarks (for poses); tipX/tipY: the moving fingertip in the image, 0..1, mirrored for selfie. */
  step(world: P3[], tipX: number, tipY: number, now: number): GestureOutput {
    const dt = Math.max(0.001, Math.min(0.1, (now - (this.last || now)) / 1000)); this.last = now;
    const raw = classifyPose(world, this.pose === 'pinch');
    const ext = fingerExtension(world), ratio = pinchRatio(world);
    if (this.state === 'SHOWCASE') this.go('TRACKING', 'hand detected');
    // 3 consecutive frames before a pose takes over
    if (raw === this.candidate) this.held++; else { this.candidate = raw; this.held = 1; }
    if (this.held >= CONFIRM_FRAMES && raw !== this.pose) {
      if (this.debug || raw !== 'none') LOG(`pose ${this.pose} -> ${raw} (held ${this.held} frames)`);
      this.pose = raw; this.haveAnchor = false; this.zooming = false; this.fistSince = raw === 'fist' ? now : 0; this.fired = false;
      if (raw === 'pinch') { this.pinchRest = this.pinchSmooth = this.pinchPrev = ratio; }
    }
    // FROZEN exactly while the palm is held; any other confirmed pose releases it
    if (this.pose === 'palm') this.go('FROZEN', 'open palm');
    else if (this.state === 'FROZEN') this.go('TRACKING', `palm ended (${this.pose})`);

    let dx = 0, dy = 0, zoom = 1, reset = false, progress = 0, effect = 'none';
    // While the hand is changing shape the pose is in doubt: no motion, and re-anchor when it settles,
    // so switching gestures never throws the piece.
    // A single odd frame is a misread: skip its motion but keep the anchor (no travel is lost). Two or more
    // frames of a different shape is a real change: re-anchor so the switch cannot jerk the view.
    const steady = raw === this.pose;
    if (!steady && this.held >= 2) { this.haveAnchor = false; if (this.pose === 'pinch') this.pinchPrev = this.pinchSmooth; }
    if (!steady && this.pose !== 'fist' && this.pose !== 'palm') effect = 'changing gesture';
    else if (this.pose === 'point' || this.pose === 'two') {
      if (!this.haveAnchor) { this.anchorX = tipX; this.anchorY = tipY; this.haveAnchor = true; }
      // smoothed follow of the fingertip; big jumps (tracking glitches) re-anchor instead of spinning
      const tx = this.anchorX + (tipX - this.anchorX) * SMOOTHING, ty = this.anchorY + (tipY - this.anchorY) * SMOOTHING;
      if (Math.abs(tipX - this.anchorX) > 0.25 || Math.abs(tipY - this.anchorY) > 0.25) { this.anchorX = tipX; this.anchorY = tipY; }
      else if (this.pose === 'point') { dx = (tx - this.anchorX) * TURN_GAIN; this.anchorX = tx; effect = `turn ${(dx * 180).toFixed(1)}°`; }
      else { dy = (ty - this.anchorY) * TURN_GAIN; this.anchorY = ty; effect = `tilt ${(dy * 180).toFixed(1)}°`; }
    } else if (this.pose === 'pinch') {
      this.pinchSmooth += (ratio - this.pinchSmooth) * SMOOTHING;
      if (!this.zooming && this.held === CONFIRM_FRAMES) this.pinchRest = this.pinchSmooth;
      if (!this.zooming && Math.abs(this.pinchSmooth / this.pinchRest - 1) > PINCH_ENGAGE) { this.zooming = true; this.pinchPrev = this.pinchSmooth; LOG('pinch engaged'); }
      if (this.zooming) {
        const limit = ZOOM_LIMIT_PER_S * dt;
        const step = Math.max(-limit, Math.min(limit, Math.log(this.pinchSmooth / this.pinchPrev)));
        zoom = Math.exp(step); this.pinchPrev = this.pinchSmooth;
        effect = zoom > 1.0005 ? `zoom in ×${zoom.toFixed(3)}` : zoom < 0.9995 ? `zoom out ×${zoom.toFixed(3)}` : 'zoom held';
      } else effect = 'pinch (spread or close to zoom)';
    } else if (this.pose === 'fist') {
      progress = Math.min(1, (now - this.fistSince) / RESET_HOLD_MS);
      if (progress >= 1 && !this.fired) { this.fired = true; reset = true; effect = 'reset view'; LOG('reset'); } else effect = this.fired ? 'reset done' : 'hold fist to reset';
    } else if (this.pose === 'palm') effect = 'frozen';
    if (this.debug && effect !== 'none' && (dx || dy || zoom !== 1 || reset)) LOG(`${this.pose}: ${effect}`);
    return this.out(ext, ratio, dx, dy, zoom, reset, progress, effect);
  }

  private out(extended: boolean[], pinchRatio: number, dx: number, dy: number, zoom: number, reset: boolean, resetProgress: number, effect: string): GestureOutput {
    return { state: this.state, pose: this.pose, held: this.held, dx, dy, zoom, reset, resetProgress, extended, pinchRatio, effect };
  }
}

/** Debug overlay on by default until the gestures pass on a real device: add ?gestures=quiet to hide it. */
export function gestureDebugEnabled() {
  try { return new URLSearchParams(location.search).get('gestures') !== 'quiet'; } catch { return true; }
}
