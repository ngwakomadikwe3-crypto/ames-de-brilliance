// The hand twin admires a new piece: when a ring, watch or bracelet goes on, the fingers flutter for about a second
// with a slight turn of the wrist (as if catching the light), then settle back to the relaxed pose. It plays once per
// placement and again only when the customer taps the hand or the piece; it never loops. With reduced motion the
// fingers stay still and the wrist only turns gently.
import { Quaternion, Vector3 } from 'three';

export const ADMIRE_SECONDS = 1.1;
const FLUTTER_HZ = 3.2;

/** Bones (MediaPipe order: 0 wrist, then 4 per digit from the thumb) and how much each joint flutters. */
const JOINTS: { bone: number; amp: number; phase: number }[] = [];
for (let f = 1; f <= 4; f++) {                         // index .. pinky: a wave rolling from the little finger
  const k = 1 + 4 * f, phase = (4 - f) * 0.55;
  JOINTS.push({ bone: k, amp: 0.3, phase }, { bone: k + 1, amp: 0.2, phase: phase + 0.25 }, { bone: k + 2, amp: 0.12, phase: phase + 0.45 });
}
JOINTS.push({ bone: 2, amp: 0.08, phase: 1.2 }, { bone: 3, amp: 0.06, phase: 1.4 });

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return Math.sin(Math.PI * t) ** 2; };   // 0 at both ends, still at both ends

export class HandAdmire {
  private start = -1;
  private readonly saved: Quaternion[] = [];
  private readonly applied: number[] = [];
  /** Begin one admire (a placement, or a tap). Restarting mid-way just plays it from the top once more. */
  play(now: number) { this.start = now; }
  get active() { return this.start >= 0; }
  /**
   * Per-bone offsets for this moment (radians about each bone's flexion axis; the wrist about the forearm), or null
   * when idle. `rest` are the template's joint positions in the hand frame (as the pose solver uses them).
   */
  offsets(now: number, rest: Vector3[], reduced = false): Map<number, Quaternion> | null {
    if (this.start < 0) return null;
    const t = (now - this.start) / 1000;
    if (t < 0) return null;                                               // scheduled a moment ahead
    if (t >= ADMIRE_SECONDS) { this.start = -1; return null; }                  // done: never loops
    const out = new Map<number, Quaternion>(), env = smooth(t / ADMIRE_SECONDS);
    const d = new Vector3(), palmar = new Vector3(), side = new Vector3();
    if (!reduced) for (const j of JOINTS) {
      if (!rest[j.bone + 1]) continue;
      d.copy(rest[j.bone + 1]).sub(rest[j.bone]).normalize();
      palmar.set(0, 0, -1).addScaledVector(d, d.z).normalize();
      side.crossVectors(d, palmar).normalize();
      out.set(j.bone, new Quaternion().setFromAxisAngle(side, j.amp * env * Math.sin(2 * Math.PI * FLUTTER_HZ * t - j.phase)));
    }
    // the wrist turns a little toward the light and back, about the forearm's axis
    if (rest[9]) {
      d.copy(rest[9]).sub(rest[0]).normalize();
      out.set(0, new Quaternion().setFromAxisAngle(d, (reduced ? 0.12 : 0.24) * env));
    }
    return out;
  }
  /** Apply this frame's offsets on top of the bones' eased pose; call restore() after drawing. */
  apply(now: number, bones: { quaternion: Quaternion }[], rest: Vector3[], reduced = false) {
    this.applied.length = 0;
    const o = this.offsets(now, rest, reduced); if (!o) return false;
    for (const [i, q] of o) {
      (this.saved[i] ??= new Quaternion()).copy(bones[i].quaternion);
      bones[i].quaternion.premultiply(q); this.applied.push(i);
    }
    return true;
  }
  restore(bones: { quaternion: Quaternion }[]) {
    for (const i of this.applied) bones[i].quaternion.copy(this.saved[i]);
    this.applied.length = 0;
  }
}
