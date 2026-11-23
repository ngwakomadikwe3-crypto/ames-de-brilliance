// The try-on's hand gestures, "magic wand" edition. Detection robustness first, vocabulary second.
//
//   WAND (index pointed, others curled) ......... the piece tilts: aim up -> rises/tilts up, aim down -> lowers; velocity
//   DOUBLE WAND (index + middle together) ....... the piece turns: aim left -> turns left, aim right -> turns right
//   PINCH (thumb tip to index tip) .............. zoom: spread or close the pinch
//   OPEN PALM (all five out, held 250 ms) ....... freeze all motion (toggles; pinch still zooms while frozen)
//   FIST (all four curled, held 500 ms) ......... reset the piece (and unfreeze)
//
// Robustness:
//  - Finger extension is orientation-invariant: dist(tip, wrist) against dist(mcp, wrist), extended above 1.6x, curled
//    below 1.2x, in between the previous state holds (hysteresis). Never screen Y, never absolute angles.
//  - A confidence gate: below it the machine freezes (holds its state, no motion, no transitions) on that frame.
//  - All landmarks pass a One Euro filter (min cutoff 1.0, in hand sizes); the aim vector then an EMA (alpha 0.2 when
//    steady, faster while it swings). Nothing downstream reads raw landmarks.
//  - A state machine with hysteresis: a pose must hold 250 ms to activate (the fist 500 ms to reset); leaving a gesture
//    passes through a 150 ms NEUTRAL check, then a 400 ms cooldown before a new gesture can start. No direct jumps.
//  - Motion is velocity: the aim direction sets an angular velocity (dead zone +-8 deg, clamped at 120 deg/s), eased
//    toward its target, so point-and-hold spins smoothly and returning to the dead zone stops within ~300 ms.
// The consumer integrates `velocity` in its own requestAnimationFrame loop (shared mutable state, no React per frame).

import { OneEuro } from './ar/one-euro';

export type P3 = { x: number; y: number; z: number };
export type WandPose = 'none' | 'wand' | 'double' | 'pinch' | 'palm' | 'fist';
export type WandState = 'IDLE' | 'ARMING' | 'WAND' | 'DOUBLE' | 'PINCH' | 'FROZEN' | 'RESET' | 'NEUTRAL' | 'COOLDOWN' | 'LOST';

export const EXTEND_ABOVE = 1.6, CURL_BELOW = 1.2;
export const THUMB_OUT = 0.78, THUMB_IN = 0.62;          // thumb tip to pinky knuckle, in hand sizes (its own hysteresis)
export const PINCH_ENGAGE = 0.35, PINCH_RELEASE = 1.1;    // pinch ratio: thumb-index tips / wrist-middle knuckle
export const ACTIVATE_MS = 250, FIST_MS = 500, NEUTRAL_MS = 150, COOLDOWN_MS = 400;
export const DEAD_ZONE = 8 * Math.PI / 180, FULL_AT = 55 * Math.PI / 180, MAX_SPEED = 120 * Math.PI / 180;
export const SPEED_EASE_MS = 60;                          // velocity eases to its target (stops within ~300 ms)
export const MIN_CONFIDENCE = 0.6;
/** One Euro beta, for landmarks measured in hand sizes (wrist to middle knuckle), so it means the same near or far.
 *  At rest the filter is the spec's (min cutoff 1.0); it opens up only while the hand moves fast. */
export const BETA = 0.3;
/** The aim's EMA: alpha 0.2 while the aim is steady (no jitter), rising toward 0.8 while it swings, so a return to
 *  the dead zone is followed in time to stop within ~300 ms. */
export const AIM_ALPHA = 0.2, AIM_ALPHA_FAST = 0.8, AIM_FAST_DEG = 6;
const ZOOM_LIMIT_PER_S = Math.log(1.6);

const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const FINGERS = [[8, 5], [12, 9], [16, 13], [20, 17]] as const;   // tip, mcp

/** Five extension states (thumb, index, middle, ring, pinky) with hysteresis against the previous ones. */
export function fingerStates(p: P3[], prev?: boolean[]): boolean[] {
  const w = p[0], size = Math.max(1e-6, dist(p[0], p[9]));
  const thumbR = dist(p[4], p[17]) / size;
  const thumb = thumbR > THUMB_OUT ? true : thumbR < THUMB_IN ? false : prev?.[0] ?? false;
  const fingers = FINGERS.map(([tip, mcp], i) => {
    const r = dist(p[tip], w) / Math.max(1e-6, dist(p[mcp], w));
    return r > EXTEND_ABOVE ? true : r < CURL_BELOW ? false : prev?.[i + 1] ?? false;
  });
  return [thumb, ...fingers];
}
export const pinchRatio = (p: P3[]) => dist(p[4], p[8]) / Math.max(1e-6, dist(p[0], p[9]));

/** One frame's pose. Priority when ambiguous: wand, then double wand, then pinch. A finger touching the thumb is a
 *  pinch, never a wand (the wand must be free). */
export function classify(p: P3[], ext: boolean[], inPinch: boolean): WandPose {
  const [thumb, index, middle, ring, pinky] = ext, ratio = pinchRatio(p);
  const pinching = inPinch ? ratio < PINCH_RELEASE : ratio < PINCH_ENGAGE;
  const free = ratio > PINCH_ENGAGE * 1.3;
  if (index && middle && ring && pinky && thumb && free) return 'palm';
  if (index && !middle && !ring && !pinky && free) return 'wand';
  if (index && middle && !ring && !pinky && free) return 'double';
  if (pinching && !ring && !pinky) return 'pinch';
  if (!index && !middle && !ring && !pinky) return 'fist';
  return 'none';
}

export interface WandOutput {
  state: WandState; pose: WandPose; candidate: WandPose; frozen: boolean;
  /** angular velocity, rad/s: yaw (about vertical, + turns the front to screen right), pitch (about horizontal, + tips the front down) */
  velocity: { yaw: number; pitch: number };
  /** this frame's share of that rotation, in half-turns (for viewers that apply per camera frame) */
  dx: number; dy: number;
  zoom: number; reset: boolean; resetProgress: number;
  /** a gesture just locked in (for a haptic tick and the lift) */
  lockedIn: boolean;
  /** 0..1, the "lift" of the piece while a motion gesture owns it */
  active: boolean;
  /** where the glint goes: 'index' tip, 'pair' (between index and middle tips), or none */
  glint: 'index' | 'pair' | null;
  extended: boolean[]; pinchRatio: number; aimDeg: number; effect: string;
}

export class WandController {
  state: WandState = 'IDLE';
  pose: WandPose = 'none';                     // the gesture that owns the piece
  frozen = false;
  private ext: boolean[] = [false, false, false, false, false];
  private filter = new OneEuro(1.0, BETA);
  private aim = { x: 0, y: 0, z: 0, ok: false };
  private candidate: WandPose = 'none'; private candidateSince = 0;
  private neutralSince = 0; private cooldownUntil = 0;
  private vel = { yaw: 0, pitch: 0 };
  private pinchPrev = 0; private pinchSmooth = 0; private zooming = false; private pinchRest = 0;
  private resetFired = false; private last = 0;
  readonly log: string[] = [];
  private go(next: WandState, why: string) { if (next !== this.state) { this.log.push(`${this.state}->${next} (${why})`); if (this.log.length > 200) this.log.shift(); this.state = next; } }

  /** No hand: everything stops gently, the machine returns to idle. Freeze is kept (it is a setting, not a pose). */
  lost(now: number): WandOutput {
    this.filter.reset(); this.aim.ok = false; this.candidate = 'none'; this.pose = 'none'; this.zooming = false; this.resetFired = false;
    this.go(this.frozen ? 'FROZEN' : 'IDLE', 'hand gone');
    return this.motion(now, 'none', 0, false, false, 0, 1, 'hand gone');
  }

  /**
   * One camera frame. world: 21 landmarks in camera-aligned axes (metres; MediaPipe world landmarks: x right in the
   * image, y down, z away). confidence: the tracker's presence/handedness score for this frame (0..1).
   */
  step(world: P3[], confidence: number, now: number): WandOutput {
    const valid = world.length === 21 && world.every(v => Number.isFinite(v.x + v.y + v.z));
    // the confidence gate: a garbage frame changes nothing (state, timers and motion targets hold)
    if (!valid || confidence < MIN_CONFIDENCE) return this.motion(now, this.pose, this.pose === 'wand' || this.pose === 'double' ? 1 : 0, false, false, 0, 1, 'low confidence: holding');
    // filtered in hand sizes, centred on the wrist (scale-invariant smoothing)
    const size = Math.max(1e-6, dist(world[0], world[9])), o = world[0];
    const f = this.filter.filter(world.flatMap(q => [(q.x - o.x) / size, (q.y - o.y) / size, (q.z - o.z) / size]), now);
    const p = Array.from({ length: 21 }, (_, i) => ({ x: f[3 * i], y: f[3 * i + 1], z: f[3 * i + 2] }));
    this.ext = fingerStates(p, this.ext);
    const raw = classify(p, this.ext, this.pose === 'pinch');
    const ratio = pinchRatio(p);
    // the aim: index mcp -> tip (wand), or the mean of index and middle (double), EMA alpha 0.2, unit length
    const dir = (tip: number, mcp: number) => { const v = { x: p[tip].x - p[mcp].x, y: p[tip].y - p[mcp].y, z: p[tip].z - p[mcp].z }, l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
    const d8 = dir(8, 5), d12 = dir(12, 9), target = raw === 'double' || this.pose === 'double' ? { x: (d8.x + d12.x) / 2, y: (d8.y + d12.y) / 2, z: (d8.z + d12.z) / 2 } : d8;
    if (!this.aim.ok) Object.assign(this.aim, target, { ok: true });
    else {
      const turn = Math.acos(Math.max(-1, Math.min(1, (target.x * this.aim.x + target.y * this.aim.y + target.z * this.aim.z) / (Math.hypot(this.aim.x, this.aim.y, this.aim.z) || 1)))) * 180 / Math.PI;
      const a = AIM_ALPHA + (AIM_ALPHA_FAST - AIM_ALPHA) * Math.min(1, Math.max(0, (turn - 1.5) / AIM_FAST_DEG));
      this.aim.x += (target.x - this.aim.x) * a; this.aim.y += (target.y - this.aim.y) * a; this.aim.z += (target.z - this.aim.z) * a;
    }

    let lockedIn = false, reset = false, progress = 0, effect = '';
    // --- the state machine -------------------------------------------------------------------------------------------
    if (this.pose !== 'none') {
      // an active gesture: it ends only after its pose has been gone for the NEUTRAL check, then cools down
      if (raw === this.pose) { this.neutralSince = 0; if (this.state === 'NEUTRAL') this.go(this.stateFor(this.pose), 'pose back'); }
      else {
        if (!this.neutralSince) { this.neutralSince = now; this.go('NEUTRAL', `${raw} seen`); }
        if (now - this.neutralSince >= NEUTRAL_MS) {
          this.log.push(`release ${this.pose}`); this.pose = 'none'; this.zooming = false; this.resetFired = false; this.neutralSince = 0;
          this.cooldownUntil = now + COOLDOWN_MS; this.go('COOLDOWN', 'gesture released'); this.candidate = 'none';
        }
      }
    }
    if (this.pose === 'none') {
      if (now < this.cooldownUntil) { this.candidate = 'none'; effect = 'cooldown'; }
      else {
        if (this.state === 'COOLDOWN') this.go(this.frozen ? 'FROZEN' : 'IDLE', 'cooldown over');
        if (raw !== this.candidate) { this.candidate = raw; this.candidateSince = now; }
        if (raw !== 'none') {
          const need = raw === 'fist' ? FIST_MS : ACTIVATE_MS, held = now - this.candidateSince;
          if (raw === 'fist') progress = Math.min(1, held / FIST_MS);
          if (this.state !== 'ARMING' && this.state !== 'FROZEN') this.go('ARMING', `${raw} held`);
          if (held >= need) {
            this.pose = raw; lockedIn = true; this.neutralSince = 0;
            if (raw === 'palm') { this.frozen = !this.frozen; this.log.push(this.frozen ? 'freeze' : 'unfreeze'); }
            if (raw === 'fist') { reset = true; this.resetFired = true; this.frozen = false; this.vel.yaw = this.vel.pitch = 0; }
            if (raw === 'pinch') { this.pinchSmooth = this.pinchPrev = this.pinchRest = ratio; this.zooming = false; }
            this.go(this.stateFor(raw), 'locked in');
          }
        } else if (this.state === 'ARMING') this.go(this.frozen ? 'FROZEN' : 'IDLE', 'pose dropped');
      }
    }
    // --- the effects ---------------------------------------------------------------------------------------------------
    let zoom = 1, drive = 0;
    const owns = this.state !== 'NEUTRAL';
    if (this.pose === 'wand' && owns && !this.frozen) drive = 1;
    else if (this.pose === 'double' && owns && !this.frozen) drive = 2;
    else if (this.pose === 'pinch' && owns) {
      this.pinchSmooth += (ratio - this.pinchSmooth) * 0.3;
      if (!this.zooming && Math.abs(this.pinchSmooth / Math.max(1e-6, this.pinchRest) - 1) > 0.08) { this.zooming = true; this.pinchPrev = this.pinchSmooth; }
      if (this.zooming) {
        const dt = Math.max(0.001, Math.min(0.1, (now - this.last) / 1000)), lim = ZOOM_LIMIT_PER_S * dt;
        zoom = Math.exp(Math.max(-lim, Math.min(lim, Math.log(this.pinchSmooth / this.pinchPrev)))); this.pinchPrev = this.pinchSmooth;
        effect = zoom > 1.0005 ? 'zoom in' : zoom < 0.9995 ? 'zoom out' : 'zoom held';
      } else effect = 'pinch: spread or close to zoom';
    } else if (this.pose === 'fist') { progress = 1; effect = 'reset'; }
    else if (this.pose === 'palm') effect = this.frozen ? 'frozen' : 'unfrozen';
    return this.motion(now, this.pose, drive, lockedIn, reset, progress, zoom, effect || (this.frozen ? 'frozen' : this.state.toLowerCase()), ratio);
  }

  private stateFor(p: WandPose): WandState {
    return p === 'wand' ? 'WAND' : p === 'double' ? 'DOUBLE' : p === 'pinch' ? 'PINCH' : p === 'palm' ? (this.frozen ? 'FROZEN' : 'IDLE') : p === 'fist' ? 'RESET' : 'IDLE';
  }

  /** drive: 0 none, 1 wand (pitch from the aim's vertical), 2 double (yaw from the aim's horizontal). */
  private motion(now: number, pose: WandPose, drive: number, lockedIn: boolean, reset: boolean, progress: number, zoom: number, effect: string, ratio = 0): WandOutput {
    const dt = this.last ? Math.max(0.001, Math.min(0.1, (now - this.last) / 1000)) : 1 / 30; this.last = now;
    // target speeds from the aim angle: the vertical component tilts (wand), the horizontal turns (double)
    const speed = (angle: number) => { const a = Math.abs(angle); if (a <= DEAD_ZONE) return 0; return Math.sign(angle) * MAX_SPEED * Math.min(1, (a - DEAD_ZONE) / (FULL_AT - DEAD_ZONE)); };
    const up = Math.asin(Math.max(-1, Math.min(1, -this.aim.y)));            // image y is down
    const left = Math.asin(Math.max(-1, Math.min(1, this.aim.x)));           // camera image x+ is the customer's left (selfie)
    let tYaw = 0, tPitch = 0;
    if (drive === 1 && this.aim.ok) tPitch = -speed(up);                        // aim up: the front tips up (negative about +x)
    if (drive === 2 && this.aim.ok) tYaw = -speed(left);                        // aim to their left (screen left): turn left
    const k = 1 - Math.exp(-dt * 1000 / SPEED_EASE_MS);
    this.vel.yaw += (tYaw - this.vel.yaw) * k; this.vel.pitch += (tPitch - this.vel.pitch) * k;
    if (Math.abs(this.vel.yaw) < 1e-3 && !tYaw) this.vel.yaw = 0;
    if (Math.abs(this.vel.pitch) < 1e-3 && !tPitch) this.vel.pitch = 0;
    const aimDeg = (drive === 1 ? up : drive === 2 ? left : 0) * 180 / Math.PI;
    return {
      state: this.state, pose, candidate: this.candidate, frozen: this.frozen,
      velocity: { ...this.vel }, dx: this.vel.yaw * dt / Math.PI, dy: this.vel.pitch * dt / Math.PI,
      zoom, reset, resetProgress: progress, lockedIn, active: drive > 0, glint: drive === 1 ? 'index' : drive === 2 ? 'pair' : null,
      extended: [...this.ext], pinchRatio: ratio, aimDeg, effect,
    };
  }
}

/** The "lift" of the piece as a gesture takes hold: 150 ms ease-in to 1.03, 250 ms settle back (ease-out cubic). */
export class Lift {
  private v = 0; private from = 0; private t0 = 0; private on = false;
  update(active: boolean, now: number) {
    if (active !== this.on) { this.on = active; this.from = this.v; this.t0 = now; }
    const t = Math.min(1, (now - this.t0) / (this.on ? 150 : 250));
    const e = this.on ? t * t * t : 1 - Math.pow(1 - t, 3);
    this.v = this.from + ((this.on ? 1 : 0) - this.from) * e;
    return this.v;
  }
}
/** A tiny haptic tick on lock-in, Android only (iOS ignores vibrate; desktop has none). */
export function hapticTick() { try { if (/Android/i.test(navigator.userAgent)) navigator.vibrate?.(8); } catch { /* no haptics */ } }
